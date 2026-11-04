// 忆枢 · 记忆读写层
//
// 所有 SQL 都住这里：active 可见性（status='active' AND layer 过滤）集中在
// 常量 VISIBLE_WHERE 里，杜绝「每处 SQL 自己记得加 WHERE」的安全模型
// （memory-eternal 曾因三处漏加 WHERE 把待审卡泄进召回，这里物理收敛）。
// 检索：零依赖 CJK bigram + 词面重叠打分，分数 × 强度因子 × 到期加权。

import { getDb, logAction, setConfig, getConfig, initialStatus } from './db.js'
import { reinforce, sweepOne, stmSweepOne, awaken, initialIntervalHours, SLEEP_THRESHOLD } from './ebbinghaus.js'
import { semanticScores } from './vectors.js'

/** 召回/检索/图谱只看这些状态。 */
export const VISIBLE_WHERE = `status = 'active'`

export const KINDS = ['knowledge', 'decision', 'mistake', 'preference', 'goal', 'trait', 'event', 'fact']

/** 语义余弦的标定锚点（见 search 里的注释）：低于 floor 视为噪声，floor+span 以上视为完全可信。 */
const SEMANTIC_FLOOR = 0.12
const SEMANTIC_SPAN = 0.35

// ---------- 分词（CJK bigram + 拉丁词） ----------

export function tokenize(text) {
  const s = String(text || '').toLowerCase()
  const out = new Set()
  for (const m of s.matchAll(/[a-z0-9_+#.-]{2,}/g)) {
    out.add(m[0])
    // 连字符/点号复合词同时索引拆分形态：`dsh-purge` 也能被 "dsh" / "purge" 查到
    if (/[-.]/.test(m[0])) for (const part of m[0].split(/[-.]+/)) if (part.length >= 2) out.add(part)
  }
  // CJK 连续段切成 bigram
  for (const m of s.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const seg = m[0]
    for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2))
  }
  // 单个 CJK 字也收（查询可能只有一个字）
  for (const m of s.matchAll(/[\u4e00-\u9fff]/g)) out.add(m[0])
  return out
}

/**
 * 对称相似度（Dice 系数）：用于去重与图谱连线。
 * 注意它**不是**检索打分 —— 检索用下面的 IDF/BM25（查询归一化），
 * 两者混用会导致「长查询搜不到」与「短文本误合并」（审阅意见 ①②）。
 */
export function diceSimilarity(a, b) {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const t of a) if (b.has(t)) hit++
  return (2 * hit) / (a.size + b.size)
}

// ---------- 写入 ----------

export function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(String).slice(0, 12) : [] } catch { return [] }
}

/**
 * 写一条记忆。
 *
 * 去重守卫（审阅意见 ② 修复后规则）：
 *   - **只对 LTM 生效**：STM 是草稿层，重复是它的正常形态，不该合并；
 *   - 阈值默认 0.85（原 0.62 太松，10 来字的卡很容易破，语义相反的两条会被缝进一张卡）；
 *   - 相似但没到阈值（≥0.5）→ **照常新建**，只记一条 near-dup 日志 —— 污染可逆；
 *   - 真重复（≥0.85）→ 不追加正文（原文边界会被搅乱、24k 截断后不可回溯），
 *     只把新内容记成一条 review_log 并轻微强化原卡。
 * @returns {{id:number, action:'created'|'duplicate', dedup?:number}}
 */
