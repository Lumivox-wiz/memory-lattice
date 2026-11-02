// 忆枢 · LLM 路由与调用（沿用 memory-eternal 验证过的宿主 llm 服务约定）
//
// llm.listProviders() → [{id}]；llm.listModels(id) → [{id}]；llm.stream(options) → chunk 流，
// 用 @deepseek-ai/dsh-llm 的 BlockAssembler 聚块、createUserMessage 构消息。
// 全部延迟 import：独立进程（无 DSH 环境）拿不到就如实报错，不猜。

let helpersCache = null
async function llmHelpers() {
  if (helpersCache) return helpersCache
  const { BlockAssembler, createUserMessage } = await import('@deepseek-ai/dsh-llm')
  helpersCache = { BlockAssembler, createUserMessage }
  return helpersCache
}

/**
 * 取模型候选路由（按 provider 顺序，配置的 provider/model 优先）。
 * @returns {Promise<Array<{provider:string, model:string, reasoningEffort?:null}>>}
 */
export async function routeCandidates(llm, { provider = '', model = '' } = {}) {
  const out = []
  if (!llm || typeof llm.listProviders !== 'function') return out
  let providers = []
  try { providers = llm.listProviders() || [] } catch { return out }
  const push = (pid, mid) => {
    if (!pid || !mid || out.some((r) => r.provider === pid)) return
    out.push({ provider: pid, model: mid, reasoningEffort: null }) // 默认关 reasoning：省 token，蒸馏不需要
  }
  const firstModel = async (id) => {
    try { const list = await llm.listModels(id); return Array.isArray(list) && list[0]?.id ? list[0].id : '' } catch { return '' }
  }
  if (provider) await firstModel(provider).then((m) => push(provider, model || m))
  for (const p of providers) {
    if (!p?.id || out.some((r) => r.provider === p.id)) continue
    push(p.id, await firstModel(p.id))
  }
  return out
}

/**
 * 一次 LLM 调用，期望返回 JSON（自动剥 ```json 围栏）。
 * @returns {{text:string}|{failure:{code:string,message:string}}}
 */
export async function callLlmJson(llm, route, { system = '', user = '', maxTokens = 1500, purpose = 'memory-lattice' } = {}) {
  const { BlockAssembler, createUserMessage } = await llmHelpers()
  const messages = [createUserMessage({
    content: [{ type: 'text', text: String(user || '') }],
    source: { kind: 'plugin', plugin: 'memory-lattice' },
  })]
  const options = {
    provider: route.provider, model: route.model, messages,
    ...(system ? { system } : {}), maxTokens,
    ...(route.reasoningEffort === null ? {} : { reasoningEffort: route.reasoningEffort }),
    purpose, signal: AbortSignal.timeout(90000),
  }
  const run = async (o) => {
    const asm = new BlockAssembler()
    for await (const chunk of llm.stream(o)) asm.push(chunk)
    return asm
  }
  let asm
  try { asm = await run(options) } catch (e) {
    return { failure: { code: 'EXCEPTION', message: String(e?.message || e) } }
  }
  const finish = asm.finish && typeof asm.finish === 'object' ? asm.finish : { kind: 'stop' }
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    const f = finish.failure || {}
    return { failure: { code: String(f.code || finish.kind), message: String(f.message || f.detail || '模型调用失败') } }
  }
  const text = asm.blocks().filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  return { text }
}

/** 从模型输出里剥出 JSON（容忍 ```json 围栏与前后杂文字）。 */
export function parseJsonLoose(text) {
  if (!text) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) return null
  try { return JSON.parse(raw.slice(start)) } catch {
    // 尾部截断兜底：补齐到能解析为止（只处理最常见的缺右括号）
    for (let end = raw.length; end > start; end--) {
      const slice = raw.slice(start, end)
      try { return JSON.parse(slice) } catch { continue }
    }
    return null
  }
}
