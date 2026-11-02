// 预览入口：stub fetch（假数据）+ 假 ctx 注入样式，渲染 App 并自动打开云图弹窗
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App, apply } from '../src/client.jsx'

const now = Date.now()
const iso = (d) => new Date(now - d * 86400_000).toISOString()
const TAGS = ['dsh', '记忆', 'Hermes', 'QQ', '游戏', '网络']
const KINDS = ['knowledge', 'decision', 'mistake', 'preference', 'goal', 'trait', 'event', 'fact']
const nodes = Array.from({ length: 34 }, (_, i) => ({
  id: i + 1, layer: i % 9 === 0 ? 'stm' : 'ltm', kind: KINDS[i % KINDS.length],
  label: `测试记忆条目 ${i + 1}`, strength: 0.4 + (i % 7) * 0.6,
  tags: [TAGS[i % TAGS.length], TAGS[(i + 2) % TAGS.length]],
}))
const edges = []
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const shared = nodes[i].tags.filter((t) => nodes[j].tags.includes(t))
    if (shared.length) edges.push({ a: nodes[i].id, b: nodes[j].id, w: Math.min(shared.length, 3), kind: 'tag' })
  }
}

const realFetch = window.fetch
window.fetch = async (url, opts) => {
  const path = String(url)
  const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })
  if (path.includes('/session')) return json({ ok: true, token: 'preview-token' })
  if (path.includes('/overview')) return json({
    ok: true, totals: { all: 34, ltmActive: 30, stmActive: 4, pending: 2, sleeping: 3, rejected: 1, deleted: 0 },
    due: 6, strengthBuckets: { low: 4, mid: 18, high: 8 }, kinds: {}, byLayer: {},
    curve: [0, 1, 2, 3, 4].map((w) => ({ weeks_ago: w, avg_strength: +(1.8 - w * 0.25).toFixed(2), n: 10 })),
  })
  if (path.includes('/list')) return json({ ok: true, items: [] })
  if (path.includes('/graph')) return json({ ok: true, nodes, edges })
  if (path.includes('/patrol/queue')) return json({ ok: true, generatedAt: new Date().toISOString(), truncated: false, totalRows: 34, scanLimit: 1500,
    neverHit: [{ id: 12, title: '旧的项目脚手架约定', kind: 'knowledge', layer: 'ltm', strength: 1, hits: 0, status: 'active', tags: [] }, { id: 18, title: '一次性排查记录', kind: 'event', layer: 'ltm', strength: 0.8, hits: 0, status: 'active', tags: [] }],
    dups: [{ a: { id: 21, title: '插件热重载要重启', strength: 1.2, hits: 3 }, b: { id: 22, title: '插件热重载不生效', strength: 1.1, hits: 2 } }],
    conflicts: [{ a: { id: 25, title: '记忆库放 D 盘', strength: 1.5, hits: 4 }, b: { id: 26, title: '记忆库不要放 D 盘', strength: 1.2, hits: 1 } }],
    fading: [{ id: 30, title: '早期讨论的命名约定', strength: 0.42, hits: 1 }],
    unclassified: [{ id: 33, title: '关于 junction 的一个结论', strength: 1.0, hits: 2 }],
    working: [] })
  if (path.includes('/patrol')) return json({ ok: true, latest: { day: '2026-11-02', summary: '久未命中 3 · 疑似重复 1 · 矛盾 0 · 将被遗忘 2 · 未归类 4' }, content: '# 忆枢夜巡报告\n\n## ① 久未命中（3）\n- #12 …' })
  if (path.includes('/working')) return json({ ok: true, items: [{ id: 1, kind: 'todo', text: '记得明天把设计稿发给老王', suggested: 1 }, { id: 2, kind: 'promise', text: '答应过把夜巡报告加按钮', suggested: 0 }] })
  if (path.includes('/providers')) return json({ ok: true, providers: [
    { id: 'deepseek-account', name: 'DeepSeek（账号）', models: [{ id: 'deepseek-chat', name: 'deepseek-chat' }, { id: 'deepseek-reasoner', name: 'deepseek-reasoner' }] },
    { id: 'llm-local', name: '本地 Ollama', models: [{ id: 'qwen2.5:7b', name: 'qwen2.5:7b' }] },
  ] })
  if (path.includes('/persona')) return json({ ok: true, current: null, timeline: [] })
  if (path.includes('/backup')) {
    if ((opts && opts.method) === 'POST') return json({ ok: true, stats: { mode: 'incremental', memories: 7, personas: 1, deletions: 2, bytes: 18432, encrypted: true, watermark: '2026-11-02 12:00:00' }, text: '{"format":"memory-lattice-export/v2"}' })
    return json({ ok: true, watermark: '2026-11-01 18:00:00', format: 'memory-lattice-export/v2' })
  }
  if (path.includes('/retention')) return json({ ok: true, kinds: [
    { kind: 'knowledge', core: false, days: 365, max: 5000 }, { kind: 'decision', core: false, days: null, max: null },
    { kind: 'mistake', core: false, days: null, max: null }, { kind: 'event', core: false, days: 90, max: 500 },
    { kind: 'fact', core: false, days: null, max: null }, { kind: 'preference', core: true, days: null, max: null },
    { kind: 'goal', core: true, days: null, max: null }, { kind: 'trait', core: true, days: null, max: null },
  ], policyText: 'event:90,knowledge:365' })
  if (path.includes('/import/preview')) return json({ ok: true, total: 32, create: 27, skip: 5, merge: 0,
    byKind: { knowledge: 14, decision: 9, mistake: 5, preference: 4 }, byLayer: { ltm: 30, stm: 2 },
    byStatus: { active: 30, pending: 2 }, personaTotal: 3, personaNew: 2,
    samples: [{ title: 'DSH 插件打包必须导出 ./client', action: 'skip' }, { title: 'Watt Toolkit 劫持 github 域名', action: 'create' }], issues: [] })
  if (path.includes('/config')) return json({ ok: true, config: {}, settings: {} })
  return realFetch(url, opts)
}

