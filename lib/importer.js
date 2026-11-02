// 忆枢 · 导出文件导入 / 迁移
//
// 场景：换机器、换 profile、把记忆库分享给未来的自己，或者从别的记忆插件
// 导出的 JSON 里搬数据过来。要求是「搬得准」和「搬得安全」：
//
//   搬得准：调度状态一起搬（strength / ease / interval / due_at / 复习次数 /
//           命中次数），所以导入后遗忘曲线接着走，而不是所有卡都回到「刚学会」。
//   搬得安全：默认 skip（同内容跳过）、先 dry-run 预览再落地、replace 需显式
//           二次确认、非法字段一律夹紧而不是原样写库（导入文件是外部输入）。
//
// 四种模式：
//   skip    同内容跳过，其余新建（默认，可重复执行）
//   merge   同内容跳过；近似重复（Dice ≥ 0.85）改为强化已有条目而非新建
//   new     全部新建（允许内容重复，用于对照实验）
//   replace 先硬删现有记忆与画像快照，再全部导入（危险，需 confirm:'REPLACE'）

import { getDb, logAction } from './db.js'
import { KINDS, tokenize, diceSimilarity } from './store.js'
import { initialIntervalHours } from './ebbinghaus.js'
import { isEncryptedEnvelope, decryptPayload, BACKUP_FORMAT } from './backup.js'

export const EXPORT_FORMAT = 'memory-lattice-export/v1'
export const IMPORT_MODES = ['skip', 'merge', 'new', 'replace']

const STATUSES = new Set(['active', 'pending', 'sleeping', 'rejected'])
const MAX_ITEMS = 20000
const MAX_TITLE = 200
const MAX_BODY = 20000

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}
const int = (v, lo, hi, fallback) => Math.round(clamp(v, lo, hi, fallback))
const iso = (v) => {
  const t = Date.parse(String(v || ''))
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : ''
}
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
/** 内容指纹：只认标题+正文（与 layer/kind 无关）—— 同一段记忆换层也算同一条。 */
const signature = (m) => `${norm(m.title)}\u0000${norm(m.body)}`

/**
 * 解析并规范化导入载荷。接受四种形状：
 *   1) 本插件导出文件（{format, memories, personaSnapshots, deletions?}）
 *   2) **加密信封**（{format, encrypted, data}）—— 需要 passphrase
 *   3) 裸数组 [{title, body, ...}]
 *   4) 别的工具导出的 { memories: [...] }（无 format 字段也认）
 * @param {object} opts {passphrase?:string}
 * @returns {{ok:boolean, error?:string, format:string, memories:Array, personas:Array, deletions:Array, issues:string[], truncated:boolean, encrypted:boolean}}
 */
