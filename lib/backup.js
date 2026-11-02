// 忆枢 · 备份：加密导出 + 增量
//
// 两个诉求分开处理：
//
// 1) **加密**（README「已知未做」第 1 条）：导出文件可能被放进网盘、U 盘、聊天记录，
//    明文 JSON 等于把整段人生交出去。这里用 scrypt 派生密钥 + AES-256-GCM 认证加密，
//    口令不落盘、不进日志、不进 URL（只走 POST body）。封装成 **JSON 信封**而不是裸二进制，
//    这样客户端可以直接当文本读出来原样传回，导入端也只需一次 JSON.parse。
//
// 2) **增量**：全量备份每次几百 KB 到几 MB，天天全量既慢又难比对。按 `updated_at`
//    水位导出「上次之后变过的」，并单独带一份 `deletions`（软删记录的 id + 时间），
//    这样「增量恢复」既能把新增/修改写回去，也能把对端删掉的条目标记为删除 ——
//    只带 upsert 的增量备份会越恢复越多，是常见坑。
//
// 加密信封格式（memory-lattice-export/v2 + encrypted 字段）：
//   { format, encrypted: { alg, kdf, n, r, p, salt, iv, tag }, data: <base64 密文> }
// 未加密的全量/增量都是 v1 兼容结构，只是多了 since / deletions / watermark 字段。

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { getDb, getConfig, setConfig } from './db.js'

export const BACKUP_FORMAT = 'memory-lattice-export/v2'
const ALG = 'aes-256-gcm'
const KDF = { name: 'scrypt', n: 16384, r: 8, p: 1, keyLen: 32 }
const MIN_PASSPHRASE = 8

// 库里的时间戳有**两种格式**：DEFAULT datetime('now') 写 'YYYY-MM-DD HH:MM:SS'（空格），
// 而 store 的部分更新写 new Date().toISOString()（带 T 和毫秒）。直接字符串比较会翻车：
// 'T'(0x54) > ' '(0x20)，于是「ISO 格式的行全都算新」或「全都算旧」。
// 一律经 SQLite 的 datetime() 归一后比较，两种格式都能正确解析。
// 注意：'YYYY-MM-DD HH:MM:SS'（空格分隔）在 JS 里会被按**本地时区**解析，
// 再 toISOString 就整体偏了 UTC+8 —— 实测把水位推早 8 小时，增量把全库都当成新的。
// 已经是库格式（UTC 空格）就原样返回，其余（ISO）按 UTC 归一。
const dbStamp = (d) => {
  if (typeof d === 'number') return new Date(d).toISOString().replace('T', ' ').slice(0, 19)
  const s = String(d || '')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s
  return new Date(s).toISOString().replace('T', ' ').slice(0, 19)
}

const COLUMNS = `id, layer, kind, title, body, tags, status, strength, ease, interval_hours,
  due_at, last_review_at, review_count, hits, source, submitted_by, created_at, updated_at, sleeping_at, deleted_at`

/** 上次成功备份的水位（存在 config 表，随库走）。 */
export function readWatermark(root) {
  try { return String(getConfig(getDb(root), 'lastBackupAt') || '') } catch { return '' }
}

export function writeWatermark(root, iso) {
  try { setConfig(getDb(root), 'lastBackupAt', String(iso || new Date().toISOString())) } catch { /* 写不进去下次再试 */ }
}

/**
 * 组装备份载荷（不加密）。
 * @param {object} opts {since?: string, now?: number}
 * @returns {{payload:object, stats:{mode:'full'|'incremental', memories:number, personas:number, deletions:number, since:string, watermark:string}}}
 */
export function buildPayload(root, { since = '', now = Date.now() } = {}) {
  const db = getDb(root)
  const watermark = dbStamp(now)
  const incremental = !!String(since || '').trim()

  const memories = incremental
    ? db.prepare(`SELECT ${COLUMNS} FROM memories
        WHERE (datetime(updated_at) >= datetime(?)) OR (deleted_at IS NOT NULL AND datetime(deleted_at) >= datetime(?))
        ORDER BY id`).all(dbStamp(since), dbStamp(since))
    : db.prepare(`SELECT ${COLUMNS} FROM memories WHERE deleted_at IS NULL ORDER BY id`).all()

  const personas = incremental
    ? db.prepare('SELECT id, content, summary, trigger, memory_count, evidence_ids, created_at FROM persona_snapshots WHERE datetime(created_at) >= datetime(?) ORDER BY id').all(dbStamp(since))
    : db.prepare('SELECT id, content, summary, trigger, memory_count, evidence_ids, created_at FROM persona_snapshots ORDER BY id').all()

  // 软删的条目：正文不再带（没必要外传），只留 id + 删除时间，供增量恢复对齐
  const deletions = memories
    .filter((m) => m.deleted_at)
    .map((m) => ({ id: m.id, deleted_at: m.deleted_at }))
  const alive = memories.filter((m) => !m.deleted_at)

  const payload = {
    format: BACKUP_FORMAT,
    exportedAt: watermark,
    since: incremental ? since : '',
    watermark,
    counts: { memories: alive.length, personas: personas.length, deletions: deletions.length },
    memories: alive,
    personaSnapshots: personas,
    ...(incremental ? { deletions } : {}),
  }
  return {
    payload,
    stats: {
      mode: incremental ? 'incremental' : 'full',
      memories: alive.length, personas: personas.length, deletions: deletions.length,
      since: payload.since, watermark,
    },
  }
}

function keyFrom(passphrase, salt) {
  return scryptSync(String(passphrase), salt, KDF.keyLen, { N: KDF.n, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 })
}

/**
 * 加密成 JSON 信封（可直接写进 .json 文件）。
 * @throws {Error} 口令太短
 */
export function encryptPayload(payload, passphrase) {
  const pass = String(passphrase || '')
  if (pass.length < MIN_PASSPHRASE) throw new Error(`口令至少 ${MIN_PASSPHRASE} 个字符`)
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALG, keyFrom(pass, salt), iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return JSON.stringify({
    format: BACKUP_FORMAT,
    encrypted: {
      alg: ALG, kdf: KDF.name, n: KDF.n, r: KDF.r, p: KDF.p,
      salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    },
    data: data.toString('base64'),
  })
}

/** 是否是加密信封（导入时先判断，再决定要不要口令）。 */
export function isEncryptedEnvelope(raw) {
  let obj = raw
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return false }
  }
  return !!(obj && typeof obj === 'object' && obj.encrypted && typeof obj.encrypted === 'object' && typeof obj.data === 'string')
}

/**
 * 解密信封 → 原始载荷对象。
 * @throws {Error} 口令错误 / 文件损坏（GCM 认证失败是同一个错误，不区分 —— 区分会泄露信息）
 */
export function decryptPayload(raw, passphrase) {
  let env = raw
  if (typeof env === 'string') {
    try { env = JSON.parse(env) } catch { throw new Error('不是合法的备份文件（JSON 解析失败）') }
  }
  const meta = env && env.encrypted
  if (!meta || typeof env.data !== 'string') throw new Error('不是加密的备份信封')
  const pass = String(passphrase || '')
  if (!pass) throw new Error('这个备份文件已加密，需要提供口令')
  try {
    const salt = Buffer.from(String(meta.salt || ''), 'base64')
    const iv = Buffer.from(String(meta.iv || ''), 'base64')
    const tag = Buffer.from(String(meta.tag || ''), 'base64')
    const decipher = createDecipheriv(ALG, keyFrom(pass, salt), iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()])
    return JSON.parse(plain.toString('utf8'))
  } catch {
    throw new Error('解密失败：口令错误或文件已损坏')
  }
}
