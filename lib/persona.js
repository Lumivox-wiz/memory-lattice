// 忆枢 · 人格画像（Persona）
//
// 人格不是手写设定，是从长期记忆里「长」出来的：
//   素材 = 高强度 trait/preference/goal/decision/fact 记忆 + 上一版画像
//   合成 = LLM 重写（低频，默认 24h 一次 / 大促進事件触发）→ 存 persona_snapshots（只追加）
//   注入 = 每次会话的 systemPrompt 带最新画像的紧凑版
// 无 LLM 时降级：用确定性聚合（各类别 top 强度条目罗列）生成结构化画像，仍然可用。

import { getDb } from './db.js'
import { tokenize } from './store.js'

const PERSONA_KINDS = ['trait', 'preference', 'goal', 'decision', 'fact']

/** 收集画像素材：相关类别里强度最高的条目（排除用户手动剔除的证据）。 */
export function collectMaterial(root, { limit = 40 } = {}) {
  const db = getDb(root)
  const excluded = new Set(db.prepare('SELECT memory_id FROM persona_exclusions').all().map((r) => r.memory_id))
  const rows = db.prepare(`SELECT id, kind, title, body, strength, updated_at FROM memories
                           WHERE status='active' AND layer='ltm' AND kind IN (${PERSONA_KINDS.map(() => '?').join(',')})
                           ORDER BY strength DESC, updated_at DESC LIMIT ?`).all(...PERSONA_KINDS, limit + excluded.size)
  return rows.filter((r) => !excluded.has(r.id)).slice(0, limit)
}

/**
 * 一键否定某条事实对画像的影响（复核建议 3）：把记忆加入排除表，
 * 下次合成不再采用它。只影响画像，不动记忆本身的状态。
 */
export function excludeFromPersona(root, memoryId) {
  const db = getDb(root)
  db.prepare('INSERT OR IGNORE INTO persona_exclusions (memory_id) VALUES (?)').run(Number(memoryId))
  return { ok: true }
}

export function includeInPersona(root, memoryId) {
  const db = getDb(root)
  db.prepare('DELETE FROM persona_exclusions WHERE memory_id = ?').run(Number(memoryId))
  return { ok: true }
}

/** 当前被排除的证据 id 列表（UI 用于显示勾选状态）。 */
export function listPersonaExclusions(root) {
  const db = getDb(root)
  return db.prepare('SELECT memory_id FROM persona_exclusions').all().map((r) => r.memory_id)
}

/** 确定性聚合画像（无 LLM 的降级路径，也作为 LLM 失败时的兜底）。 */
export function buildFallbackPersona(material) {
  const byKind = {}
  for (const m of material) (byKind[m.kind] = byKind[m.kind] || []).push(m)
  const section = (label, items, n = 6) => items?.length
    ? `## ${label}\n${items.slice(0, n).map((m) => `- ${m.title}`).join('\n')}`
    : ''
  return [
    `# 用户画像（自动聚合 @ ${new Date().toISOString().slice(0, 10)}）`,
    section('特质', byKind.trait),
    section('偏好', byKind.preference),
    section('目标', byKind.goal),
    section('关键决策', byKind.decision, 8),
    section('稳定事实', byKind.fact, 8),
  ].filter(Boolean).join('\n\n')
}

const PERSONA_SYSTEM = `你是用户画像合成器。基于「上一版画像」和「新素材」（都是记忆条目），输出一份更新后的用户画像 Markdown。
结构（保持稳定，便于跨版本对比）：
# 用户画像
## 核心特质        （3-6 条，只写有记忆证据的）
## 偏好与习惯      （工具/风格/流程偏好）
## 当前目标        （按优先级）
## 决策风格        （如何做选择、看重什么）
## 近期变化        （与上一版相比新增或变化了什么；没有就写「无明显变化」）
规则：只用素材里有的信息，不编造；与上一版冲突时以新素材为准；总长 ≤600 字。`

/**
 * 合成新画像（LLM），失败回落确定性聚合。返回 {content, summary, mode}。
 */