export function normalizePayload(raw, { passphrase = '' } = {}) {
  let obj = raw
  let encrypted = false
  if (isEncryptedEnvelope(obj)) {
    encrypted = true
    try { obj = decryptPayload(obj, passphrase) } catch (e) {
      return { ok: false, error: String(e?.message || e), format: BACKUP_FORMAT, memories: [], personas: [], deletions: [], issues: [], truncated: false, encrypted: true }
    }
  }
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return { ok: false, error: '不是合法的 JSON', format: '', memories: [], personas: [], deletions: [], issues: [], truncated: false, encrypted } }
  }
  const issues = []
  let list = []
  let personas = []
  let deletions = []
  let format = ''
  if (Array.isArray(obj)) {
    list = obj
  } else if (obj && typeof obj === 'object') {
    format = String(obj.format || obj.schema || '')
    if (Array.isArray(obj.memories)) list = obj.memories
    else if (Array.isArray(obj.items)) list = obj.items
    else if (Array.isArray(obj.data)) list = obj.data
    else return { ok: false, error: '文件里没有 memories / items / data 数组', format, memories: [], personas: [], deletions: [], issues, truncated: false, encrypted }
    personas = Array.isArray(obj.personaSnapshots) ? obj.personaSnapshots : (Array.isArray(obj.personas) ? obj.personas : [])
    // 增量备份携带的「对端已删除」清单（只用于对齐，不带正文）
    if (Array.isArray(obj.deletions)) {
      deletions = obj.deletions
        .map((d) => ({ id: Number(d?.id), deleted_at: iso(d?.deleted_at) }))
        .filter((d) => Number.isInteger(d.id) && d.id > 0 && d.deleted_at)
        .slice(0, MAX_ITEMS)
    }
  } else {
    return { ok: false, error: '无法识别的文件结构', format: '', memories: [], personas: [], deletions: [], issues: [], truncated: false, encrypted }
  }
  if (format && format !== EXPORT_FORMAT && format !== BACKUP_FORMAT) issues.push(`格式标记是 ${format}（本插件当前为 ${EXPORT_FORMAT}），按通用字段尽力解析`)

  const truncated = list.length > MAX_ITEMS
  if (truncated) issues.push(`条目数超过上限 ${MAX_ITEMS}，只导入前 ${MAX_ITEMS} 条`)

  const memories = []
  let skipped = 0
  for (const item of list.slice(0, MAX_ITEMS)) {
    if (!item || typeof item !== 'object') { skipped++; continue }
    const title = String(item.title ?? '').trim().slice(0, MAX_TITLE)
    const body = String(item.body ?? item.content ?? item.text ?? '').trim().slice(0, MAX_BODY)
    if (!title && !body) { skipped++; continue }
    const status = STATUSES.has(String(item.status)) ? String(item.status) : 'active'
    const layer = item.layer === 'stm' ? 'stm' : 'ltm'
    const kind = KINDS.includes(String(item.kind)) ? String(item.kind) : 'knowledge'
    const interval = clamp(item.interval_hours, 4, 24 * 365, initialIntervalHours(kind))
    const created = iso(item.created_at) || new Date().toISOString()
    const due = iso(item.due_at) || new Date(Date.parse(created) + interval * 3600_000).toISOString()
    let tags = []
    if (Array.isArray(item.tags)) tags = item.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    else if (typeof item.tags === 'string') {
      try { const v = JSON.parse(item.tags); if (Array.isArray(v)) tags = v.map(String).slice(0, 12) } catch { tags = item.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) }
    }
    const rawId = Number(item.id)
    memories.push({
      // 本插件自己的导出带 id：增量恢复靠它对上号（外部工具没有 id，走内容指纹去重）
      id: Number.isInteger(rawId) && rawId > 0 ? rawId : null,
      title: title || body.slice(0, 40), body, tags, layer, kind, status,
      strength: clamp(item.strength, 0, 10, 1),
      ease: clamp(item.ease, 1.3, 2.8, 2.5),
      interval_hours: interval,
      due_at: due,
      last_review_at: iso(item.last_review_at) || null,
      review_count: int(item.review_count, 0, 100000, 0),
      hits: int(item.hits, 0, 100000, 0),
      source: String(item.source || 'import').slice(0, 40),
      submitted_by: String(item.submitted_by || '').slice(0, 60),
      created_at: created,
      updated_at: iso(item.updated_at) || created,
      sleeping_at: iso(item.sleeping_at) || null,
    })
  }
  if (skipped) issues.push(`${skipped} 条没有标题也没有正文，已跳过`)

  const snaps = personas
    .filter((p) => p && typeof p === 'object' && String(p.content || '').trim())
    .slice(0, 200)
    .map((p) => ({
      content: String(p.content).slice(0, 20000),
      summary: String(p.summary || '').slice(0, 200),
      trigger: String(p.trigger || 'import').slice(0, 40),
      memory_count: int(p.memory_count, 0, 100000, 0),
      created_at: iso(p.created_at) || new Date().toISOString(),
    }))

  if (!memories.length && !deletions.length) issues.push('没有可导入的记忆条目')
  const ok = memories.length > 0 || deletions.length > 0
  return { ok, error: ok ? undefined : '没有可导入的记忆条目', format, memories, personas: snaps, deletions, issues, truncated, encrypted }
}

/** 现有条目的内容指纹集合（含已软删的：避免「删了又被导入回来」）。 */
function existingIndex(db) {
  const rows = db.prepare(`SELECT id, title, body, status, deleted_at FROM memories`).all()
  const sigs = new Set()
  const live = []
  for (const r of rows) {
    sigs.add(signature(r))
    if (!r.deleted_at) live.push(r)
  }
  return { sigs, live }
}

