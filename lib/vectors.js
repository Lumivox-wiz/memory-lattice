// 忆枢 · 本地向量语义召回（零依赖、零出站）
//
// 为什么需要它：BM25 是字面匹配，「换个说法就召回不到」是它的结构性死角。
// 宿主 llm 服务没有 embedding 接口（只有 stream），所以这里不依赖模型，
// 而用**分布论语义**（Harris 假设：常在同一语境出现的词，意义相近），
// 即经典 LSA 的轻量版：
//
//   1) 词-词共现：每篇记忆内取 idf 最高的 W 个词两两配对计数（控制规模）；
//   2) PPMI 加权：压掉「的/是/一个」这类高频词的权重，放大有信息量的搭配；
//   3) 符号哈希随机投影到 D 维（Johnson–Lindenstrauss，近似保余弦距离）——
//      不用做昂贵的 SVD，也不需要任何依赖；
//   4) 词向量按 idf 加权求和并归一化 → 文档向量；查询同法。
//
// 效果：即使「插件没挂上」和「扩展加载失败」没有任何共同字面，只要它们
// 反复与「bundle / 重启 / 报错」共同出现，余弦就会把它们拉到一起。
//
// 纪律：
//   - 语料太小（< 8 篇或词表 < 12）时**不启用**——共现统计没有意义，
//     强行给分只会制造假阳性；
//   - 纯本地计算，不发送任何内容；索引在内存里，按库签名（条数/最大 id/
//     最大 updated_at/总字数）失效重建；
//   - 只做候选召回，不替代 BM25 排序：字面命中永远优先（见 store.search 的融合）。

import { getDb } from './db.js'
import { tokenize } from './store.js'

/** 投影维度。D 越大越还原，但重建成本线性上升；128 对几千条记忆足够。 */
export const DIM = 128
/** 参与建索引的最大文档数（按 updated_at 取最近）。 */
export const MAX_DOCS = 2000
/** 每篇文档参与共现的词数上限（按位置均匀采样，覆盖全文而不只是开头）。 */
const TOKENS_PER_DOC = 80
/** 滑窗最大跨度（左右各 window 个词）。大库会按预算自动调小。 */
const MAX_WINDOW = 3
/** 全库共现对预算：按文档数分摊，避免 2000 条长记忆把内存撑爆。 */
const PAIR_BUDGET = 400_000
/**
 * 词频下限。**故意设成 1**：个人记忆库往往只有几十条，若要求「至少出现两次」，
 * 大部分专有词会被整批过滤掉，索引直接建不起来（实测 9 条记忆只剩 7 个共有词）。
 * PPMI 本身会按行/列和做归一，偶发词不会像想象中那样污染向量；
 * 真正的高频词（的/是/一个）则由 PPMI 归零、idf 加权一起压住。
 */
const MIN_DF = 1
/** 语料下限：低于此不启用（避免小库乱给分）。 */
const MIN_DOCS = 6
const MIN_VOCAB = 20

const cache = new Map() // root -> { sig, index, checkedAt }
/** 语料签名复查间隔（查一次是聚合查询，别在每轮提示组装里都扫全表）。 */
const SIG_TTL_MS = 3000

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 由词哈希确定性地生成 ±1/√D 的投影向量（xorshift32，跨会话稳定）。 */
function projection(seed) {
  const v = new Float32Array(DIM)
  let s = (seed || 1) >>> 0 || 1
  const scale = 1 / Math.sqrt(DIM)
  for (let i = 0; i < DIM; i++) {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    v[i] = (s & 1) ? scale : -scale
  }
  return v
}

function normalize(v) {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  if (sum <= 0) return null
  const inv = 1 / Math.sqrt(sum)
  for (let i = 0; i < v.length; i++) v[i] *= inv
  return v
}

function cosine(a, b) {
  let dot = 0
  for (let i = 0; i < DIM; i++) dot += a[i] * b[i]
  return dot // 两边都归一化过，点积即余弦
}

/** 文档分词：去掉单字（噪声大、且会让共现对数量爆炸）。 */
function docTerms(row) {
  const raw = tokenize(`${row.title || ''} ${row.body || ''} ${row.tags || ''}`)
  const out = new Set()
  for (const t of raw) if (t.length >= 2) out.add(t)
  return out
}

/**
 * 有序词序列（保留出现顺序，滑窗共现要用）。
 * 与 tokenize 同一套切分（拉丁词 + CJK bigram），只是不去重、保顺序。
 */
