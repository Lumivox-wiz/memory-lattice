// 忆枢 · 夜巡（每日审查报告）
//
// 参考 dsh-chain 的夜巡：每天跑一次，把「该处理的记忆」列成一份可读报告：
//   久未命中 / 疑似重复 / 矛盾候选 / 沉睡 / 将被遗忘 / 未归类 / 工作记忆残留
// 只报告，不自动改数据（除了工作记忆过期清理）——人是最后一道闸门。
// 报告落 vault/reports/YYYY-MM-DD.md，patrol_reports 表记录摘要（幂等锁）。

import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { getDb, logAction } from './db.js'
import { tokenize, parseTags, diceSimilarity } from './store.js'
import { liveItems } from './working.js'

const SIM_DUP = 0.75
const SIM_CONFLICT = 0.6

function sim(a, b) {
  // Dice 系数（0~1、对称）：原实现 hit / min(size,12) 会算出 >1 的分数，
  // 导致「都算重复」——阈值形同虚设。
  return diceSimilarity(a, b)
}

const PATROL_SCAN_LIMIT = 1500

/**
 * 统一的「问题检测」：报告与可执行队列共用同一套判据，避免两边口径漂移。
 * @returns {{rows, active, neverHit, dups, conflicts, fading, unclassified, working, truncated, totalRows, PATROL_SCAN_LIMIT}}
 */
export function computeIssues(root, now = Date.now()) {
  const db = getDb(root)
  // 规模上限（复核 P2）：重复/矛盾检测是 O(n²) 配对，全库扫会随记忆增长失控。
  // 只对「最近 1500 条」做配对，报告里注明截断，不静默丢。
  const totalRows = Number(db.prepare(`SELECT COUNT(*) n FROM memories WHERE status IN ('active','sleeping','pending') AND deleted_at IS NULL`).get().n) || 0
  const rows = db.prepare(`SELECT id, layer, kind, title, body, tags, strength, hits, review_count, status, created_at, updated_at, due_at
                           FROM memories WHERE status IN ('active','sleeping','pending') AND deleted_at IS NULL
                           ORDER BY updated_at DESC LIMIT ?`).all(PATROL_SCAN_LIMIT)
  const truncated = totalRows > PATROL_SCAN_LIMIT
  const active = rows.filter((r) => r.status === 'active')

  // ① 久未命中：从没被召回过的生效记忆（超过 14 天）
  const neverHit = active.filter((r) => (r.hits || 0) === 0 && now - (Date.parse(r.created_at) || now) > 14 * 86400_000)

  // ② 疑似重复：正文 bigram 相似度超阈值的配对（各句只报一次）
  const tokenized = rows.map((r) => ({ r, t: tokenize(r.title + ' ' + r.body) }))
  const dups = []
  for (let i = 0; i < tokenized.length && dups.length < 12; i++) {
    for (let j = i + 1; j < tokenized.length && dups.length < 12; j++) {
      if (sim(tokenized[i].t, tokenized[j].t) >= SIM_DUP) dups.push([tokenized[i].r, tokenized[j].r])
    }
  }

  // ③ 矛盾候选：高相似但一边带否定词、一边带肯定词
  const NEG = /(不|别|禁止|不要|避免|勿|取消)/
  const conflicts = []
  for (let i = 0; i < tokenized.length && conflicts.length < 8; i++) {
    for (let j = i + 1; j < tokenized.length && conflicts.length < 8; j++) {
      const a = tokenized[i], b = tokenized[j]
      const s = sim(a.t, b.t)
      if (s < SIM_CONFLICT || s >= SIM_DUP) continue
      const aNeg = NEG.test(a.r.body), bNeg = NEG.test(b.r.body)
      if (aNeg !== bNeg) conflicts.push([a.r, b.r])
    }
  }

  // ④ 将被遗忘：强度低于阈值但仍生效（还没睡）
  const fading = active.filter((r) => Number(r.strength) < 0.5)

  // ⑤ 未归类：knowledge 且没有标签
  const unclassified = active.filter((r) => r.kind === 'knowledge' && !parseTags(r.tags).length)

  // ⑥ 工作记忆残留（未完成未必是问题，提醒一下就好）
  const working = liveItems(root, now)

  return { rows, active, neverHit, dups, conflicts, fading, unclassified, working, truncated, totalRows, PATROL_SCAN_LIMIT }
}