export async function synthesizePersona(root, llm, route, { trigger = 'scheduled' } = {}) {
  const db = getDb(root)
  const material = collectMaterial(root)
  if (!material.length) return { ok: false, error: '长期记忆里还没有 trait/preference/goal/decision 素材，人格画像等记忆再长一点' }

  const last = db.prepare('SELECT content FROM persona_snapshots ORDER BY id DESC LIMIT 1').get()
  const materialText = material.map((m) => `- [${m.kind}] ${m.title}（强度 ${m.strength}）`).join('\n')
  let content = buildFallbackPersona(material)
  let mode = 'fallback'

  if (llm && route) {
    try {
      const { callLlmJson, parseJsonLoose } = await import('./llm.js')
      const res = await callLlmJson(llm, route, {
        system: PERSONA_SYSTEM,
        user: `## 上一版画像\n${last?.content || '（暂无，这是第一版）'}\n\n## 新素材\n${materialText}`,
        maxTokens: 1600, purpose: 'memory-lattice-persona',
      })
      if (!res.failure) {
        const parsed = parseJsonLoose(res.text)
        const md = typeof parsed?.markdown === 'string' ? parsed.markdown : (typeof parsed === 'string' ? parsed : res.text)
        if (md && md.includes('##')) { content = md; mode = 'llm' }
      }
    } catch { /* 回落 fallback */ }
  }

  const summary = material.slice(0, 3).map((m) => m.title).join('；')
  const evidenceIds = material.map((m) => m.id)
  const info = db.prepare('INSERT INTO persona_snapshots (content, summary, trigger, memory_count, evidence_ids) VALUES (?, ?, ?, ?, ?)')
    .run(content, summary.slice(0, 200), trigger, material.length, JSON.stringify(evidenceIds))
  return { ok: true, id: Number(info.lastInsertRowid), content, mode, memoryCount: material.length }
}

/**
 * 某个快照的证据链：谁支撑了这版画像、多可信、谁确认过。
 * 复核建议 3：审核/画像不该只看结论，要能追到证据与来源。
 */
export function snapshotEvidence(root, snapshotId) {
  const db = getDb(root)
  const snap = db.prepare('SELECT evidence_ids FROM persona_snapshots WHERE id = ?').get(Number(snapshotId))
  if (!snap) return []
  let ids = []
  try { ids = JSON.parse(snap.evidence_ids || '[]') } catch { ids = [] }
  if (!Array.isArray(ids) || !ids.length) return []
  const rows = db.prepare(`SELECT id, kind, title, source, submitted_by, strength, hits, last_review_at, created_at
                           FROM memories WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
  const confirmed = new Map()
  for (const r of db.prepare(`SELECT memory_id, COUNT(*) n FROM review_log
                              WHERE action IN ('approve','edit','reinforce') AND memory_id IN (${ids.map(() => '?').join(',')})
                              GROUP BY memory_id`).all(...ids)) confirmed.set(r.memory_id, Number(r.n))
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: String(r.title).slice(0, 60),
    source: r.source || '', submittedBy: r.submitted_by || '',
    strength: Number(Number(r.strength).toFixed(2)), hits: r.hits || 0,
    confirmed: confirmed.get(r.id) || 0,
    lastReview: r.last_review_at || '', addedAt: r.created_at || '',
  }))
}

/** 当前画像（最新快照；没有就现场聚合但不落库）。 */
export function currentPersona(root) {
  const db = getDb(root)
  const last = db.prepare('SELECT * FROM persona_snapshots ORDER BY id DESC LIMIT 1').get()
  if (last) return { id: last.id, content: last.content, createdAt: last.created_at, trigger: last.trigger, exact: true }
  const material = collectMaterial(root)
  if (!material.length) return null
  return { id: 0, content: buildFallbackPersona(material), createdAt: '', trigger: 'live-aggregate', exact: false }
}

/** 成长时间线：快照列表（不含正文，UI 列表用）。 */
export function personaTimeline(root) {
  const db = getDb(root)
  return db.prepare('SELECT id, summary, trigger, memory_count, created_at FROM persona_snapshots ORDER BY id DESC LIMIT 100').all()
}

export function personaSnapshot(root, id) {
  const db = getDb(root)
  return db.prepare('SELECT * FROM persona_snapshots WHERE id = ?').get(id) || null
}

/** 画像的紧凑注入版（systemPrompt 用）：截断 + 去 markdown 装饰。 */
export function compactPersona(content, maxChars = 900) {
  const text = String(content || '')
    .split('\n').filter((l) => !/^#\s/.test(l.trim())) // 去一级标题
    .join('\n').replace(/\n{2,}/g, '\n').trim()
  return text.slice(0, maxChars)
}
