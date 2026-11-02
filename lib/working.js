// 忆枢 · 工作记忆（待办 / 承诺）
//
// 参考 dsh-chain 的 working.json：从用户的话里用纯正则认待办与承诺，
// 不进记忆链（不参与衰减统计、不上星云），最多 3 条，3 天没提起自动过期。
// 说「做好了 / 发过去了」就删掉相关那条。

import { getDb } from './db.js'
import { tokenize } from './store.js'

const MAX_LIVE = 3
const TTL_DAYS = 3

/** 从一句话里抽出待办/承诺（纯正则，零模型调用）。 */
export function extractWorking(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return { items: [], done: false }
  const done = /(做好了|弄好了|发过去了|完成了|搞定了|已经发|已经做)/.test(s)
  const out = []
  const patterns = [
    { kind: 'todo', re: /(?:记得|别忘了|待会(?:儿)?|回头|稍后|之后)[^。！？!?\n]{2,40}/ },
    { kind: 'promise', re: /(?:答应过?|我准备|明天|下周|晚点)[^。！？!?\n]{2,40}/ },
  ]
  for (const p of patterns) {
    const m = p.re.exec(s)
    if (!m) continue
    const item = m[0].trim()
    if (item.length < 4) continue
    out.push({ text: item, kind: p.kind })
  }
  return { items: out.slice(0, 3), done }
}

/** 记下一条工作记忆（去重 + 上限 3 条）。suggested=1 表示「待确认」的建议条目。 */
export function remember(root, text, kind = 'todo', now = Date.now(), { suggested = 0 } = {}) {
  const db = getDb(root)
  const live = liveItems(root, now)
  const tokens = tokenize(text)
  for (const it of live) {
    const t2 = tokenize(it.text)
    let hit = 0
    for (const t of tokens) if (t2.has(t)) hit++
    if (tokens.size && hit / Math.min(tokens.size, 10) >= 0.7) {
      return { id: it.id, action: 'duplicate' } // 已在列表里
    }
  }
  if (live.length >= MAX_LIVE) {
    // 满了：优先挤掉最老的一条「建议」，其次才挤已确认的（工作记忆是草稿纸，不是档案）
    const victim = [...live].reverse().find((it) => it.suggested) || live[live.length - 1]
    db.prepare('UPDATE working SET done_at = ? WHERE id = ?').run(new Date(now).toISOString(), victim.id)
  }
  const expires = new Date(now + TTL_DAYS * 86400_000).toISOString()
  const info = db.prepare('INSERT INTO working (text, kind, expires_at, suggested) VALUES (?, ?, ?, ?)')
    .run(text.slice(0, 120), kind, expires, suggested ? 1 : 0)
  return { id: Number(info.lastInsertRowid), action: 'created', suggested: !!suggested }
}

/** 用户说「做好了」时，把相关的未完成项标完成。 */
export function completeRelated(root, text, now = Date.now()) {
  const db = getDb(root)
  const tokens = tokenize(text)
  const live = liveItems(root, now)
  const done = []
  for (const it of live) {
    const t2 = tokenize(it.text)
    let hit = 0
    for (const t of tokens) if (t2.has(t)) hit++
    if (hit >= 2 || (tokens.size && hit / Math.min(tokens.size, 10) >= 0.5)) {
      db.prepare('UPDATE working SET done_at = ? WHERE id = ?').run(new Date(now).toISOString(), it.id)
      done.push(it.text)
    }
  }
  return done
}

/** 当前未完成、未过期的条目（最新的在前）。 */
export function liveItems(root, now = Date.now()) {
  const db = getDb(root)
  return db.prepare(`SELECT id, text, kind, created_at, expires_at, suggested FROM working
                     WHERE done_at IS NULL AND expires_at > ?
                     ORDER BY created_at DESC LIMIT ?`).all(new Date(now).toISOString(), MAX_LIVE)
}

/** 确认一条建议（之后才会被注入提示）。 */
export function confirmWorking(root, id) {
  const db = getDb(root)
  const r = db.prepare('UPDATE working SET suggested = 0 WHERE id = ?').run(Number(id))
  return Number(r.changes) > 0
}

/** 丢弃一条（建议或已确认都可丢，直接销项）。 */
export function dropWorking(root, id, now = Date.now()) {
  const db = getDb(root)
  const r = db.prepare('UPDATE working SET done_at = ? WHERE id = ?').run(new Date(now).toISOString(), Number(id))
  return Number(r.changes) > 0
}

/** 清理过期项（sweep 时顺带跑）。 */
export function purgeExpired(root, now = Date.now()) {
  const db = getDb(root)
  const r = db.prepare('DELETE FROM working WHERE expires_at <= ? OR done_at IS NOT NULL').run(new Date(now).toISOString())
  return Number(r.changes) || 0
}

/** 注入块：**只注入已确认的条目**；纯建议不打扰模型。没有条目返回空串。 */
export function workingBlock(root, now = Date.now()) {
  const items = liveItems(root, now).filter((it) => !it.suggested)
  if (!items.length) return ''
  return ['【还没做完的事】', ...items.map((it) => `- ${it.kind === 'promise' ? '答应过' : '待办'}：${it.text}`)].join('\n')
}
