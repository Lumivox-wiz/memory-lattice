// 忆枢 · 保留期限 / 容量上限 / 整库清除
//
// 复核建议 7（数据控制权）：
//   - 按类型保留期限：`event:90,knowledge:365` —— 只淘汰「从没被召回且确实老」的条目，
//     核心层（特质/偏好/目标）永不进淘汰池；
//   - 容量上限：超过 maxMemories 时淘汰「最弱且没被用过」的，软删除可回收；
//   - 整库清除：显式 confirm 才执行，删完 VACUUM（不留残页）。
// 所有删除都是**软删除**（status='deleted'），回收站仍可见，除非用户主动清空。

import { getDb, logAction } from './db.js'
import { isCoreKind } from './ebbinghaus.js'

/** 解析 "event:30,knowledge:365" → [{kind, days}]，非法项忽略。 */
export function parsePolicy(text) {
  return String(text || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [kind, days] = part.split(':').map((s) => s.trim())
      const n = Number(days)
      return kind && Number.isFinite(n) && n > 0 ? { kind, days: n } : null
    })
    .filter(Boolean)
}

/**
 * 按保留期限淘汰过期记忆（软删）。
 * 条件克制：只动「从没被召回过（hits=0）」的条目，核心层跳过。
 * @returns {{deleted:number, details:Array<{kind:string, days:number, deleted:number}>}}
 */
export function applyRetention(root, policyText, now = Date.now()) {
  const db = getDb(root)
  const rules = parsePolicy(policyText)
  const out = { deleted: 0, details: [] }
  for (const rule of rules) {
    if (isCoreKind(rule.kind)) continue // 核心层不设期限
    const cutoff = new Date(now - rule.days * 86400_000).toISOString()
    const rows = db.prepare(`SELECT id FROM memories
                             WHERE kind = ? AND status IN ('active','sleeping') AND deleted_at IS NULL
                               AND hits = 0 AND created_at < ?`).all(rule.kind, cutoff)
    for (const r of rows) {
      db.prepare(`UPDATE memories SET status='deleted', deleted_at=?, updated_at=? WHERE id=?`)
        .run(new Date(now).toISOString(), new Date(now).toISOString(), r.id)
      logAction(db, r.id, 'expire', `retention:${rule.kind}>${rule.days}d`)
    }
    out.deleted += rows.length
    out.details.push({ kind: rule.kind, days: rule.days, deleted: rows.length })
  }
  return out
}

/**
 * 容量上限：超过 max 时从「最弱且没被用过」的开始淘汰（核心层豁免）。
 * @returns {{deleted:number, cap:number, before:number}}
 */
export function enforceCapacity(root, max, now = Date.now()) {
  const db = getDb(root)
  const cap = Number(max) || 0
  const live = db.prepare(`SELECT id, kind, strength, hits FROM memories
                           WHERE status IN ('active','sleeping') AND deleted_at IS NULL`).all()
  if (!cap || live.length <= cap) return { deleted: 0, cap, before: live.length }
  const candidates = live
    .filter((r) => !isCoreKind(r.kind))
    .sort((a, b) => (Number(a.hits) - Number(b.hits)) || (Number(a.strength) - Number(b.strength)))
  const excess = live.length - cap
  const victims = candidates.slice(0, Math.max(0, excess))
  for (const v of victims) {
    db.prepare(`UPDATE memories SET status='deleted', deleted_at=?, updated_at=? WHERE id=?`)
      .run(new Date(now).toISOString(), new Date(now).toISOString(), v.id)
    logAction(db, v.id, 'expire', `capacity>${cap}`)
  }
  return { deleted: victims.length, cap, before: live.length }
}

/**
 * 解析按类型的条数上限 "event:500,knowledge:5000" → [{kind, max}]，非法项忽略。
 * 与天数策略分开存放：`retentionPolicy` 管「多久没被用过就清」，这里管「某一类最多留多少条」。
 */
export function parseCountPolicy(text) {
  return String(text || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [kind, max] = part.split(':').map((s) => s.trim())
      const n = Number(max)
      return kind && Number.isFinite(n) && n > 0 ? { kind, max: Math.floor(n) } : null
    })
    .filter(Boolean)
}

/**
 * 按类型的条数上限淘汰（软删）。核心层豁免。
 *
 * 淘汰顺序刻意「先清没人用的」：hits 升序 → strength 升序 → updated_at 升序。
 * 只按时间淘汰会把刚复习过的老卡删掉、留下刚写进来的噪声，和记忆系统目标相反。
 * @returns {{deleted:number, details:Array<{kind:string, max:number, deleted:number, before:number}>}}
 */
export function applyCountPolicy(root, policyText, now = Date.now()) {
  const db = getDb(root)
  const rules = parseCountPolicy(policyText)
  const out = { deleted: 0, details: [] }
  const stamp = new Date(now).toISOString()
  for (const rule of rules) {
    if (isCoreKind(rule.kind)) continue // 核心层不设条数上限
    const rows = db.prepare(`SELECT id, hits, strength, updated_at FROM memories
                             WHERE kind = ? AND status IN ('active','sleeping') AND deleted_at IS NULL
                             ORDER BY hits ASC, strength ASC, updated_at ASC`).all(rule.kind)
    const excess = rows.length - rule.max
    if (excess <= 0) { out.details.push({ kind: rule.kind, max: rule.max, deleted: 0, before: rows.length }); continue }
    const victims = rows.slice(0, excess)
    for (const v of victims) {
      db.prepare(`UPDATE memories SET status='deleted', deleted_at=?, updated_at=? WHERE id=?`).run(stamp, stamp, v.id)
      logAction(db, v.id, 'expire', `count:${rule.kind}>${rule.max}`)
    }
    out.deleted += victims.length
    out.details.push({ kind: rule.kind, max: rule.max, deleted: victims.length, before: rows.length })
  }
  return out
}

/**
 * 整库清除（危险操作）：调用方必须先校验 confirm 文案。
 * 硬删除所有记忆/快照/待办/报告/审计日志，然后 VACUUM 收回磁盘。
 */
export function wipeAll(root) {
  const db = getDb(root)
  const before = {
    memories: Number(db.prepare('SELECT COUNT(*) n FROM memories').get().n),
    personas: Number(db.prepare('SELECT COUNT(*) n FROM persona_snapshots').get().n),
    working: Number(db.prepare('SELECT COUNT(*) n FROM working').get().n),
  }
  db.exec('DELETE FROM memories; DELETE FROM persona_snapshots; DELETE FROM working; DELETE FROM patrol_reports; DELETE FROM review_log; DELETE FROM persona_exclusions;')
  try { db.exec('VACUUM') } catch { /* 有连接占用时跳过压缩，不影响正确性 */ }
  return { ok: true, removed: before }
}

/** 库的规模概览（UI 显示容量占用用）。 */
export function storageStats(root) {
  const db = getDb(root)
  const rows = db.prepare(`SELECT status, COUNT(*) n FROM memories GROUP BY status`).all()
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]))
  const persisted = Number(db.prepare("SELECT COUNT(*) n FROM memories WHERE deleted_at IS NULL AND status != 'deleted'").get().n)
  return { byStatus, persisted }
}
