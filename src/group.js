// 审核列表分组：按记忆类别（kind）聚合。
// - 组顺序跟 KIND_ORDER 一致，未知类别排最后；
// - 组内保持传入顺序（API 已按强度/时间排好，分组不该重排）；
// 抽成纯模块是为了能在 smoke 里直接 import 测 —— JSX 里的逻辑测不到。
export const KIND_ORDER = ['knowledge', 'decision', 'mistake', 'preference', 'goal', 'trait', 'event', 'fact']

export function groupByKind(items) {
  const map = new Map()
  for (const m of items) {
    const k = m.kind || 'unknown'
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(m)
  }
  const rank = (k) => {
    const i = KIND_ORDER.indexOf(k)
    return i < 0 ? KIND_ORDER.length : i
  }
  // Array.prototype.sort 是稳定排序（ES2019+），同 rank 的组保持插入顺序
  return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]))
}