function docSequence(text) {
  const s = String(text || '').toLowerCase()
  const out = []
  for (const m of s.matchAll(/[a-z0-9_+#.-]{2,}|[\u4e00-\u9fff]{2,}/g)) {
    const seg = m[0]
    if (/^[a-z0-9_+#.-]+$/.test(seg)) out.push(seg)
    else for (let i = 0; i < seg.length - 1; i++) out.push(seg.slice(i, i + 2))
  }
  return out
}

/** 均匀采样到 n 个词：只截前 n 个会让「长记忆的结论段」完全进不了语境。 */
function capSequence(seq, n) {
  if (seq.length <= n) return seq
  const step = seq.length / n
  const out = []
  for (let i = 0; i < n; i++) out.push(seq[Math.floor(i * step)])
  return out
}

/** 语料签名：库一变就重建索引（比监听写入事件可靠）。 */
function corpusSignature(db) {
  const r = db.prepare(`SELECT COUNT(*) n, COALESCE(MAX(id),0) m,
      COALESCE(MAX(updated_at),'') u, COALESCE(SUM(LENGTH(title)+LENGTH(body)),0) l
    FROM memories WHERE deleted_at IS NULL AND status IN ('active','pending','sleeping')`).get()
  return `${r.n}|${r.m}|${r.u}|${r.l}`
}

/**
 * 建索引（纯计算，不写库）。
 * @returns {{dim:number, sig:string, vocabSize:number, docCount:number, vecs:Map<string,Float32Array>,
 *            docVecs:Map<number,Float32Array>, idf:Map<string,number>, builtAt:number}|null}
 */
export function buildIndex(root, { maxDocs = MAX_DOCS } = {}) {
  const db = getDb(root)
  const sig = corpusSignature(db)
  const rows = db.prepare(`SELECT id, title, body, tags FROM memories
    WHERE deleted_at IS NULL AND status IN ('active','pending','sleeping')
    ORDER BY updated_at DESC LIMIT ?`).all(maxDocs)
  if (rows.length < MIN_DOCS) return null

  const N = rows.length
  const docTermsList = rows.map((r) => docTerms(r))
  const df = new Map()
  for (const terms of docTermsList) for (const t of terms) df.set(t, (df.get(t) || 0) + 1)
  const idf = new Map()
  for (const [t, n] of df) {
    if (n < MIN_DF) continue
    idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)))
  }
  if (idf.size < MIN_VOCAB) return null

  // 词表下标化：共现用整数键（number），避免几百万个字符串键把内存吃光
  const terms = [...idf.keys()]
  const tid = new Map(terms.map((t, i) => [t, i]))
  const V = terms.length

  // ① 共现：**滑窗局部语境**（左右各 window 个词，按距离 1/d 加权）。
  //
  // 为什么不是「全文档两两」：那样常用词（插件/失败/记忆）几乎永远排不进
  // 「每篇 idf 最强的 N 个词」，于是拿不到向量 —— 而查询里恰恰全是这类词，
  // 实测真库上所有查询都因此返回 (none)，整个通道形同关闭。
  // 滑窗覆盖每个出现的词，也让「同句同段」的搭配权重高于「同文档但隔很远」。
  const perDocPairs = Math.max(24, Math.min(600, Math.floor(PAIR_BUDGET / rows.length)))
  const window = Math.max(1, Math.min(MAX_WINDOW, Math.floor(perDocPairs / (TOKENS_PER_DOC * 2)) || 1))
  const co = new Map() // a*V+b -> 加权计数 （a<b）
  const seqtokens = rows.map((r) => capSequence(docSequence(`${r.title || ''} ${r.body || ''} ${r.tags || ''}`), TOKENS_PER_DOC))
  for (const seq of seqtokens) {
    const ids = []
    for (const t of seq) {
      const i = tid.get(t)
      if (i !== undefined) ids.push(i)
    }
    for (let i = 0; i < ids.length; i++) {
      for (let d = 1; d <= window && i + d < ids.length; d++) {
        const a = Math.min(ids[i], ids[i + d])
        const b = Math.max(ids[i], ids[i + d])
        if (a === b) continue
        const key = a * V + b
        co.set(key, (co.get(key) || 0) + 1 / d)
      }
    }
  }
  if (!co.size) return null

  // ② PPMI：需要行和与总和
  const rowSum = new Float64Array(V)
  let total = 0
  for (const [key, cnt] of co) {
    const a = Math.floor(key / V), b = key % V
    rowSum[a] += cnt; rowSum[b] += cnt
    total += cnt
  }
  if (total <= 0) return null

  // ③ 随机投影：vec[t] = Σ_c ppmi(t,c) · r[c]
  const proj = new Array(V)
  const vecs = new Map()
  const touch = (i) => {
    let v = vecs.get(terms[i])
    if (!v) { v = new Float32Array(DIM); vecs.set(terms[i], v) }
    return v
  }
  const getProj = (i) => {
    if (!proj[i]) proj[i] = projection(fnv1a(terms[i]))
    return proj[i]
  }
  for (const [key, cnt] of co) {
    const a = Math.floor(key / V), b = key % V
    const denom = rowSum[a] * rowSum[b]
    if (!denom) continue
    const ppmi = Math.log((cnt * total) / denom)
    if (!(ppmi > 0)) continue
    const va = touch(a), vb = touch(b)
    const pa = getProj(a), pb = getProj(b)
    for (let d = 0; d < DIM; d++) {
      va[d] += ppmi * pb[d]
      vb[d] += ppmi * pa[d]
    }
  }
  for (const [t, v] of vecs) {
    if (!normalize(v)) vecs.delete(t)
  }
  if (vecs.size < MIN_VOCAB) return null

  // ④ 文档向量：idf 加权词向量求和
  const docVecs = new Map()
  rows.forEach((row, idx) => {
    const acc = new Float32Array(DIM)
    let touched = false
    for (const t of docTermsList[idx]) {
      const w = idf.get(t)
      const v = vecs.get(t)
      if (!w || !v) continue
      touched = true
      for (let d = 0; d < DIM; d++) acc[d] += w * v[d]
    }
    if (!touched) return
    const n = normalize(acc)
    if (n) docVecs.set(row.id, n)
  })

  return { dim: DIM, sig, vocabSize: vecs.size, docCount: rows.length, vecs, docVecs, idf, builtAt: Date.now() }
}

/**
 * 取索引（**非阻塞**）：缓存命中且签名一致就直接用；否则立刻返回旧索引（或 null），
 * 把重建丢到事件循环下一拍。
 *
 * 为什么不能同步建：`search()` 会被自动召回注入调用，也就是**每次组装系统提示时**都会跑。
 * 记忆接近 2000 条时一次重建要几百毫秒，会把首轮响应拖住（复核建议）。
 * 重建完成前退回纯字面检索，结果只是「这轮没有语义补召」，不会错也不会卡。
 */
export function getIndex(root, { rebuild = false } = {}) {
  try {
    const hit = cache.get(root)
    if (rebuild) return warmIndex(root)
    if (!hit) { scheduleBuild(root); return null }
    if (Date.now() - (hit.checkedAt || 0) > SIG_TTL_MS) {
      const db = getDb(root)
      const sig = corpusSignature(db)
      hit.checkedAt = Date.now()
      if (sig !== hit.sig) {
        hit.sig = sig
        scheduleBuild(root)
      }
    }
    return hit.index // 过期索引也先顶着：调用方只会拿它给**当前候选集**打分，不会引入已删条目
  } catch {
    return null
  }
}

/** 同步重建（激活预热 / 诊断 / 测试用）。 */
export function warmIndex(root) {
  try {
    const db = getDb(root)
    const sig = corpusSignature(db)
    const index = buildIndex(root)
    cache.set(root, { sig, index, checkedAt: Date.now() })
    if (cache.size > 8) cache.clear()
    return index
  } catch {
    return null
  }
}

const building = new Set()
function scheduleBuild(root) {
  if (building.has(root)) return
  building.add(root)
  const run = () => {
    building.delete(root)
    try { warmIndex(root) } catch { /* 建失败就继续用字面检索 */ }
  }
  if (typeof setImmediate === 'function') setImmediate(run)
  else setTimeout(run, 0)
}

export function clearIndexCache() { cache.clear(); building.clear() }

/** 查询向量化（词表外的词忽略：没有上下文信息，无法投影）。 */
export function queryVector(index, query) {
  if (!index) return null
  const acc = new Float32Array(DIM)
  let touched = false
  const raw = tokenize(query)
  for (const t of raw) {
    if (t.length < 2) continue
    const w = index.idf.get(t)
    const v = index.vecs.get(t)
    if (!w || !v) continue
    touched = true
    for (let d = 0; d < DIM; d++) acc[d] += w * v[d]
  }
  return touched ? normalize(acc) : null
}

/**
 * 语义打分：id → 余弦（0~1，负值截零）。
 * @returns {Map<number, number>|null} null = 索引不可用（语料太小/出错），调用方回退纯 BM25
 */
export function semanticScores(root, query, { index = null } = {}) {
  const idx = index || getIndex(root)
  if (!idx) return null
  const qv = queryVector(idx, query)
  if (!qv) return null
  const out = new Map()
  for (const [id, dv] of idx.docVecs) {
    const s = cosine(qv, dv)
    if (s > 0.05) out.set(id, Math.min(1, s))
  }
  return out.size ? out : null
}

/** 诊断用：索引是否可用、规模多大。 */
export function indexStats(root) {
  // 诊断/测试路径走同步重建，保证「问的是当前真实状态」
  const idx = getIndex(root, { rebuild: true })
  if (!idx) return { ready: false, reason: '语料太少（需要 ≥8 条记忆且 ≥12 个共有词）或建索引失败' }
  return {
    ready: true, dim: idx.dim, vocabSize: idx.vocabSize, docCount: idx.docCount,
    builtAt: new Date(idx.builtAt).toISOString(),
  }
}