/**
 * 预览：不写库，只算「会发生什么」。UI 的导入确认页就靠它。
 * 带 id 的条目（本插件自己的导出）走「按 id 对齐」：对端更新过就是 update，
 * 没更新过就是 skip —— 这是增量恢复能收敛的前提。
 * @returns {{ok:boolean, total:number, create:number, update:number, skip:number, merge:number,
 *            deleted:number, byKind:object, byLayer:object, byStatus:object, personas:number,
 *            personaNew:number, samples:Array, issues:string[], encrypted:boolean}}
 */
export function previewImport(root, raw, { mode = 'skip', passphrase = '' } = {}) {
  const parsed = normalizePayload(raw, { passphrase })
  const empty = {
    ok: false, total: 0, create: 0, update: 0, skip: 0, merge: 0, deleted: 0,
    byKind: {}, byLayer: {}, byStatus: {}, personaNew: 0, personaTotal: 0, samples: [],
    issues: parsed.issues || [], encrypted: parsed.encrypted,
  }
  if (!parsed.ok) return { ...empty, error: parsed.error }
  const db = getDb(root)
  const { sigs, live } = existingIndex(db)
  const byId = new Map(db.prepare('SELECT id, updated_at, deleted_at FROM memories').all().map((r) => [r.id, r]))
  const seen = new Set()
  const docTokens = live.map((r) => ({ id: r.id, tokens: tokenize(`${r.title} ${r.body}`) })).slice(0, 4000)

  const out = {
    ok: true, total: parsed.memories.length, create: 0, update: 0, skip: 0, merge: 0, deleted: 0,
    byKind: {}, byLayer: {}, byStatus: {}, personaNew: 0, personaTotal: parsed.personas.length,
    samples: [], issues: parsed.issues.slice(), encrypted: parsed.encrypted,
  }
  for (const m of parsed.memories) {
    const sig = signature(m)
    out.byKind[m.kind] = (out.byKind[m.kind] || 0) + 1
    out.byLayer[m.layer] = (out.byLayer[m.layer] || 0) + 1
    out.byStatus[m.status] = (out.byStatus[m.status] || 0) + 1
    let action = 'create'
    let nearId = undefined
    const own = m.id ? byId.get(m.id) : null
    if (mode !== 'new' && own) action = String(m.updated_at) > String(own.updated_at || '') ? 'update' : 'skip'
    else if (sigs.has(sig) || seen.has(sig)) action = 'skip'
    else if (mode === 'merge') {
      const t = tokenize(`${m.title} ${m.body}`)
      for (const d of docTokens) {
        if (diceSimilarity(t, d.tokens) >= 0.85) { action = 'merge'; nearId = d.id; break }
      }
    }
    if (action === 'create') out.create++
    else if (action === 'update') out.update++
    else if (action === 'merge') out.merge++
    else out.skip++
    seen.add(sig)
    if (out.samples.length < 8) out.samples.push({ title: m.title.slice(0, 48), action, nearId })
  }
  // 增量备份里的删除清单：只统计「本地还活着」的那些（已经删掉的不用再删）
  out.deleted = parsed.deletions.filter((d) => byId.has(d.id) && !byId.get(d.id).deleted_at).length
  const existingSnaps = new Set(db.prepare('SELECT content FROM persona_snapshots').all().map((r) => norm(r.content)))
  out.personaNew = parsed.personas.filter((p) => !existingSnaps.has(norm(p.content))).length
  return out
}

/**
 * 执行导入。
 * @param {object} opts {mode, confirm, passphrase, now}
 * @returns {{ok:boolean, error?:string, mode:string, created:number, updated:number, skipped:number,
 *            merged:number, deleted:number, personas:number, wiped:number}}
 */