export function writeMemory(root, {
  layer = 'ltm', kind = 'knowledge', title, body, tags = [], source = 'manual',
  submittedBy = '', status, dedupThreshold = 0.85, now = Date.now(),
}) {
  const db = getDb(root)
  title = String(title || '').trim().slice(0, 200)
  body = String(body || '').trim().slice(0, 20000)
  if (!title && body) title = body.slice(0, 40)
  if (!title) throw new Error('记忆标题与正文不能同时为空')
  if (!KINDS.includes(kind)) kind = 'knowledge'
  if (!['stm', 'ltm'].includes(layer)) layer = 'ltm'
  const tagList = parseTags(tags)

  let nearDup = 0
  if (layer === 'ltm') {
    // 去重池包含待审：重复提交进审核队列同样是噪声，且会让审核页出现两张几乎一样的卡
    const pool = db.prepare(`SELECT id, title, body FROM memories WHERE status IN ('active','pending') AND layer = 'ltm' AND deleted_at IS NULL`).all()
    const qTokens = tokenize(title + ' ' + body)
    let best = null, bestScore = 0
    for (const p of pool) {
      const score = diceSimilarity(qTokens, tokenize(p.title + ' ' + p.body))
      if (score > bestScore) { bestScore = score; best = p }
    }
    if (best && bestScore >= dedupThreshold) {
      // 真重复：正文不进原卡（保住原文边界），只留痕 + 轻微强化
      logAction(db, best.id, 'reinforce', `duplicate-hit(${bestScore.toFixed(2)}) ← 「${title.slice(0, 40)}」`)
      reinforceInPlace(root, best.id, 3, now)
      return { id: best.id, action: 'duplicate', dedup: Math.round(bestScore * 1000) / 1000 }
    }
    nearDup = Math.round(bestScore * 1000) / 1000
  }

  const effectiveStatus = status || initialStatus(layer, getConfig(db, 'auditMode') || 'all')
  const interval = layer === 'stm' ? 24 : initialIntervalHours(kind)
  const info = db.prepare(`
    INSERT INTO memories (layer, kind, title, body, tags, status, strength, interval_hours, due_at, source, submitted_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1.0, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    layer, kind, title, body, JSON.stringify(tagList), effectiveStatus, interval,
    new Date(now + interval * 3600_000).toISOString(), source, submittedBy,
  )
  const id = Number(info.lastInsertRowid)
  logAction(db, id, 'create', `${layer}/${kind}/${effectiveStatus}${nearDup >= 0.5 ? ` near-dup=${nearDup.toFixed(2)}` : ''}`)
  return { id, action: 'created', dedup: nearDup || undefined }
}

/** 就地强化（不改变状态；沉睡记忆不会被此函数复活）。 */
export function reinforceInPlace(root, id, quality = 4, now = Date.now()) {
  const db = getDb(root)
  const mem = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  if (!mem) return null
  const next = reinforce(mem, quality, now)
  db.prepare(`UPDATE memories SET strength=?, ease=?, interval_hours=?, due_at=?, last_review_at=?, review_count=?, updated_at=datetime('now') WHERE id=?`)
    .run(next.strength, next.ease, next.interval_hours, next.due_at, next.last_review_at, next.review_count, id)
  return next
}

// ---------- 召回 ----------

/** 查询侧停用词：口语填充词与虚词，参与打分只会稀释信号（文档侧不删，正文里它们有语境意义）。 */
const QUERY_STOP = new Set([
  '我们', '你们', '他们', '什么', '怎么', '这个', '那个', '之前', '之后', '记得', '一下', '有点',
  '还是', '已经', '因为', '所以', '但是', '然后', '如果', '可以', '就是', '不是', '一个', '那次',
  '时候', '现在', '当时', '知道', '觉得', '东西', '事情',
])
const SINGLE_CJK = /^[\u4e00-\u9fff]$/

/**
 * 文档分词缓存：自动召回每轮都要对全库打分，逐条重新分词是 O(全库文本)。
 * 键含 updated_at，写入/编辑后自动失效；上限 4000 条（超出整体清空，成本可忽略）。
 */
const docTokenCache = new Map()
function docTokens(row, text) {
  const key = `${row.id}:${row.updated_at || ''}`
  let tokens = docTokenCache.get(key)
  if (!tokens) {
    tokens = tokenize(text)
    if (docTokenCache.size > 4000) docTokenCache.clear()
    docTokenCache.set(key, tokens)
  }
  return tokens
}

/** 查询分词：去停用词；单字只在「整条查询就一个汉字」时保留。 */
function queryTokens(query) {
  const raw = tokenize(query)
  const out = new Set()
  for (const t of raw) {
    if (SINGLE_CJK.test(t) && raw.size > 1) continue
    if (QUERY_STOP.has(t)) continue
    out.add(t)
  }
  return out.size ? out : raw
}

/**
 * 检索（active 层）：**IDF 加权 BM25（查询归一化）**。
 *
 * 为什么不是 bigram 重叠计数（审阅意见 ①）：旧口径 `hit / min(queryTokens, 12)`
 * 让「查询越具体、得分越低」——20 个 token 的详细提问命中 3 个只得 0.19，被
 * minScore 直接滤掉。这里改成 BM25：
 *   - 罕见词（IDF 高）权重高，常用字（"的/了"、单字）几乎不贡献；
 *   - docLen 归一（k1=1.2, b=0.75）压制长文档靠字数堆分；
 *   - 分母只算「语料里出现过的查询词」→ 长短查询可比。
 *
 * @param {{layers?:string[], limit?:number, minScore?:number, kinds?:string[],
 *          trustedOnly?:boolean, excludeAuto?:boolean}} opts
 *   trustedOnly  只搜「长期层 + 生效」的记忆（自动注入系统提示必须用这个）
 *   excludeAuto  排除自动捕获来源（source like 'auto%'）—— 审核关闭时也不让原始对话进提示
 */
export function search(root, query, {
  layers = ['ltm', 'stm'], limit = 5, minScore = 0.35, kinds = [],
  trustedOnly = false, excludeAuto = false,
  vector = false, vectorWeight = 0.85, vectorMin = 0.32,
} = {}) {
  const db = getDb(root)
  const qTokens = queryTokens(query)
  if (!qTokens.size) return []
  const placeholders = layers.map(() => '?').join(',')
  const rows = db.prepare(`SELECT * FROM memories WHERE ${VISIBLE_WHERE} AND layer IN (${placeholders}) AND deleted_at IS NULL`).all(...layers)
  const now = Date.now()

  // 语义召回（可选）：本地分布论向量，纯计算、零出站。索引用不了就退化为纯字面。
  let semMap = null
  if (vector) {
    try { semMap = semanticScores(root, query) } catch { semMap = null }
  }

  const docs = rows
    .filter((r) => !kinds.length || kinds.includes(r.kind))
    .filter((r) => !trustedOnly || r.layer === 'ltm')
    .filter((r) => !excludeAuto || !String(r.source || '').startsWith('auto'))
    .map((r) => {
      const tags = parseTags(r.tags)
      const tokens = docTokens(r, r.title + ' ' + r.body + ' ' + tags.join(' '))
      return { r, tags, tokens, dl: tokens.size }
    })
  if (!docs.length) return []

  const N = docs.length
  const avgdl = docs.reduce((s, d) => s + d.dl, 0) / N || 1
  const df = new Map()
  for (const d of docs) for (const t of d.tokens) if (qTokens.has(t)) df.set(t, (df.get(t) || 0) + 1)
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5))
  // 归一化分母只统计**语料里实际出现过**的查询词：语料外的词 IDF 天然最高，
  // 把它们算进分母会让「问得越细、分数越低」的老毛病换个马甲复活。
  let qIdfSum = 0
  for (const t of qTokens) if ((df.get(t) || 0) > 0) qIdfSum += idf(t)
  if (!qIdfSum) qIdfSum = [...qTokens].reduce((s, t) => s + idf(t), 0) || 1
  const K1 = 1.2, B = 0.75
  // 绝对证据门槛改成**相对**的：原来定的固定值 0.9 会把 `dsh` 这种「本语料里的高频词」
  // 整条查询挡死（它的 IDF 只有 0.3 左右，但依然是合法查询）。
  // 判据：命中的词里至少有一个要承担「查询最强信号」的 1/3 —— 只靠泛词沾边的不收。
  // 峰值同样只取**语料内出现过**的词：语料外的词 IDF 天然最高，拿它当基准会让
  // 「库还小（几条记忆）时任何查询都过不去」，实测踩过。
  const presentIdfs = [...qTokens].filter((t) => (df.get(t) || 0) > 0).map((t) => idf(t))
  const maxQueryIdf = presentIdfs.length ? Math.max(...presentIdfs) : 0.001
  const MIN_EVIDENCE_RATIO = 0.34
  const MIN_BM25 = 0.05

  const scored = []
  for (const d of docs) {
    let bm25 = 0, maxMatchedIdf = 0
    for (const t of qTokens) {
      if (!d.tokens.has(t)) continue
      const norm = 1 - B + B * (d.dl / avgdl)
      const idfT = idf(t)
      bm25 += idfT * (K1 + 1) / (1 + K1 * norm) // 二元 token → tf=1
      if (idfT > maxMatchedIdf) maxMatchedIdf = idfT
    }
    // 字面证据闸门：命中太少、或只命中泛词（最强那个词的分量不到查询峰值的 1/3）→ 字面通道不算数。
    // 注意：这里不再直接 continue —— 语义通道可能救回「字面完全不沾边」的条目。
    const literalOk = bm25 > MIN_BM25 && maxMatchedIdf >= maxQueryIdf * MIN_EVIDENCE_RATIO
    // 归一化到 [0,1]：分母是查询的 idf 和，而 bm25 带 (K1+1) 放大，极短文档上会 >1。
    // 不夹紧的话「概率或」融合在 lex>1 时会**反而降低**分数（实测 1.069 → 1.011）。
    const lex = literalOk ? Math.min(1, Math.sqrt(bm25 / qIdfSum)) : 0
    // 语义分标定：128 维随机投影的余弦有效区间很窄（实测相关条目落在 0.2~0.42，
    // 不相关大多 <0.15），直接当 0~1 用会让通道几乎永不生效。这里做单调仿射标定，
    // 锚点来自真实库实测：0.12 以下视为噪声，0.47 以上视为完全可信。
    const semRaw = semMap ? (semMap.get(d.r.id) || 0) : 0
    const sem = semRaw > SEMANTIC_FLOOR ? Math.min(1, (semRaw - SEMANTIC_FLOOR) / SEMANTIC_SPAN) : 0
    if (!literalOk && sem < vectorMin) continue
    // 融合：两路证据按「概率或」合并（任一路强就能过门槛，两路都沾边会叠加）。
    // 语义单独命中要乘 vectorWeight 压低 —— 字面命中永远优先，向量只是补字面死角。
    const blend = 1 - (1 - lex) * (1 - vectorWeight * sem)
    const strengthFactor = 0.6 + 0.4 * Math.min((Number(d.r.strength) || 1) / 3, 1)
    const due = Date.parse(d.r.due_at || '') || 0
    const dueBoost = due && due <= now ? 1.15 : 1
    // 刚强化过的降权（审阅意见 ③：注释写着有、实现里没有）。
    // 只对**已经很强**（strength>2）且在 6 小时内再次命中的卡打折 —— 否则正常强化
    // 会被自己的防回声规则压住（新卡刚背反而排名更低，实测过）。
    const last = Date.parse(d.r.last_review_at || '') || 0
    const fresh = last && now - last < 6 * 3600_000 && (Number(d.r.strength) || 0) > 2 ? 0.85 : 1
    scored.push({
      ...d.r, tags: d.tags,
      _viaVector: !literalOk && sem > 0,
      _score: Math.round(blend * strengthFactor * dueBoost * fresh * 1000) / 1000,
    })
  }
  scored.sort((a, b) => b._score - a._score)
  return scored.filter((s) => s._score >= minScore).slice(0, limit)
}

/**
 * 召回命中后的强化（fire-and-forget，失败不影响召回结果）。
 * quality 按「距上次复习多久」给分：**越久没想起，强化越强**。
 *   刚聊过（0 天）→ 2.0（只是重复）；隔一周 → 3.3；隔两周 → 3.7。
 * 注意符号：是 (1 - exp(-days/7))，写成 exp(-days/7) 会反过来 —— 0 天给满分，
 * 等于给「富者愈富」装加速器（上一版就是这么错的）。
 */
export function reinforceHits(root, ids, now = Date.now()) {
  try {
    const db = getDb(root)
    for (const id of ids) {
      const mem = db.prepare('SELECT last_review_at FROM memories WHERE id = ?').get(id)
      const last = Date.parse(mem?.last_review_at || '') || 0
      const days = last ? (now - last) / 86400_000 : 30
      const quality = Math.max(2, Math.min(4, 2 + 2 * (1 - Math.exp(-days / 7))))
      db.prepare('UPDATE memories SET hits = hits + 1 WHERE id = ?').run(id)
      reinforceInPlace(root, id, quality, now)
      logAction(db, id, 'reinforce', `recall-hit(q=${quality.toFixed(1)})`)
    }
  } catch { /* 强化失败不影响召回 */ }
}

// ---------- 审核 / 状态操作 ----------

const TRANSITIONS = {
  pending: ['active', 'rejected', 'deleted'],
  active: ['sleeping', 'deleted', 'pending'],
  sleeping: ['active', 'deleted'],
  rejected: ['pending', 'deleted'],
  // 从回收站恢复：deleted 不是终态，否则「进回收站、可回滚」只是句空话
  deleted: ['active', 'sleeping'],
}

function transition(root, id, to, detail = '', now = Date.now()) {
  const db = getDb(root)
  const mem = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  if (!mem) return { ok: false, error: '记忆不存在' }
  if (!(TRANSITIONS[mem.status] || []).includes(to)) {
    return { ok: false, error: `非法状态迁移 ${mem.status} → ${to}` }
  }
  const patch = { status: to, updated_at: new Date(now).toISOString() }
  if (to === 'sleeping') patch.sleeping_at = patch.updated_at
  if (to === 'deleted') patch.deleted_at = patch.updated_at
  // 离开回收站：必须清掉 deleted_at，否则它仍被检索/列表按「已删」过滤掉
  if (mem.status === 'deleted' && to !== 'deleted') patch.deleted_at = null
  if (to === 'active' && mem.status === 'sleeping') Object.assign(patch, awaken(mem, now))
  // 注：原来这里还有一段「pending + STM → 转 LTM」的分支，是死代码 ——
  // sweep() 在晋升时已经写了 layer='ltm'，人工 approve 时 mem.layer 永远是 ltm，
  // 分支进不来（审阅意见 ⑧）。删除，别留假的安全感。
  const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ')
  db.prepare(`UPDATE memories SET ${sets} WHERE id = ?`).run(...Object.values(patch), id)
  const action = mem.status === 'deleted' ? 'restore'
    : to === 'sleeping' ? 'sleep'
    : to === 'active' ? (mem.status === 'sleeping' ? 'awaken' : 'approve')
    : to
  logAction(db, id, action, detail)
  return { ok: true }
}

export const audit = {
  approve: (root, id, detail = '人工审核通过') => transition(root, id, 'active', detail),
  reject: (root, id, detail = '') => transition(root, id, 'rejected', detail),
  sleep: (root, id, detail = '手动沉睡') => transition(root, id, 'sleeping', detail),
  awaken: (root, id, detail = '手动唤醒') => transition(root, id, 'active', detail),
  delete: (root, id, detail = '') => transition(root, id, 'deleted', detail),
  /**
   * 从回收站恢复：**回到删除前的状态**（沉睡过的回沉睡，否则回生效），
   * 并清掉 deleted_at（不清的话它仍然被检索按「已删」过滤，等于没恢复）。
   */
  restore: (root, id, detail = '从回收站恢复') => {
    const db = getDb(root)
    const mem = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
    if (!mem) return { ok: false, error: '记忆不存在' }
    if (mem.status !== 'deleted') return { ok: false, error: '这条记忆不在回收站里' }
    return transition(root, id, mem.sleeping_at ? 'sleeping' : 'active', detail)
  },
  /** 编辑正文/标题/标签；active 卡编辑后退回 pending（内容变了要重审）。 */
  edit: (root, id, { title, body, tags, kind }, now = Date.now()) => {
    const db = getDb(root)
    const mem = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
    if (!mem) return { ok: false, error: '记忆不存在' }
    const patch = { updated_at: new Date(now).toISOString() }
    if (title !== undefined) patch.title = String(title).trim().slice(0, 200) || mem.title
    if (body !== undefined) patch.body = String(body).trim().slice(0, 20000)
    if (tags !== undefined) patch.tags = JSON.stringify(parseTags(tags))
    if (kind !== undefined && KINDS.includes(kind)) patch.kind = kind
    if (mem.status === 'active') patch.status = 'pending'
    const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE memories SET ${sets} WHERE id = ?`).run(...Object.values(patch), id)
    logAction(db, id, 'edit', Object.keys({ title, body, tags, kind }).filter((k) => k !== undefined).join(','))
    return { ok: true }
  },
}

