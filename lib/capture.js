// 忆枢 · 会话捕获：turn-stopping 事件 → 短期记忆（可选 LLM 蒸馏）
//
// 与 memory-eternal 的差异：
// - 默认目标是 **STM**（原始事件层，48h 生命期），不是直接蒸馏成 LTM 卡——
//   LTM 必须经过「命中/晋升 → 审核」才入主库，这是长期记忆质量的闸门。
// - 蒸馏（LLM 压缩成结构化条目）是可选加速：关闭或模型不可用时，落原始事件摘要进 STM，
//   照样参与召回与晋升判定（零 LLM 消耗的降级路径）。

import { writeMemory } from './store.js'

/** 事件 → 会话文本（沿用 memory-eternal 验证过的事件形状）。 */
export function eventsToText(events, { maxChars = 20000 } = {}) {
  const lines = []
  const push = (role, raw) => {
    const text = String(raw || '').replace(/\s+/g, ' ').trim()
    if (text) lines.push(`${role}：${text}`)
  }
  const pushMessage = (data) => {
    const message = data?.message || data || {}
    const role = message.role === 'user' ? '用户' : '助手'
    const content = message.content
    if (Array.isArray(content)) {
      for (const block of content) if (block.type === 'text' && block.text) push(role, block.text)
    } else if (typeof content === 'string' && content) push(role, content)
  }
  for (const event of events || []) {
    const type = event?.type
    const data = event?.data || event
    if (type === 'user/message' || (type === 'message' && data?.role === 'user')) pushMessage(data)
    else if (type === 'assistant/message') pushMessage(data)
    else if (type === 'assistant/chunk' && data?.chunk?.content) {
      const c = data.chunk.content
      if (typeof c === 'string') push('助手', c)
      else if (Array.isArray(c)) for (const block of c) if (block.type === 'text' && block.text) push('助手', block.text)
    }
  }
  return lines.join('\n').slice(0, maxChars).trim()
}

const DISTILL_SYSTEM = `你是记忆蒸馏器。从对话片段中提取「值得记住的条目」。输出 JSON：
{"items":[{"title":"≤30字标题","body":"≤300字要点","kind":"knowledge|decision|mistake|preference|goal|trait|event|fact","tags":["标签"],"layer":"stm|ltm"}]}
规则：
- 只提取有复用价值的信息（决策及理由、踩坑、用户偏好、目标、事实）；寒暄/过程性内容输出空 items。
- layer 判断：确定长期有效的用户偏好/目标/项目决策用 "ltm"；仅近期上下文相关用 "stm"。
- preference/trait/goal 三类必须是「关于用户或项目」的稳定事实，不是本次对话的临时内容。
- 最多 5 条；没有值得记的就输出 {"items":[]}。`

/**
 * 截断但保住结论：长对话的结论永远在**最后**，直接 slice(0, N) 会把它切掉
 * （审阅意见 ⑦）。保留头部 35% + 尾部 65%，中间用标记省略。
 */
export function takeHeadTail(text, maxChars = 12000, headRatio = 0.35) {
  const s = String(text || '')
  if (s.length <= maxChars) return s
  const headLen = Math.floor(maxChars * headRatio)
  const tailLen = maxChars - headLen
  return `${s.slice(0, headLen)}\n……（中间省略 ${s.length - maxChars} 字）……\n${s.slice(-tailLen)}`
}

/**
 * 蒸馏一轮对话 → 记忆条目。
 * @returns {Promise<Array<{title,body,kind,tags,layer}>>} 空数组 = 没东西可存 / 蒸馏失败
 */
export async function distillTurn(llm, route, turnText, { maxTokens = 1500 } = {}) {
  const { callLlmJson, parseJsonLoose } = await import('./llm.js')
  const res = await callLlmJson(llm, route, {
    system: DISTILL_SYSTEM,
    user: takeHeadTail(turnText, 12000),
    maxTokens, purpose: 'memory-lattice-distill',
  })
  if (res.failure) throw Object.assign(new Error(res.failure.message), { code: res.failure.code })
  const parsed = parseJsonLoose(res.text)
  if (!parsed || !Array.isArray(parsed.items)) return []
  return parsed.items
    .filter((it) => it && typeof it.title === 'string' && it.title.trim())
    .slice(0, 5)
    .map((it) => ({
      title: String(it.title).slice(0, 120),
      body: String(it.body || '').slice(0, 2000),
      kind: ['knowledge', 'decision', 'mistake', 'preference', 'goal', 'trait', 'event', 'fact'].includes(it.kind) ? it.kind : 'knowledge',
      tags: Array.isArray(it.tags) ? it.tags : [],
      layer: it.layer === 'ltm' ? 'ltm' : 'stm',
    }))
}

/**
 * 把一轮对话写进记忆库（蒸馏 + 落库 + 配额由调用方控制）。
 * @param {object} opts {root, llm?, route?, turnText, captureMinChars, distillEnabled, dedupThreshold, submittedBy}
 * @returns {Promise<{mode:'distilled'|'raw'|'skipped', written:number, error?:string}>}
 */
export async function captureTurn({ root, llm, route, turnText, captureMinChars = 200, distillEnabled = true, dedupThreshold = 0.85, submittedBy = 'deepseek-harness' }) {
  const text = String(turnText || '').trim()
  if (text.length < captureMinChars) return { mode: 'skipped', written: 0 }

  if (distillEnabled && llm && route) {
    try {
      const items = await distillTurn(llm, route, text)
      let written = 0
      for (const it of items) {
        writeMemory(root, { ...it, source: 'auto', submittedBy, dedupThreshold })
        written++
      }
      if (written > 0) return { mode: 'distilled', written }
      return { mode: 'skipped', written: 0 } // 模型判断无值得记
    } catch (e) {
      // 蒸馏失败 → 降级为原始 STM（记录原因，让上层决定要不要报健康状态）
      writeMemory(root, {
        layer: 'stm', kind: 'event',
        title: `[原始捕获] ${text.slice(0, 60)}`,
        body: takeHeadTail(text, 6000),
        tags: ['raw'], source: 'auto-fallback', submittedBy, dedupThreshold,
      })
      return { mode: 'raw', written: 1, error: String(e?.message || e) }
    }
  }

  writeMemory(root, {
    layer: 'stm', kind: 'event',
    title: `[原始捕获] ${text.slice(0, 60)}`,
    body: takeHeadTail(text, 6000),
    tags: ['raw'], source: 'auto', submittedBy, dedupThreshold,
  })
  return { mode: 'raw', written: 1 }
}
