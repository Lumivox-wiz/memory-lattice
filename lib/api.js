// 忆枢 · DSH webServer JSON API（/memory-lattice/api/*）
//
// 同源闸门：无鉴权的本机 API 不能让任意网页读写记忆 —— 校验 Origin/Referer 的
// host 与请求 Host 一致，不一致直接 403（与 memory-eternal 同一威胁模型）。

import { overview, list, getOne, search, writeMemory, audit, reinforceInPlace, graph, sweep, about, VISIBLE_WHERE, KINDS } from './store.js'
import { getDb } from './db.js'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { currentPersona, personaTimeline, personaSnapshot, synthesizePersona, compactPersona, collectMaterial, excludeFromPersona, includeInPersona, listPersonaExclusions, snapshotEvidence } from './persona.js'
import { wipeAll, storageStats, parsePolicy, parseCountPolicy } from './retention.js'
import { isCoreKind } from './ebbinghaus.js'
import { previewImport, applyImport, IMPORT_MODES, EXPORT_FORMAT } from './importer.js'
import { buildPayload, encryptPayload, readWatermark, writeWatermark, runAutoBackup, readLastAutoBackupAt, resolveBackupDir, BACKUP_FORMAT } from './backup.js'
import { routeCandidates } from './llm.js'
import { liveItems, remember, completeRelated, confirmWorking, dropWorking } from './working.js'
import { runPatrol, latestPatrol, patrolQueue } from './patrol.js'

export const API_PREFIX = '/memory-lattice/api'

function json(res, code, obj, extraHeaders = null) {
  const body = JSON.stringify(obj)
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers[k] = v
  res.writeHead(code, headers)
  res.end(body)
}

// ---------- 会话能力令牌（安全复核：读接口不能只靠 Origin） ----------
//
// 背景：`Origin` / `Referer` / `Sec-Fetch-*` 只是**浏览器防跨站的信号**，不是身份凭据 ——
// 任何本机进程（curl / 另一个 app）都能伪造或干脆不带，于是 `GET /export` 会把整个
// 记忆库和人格快照送出去。
//
// 这里的做法是「进程内随机令牌 + 会话绑定」：
//   1) 插件激活时生成 24 字节随机令牌，只存在内存里，不落盘、不随重启复用；
//   2) 客户端启动先 POST /session 换令牌（同时下发 HttpOnly + SameSite=Strict 的 cookie，
//      并允许用 X-ML-Token 头回传，兼容 cookie 被拦的渲染环境）；
//   3) 除 /session 外**所有路由**都要令牌，缺了就是 401。
//
// 边界（必须写清楚，不能装作已经解决）：同用户的其他进程仍可自己 POST /session 拿令牌，
// 甚至直接读 SQLite 文件 —— 记忆数据本身就存在明文库里。**非目标：OS 级数据隔离。**
// 这里做的是「关掉不设防的本机 HTTP 面」，把攻击门槛从「一条 curl」抬到「主动伪造会话」；
// 真正的身份隔离属于宿主能力（带调用者身份的能力令牌），已记录为上游依赖。
// 适用范围：单用户、本地 profile。详见 README「威胁模型（适用 / 不适用）」。
const SESSION_COOKIE = 'ml_session'
const SESSION_HEADER = 'x-ml-token'

function readCookie(req, name) {
  const raw = String(req.headers?.cookie || '')
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return ''
}

/** 定时安全比较（长度不同直接 false，避免抛错）。 */
function tokenEquals(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8')
  const y = Buffer.from(String(b || ''), 'utf8')
  if (!x.length || x.length !== y.length) return false
  try { return timingSafeEqual(x, y) } catch { return false }
}

function presentedToken(req) {
  const header = String(req.headers?.[SESSION_HEADER] || '').trim()
  if (header) return header
  return readCookie(req, SESSION_COOKIE)
}

/** 请求体上限（安全复核 P1-1）：记忆正文最长 20k 字，256KB 足够且能挡住灌库式攻击。
 *  导入是唯一例外（搬整个记忆库），单独给 16MB 上限。 */