export function applyImport(root, raw, { mode = 'skip', confirm = '', passphrase = '', now = Date.now() } = {}) {
  const fail = (error) => ({ ok: false, error, mode, created: 0, updated: 0, skipped: 0, merged: 0, deleted: 0, personas: 0, wiped: 0 })
  if (!IMPORT_MODES.includes(mode)) return fail(`未知导入模式：${mode}`)
  const parsed = normalizePayload(raw, { passphrase })
  if (!parsed.ok) return fail(parsed.error)
  if (mode === 'replace' && confirm !== 'REPLACE') return fail('整库替换需要显式确认（confirm="REPLACE"）')

  const db = getDb(root)
  let wiped = 0
  if (mode === 'replace') {
    wiped = Number(db.prepare('DELETE FROM memories').run().changes) || 0
    db.prepare('DELETE FROM persona_snapshots').run()
  }

  const { sigs, live } = existingIndex(db)
  const byId = new Map(db.prepare('SELECT id, updated_at, deleted_at FROM memories').all().map((r) => [r.id, r]))
  const docTokens = live.map((r) => ({ id: r.id, tokens: tokenize(`${r.title} ${r.body}`) })).slice(0, 4000)
  const insert = db.prepare(`INSERT INTO memories
    (id, layer, kind, title, body, tags, status, strength, ease, interval_hours, due_at, last_review_at,
     review_count, hits, source, submitted_by, created_at, updated_at, sleeping_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const updateById = db.prepare(`UPDATE memories SET
      layer = ?, kind = ?, title = ?, body = ?, tags = ?, status = ?, strength = ?, ease = ?,
      interval_hours = ?, due_at = ?, last_review_at = ?, review_count = ?, hits = ?, source = ?,
      submitted_by = ?, updated_at = ?, sleeping_at = ?, deleted_at = NULL
    WHERE id = ?`)

  let created = 0, updated = 0, skipped = 0, merged = 0, deleted = 0

  // ① 增量删除清单：对端删掉的条目标记为删除（软删，回收站仍可见）
  for (const d of parsed.deletions) {
    const row = byId.get(d.id)
    if (!row || row.deleted_at) continue
    db.prepare(`UPDATE memories SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(d.deleted_at, d.deleted_at, d.id)
    logAction(db, d.id, 'import-delete', 'incremental')
    deleted++
  }

  // ② 逐条 upsert
  for (const m of parsed.memories) {
    const sig = signature(m)
    const own = m.id ? byId.get(m.id) : null
    if (mode !== 'new' && own) {
      if (!(String(m.updated_at) > String(own.updated_at || ''))) { skipped++; continue }
      updateById.run(
        m.layer, m.kind, m.title, m.body, JSON.stringify(m.tags), m.status,
        m.strength, m.ease, m.interval_hours, m.due_at, m.last_review_at,
        m.review_count, m.hits, m.source, m.submitted_by, m.updated_at, m.sleeping_at, m.id,
      )
      logAction(db, m.id, 'import-update', mode)
      sigs.add(sig)
      updated++
      continue
    }
    if (mode !== 'new' && sigs.has(sig)) { skipped++; continue }
    if (mode === 'merge') {
      const t = tokenize(`${m.title} ${m.body}`)
      let near = null
      for (const d of docTokens) {
        if (diceSimilarity(t, d.tokens) >= 0.85) { near = d.id; break }
      }
      if (near) {
        // 只强化、不拼正文：拼接会搅乱原文边界（复核意见 ② 的结论）。
        db.prepare(`UPDATE memories SET hits = hits + ?, review_count = review_count + 1,
            strength = MIN(10, strength + 0.4), last_review_at = ?, updated_at = ? WHERE id = ?`)
          .run(Math.max(1, m.hits), new Date(now).toISOString(), new Date(now).toISOString(), near)
        logAction(db, near, 'reinforce', 'import-merge')
        merged++
        sigs.add(sig)
        continue
      }
    }
    const info = insert.run(
      own ? null : (m.id ?? null), // id 已被占用时退回自增，避免主键冲突
      m.layer, m.kind, m.title, m.body, JSON.stringify(m.tags), m.status,
      m.strength, m.ease, m.interval_hours, m.due_at, m.last_review_at,
      m.review_count, m.hits, m.source, m.submitted_by, m.created_at, m.updated_at, m.sleeping_at,
    )
    logAction(db, Number(info.lastInsertRowid), 'import', mode)
    sigs.add(sig)
    created++
  }

  let personas = 0
  const hasSnap = db.prepare('SELECT content FROM persona_snapshots')
  const snapSet = new Set(hasSnap.all().map((r) => norm(r.content)))
  const insertSnap = db.prepare('INSERT INTO persona_snapshots (content, summary, trigger, memory_count, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const p of parsed.personas) {
    const k = norm(p.content)
    if (snapSet.has(k)) continue
    insertSnap.run(p.content, p.summary, p.trigger, p.memory_count, p.created_at)
    snapSet.add(k)
    personas++
  }

  return { ok: true, mode, created, updated, skipped, merged, deleted, personas, wiped, encrypted: parsed.encrypted }
}