// ---------- sweep（衰减 + STM 过期） ----------

/**
 * 一轮清扫：LTM active 衰减（低分沉睡）+ STM 过期晋升/淘汰。
 * @returns {{decayed:number, slept:number, promoted:number, expired:number}}
 */
export function sweep(root, { stmTtlHours = 48, decayEnabled = true } = {}, now = Date.now()) {
  const db = getDb(root)
  const stats = { decayed: 0, slept: 0, promoted: 0, expired: 0 }
  const upd = db.prepare('UPDATE memories SET strength = ?, status = ?, sleeping_at = ?, updated_at = ? WHERE id = ?')

  if (decayEnabled) {
    const actives = db.prepare(`SELECT id, kind, strength, ease, interval_hours, due_at FROM memories WHERE ${VISIBLE_WHERE} AND layer = 'ltm' AND deleted_at IS NULL`).all()
    for (const mem of actives) {
      const r = sweepOne(mem, now)
      if (!r.write) continue
      stats.decayed++
      if (r.transition === 'sleep') {
        upd.run(r.write.strength, 'sleeping', new Date(now).toISOString(), r.write.updated_at, mem.id)
        logAction(db, mem.id, 'sleep', `strength=${r.write.strength} ≤ ${SLEEP_THRESHOLD}`)
        stats.slept++
      } else {
        db.prepare('UPDATE memories SET strength = ? WHERE id = ?').run(r.write.strength, mem.id)
      }
    }
  }

  const stms = db.prepare(`SELECT id, kind, strength, hits, created_at FROM memories WHERE ${VISIBLE_WHERE} AND layer = 'stm' AND deleted_at IS NULL`).all()
  for (const mem of stms) {
    const verdict = stmSweepOne(mem, stmTtlHours, now)
    if (verdict === 'keep') continue
    if (verdict === 'promote') {
      const interval = initialIntervalHours(mem.kind)
      db.prepare(`UPDATE memories SET layer='ltm', status='pending', interval_hours=?, due_at=?, source='promotion', updated_at=datetime('now') WHERE id=?`)
        .run(interval, new Date(now + interval * 3600_000).toISOString(), mem.id)
      logAction(db, mem.id, 'promote', `stm 过期晋升（hits=${mem.hits}）`)
      stats.promoted++
    } else {
      db.prepare(`UPDATE memories SET status='deleted', deleted_at=?, updated_at=? WHERE id=?`)
        .run(new Date(now).toISOString(), new Date(now).toISOString(), mem.id)
      logAction(db, mem.id, 'expire', 'stm 过期淘汰')
      stats.expired++
    }
  }
  return stats
}