const MAX_BODY_BYTES = 256 * 1024
const MAX_IMPORT_BYTES = 16 * 1024 * 1024

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error(`请求体过大（上限 ${Math.round(limit / 1024)}KB）`), { code: 'BODY_TOO_LARGE' }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

/**
 * 写接口来源证明（安全复核 P1-1）。读接口靠同源闸门就够，写接口再收紧一档：
 * 必须能证明「这是从本应用页面发起的请求」——
 *   - Origin / Referer 与 Host 同源（含端口），或
 *   - 浏览器提供的 Sec-Fetch-Site 为 same-origin / same-site / none，
 *   - 或 DSH 应用壳协议（dsh-app://）。
 * 裸 curl / 任意本机进程（既无 Origin 也无 Sec-Fetch-*）一律拒绝：
 * 没有鉴权的本机写接口，不能让「任何进程」都能批准、改写、删除记忆。
 */
export function missingOriginProof(req) {
  const hostHeader = String(req.headers.host || '')
  const origin = String(req.headers.origin || req.headers.referer || '')
  const fetchSite = String(req.headers['sec-fetch-site'] || '')
  if (origin) {
    try {
      const u = new URL(origin)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      if (u.host === hostHeader) return null
      const uPort = u.port || (u.protocol === 'https:' ? '443' : '80')
      if (u.hostname === hostHeader.split(':')[0] && uPort === (hostHeader.includes(':') ? hostHeader.split(':').pop() : '80')) return null
      return '来源不同源（端口也需一致）'
    } catch { /* 非 URL 形状继续用 Sec-Fetch 判定 */ }
  }
  if (fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none') return null
  return '写接口要求来源证明（缺少 Origin / Referer / Sec-Fetch-Site）'
}

/** 简易写接口限流：每路由每分钟 60 次，挡住脚本狂刷（内存计数，重启归零）。 */
const writeBuckets = new Map()
function rateLimited(route) {
  const now = Date.now()
  const bucket = writeBuckets.get(route) || { start: now, count: 0 }
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0 }
  bucket.count++
  writeBuckets.set(route, bucket)
  if (writeBuckets.size > 200) writeBuckets.clear()
  return bucket.count > 60
}

/**
 * 同源闸门：**主机名 + 端口**都要一致（审阅意见 ⑤）。
 *
 * 原实现只比 hostname，于是 `127.0.0.1:3000` 上的任意本地 dev server 页面
 * 都能调 `127.0.0.1:43120/memory-lattice/api/audit` 批准/改写记忆。
 * 现在：http(s) 来源必须与 Host 头逐字相等（含端口）；非 http(s) 协议
 * （DSH 的 `dsh-app://` 应用壳）不是网页能伪造的来源，放行。
 */
export function crossOriginError(req) {
  const hostHeader = String(req.headers.host || '')
  if (!hostHeader) return null
  const hostPort = hostHeader.includes(':') ? hostHeader.split(':').pop() : '80'
  for (const key of ['origin', 'referer']) {
    const raw = String(req.headers[key] || '')
    if (!raw) continue
    let u
    try { u = new URL(raw) } catch { continue }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue // 应用壳 / 自定义协议
    if (u.host === hostHeader) continue                            // 完全同源
    const uPort = u.port || (u.protocol === 'https:' ? '443' : '80')
    if (u.hostname === hostHeader.split(':')[0] && uPort === hostPort) continue
    return `跨站请求被拒绝（来源 ${u.host} ≠ 本机服务 ${hostHeader}）`
  }
  return null
}

/**
 * @param {object} deps {vaultDir, getSettings, getLlm, log}
 */
