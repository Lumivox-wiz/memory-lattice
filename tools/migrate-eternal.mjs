// 忆枢 · 从 memory-eternal 迁移知识卡 → LTM
//
// 读旧库（memory-eternal.db）主库区（cards，物理上只存 approved），
// 按卡龄折算艾宾浩斯初始调度（lib/ebbinghaus.js migrationSchedule），写入忆枢库。
// 幂等：同 title + source='migration' 的卡跳过，可重复执行。
//
// 用法：
//   node tools/migrate-eternal.mjs                     # 默认 $DSH_HOME/memory-vault → $DSH_HOME/memory-lattice
//   node tools/migrate-eternal.mjs --from <旧库目录> --to <忆枢库目录> [--dry-run]

import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import os from 'node:os'
import { getDb, closeAllDb } from '../lib/db.js'
import { migrationSchedule } from '../lib/ebbinghaus.js'
import { tokenize } from '../lib/store.js'

const args = process.argv.slice(2)
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : '' }
const dryRun = args.includes('--dry-run')

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const fromDir = path.resolve(argOf('--from') || path.join(DSH_HOME, 'memory-vault'))
const toDir = path.resolve(argOf('--to') || path.join(DSH_HOME, 'memory-lattice'))

const KIND_MAP = {
  project: 'knowledge', knowledge: 'knowledge', content: 'event', prompt: 'knowledge',
  business: 'knowledge', tool: 'knowledge', mistake: 'mistake',
}

// ---- 读旧库 ----
let src
try { src = new DatabaseSync(path.join(fromDir, 'memory-eternal.db'), { readOnly: true }) } catch (e) {
  console.error(`打不开旧库 ${path.join(fromDir, 'memory-eternal.db')}：${e.message}`)
  console.error('提示：用 --from 指定 memory-eternal 库目录')
  process.exit(1)
}
const cards = src.prepare(`SELECT id, kind, title, body, tags, summary, submitted_by, created_at, updated_at
                           FROM cards WHERE deleted_at IS NULL`).all()
console.log(`旧库 ${fromDir} 读到 ${cards.length} 张已审核卡`)
if (!cards.length) process.exit(0)

if (dryRun) {
  for (const c of cards.slice(0, 10)) console.log(`  [dry] #${c.id} ${c.kind} → ${KIND_MAP[c.kind] || 'knowledge'} · ${c.title}`)
  console.log(`（dry-run：共将迁移 ${cards.length} 张）`)
  process.exit(0)
}

// ---- 写入忆枢库（幂等） ----
const dst = getDb(toDir)
const exists = new Set(dst.prepare(`SELECT title FROM memories WHERE source = 'migration'`).all().map((r) => r.title))
const existingActive = dst.prepare(`SELECT title, body FROM memories WHERE status = 'active'`).all()
  .map((r) => ({ title: r.title, tokens: tokenize(r.title + ' ' + r.body) }))
const now = Date.now()

let migrated = 0, skippedDup = 0, skippedExists = 0
const insert = dst.prepare(`INSERT INTO memories
  (layer, kind, title, body, tags, status, strength, ease, interval_hours, due_at, source, submitted_by, created_at, updated_at)
  VALUES ('ltm', ?, ?, ?, ?, 'active', ?, 2.5, ?, ?, 'migration', ?, ?, ?)`)

for (const c of cards) {
  const title = String(c.title || '').trim()
  const body = String(c.body || '').trim()
  if (!title && !body) continue
  if (exists.has(title)) { skippedExists++; continue }
  // 与忆枢库里已有记忆近似（bigram 高重叠）也跳过，避免迁移制造重复
  const tokens = tokenize(title + ' ' + body)
  let nearDup = false
  for (const ex of existingActive) {
    let hit = 0
    for (const t of tokens) if (ex.tokens.has(t)) hit++
    if (tokens.size && hit / Math.min(tokens.size, 12) >= 0.8) { nearDup = true; break }
  }
  if (nearDup) { skippedDup++; continue }
  let tags = []
  try { tags = JSON.parse(c.tags || '[]') } catch { tags = String(c.tags || '').split(',').filter(Boolean) }
  const sched = migrationSchedule({ updated_at: c.updated_at || c.created_at }, now)
  insert.run(
    KIND_MAP[c.kind] || 'knowledge', title, body,
    JSON.stringify(Array.isArray(tags) ? tags.map(String).slice(0, 12) : []),
    sched.strength, sched.interval_hours, sched.due_at,
    String(c.submitted_by || 'migration'),
    String(c.created_at || ''), String(c.updated_at || c.created_at || ''),
  )
  exists.add(title)
  migrated++
}

console.log(`迁移完成：新写入 ${migrated} · 幂等跳过 ${skippedExists} · 近似跳过 ${skippedDup} → ${toDir}`)
src.close()
closeAllDb()
