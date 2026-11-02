// 忆枢 · 语义扩写（可选，默认关）
//
// 复核已知限制：「换个说法、字面不沾边就召回不到」——纯 BM25 无解，零依赖也做不了向量。
// 折中方案：用模型把查询改写成几条同义/上位/近义短语，再分别做 BM25，结果合并。
// 纪律：
//   - 只有用户显式开启 semanticRecall 且配了 Provider 才会调用（出站，默认关）；
//   - 只用于 memory_recall 工具（自动注入保持确定性，不让每轮产生模型调用）；
//   - 任何失败都静默回到单路检索，扩写只是加分项；
//   - 结果合并按 id 去重取最高分，并打 _viaExpansion 标记（便于排查）。

import { callLlmJson, parseJsonLoose } from './llm.js'

const cache = new Map() // query → { at, queries }
const TTL_MS = 60 * 60_000

const SYSTEM = `你是检索查询扩写器。把用户的一句话改写成 3-5 条**等价或相关**的检索短语，用于在个人记忆库里按字面匹配召回。
要求：
- 保留原意，换用不同的说法、同义词、上位词；专有名词原样保留；
- 每条 ≤20 字，不要解释，不要编号；
- 输出 JSON：{"queries":["...","..."]}`

/** 解析模型输出为字符串数组（容错）。 */
export function parseExpansions(parsed) {
  const list = Array.isArray(parsed) ? parsed : parsed?.queries
  if (!Array.isArray(list)) return []
  return list
    .map((q) => (typeof q === 'string' ? q : q?.query || q?.text || ''))
    .map((q) => String(q).trim())
    .filter((q) => q.length >= 2 && q.length <= 40)
    .slice(0, 5)
}

/** 取扩写结果（带 1 小时缓存）。失败返回 []。 */
export async function expandQuery(llm, route, query) {
  const key = String(query || '').trim()
  if (!key || !llm || !route) return []
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.queries
  try {
    const res = await callLlmJson(llm, route, {
      system: SYSTEM,
      user: key.slice(0, 300),
      maxTokens: 300,
      purpose: 'memory-lattice-expand',
    })
    if (res.failure) return []
    const queries = parseExpansions(parseJsonLoose(res.text))
    if (cache.size > 300) cache.clear()
    cache.set(key, { at: Date.now(), queries })
    return queries
  } catch {
    return []
  }
}

/**
 * 合并多路检索结果：同 id 取最高分，扩写命中的打标记。
 * 纯函数，便于测试。
 * @param {Array} primary 原始查询的命中
 * @param {Array<Array>} expanded 扩写查询各自的命中
 */
export function mergeHits(primary, expanded) {
  const byId = new Map()
  for (const h of primary) byId.set(h.id, { ...h, _viaExpansion: false })
  for (const list of expanded) {
    for (const h of list) {
      const prev = byId.get(h.id)
      if (!prev) byId.set(h.id, { ...h, _viaExpansion: true })
      else if ((h._score || 0) > (prev._score || 0)) byId.set(h.id, { ...h, _viaExpansion: prev._viaExpansion })
    }
  }
  return [...byId.values()].sort((a, b) => (b._score || 0) - (a._score || 0))
}