// 假 ctx：只为跑 apply 里的样式注入与 section 渲染
let sectionEl = null
const fakeCtx = {
  get: () => undefined,
  on: () => () => {},
  off: () => {},
  effect(fn) { try { return fn() } catch { return undefined } },
  inject() {},
  systemPrompt: { section: () => () => {} },
  slots: {
    inject(name, fn) { try { fn() } catch { /* sidebar 注入在无 slots 环境下忽略 */ } },
    register(opts, render) { if (opts?.name === 'settings.section') sectionEl = render(); return null },
  },
  fiber: { entry: { options: { id: 'memory-lattice' } } },
}
apply(fakeCtx)

const root = createRoot(document.getElementById('root'))
root.render(sectionEl || <App />)

// 自动：切到云图 → 点放大查看（#overview / #config 时停在对应页，给截图用）
if (location.hash === '#config') {
  setTimeout(() => {
    const tab = [...document.querySelectorAll('.ml-tab')].find((b) => b.textContent.includes('配置'))
    if (tab) tab.click()
  }, 500)
} else if (location.hash === '#queue') {
  setTimeout(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === '处理队列')
    if (btn) btn.click()
  }, 700)
} else if (location.hash === '#persona') {
  setTimeout(() => {
    const tab = [...document.querySelectorAll('.ml-tab')].find((b) => b.textContent.includes('人格'))
    if (tab) tab.click()
  }, 500)
} else if (location.hash !== '#overview') setTimeout(() => {
  const tab = [...document.querySelectorAll('.ml-tab')].find((b) => b.textContent.includes('云图'))
  if (tab) tab.click()
  setTimeout(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === '放大查看')
    if (btn) btn.click()
    setTimeout(() => {
      const wrap = document.querySelector('.ml-graph-full')
      const diag = document.createElement('pre')
      diag.id = 'diag'
      diag.style.cssText = 'position:fixed;bottom:0;left:0;z-index:99999;background:#000c;color:#0f0;font-size:11px;margin:0;padding:4px;max-height:40vh;overflow:auto'
      if (wrap) {
        const cs = getComputedStyle(wrap)
        const wraps = [...document.querySelectorAll('.ml-graph-wrap')].map((w) => {
          const c = w.querySelector('canvas')
          const r = w.getBoundingClientRect()
          const cr = c && c.getBoundingClientRect()
          return {
            cls: w.className, rect: [r.x | 0, r.y | 0, r.width | 0, r.height | 0].join(','),
            attr: c ? c.width + 'x' + c.height : 'none',
            styleWH: c ? c.style.width + '|' + c.style.height : '-',
            canvasRect: cr ? [cr.width | 0, cr.height | 0].join(',') : '-',
          }
        })
        diag.textContent = JSON.stringify({
          pos: cs.position, h: cs.height, wrapRect: [wrap.offsetTop, wrap.offsetHeight].join('x'),
          dpr: window.devicePixelRatio, wraps,
        })
      } else diag.textContent = 'NO .ml-graph-full FOUND'
      document.body.appendChild(diag)
      document.title = 'PREVIEW-READY'
    }, 400)
  }, 400)
}, 400)