// ---------- 图 / 统计 ----------

/** 记忆云图：节点 = active 记忆，边 = 共享标签（≥2 个共享更强）或正文 [[链接]]。 */
/**
 * 记忆云图：节点 = active 记忆，边 = 共享标签或正文 [[链接]]。
 *
 * 审阅意见 ⑥ 修复：「共享 ≥1 个标签就连线」会让一个热门标签（如 "dsh"）把 50 张卡
 * 连成 1225 条边的毛球，视觉信息量趋零。现在的规则：
 *   1. 标签边要求 **共享 ≥2 个标签**（真的同主题，不是碰巧都打了 dsh）；
 *   2. **每节点度数上限 6**（按共享强度从高到低取，超出丢弃）——热门标签不再喂出毛球；
 *   3. 若图太稀疏（边数 < 节点数 ×0.3），才回落允许共享 1 个标签，但仍受度数上限约束。
 */
export function graph(root, { limit = 300, maxDegree = 6 } = {}) {
  const db = getDb(root)
  const rows = db.prepare(`SELECT id, layer, kind, title, body, tags, strength, status, source, created_at FROM memories
                           WHERE ${VISIBLE_WHERE} AND deleted_at IS NULL ORDER BY strength DESC, updated_at DESC LIMIT ?`).all(limit)
  const nodes = rows.map((r) => ({
    id: r.id, label: r.title.slice(0, 24), title: r.title, layer: r.layer, kind: r.kind,
    strength: Number(r.strength) || 1, tags: parseTags(r.tags), status: r.status,
    source: r.source, created_at: r.created_at,
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = []
  const degree = new Map()

  // ① 显式链接（[[id]] / [[标题]]）优先级最高，不受度数上限限制
  for (const row of rows) {
    for (const m of String(row.body || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = /^\d+$/.test(m[1]) ? Number(m[1]) : rows.find((r) => r.title === m[1])?.id
      if (target && byId.has(target) && target !== row.id) {
        edges.push({ a: row.id, b: target, w: 2, kind: 'link' })
        degree.set(row.id, (degree.get(row.id) || 0) + 1)
        degree.set(target, (degree.get(target) || 0) + 1)
      }
    }
  }

  // ② 标签边：先算共享数，再按强度取、受度数上限
  const tagSets = rows.map((r) => new Set(parseTags(r.tags)))
  const pairs = []
  for (let i = 0; i < rows.length; i++) {
    if (!tagSets[i].size) continue
    for (let j = i + 1; j < rows.length; j++) {
      if (!tagSets[j].size) continue
      let shared = 0
      for (const t of tagSets[i]) if (tagSets[j].has(t)) shared++
      if (shared > 0) pairs.push({ a: rows[i].id, b: rows[j].id, shared })
    }
  }
  pairs.sort((x, y) => y.shared - x.shared)
  // 稳定性：只有「共享≥2 的边 ≥ 节点数」才真的按 2 卡阈值，否则放宽到 1（避免阈值随数据量抖动）
  const minShared = pairs.filter((p) => p.shared >= 2).length >= rows.length ? 2 : 1
  for (const p of pairs) {
    if (p.shared < minShared) continue
    const da = degree.get(p.a) || 0, db2 = degree.get(p.b) || 0
    if (da >= maxDegree || db2 >= maxDegree) continue
    edges.push({ a: p.a, b: p.b, w: Math.min(p.shared, 3), kind: 'tag' })
    degree.set(p.a, da + 1); degree.set(p.b, db2 + 1)
  }
  return { nodes, edges: edges.slice(0, 1200) }
}

/** 概览统计 + 遗忘曲线数据。 */
export function overview(root, now = Date.now()) {
  const db = getDb(root)
  const count = (where) => Number(db.prepare(`SELECT COUNT(*) n FROM memories WHERE ${where}`).get().n)
  const byLayer = {}
  for (const r of db.prepare(`SELECT layer, status, COUNT(*) n FROM memories WHERE deleted_at IS NULL GROUP BY layer, status`).all()) {
    byLayer[r.layer] = byLayer[r.layer] || {}
    byLayer[r.layer][r.status] = r.n
  }
  const due = Number(db.prepare(`SELECT COUNT(*) n FROM memories WHERE ${VISIBLE_WHERE} AND layer='ltm' AND due_at IS NOT NULL AND due_at <= ?`).get(new Date(now).toISOString()).n)
  const strengthBuckets = { low: 0, mid: 0, high: 0 }
  for (const r of db.prepare(`SELECT strength FROM memories WHERE ${VISIBLE_WHERE} AND layer='ltm'`).all()) {
    const s = Number(r.strength) || 0
    if (s < 0.6) strengthBuckets.low++
    else if (s < 2) strengthBuckets.mid++
    else strengthBuckets.high++
  }
  // 遗忘曲线：近 30 天按周分桶的平均强度（实际记忆池的「新鲜度地形」）
  const curve = db.prepare(`
    SELECT CAST((julianday('now') - julianday(created_at)) / 7 AS INTEGER) AS weeks_ago,
           ROUND(AVG(strength), 3) AS avg_strength, COUNT(*) AS n
    FROM memories WHERE ${VISIBLE_WHERE} AND layer='ltm' AND created_at >= datetime('now', '-30 days')
    GROUP BY weeks_ago ORDER BY weeks_ago
  `).all()
  return {
    totals: {
      all: count('deleted_at IS NULL'),
      ltmActive: count(`status='active' AND layer='ltm'`),
      stmActive: count(`status='active' AND layer='stm'`),
      pending: count(`status='pending' AND deleted_at IS NULL`),
      sleeping: count(`status='sleeping'`),
      rejected: count(`status='rejected' AND deleted_at IS NULL`),
      deleted: count(`status='deleted'`),
    },
    due, strengthBuckets, byLayer, curve,
    kinds: Object.fromEntries(db.prepare(`SELECT kind, COUNT(*) n FROM memories WHERE ${VISIBLE_WHERE} AND layer='ltm' GROUP BY kind`).all().map((r) => [r.kind, r.n])),
  }
}

/** 列表（管理页用）：任意状态可查。 */
export function list(root, { layer = '', status = '', kind = '', q = '', limit = 60, offset = 0 } = {}) {
  const db = getDb(root)
  const where = []
  const args = []
  if (layer) { where.push('layer = ?'); args.push(layer) }
  if (status) { where.push('status = ?'); args.push(status) } else if (status !== '*') where.push("status != 'deleted'")
  if (kind) { where.push('kind = ?'); args.push(kind) }
  if (q) { where.push('(title LIKE ? OR body LIKE ?)'); args.push(`%${q}%`, `%${q}%`) }
  const rows = db.prepare(`SELECT * FROM memories WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...args, Math.min(Number(limit) || 60, 200), Number(offset) || 0)
  return rows.map((r) => ({ ...r, tags: parseTags(r.tags) }))
}

export function getOne(root, id) {
  const db = getDb(root)
  const r = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  return r ? { ...r, tags: parseTags(r.tags) } : null
}

/**
 * 元记忆：关于某个主题我知道什么、多可信、变过几次。
 * 参考 dsh-chain 的 chain_about —— 只读，不触发强化（问了不等于想起）。
 * @returns {Array<{...mem, confirmed:number, neighbors:number, ageDays:number}>}
 */
export function about(root, query, { limit = 5 } = {}) {
  const db = getDb(root)
  const hits = search(root, query, { layers: ['ltm', 'stm'], limit, minScore: 0.3 })
  if (!hits.length) return []
  const now = Date.now()
  // 邻居 = 共享至少一个标签的 active 记忆数。无标签就是 0（审阅意见 ④：
  // 原实现拼出 `LIKE '%%'` 匹配全库，把「邻居」显示成整个库的条数）
  const tagPool = db.prepare(`SELECT id, tags FROM memories WHERE ${VISIBLE_WHERE} AND deleted_at IS NULL`).all()
    .map((r) => ({ id: r.id, tags: parseTags(r.tags) }))
  const neighborsOf = (tags, selfId) => {
    if (!tags.length) return 0
    const set = new Set(tags)
    // 排除自己要用 selfId：原来写的 p.id !== 0 恒为真（id 从 1 起），实际靠外层 -1 硬凑
    return tagPool.filter((p) => p.id !== selfId && p.tags.some((t) => set.has(t))).length
  }
  return hits.map((h) => {
    const confirmed = Number(db.prepare("SELECT COUNT(*) n FROM review_log WHERE memory_id = ? AND action IN ('approve','edit','reinforce')").get(h.id)?.n || 0)
    const neighbors = neighborsOf(h.tags, h.id)
    const ageDays = Math.round((now - (Date.parse(h.created_at) || now)) / 86400_000)
    const due = Date.parse(h.due_at || '') || 0
    const state = h.status === 'sleeping' ? '沉睡' : due && due <= now ? '待复习' : '生效'
    return {
      id: h.id, title: h.title, kind: h.kind, layer: h.layer, strength: h.strength, tags: h.tags,
      hits: h.hits, confirmed, neighbors, ageDays, status: state,
      lastReview: h.last_review_at || '', overdueDays: due && due <= now ? Math.round((now - due) / 86400_000) : 0,
    }
  })
}
