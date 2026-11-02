// 忆枢 · SQLite 存储层（node:sqlite 内置，零依赖）
//
// 4 张表：config / memories / persona_snapshots / review_log
//
// 设计（相对 memory-eternal 的核心差异）：
// - 单一 memories 表 + layer('stm'|'ltm') + status('active'|'pending'|'sleeping'|'rejected'|'deleted')。
//   读路径全部经 lib/store.js 的固定查询（active 可见性集中在一处，不靠每处 SQL 自觉）。
// - 每条记忆带艾宾浩斯调度状态：strength / ease / interval_hours / due_at / review_count / hits。
// - persona_snapshots 是人格画像的版本历史（只追加，不修改）——成长轨迹的数据源。
// - review_log 记录所有状态变更与强化事件，审计与「记忆怎么来的」可追溯。

import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const DB_FILE = 'memory-lattice.db'

const instances = new Map()

export function getDb(root) {
  const resolved = path.resolve(root)
  if (instances.has(resolved)) return instances.get(resolved)
  mkdirSync(resolved, { recursive: true })
  const db = new DatabaseSync(path.join(resolved, DB_FILE))
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')
  initTables(db)
  instances.set(resolved, db)
  return db
}

export function closeDb(root) {
  const resolved = path.resolve(root)
  const db = instances.get(resolved)
  if (db) { db.close(); instances.delete(resolved) }
}

export function closeAllDb() {
  for (const db of instances.values()) { try { db.close() } catch {} }
  instances.clear()
}

function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layer TEXT NOT NULL DEFAULT 'ltm',            -- 'stm' | 'ltm'
      kind TEXT NOT NULL DEFAULT 'knowledge',       -- knowledge/decision/mistake/preference/goal/trait/event/fact
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      tags TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',        -- active|pending|sleeping|rejected|deleted
      strength REAL NOT NULL DEFAULT 1.0,           -- 记忆强度（0 起衰减，低于 SLEEP_THRESHOLD 沉睡）
      ease REAL NOT NULL DEFAULT 2.5,               -- SM-2 ease 因子
      interval_hours REAL NOT NULL DEFAULT 24,      -- 当前复习间隔（小时）
      due_at TEXT,                                  -- 下次应强化的时间（ISO）；过期即开始衰减
      last_review_at TEXT,
      review_count INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0,              -- 被召回命中的次数（STM 晋升依据之一）
      source TEXT DEFAULT '',                       -- auto|manual|agent|migration|promotion
      submitted_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sleeping_at TEXT,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mem_status ON memories(status);
    CREATE INDEX IF NOT EXISTS idx_mem_layer ON memories(layer);
    CREATE INDEX IF NOT EXISTS idx_mem_kind ON memories(kind);
    CREATE INDEX IF NOT EXISTS idx_mem_due ON memories(due_at);

    CREATE TABLE IF NOT EXISTS persona_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      summary TEXT DEFAULT '',
      trigger TEXT DEFAULT '',                      -- scheduled|manual|promotion
      memory_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER,
      action TEXT NOT NULL,                         -- create|approve|reject|edit|delete|reinforce|sleep|awaken|promote|expire
      detail TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- 工作记忆：待办/承诺。不进记忆链（不参与衰减统计、不上星云），
    -- 纯正则从用户的话里认出来（参考 dsh-chain 的 working.json）：
    -- 最多 3 条、3 天没提起自动过期、说「做好了」就删掉。
    CREATE TABLE IF NOT EXISTS working (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'todo',            -- todo | promise
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      done_at TEXT
    );

    CREATE TABLE IF NOT EXISTS patrol_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT UNIQUE NOT NULL,                     -- YYYY-MM-DD（幂等锁）
      path TEXT NOT NULL,
      summary TEXT DEFAULT '',
      stats TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_working_live ON working(done_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_review_memory ON review_log(memory_id, action);
  `)
  // 轻确认（复核建议 5）：正则抽出来的待办可能是误记，默认先存成「建议」，
  // 用户确认后才注入系统提示。老库平滑升级。
  ensureColumn(db, 'working', 'suggested', 'suggested INTEGER NOT NULL DEFAULT 0')
  // 画像证据链（复核建议 3）：每次合成记录「用了哪几条记忆」，快照才能自我解释
  ensureColumn(db, 'persona_snapshots', 'evidence_ids', "evidence_ids TEXT DEFAULT '[]'")
  db.exec(`CREATE TABLE IF NOT EXISTS persona_exclusions (
    memory_id INTEGER PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
  );`)
}

/** 幂等加列（SQLite 没有 ADD COLUMN IF NOT EXISTS）。 */
function ensureColumn(db, table, column, ddl) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all()
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  } catch { /* 表还没建好时忽略，下次启动再补 */ }
}

/** 取/存 config 表（字符串值；调用方自行 JSON 序列化）。 */
export function getConfig(db, key) {
  try { return db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value ?? null } catch { return null }
}
export function setConfig(db, key, value) {
  db.prepare(`INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, String(value))
}

/** 审核日志（永不抛错：审计失败不影响主流程）。 */
export function logAction(db, memoryId, action, detail = '') {
  try { db.prepare('INSERT INTO review_log (memory_id, action, detail) VALUES (?, ?, ?)').run(memoryId, action, String(detail || '').slice(0, 500)) } catch {}
}

/** 状态机：哪些迁移合法（防止绕过审核的任意搬移）。 */
export const STATUS_TRANSITIONS = {
  pending: ['active', 'rejected', 'deleted'],      // pending → 审核通过/驳回/删除
  active: ['sleeping', 'deleted', 'pending'],      // active → 沉睡/删除/退回待审（编辑正文时）
  sleeping: ['active', 'deleted'],                 // 沉睡 → 唤醒/删除
  rejected: ['pending', 'deleted'],                // 驳回 → 重新提交/删除
  deleted: [],                                     // 软删终态（回收站层面再清理）
}

/**
 * 审核守卫：新记忆的初始 status。
 * STM 永远免审（短命草稿层，进审核中心是噪音）；LTM 按 auditMode 决定。
 */
export function initialStatus(layer, auditMode) {
  if (layer === 'stm') return 'active'
  return auditMode === 'none' ? 'active' : 'pending'
}