/**
 * 可执行队列：把报告里的六类线索变成带操作的结构化数据（前端直接渲染按钮）。
 * 只读 —— 操作走 POST /patrol/action。
 */
export function patrolQueue(root, now = Date.now()) {
  const issues = computeIssues(root, now)
  const brief = (r) => ({
    id: r.id, title: String(r.title).slice(0, 60), kind: r.kind, layer: r.layer,
    strength: Number(Number(r.strength).toFixed(2)), hits: r.hits || 0, status: r.status,
    tags: parseTags(r.tags),
  })
  return {
    generatedAt: new Date(now).toISOString(),
    truncated: issues.truncated,
    totalRows: issues.totalRows,
    scanLimit: issues.PATROL_SCAN_LIMIT,
    neverHit: issues.neverHit.slice(0, 12).map(brief),
    dups: issues.dups.map(([a, b]) => ({ a: brief(a), b: brief(b) })),
    conflicts: issues.conflicts.map(([a, b]) => ({ a: brief(a), b: brief(b) })),
    fading: issues.fading.slice(0, 10).map(brief),
    unclassified: issues.unclassified.slice(0, 10).map(brief),
    working: issues.working.map((w) => ({ id: w.id, text: w.text, kind: w.kind })),
  }
}

/**
 * 生成（或读取）今天的报告。
 * @param {object} opts {root, now, force}
 * @returns {{ok:boolean, day:string, path:string, summary:string, stats:object, cached?:boolean}}
 */