export function createApi(deps) {
  const vaultDir = deps.vaultDir
  const getSettings = deps.getSettings ?? (() => ({}))
  const getLlm = deps.getLlm ?? (() => null)
  const log = deps.log ?? (() => {})
  // 进程内令牌：优先用调用方（index.js）在激活时生成的那一个，保证热重载后仍是同一会话；
  // 独立使用时（测试/CLI）自己生成一个。
  const sessionToken = String(deps.sessionToken || '') || randomBytes(24).toString('hex')

  return async function handleApi(req, res) {
    const cross = crossOriginError(req)
    if (cross) return json(res, 403, { ok: false, error: cross, code: 'CROSS_ORIGIN_BLOCKED' })
    const root = vaultDir()
    const url = new URL(req.url, 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '') || '/overview'
    const q = url.searchParams
    const method = req.method || 'GET'

    // 握手：唯一不需要令牌的路由。仍然要来源证明 + 限流，
    // 否则任意本机进程都能顺手换一个令牌（见文件头「边界」说明）。
    if (route === '/session') {
      if (method !== 'POST') return json(res, 405, { ok: false, error: '只接受 POST' })
      const noProof = missingOriginProof(req)
      if (noProof) return json(res, 403, { ok: false, error: noProof, code: 'NO_ORIGIN_PROOF' })
      if (rateLimited('/session')) return json(res, 429, { ok: false, error: '握手过于频繁', code: 'RATE_LIMITED' })
      const cookie = `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      return json(res, 200, { ok: true, token: sessionToken }, { 'Set-Cookie': cookie })
    }

    // 其余全部路由都要令牌 —— 包括只读的 /export、/list、/persona。
    if (!tokenEquals(presentedToken(req), sessionToken)) {
      return json(res, 401, { ok: false, error: '缺少或错误的会话令牌（先 POST /session 握手）', code: 'NO_SESSION' })
    }

    // 写接口再收紧一档：来源证明 + 限流
    if (method === 'POST') {
      const noProof = missingOriginProof(req)
      if (noProof) return json(res, 403, { ok: false, error: noProof, code: 'NO_ORIGIN_PROOF' })
      if (rateLimited(route)) return json(res, 429, { ok: false, error: '写接口请求过于频繁（每分钟 60 次上限）', code: 'RATE_LIMITED' })
    }

    try {
      if (route === '/overview') return json(res, 200, { ok: true, ...overview(root) })

      if (route === '/list') {
        return json(res, 200, { ok: true, items: list(root, {
          layer: q.get('layer') || '', status: q.get('status') || '', kind: q.get('kind') || '',
          q: q.get('q') || '', limit: Number(q.get('limit')) || 60, offset: Number(q.get('offset')) || 0,
        }) })
      }

      if (route === '/card') {
        const card = getOne(root, Number(q.get('id')))
        return card ? json(res, 200, { ok: true, card }) : json(res, 404, { ok: false, error: 'not found' })
      }

      if (route === '/search') {
        const hits = search(root, q.get('q') || '', { limit: Number(q.get('limit')) || 8 })
        return json(res, 200, { ok: true, hits: hits.map((h) => ({ id: h.id, title: h.title, layer: h.layer, kind: h.kind, tags: h.tags, strength: h.strength, score: h._score, summary: String(h.body).slice(0, 160) })) })
      }

      if (route === '/graph') return json(res, 200, { ok: true, ...graph(root) })

      if (route === '/providers') {
        // 给配置页的 Provider 选择器用：列出宿主可用的 provider / model
        const listProviders = deps.listProviders
        if (typeof listProviders !== 'function') return json(res, 200, { ok: true, providers: [], note: '当前环境拿不到 llm 服务' })
        try {
          const providers = await listProviders()
          return json(res, 200, { ok: true, providers })
        } catch (e) {
          return json(res, 200, { ok: true, providers: [], note: String(e?.message || e) })
        }
      }

      if (route === '/storage') {
        return json(res, 200, { ok: true, ...storageStats(root), settings: getSettings() })
      }

      if (route === '/wipe' && method === 'POST') {
        // 整库清除（危险）：必须显式传 confirm 文案，避免误触/脚本误调
        const body = await readBody(req)
        if (String(body.confirm || '') !== 'CLEAR') {
          return json(res, 400, { ok: false, error: '需要 confirm: "CLEAR" 才能清空记忆库' })
        }
        const r = wipeAll(root)
        log('ui', 'wipe', `整库清除：${JSON.stringify(r.removed)}`)
        return json(res, 200, { ok: true, ...r })
      }

      if (route === '/export') {
        // 数据控制权：整库导出为 JSON，用户随时可以带走自己的记忆。
        // 现在统一走 lib/backup.js（v2 结构，多了 counts/watermark；v1 文件仍可导入）。
        const { payload, stats } = buildPayload(root, { since: q.get('since') || '' })
        writeWatermark(root, stats.watermark)
        return json(res, 200, { ok: true, ...payload, stats })
      }

      if (route === '/backup') {
        // 加密 / 增量备份：口令只走 POST body（不进 URL、不进日志）
        if (method === 'GET') {
          const cfg = getSettings()
          return json(res, 200, {
            ok: true,
            watermark: readWatermark(root),
            format: BACKUP_FORMAT,
            auto: {
              enabled: cfg.backupAuto === true,
              intervalHours: Number(cfg.backupIntervalHours) || 24,
              dir: resolveBackupDir(root, cfg.backupDir || ''),
              keep: Number(cfg.backupKeep) || 7,
              encrypt: cfg.backupEncrypt === true,
              lastAt: readLastAutoBackupAt(root),
            },
          })
        }
        if (method !== 'POST') return json(res, 405, { ok: false, error: '只接受 GET / POST' })
        const body = await readBody(req, MAX_IMPORT_BYTES)

        // 手动触发一次自动备份（用来验证目录 / 加密环境变量配对了没有）。
        // 走的是与定时任务完全相同的 runAutoBackup —— 口令同样只从环境变量读，
        // 所以「手动能加密成功」就等于「定时也能」，不会出现两套行为。
        if (body.autoRun === true) {
          const cfg = getSettings()
          const r = runAutoBackup(root, {
            dir: cfg.backupDir || '',
            encrypt: cfg.backupEncrypt === true,
            keep: Number(cfg.backupKeep) || 7,
          })
          if (!r.ok) {
            return json(res, 200, { ok: false, auto: true, skipped: r.skipped, dir: r.dir })
          }
          log('ui', 'backup', `手动触发自动备份 · ${r.mode} · ${r.stats.memories} 条 · ${Math.round(r.bytes / 1024)}KB · 保留 ${r.kept} 份`)
          return json(res, 200, {
            ok: true, auto: true,
            file: r.file, bytes: r.bytes, dir: r.dir, kept: r.kept, removed: r.removed,
            stats: { ...r.stats, encrypted: cfg.backupEncrypt === true },
          })
        }

        const since = body.full === true ? '' : (String(body.since || '').trim() || readWatermark(root))
        const { payload, stats } = buildPayload(root, { since })
        let text
        try {
          text = body.passphrase ? encryptPayload(payload, body.passphrase) : JSON.stringify(payload, null, 2)
        } catch (e) {
          return json(res, 400, { ok: false, error: String(e?.message || e) })
        }
        // 只有成功产出才推进水位：中途失败不能导致「本地认为已备份、实际没拿到」
        writeWatermark(root, stats.watermark)
        const info = { ...stats, encrypted: !!body.passphrase, bytes: Buffer.byteLength(text) }
        log('ui', 'backup', `${info.mode} · ${info.memories} 条 · ${info.encrypted ? '已加密' : '明文'} · ${Math.round(info.bytes / 1024)}KB`)
        return json(res, 200, { ok: true, stats: info, text })
      }

      if (route === '/import/preview') {
        if (method !== 'POST') return json(res, 405, { ok: false, error: '只接受 POST' })
        const body = await readBody(req, MAX_IMPORT_BYTES)
        const mode = IMPORT_MODES.includes(String(body.mode)) ? String(body.mode) : 'skip'
        return json(res, 200, previewImport(root, body.payload, { mode, passphrase: String(body.passphrase || '') }))
      }

      if (route === '/import') {
        if (method !== 'POST') return json(res, 405, { ok: false, error: '只接受 POST' })
        const body = await readBody(req, MAX_IMPORT_BYTES)
        const mode = IMPORT_MODES.includes(String(body.mode)) ? String(body.mode) : 'skip'
        const passphrase = String(body.passphrase || '')
        if (body.dryRun === true) return json(res, 200, { ok: true, ...previewImport(root, body.payload, { mode, passphrase }) })
        const r = applyImport(root, body.payload, { mode, confirm: String(body.confirm || ''), passphrase })
        if (r.ok) log('ui', 'import', `导入完成：新建 ${r.created} · 跳过 ${r.skipped} · 合并 ${r.merged} · 画像 ${r.personas}${r.wiped ? ` · 先清空 ${r.wiped}` : ''}`)
        return json(res, r.ok ? 200 : 400, r)
      }

      if (route === '/retention') {
        // 保留期限的图形化配置需要「有哪些类型 + 哪些是核心层 + 当前策略」，
        // 让前端渲染成一行行输入框，而不是让用户手写 "kind:days" 字符串。
        const policy = parsePolicy(getSettings().retentionPolicy || '')
        const map = {}
        for (const p of policy) map[p.kind] = p.days
        const counts = {}
        for (const p of parseCountPolicy(getSettings().retentionCounts || '')) counts[p.kind] = p.max
        return json(res, 200, {
          ok: true,
          kinds: KINDS.map((k) => ({ kind: k, core: isCoreKind(k), days: map[k] ?? null, max: counts[k] ?? null })),
          policyText: getSettings().retentionPolicy || '',
          countsText: getSettings().retentionCounts || '',
          stats: (() => { try { return storageStats(root) } catch { return {} } })(),
        })
      }

      if (route === '/about') {
        const q = q.get('q') || ''
        if (!q.trim()) return json(res, 400, { ok: false, error: '缺少查询词' })
        return json(res, 200, { ok: true, items: about(root, q, { limit: Number(q.get('limit')) || 5 }) })
      }

      if (route === '/working') {
        if (method === 'GET') return json(res, 200, { ok: true, items: liveItems(root) })
        if (method === 'POST') {
          const body = await readBody(req)
          if (body.action === 'complete') {
            const done = completeRelated(root, String(body.text || ''))
            return json(res, 200, { ok: true, completed: done })
          }
          if (body.action === 'confirm') return json(res, 200, { ok: confirmWorking(root, body.id) })
          if (body.action === 'drop') return json(res, 200, { ok: dropWorking(root, body.id) })
          if (!String(body.text || '').trim()) return json(res, 400, { ok: false, error: '缺少内容' })
          return json(res, 200, { ok: true, ...remember(root, String(body.text), body.kind === 'promise' ? 'promise' : 'todo') })
        }
      }

      if (route === '/patrol') {
        if (method === 'GET') {
          const latest = latestPatrol(root)
          let content = ''
          if (latest?.path) { try { content = (await import('node:fs')).readFileSync(latest.path, 'utf8').slice(0, 12000) } catch { content = '' } }
          return json(res, 200, { ok: true, latest, content })
        }
        if (method === 'POST') {
          const r = runPatrol(root, { force: true })
          log('ui', 'patrol', r.summary)
          return json(res, 200, { ok: true, ...r })
        }
      }

      // 夜巡可执行队列（复核建议 4：报告不该只是清单，要能直接处理）
      if (route === '/patrol/queue') {
        return json(res, 200, { ok: true, ...patrolQueue(root) })
      }

      if (route === '/patrol/action' && method === 'POST') {
        const body = await readBody(req)
        const action = String(body.action || '')
        const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
        if (!ids.length && action !== 'tag') return json(res, 400, { ok: false, error: '缺少目标记忆 id' })
        let result
        if (action === 'delete' || action === 'sleep' || action === 'awaken' || action === 'approve' || action === 'reject') {
          result = ids.map((id) => ({ id, ...audit[action](root, id, '夜巡队列') }))
        } else if (action === 'strengthen') {
          result = ids.map((id) => ({ id, ...(reinforceInPlace(root, id, 5) ? { ok: true } : { ok: false, error: '记忆不存在' }) }))
        } else if (action === 'tag') {
          const tag = String(body.tag || '').trim()
          if (!tag || !ids.length) return json(res, 400, { ok: false, error: '缺少标签或目标' })
          result = ids.map((id) => {
            const card = getOne(root, id)
            if (!card) return { id, ok: false, error: '记忆不存在' }
            const tags = [...new Set([...(card.tags || []), tag])].slice(0, 12)
            return { id, ...audit.edit(root, id, { tags }) }
          })
        } else if (action === 'merge') {
          // 合并 = 保留 keep，drop 软删并留痕（不改保留那条的正文，保住原文边界）
          const keep = Number(body.keep || ids[0])
          const drops = ids.filter((id) => id !== keep)
          if (!keep || !drops.length) return json(res, 400, { ok: false, error: '合并需要 keep + 至少一个 drop' })
          result = drops.map((id) => {
            const r = audit.delete(root, id, `已合并到 #${keep}`)
            return { id, keep, ...r }
          })
          log('ui', 'patrol', `merge → 保留 #${keep}，合并 ${drops.length} 条`)
        } else {
          return json(res, 400, { ok: false, error: '未知操作：' + action })
        }
        log('ui', 'patrol', `${action} ${ids.join(',')}`)
        return json(res, 200, { ok: result.every((r) => r.ok !== false), results: result })
      }

      if (route === '/write' && method === 'POST') {
        const body = await readBody(req)
        const r = writeMemory(root, {
          layer: body.layer === 'stm' ? 'stm' : 'ltm',
          kind: body.kind, title: body.title, body: body.body, tags: body.tags,
          source: 'manual', submittedBy: 'user', dedupThreshold: Number(getSettings().dedupThreshold) || 0.85,
        })
        log('ui', 'write', `${r.action} #${r.id}`)
        return json(res, 200, { ok: true, ...r })
      }

      if (route === '/audit' && method === 'POST') {
        const body = await readBody(req)
        const id = Number(body.id)
        const fn = audit[body.action]
        if (typeof fn !== 'function') return json(res, 400, { ok: false, error: '未知操作：' + body.action })
        const r = body.action === 'edit' ? fn(root, id, body.patch || {}) : fn(root, id, body.detail || '')
        log('ui', 'audit', `${body.action} #${id} → ${r.ok}`)
        return json(res, r.ok ? 200 : 400, { ok: r.ok, ...r })
      }

      if (route === '/reinforce' && method === 'POST') {
        const body = await readBody(req)
        const next = reinforceInPlace(root, Number(body.id), Number(body.quality) || 5)
        return next ? json(res, 200, { ok: true, ...next }) : json(res, 404, { ok: false, error: 'not found' })
      }

      if (route === '/sweep' && method === 'POST') {
        const cfg = getSettings()
        const stats = sweep(root, { stmTtlHours: Number(cfg.stmTtlHours) || 48, decayEnabled: cfg.decayEnabled !== false })
        log('ui', 'sweep', JSON.stringify(stats))
        return json(res, 200, { ok: true, stats })
      }

      if (route === '/persona') {
        const cur = currentPersona(root)
        const excludedIds = listPersonaExclusions(root)
        const excludedEvidence = excludedIds.length
          ? getDb(root).prepare(`SELECT id, kind, title FROM memories WHERE id IN (${excludedIds.map(() => '?').join(',')})`).all(...excludedIds)
            .map((m) => ({ id: m.id, kind: m.kind, title: String(m.title).slice(0, 60) }))
          : []
        return json(res, 200, {
          ok: true, current: cur, timeline: personaTimeline(root),
          evidence: collectMaterial(root).map((m) => ({ id: m.id, kind: m.kind, title: String(m.title).slice(0, 60), strength: Number(m.strength).toFixed(2) })),
          excludedEvidence,
          excluded: excludedIds,
        })
      }
      if (route === '/persona/exclude' && method === 'POST') {
        const body = await readBody(req)
        const id = Number(body.id)
        if (!Number.isInteger(id) || id <= 0) return json(res, 400, { ok: false, error: '缺少记忆 id' })
        const r = body.exclude === false ? includeInPersona(root, id) : excludeFromPersona(root, id)
        log('ui', 'persona', `${body.exclude === false ? '恢复' : '排除'}证据 #${id}`)
        return json(res, 200, { ok: r.ok })
      }
      if (route === '/persona/snapshot') {
        const snap = personaSnapshot(root, Number(q.get('id')))
        if (!snap) return json(res, 404, { ok: false, error: 'not found' })
        return json(res, 200, { ok: true, snapshot: snap, evidence: snapshotEvidence(root, snap.id) })
      }
      if (route === '/persona/synthesize' && method === 'POST') {
        const st = getSettings()
        // 出站闸门（复核 Critical）：人格合成与蒸馏同一套规则 —— 必须「显式开启 + 显式 Provider」。
        // 旧实现让 routeCandidates 在没有配置时自选第一个 Provider，等于默默把画像素材发出去。
        const provider = String(st.personaProvider || '').trim()
        const wantLlm = st.personaAutoSynth === true && !!provider
        let llm = null, route = null
        if (wantLlm) {
          const client = getLlm()
          const routes = client ? await routeCandidates(client, { provider, model: st.personaModel || '' }).catch(() => []) : []
          if (client && routes[0]) { llm = client; route = routes[0] }
        }
        const r = await synthesizePersona(root, llm, route, { trigger: 'manual' })
        const note = wantLlm
          ? (route ? '' : '已开启 LLM 合成但拿不到该 Provider 的模型，本次用本地兜底')
          : '未开启 LLM 合成（配置 → 人格 → 允许 LLM 合成并指定 Provider），本次用本地兜底'
        log('ui', 'persona', r.ok ? `v${r.id} (${r.mode})${note ? ' · ' + note : ''}` : r.error)
        return json(res, r.ok ? 200 : 400, { ok: r.ok, ...r, viaLlm: r.mode === 'llm', note })
      }

      if (route === '/config') {
        if (method === 'GET') {
          const db = getDb(root)
          const cfg = {}
          for (const r of db.prepare('SELECT key, value FROM config').all()) cfg[r.key] = r.value
          return json(res, 200, { ok: true, config: cfg, settings: getSettings() })
        }
        if (method === 'POST') {
          // 白名单写配置：只放行调用方（index.js）声明的键，经 settings.update 走宿主表单服务
          const body = await readBody(req)
          const patch = body?.patch || {}
          const { applySettings, configKeys } = deps
          const allowed = new Set(configKeys || [])
          const clean = {}
          for (const k of Object.keys(patch)) if (allowed.has(k)) clean[k] = patch[k]
          if (!Object.keys(clean).length) return json(res, 400, { ok: false, error: '无可写入字段' })
          if (typeof applySettings !== 'function') return json(res, 501, { ok: false, error: '当前环境不支持写配置' })
          try {
            await applySettings(clean)
            // auditMode 不再在这里手写 SQLite —— index.js 的 settings.watch 统一负责镜像，
            // 否则重启后宿主配置会把这份「影子值」覆盖回去（复核 Required 项）。
            return json(res, 200, { ok: true, applied: Object.keys(clean) })
          } catch (e) {
            return json(res, 500, { ok: false, error: String(e?.message || e) })
          }
        }
      }

      return json(res, 404, { ok: false, error: 'unknown route: ' + route })
    } catch (e) {
      if (e?.code === 'BODY_TOO_LARGE') return json(res, 413, { ok: false, error: e.message, code: 'BODY_TOO_LARGE' })
      return json(res, 500, { ok: false, error: String(e?.message || e) })
    }
  }
}