export function runPatrol(root, { now = Date.now(), force = false } = {}) {
  const db = getDb(root)
  const day = new Date(now).toISOString().slice(0, 10)
  const existing = db.prepare('SELECT * FROM patrol_reports WHERE day = ?').get(day)
  if (existing && !force) {
    return { ok: true, day, path: existing.path, summary: existing.summary, stats: JSON.parse(existing.stats || '{}'), cached: true }
  }

  const issues = computeIssues(root, now)
  const { rows, active, neverHit, dups, conflicts, fading, unclassified, working, truncated, totalRows, PATROL_SCAN_LIMIT } = issues

  const sleeping = rows.filter((r) => r.status === 'sleeping')
  const pending = rows.filter((r) => r.status === 'pending')

  const stats = {
    total: rows.length, active: active.length, sleeping: sleeping.length, pending: pending.length,
    neverHit: neverHit.length, dups: dups.length, conflicts: conflicts.length, fading: fading.length,
    unclassified: unclassified.length, working: working.length,
  }

  const line = (r) => `- #${r.id} ${String(r.title).slice(0, 48)}（强度 ${Number(r.strength).toFixed(2)} · 命中 ${r.hits}）`
  const md = [
    `# 忆枢夜巡报告 · ${day}`,
    '',
    `共 ${stats.total} 条（生效 ${stats.active} / 待审 ${stats.pending} / 沉睡 ${stats.sleeping}）${truncated ? `\n\n> 记忆库共 ${totalRows} 条，本次只对最近 ${PATROL_SCAN_LIMIT} 条做配对检查（重复/矛盾检测是 O(n²)，超限部分未扫描）。` : ''}`,
    '',
    `## ① 久未命中（${neverHit.length}）`,
    '这些记忆从入库到现在一次都没被召回。要么写得不够有用，要么该删。',
    ...neverHit.slice(0, 12).map(line),
    '',
    `## ② 疑似重复（${dups.length}）`,
    '正文高度相似，建议合并（审核中心可编辑，合并后删掉一条）。',
    ...dups.map(([a, b]) => `- #${a.id} ${a.title.slice(0, 30)} ↔ #${b.id} ${b.title.slice(0, 30)}`),
    '',
    `## ③ 矛盾候选（${conflicts.length}）`,
    '高相似但肯定/否定口径相反 —— 可能有一条过时了，请人工判断。',
    ...conflicts.map(([a, b]) => `- #${a.id} ${a.title.slice(0, 30)} ↔ #${b.id} ${b.title.slice(0, 30)}`),
    '',
    `## ④ 将被遗忘（${fading.length}）`,
    '强度低于 0.5，再不召回就会沉睡。留着有用就去「记忆」页点一次强化。',
    ...fading.slice(0, 10).map(line),
    '',
    `## ⑤ 未归类（${unclassified.length}）`,
    '没有标签的通用知识，建议补标签（补完会参与云图连线）。',
    ...unclassified.slice(0, 10).map((r) => `- #${r.id} ${String(r.title).slice(0, 48)}`),
    '',
    `## ⑥ 工作记忆（${working.length} 条未完成）`,
    ...working.map((w) => `- ${w.kind === 'promise' ? '答应过' : '待办'}：${w.text}`),
    '',
    '> 本报告只列线索，不自动修改任何记忆。核心层（特质/偏好/目标）不参与衰减，不会出现在④。',
  ].join('\n')

  const dir = path.join(root, 'reports')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${day}.md`)
  writeFileSync(file, md, 'utf8')

  const summary = `久未命中 ${stats.neverHit} · 疑似重复 ${stats.dups} · 矛盾 ${stats.conflicts} · 将被遗忘 ${stats.fading} · 未归类 ${stats.unclassified}`
  db.prepare(`INSERT INTO patrol_reports (day, path, summary, stats) VALUES (?, ?, ?, ?)
              ON CONFLICT(day) DO UPDATE SET path=excluded.path, summary=excluded.summary, stats=excluded.stats, created_at=datetime('now')`)
    .run(day, file, summary, JSON.stringify(stats))
  return { ok: true, day, path: file, summary, stats, cached: false }
}

/**
 * 矛盾自动裁决（复核建议：矛盾要有策略，不只是一张清单）。
 * 保守规则：只处理「明显过时」的一方 —— 0 命中、强度 < 1、且不是最近更新；
 * 另一方必须是 有召回记录或强度 ≥ 1。命中即沉睡（可唤醒，不删除）。
 * @returns {Array<{sleepId:number, keepId:number, reason:string}>}
 */
export function autoResolveConflicts(root, now = Date.now()) {
  const db = getDb(root)
  const { conflicts } = computeIssues(root, now)
  const stale = (r) => (Number(r.hits) || 0) === 0 && Number(r.strength) < 1
  const solid = (r) => (Number(r.hits) || 0) > 0 || Number(r.strength) >= 1
  const acted = []
  for (const [a, b] of conflicts) {
    let weak = null, keep = null
    if (stale(a) && solid(b)) { weak = a; keep = b }
    else if (stale(b) && solid(a)) { weak = b; keep = a }
    if (!weak) continue
    db.prepare(`UPDATE memories SET status='sleeping', sleeping_at=?, updated_at=? WHERE id=?`)
      .run(new Date(now).toISOString(), new Date(now).toISOString(), weak.id)
    logAction(db, weak.id, 'sleep', `conflict-auto: 与 #${keep.id} 矛盾且明显过时`)
    acted.push({ sleepId: weak.id, keepId: keep.id, reason: 'stale-vs-solid' })
  }
  return acted
}

/** 最近一次报告（UI 概览用）。 */
export function latestPatrol(root) {
  const db = getDb(root)
  const row = db.prepare('SELECT * FROM patrol_reports ORDER BY day DESC LIMIT 1').get()
  if (!row) return null
  return { day: row.day, path: row.path, summary: row.summary, stats: JSON.parse(row.stats || '{}'), createdAt: row.created_at }
}
