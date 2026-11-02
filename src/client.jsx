// 忆枢 · DSH 客户端（设置页 section + 侧栏入口弹窗）
// 跟随 DSH 原生风格：全部颜色/圆角取 --dsw-alias-* 变量，不引入自有品牌色。
// 构建由 tools/build.mjs 完成（esbuild，react/react-dom/jsx-runtime 走宿主 require）。

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { NebulaGraph } from './graph3d.jsx'

const PLUGIN_ID = 'memory-lattice'
const API = '/memory-lattice/api'

const CSS = `
.ml-root { color: var(--dsw-alias-label-primary, #1f2937); font-size: 13px; }
.ml-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
.ml-tab { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.ml-tab.ml-on { background: var(--dsw-alias-accent, #2563eb) !important; color: #fff !important; border-color: transparent; }
.ml-pane { display: flex; flex-direction: column; gap: 10px; }
.ml-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.ml-stat { text-align: center; background: linear-gradient(145deg, var(--dsw-alias-bg-layer-1, #fff), var(--dsw-alias-bg-base, #f4f6fb));
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 12px; padding: 10px 4px;
  transition: transform .15s ease, box-shadow .15s ease; }
.ml-stat:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(30,50,120,.1); }
.ml-stat b { display: block; font-size: 20px; line-height: 1.3; }
.ml-stat span { font-size: 11px; opacity: .65; }
.ml-panel { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 10px; padding: 12px 14px; }
.ml-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; }
.ml-bars { display: flex; flex-direction: column; gap: 6px; }
.ml-bar-row { display: grid; grid-template-columns: 84px 1fr 32px; align-items: center; gap: 8px; font-size: 12px; }
.ml-bar { height: 12px; background: var(--dsw-alias-bg-base, #f3f4f6); border-radius: 6px; overflow: hidden; }
.ml-bar i { display: block; height: 100%; border-radius: 6px; transition: width .3s; }
.ml-curve { width: 100%; max-height: 180px; }
.ml-filter { display: flex; gap: 6px; flex-wrap: wrap; }
.ml-filter input[type=text], .ml-filter input:not([type]) { flex: 1; min-width: 140px; padding: 6px 10px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; font-size: 12px; }
.ml-filter select { padding: 5px 6px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; font-size: 12px; }
.ml-card { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 10px; padding: 8px 12px; transition: border-color .15s, box-shadow .15s; }
.ml-card:hover { border-color: var(--dsw-alias-accent, #2563eb); box-shadow: 0 3px 14px rgba(30,50,120,.08); }
.ml-card[data-status=pending] { border-left: 3px solid #F59E0B; }
.ml-card[data-status=sleeping] { opacity: .6; border-left: 3px solid #6B7280; }
.ml-card[data-status=rejected] { opacity: .5; }
.ml-card[data-status=deleted] { opacity: .4; }
.ml-card-head { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.ml-card-title { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-kind-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ml-card-meta { display: flex; gap: 4px; flex: none; }
.ml-chip { font-size: 10px; font-style: normal; padding: 1px 6px; border-radius: 999px;
  background: var(--dsw-alias-bg-base, #f3f4f6); color: var(--dsw-alias-label-secondary, #666); }
.ml-chip-stm { background: rgba(6,182,212,.15); color: #0891b2; }
.ml-chip-pending { background: rgba(245,158,11,.18); color: #b45309; }
.ml-chip-sleeping { background: rgba(107,114,128,.18); }
.ml-card-body { margin-top: 8px; border-top: 1px dashed var(--dsw-alias-border-l1, #e5e7eb); padding-top: 8px; }
.ml-body { white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 12px; margin: 0 0 6px;
  max-height: 220px; overflow: auto; }
.ml-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.ml-tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: rgba(59,130,246,.12); color: var(--dsw-alias-accent, #2563eb); }
.ml-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ml-card-actions button, .ml-panel-head button, .ml-filter button, .ml-actions button, .ml-node-info button, .ml-modal-head button {
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
.ml-card-actions button:hover, .ml-panel-head button:hover, .ml-filter button:hover { opacity: .8; }
.ml-danger { color: #dc2626 !important; border-color: rgba(220,38,38,.4) !important; }
.ml-primary { background: var(--dsw-alias-accent, #2563eb) !important; color: #fff !important; }
.ml-empty { text-align: center; padding: 26px 10px; opacity: .55; font-size: 12px; }
.ml-hint { font-size: 11px; opacity: .6; background: var(--dsw-alias-bg-base, #f9fafb);
  border-radius: 8px; padding: 7px 10px; }
.ml-dim { opacity: .5; font-size: 11px; margin-left: auto; }
.ml-md { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 10px; padding: 12px 16px; line-height: 1.65; font-size: 12.5px; }
.ml-md .ml-h { font-weight: 700; margin: 10px 0 4px; }
.ml-md .ml-h:first-child { margin-top: 0; }
.ml-md .ml-h2, .ml-md .ml-h3 { font-size: 13px; border-left: 3px solid var(--dsw-alias-accent, #2563eb); padding-left: 8px; }
.ml-md ul { margin: 4px 0; padding-left: 18px; }
.ml-timeline { display: flex; flex-direction: column; gap: 6px; }
.ml-snap { display: flex; flex-direction: column; gap: 2px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 12px; }
.ml-snap:hover { border-color: var(--dsw-alias-accent, #2563eb); }
.ml-snap span { opacity: .6; font-size: 11px; }
.ml-snap-view { border-color: var(--dsw-alias-accent, #2563eb); }
.ml-graph-wrap { position: relative; min-height: 320px; height: 420px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 12px; overflow: hidden; }
.ml-graph-inner { position: relative; width: 100%; height: 100%; }
.ml-graph-wrap canvas { display: block; width: 100%; height: 100%; }
/* 星云版：深空底色固定（画布自己画背景），玻璃图例 */
.ml-graph-nebula { background: #0a0f1f; border-color: rgba(120,140,220,.25); }
.ml-graph-legend { position: absolute; left: 12px; bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;
  align-items: center; font-size: 10px; pointer-events: none; color: #aeb8dd;
  background: rgba(10,16,34,.55); backdrop-filter: blur(6px); padding: 4px 10px; border-radius: 8px;
  border: 1px solid rgba(120,140,220,.18); }
.ml-graph-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px;
  box-shadow: 0 0 6px currentColor; }
.ml-node-info { position: absolute; top: 12px; right: 12px; display: flex; gap: 10px; align-items: center;
  background: rgba(10,16,34,.72); backdrop-filter: blur(8px); border: 1px solid rgba(120,140,220,.3);
  border-radius: 10px; padding: 8px 14px; font-size: 12px; color: #dbe3ff;
  box-shadow: 0 6px 24px rgba(0,0,0,.4); max-width: 60%; }
.ml-node-info span { opacity: .75; }
.ml-node-info button { margin-left: auto; color: #dbe3ff !important; border-color: rgba(120,140,220,.4) !important; background: transparent !important; }
.ml-graph-tools { display: flex; gap: 6px; }
.ml-graph-tools button { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
.ml-graph-tools button:hover { opacity: .85; }
.ml-graph-tools .ml-tgl-on { background: var(--dsw-alias-accent, #2563eb) !important; color: #fff !important; border-color: transparent !important; }
.ml-empty-dark { color: #8b95b0; }
.ml-patrol { white-space: pre-wrap; word-break: break-word; font: 11px/1.6 ui-monospace, monospace; margin: 8px 0 0;
  max-height: 320px; overflow: auto; background: var(--dsw-alias-bg-base, #f9fafb); border-radius: 8px; padding: 10px 12px;
  color: var(--dsw-alias-label-secondary, #555); }
.ml-working-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0;
  border-bottom: 1px dashed var(--dsw-alias-border-l1, #e5e7eb); font-size: 12px; }
.ml-working-row:last-child { border-bottom: none; }
.ml-working-row button { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 3px 10px; font-size: 11px; cursor: pointer; }
/* 夜巡队列 */
.ml-q-sec { font-size: 11px; font-weight: 600; opacity: .7; margin: 10px 0 4px; }
.ml-q-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px;
  border-bottom: 1px dashed var(--dsw-alias-border-l1, #e5e7eb); }
.ml-q-row:last-child { border-bottom: none; }
.ml-q-id { opacity: .5; font-variant-numeric: tabular-nums; flex: none; }
.ml-q-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-q-meta { opacity: .55; font-size: 11px; flex: none; }
.ml-q-actions { display: flex; gap: 5px; flex: none; align-items: center; }
.ml-q-actions button { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 3px 9px; font-size: 11px; cursor: pointer; }
.ml-q-actions button:hover { opacity: .8; }
.ml-q-tag { width: 90px; padding: 3px 8px; border-radius: 7px; font-size: 11px; color: inherit;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-base, #f9fafb); }
.ml-diff { font-size: 11.5px; margin: 6px 0 10px; padding: 8px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-base, #f9fafb); }
.ml-diff-add { color: #0f7b3f; }
.ml-diff-del { color: #b42318; }
.ml-field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; max-width: 380px; }
.ml-field > span { font-size: 12px; font-weight: 500; }
.ml-field input, .ml-field select { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; font-size: 12px; }
.ml-field small { opacity: .5; font-size: 10.5px; }
.ml-field-check { flex-direction: row; align-items: center; gap: 8px; flex-wrap: nowrap; }
.ml-field-check > span { white-space: nowrap; flex: none; }
.ml-field-check small { margin-left: 4px; flex: 1; min-width: 0; }
.ml-actions { margin-top: 10px; }
/* 保留策略：按类型的「期限 + 条数」双列输入（替代 "kind:days" 手写字符串） */
.ml-retention-head { display: grid; grid-template-columns: 68px 1fr 1fr; gap: 6px; font-size: 11px; opacity: .55; padding: 0 8px; }
.ml-retention-head span:not(:first-child) { text-align: right; }
.ml-retention-grid { display: flex; flex-direction: column; gap: 5px; width: 100%; }
.ml-retention-cell { display: grid; grid-template-columns: 68px 1fr 1fr; align-items: center; gap: 6px;
  padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #fff); }
.ml-retention-kind { opacity: .8; }
.ml-retention-cell input { width: 100%; min-width: 0; padding: 3px 6px; font-size: 12px; text-align: right;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); border-radius: 6px;
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; }
.ml-retention-core { opacity: .6; }
.ml-retention-core em { grid-column: 2 / 4; font-style: normal; font-size: 11px; text-align: right; }
/* 导入 / 迁移 */
.ml-import-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0; }
.ml-import-row input[type="file"] { font-size: 12px; max-width: 100%; }
.ml-import-row select, .ml-import-row input[type="text"], .ml-import-row input:not([type]) {
  font-size: 12px; padding: 5px 8px; border-radius: 7px; max-width: 100%;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.ml-import-preview { border: 1px dashed var(--dsw-alias-border-l2, #d1d5db); border-radius: 8px;
  padding: 8px 10px; margin: 6px 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.ml-toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 99999;
  background: rgba(15,20,40,.85); backdrop-filter: blur(8px); color: #e7ecff;
  padding: 8px 18px; border-radius: 999px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
  border: 1px solid rgba(120,140,220,.3); }
.ml-sidebar-btn { font-size: 15px; line-height: 1; border: none; background: transparent; cursor: pointer; opacity: .75; padding: 4px; }
.ml-sidebar-btn:hover { opacity: 1; }
/* 侧栏 footer 按钮：整行宽 + 图标 + 文字（footerActions 容器需要 :has() 撑行，否则被裁切） */
[class*="footerActions"]:has(.ml-footer-btn), :has(> .ml-footer-btn) { width: 100%; }
[class*="footerActions"]:has(.ml-footer-btn) { flex-wrap: wrap; }
.ml-footer-btn { display: flex; align-items: center; gap: 9px; width: 100%; flex: 0 0 auto; min-width: 0;
  padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.14));
  background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 13.5px; line-height: 18px; border-radius: 8px; cursor: pointer; text-align: left; }
.ml-footer-btn:hover { background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.06)); color: var(--dsw-alias-label-primary, #111); }
.ml-footer-btn:active { transform: translateY(.5px); }
.ml-footer-ico { display: inline-flex; flex: none; width: 18px; height: 18px; align-items: center; justify-content: center; font-size: 14px; }
.ml-footer-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ml-modal-mask { position: fixed; inset: 0; background: rgba(8,10,22,.45); backdrop-filter: blur(6px); z-index: 9998;
  display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px 16px; }
.ml-modal { width: min(860px, 96vw); max-height: 86vh; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base, #f9fafb); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 16px; box-shadow: 0 18px 60px rgba(0,0,0,.35); overflow: hidden; }
.ml-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px;
  font-weight: 600; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb); background: var(--dsw-alias-bg-layer-1, #fff); }
.ml-modal-head button { border: none; background: transparent; font-size: 18px; cursor: pointer; color: inherit; }
.ml-modal-body { padding: 14px 16px; overflow: auto; }
/* 弹窗内画布用绝对定位铺满 header 以下区域 —— 不依赖 vh/flex 的参与计算，不可能算矮 */
.ml-graph-modal-bg .ml-modal-head, .ml-modal-graph .ml-modal-head { background: #0a0f1f; color: #dbe3ff; border-color: rgba(120,140,220,.25); }
.ml-modal-graph { position: relative; width: min(1200px, 94vw); height: 86vh; background: #0a0f1f; border-color: rgba(120,140,220,.3); }
.ml-graph-full { position: absolute; top: 45px; left: 0; right: 0; bottom: 0;
  height: auto !important; min-height: 0 !important; border: none; border-top: 1px solid rgba(120,140,220,.25); border-radius: 0; }
`

// 会话令牌：宿主进程内随机生成，不落盘、随重启轮换（见 lib/api.js 文件头）。
// 客户端首次调用前先握手；任何一次 401 都重新握手一次再重试 —— 重启 DSH 后旧令牌会失效。
let sessionToken = ''
let sessionPromise = null
async function ensureSession(reset = false) {
  if (reset) sessionToken = ''
  if (sessionToken) return sessionToken
  if (!sessionPromise) {
    const once = () => fetch(API + '/session', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
      .then((r) => r.json())
      .then((d) => (d && d.token ? String(d.token) : ''))
      .catch(() => '')
    sessionPromise = once()
      .then((t) => (t ? t : new Promise((r) => setTimeout(r, 300)).then(once))) // 握手失败重试一次（宿主编排时序）
      .then((t) => (sessionToken = t || ''))
      .finally(() => { sessionPromise = null })
  }
  return sessionPromise
}

async function api(path, opts = {}) {
  const token = await ensureSession()
  const send = (t) => fetch(API + path, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(t ? { 'X-ML-Token': t } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  let res = await send(token)
  if (res.status === 401) res = await send(await ensureSession(true))
  let data = null
  try { data = await res.json() } catch { data = { ok: false, error: 'HTTP ' + res.status } }
  if (!res.ok && data && !data.error) data.error = 'HTTP ' + res.status
  return data
}

const KIND_LABEL = { knowledge: '知识', decision: '决策', mistake: '踩坑', preference: '偏好', goal: '目标', trait: '特质', event: '事件', fact: '事实' }
const KIND_COLOR = { knowledge: '#3B82F6', decision: '#10B981', mistake: '#EF4444', preference: '#A855F7', goal: '#F59E0B', trait: '#EC4899', event: '#6B7280', fact: '#06B6D4' }
const STATUS_LABEL = { active: '生效', pending: '待审', sleeping: '沉睡', rejected: '已驳回', deleted: '回收站' }
const LAYER_LABEL = { ltm: '长期', stm: '短期' }
// 来源标注（复核建议 2：审核不该只看正文，要知道这条是怎么进来的）
const SOURCE_LABEL = { manual: '人工手写', agent: '助手写入', auto: '自动捕获', 'auto-fallback': '自动捕获·降级', promotion: '短期晋升', migration: '旧库迁移' }

// ---------- 微型 Markdown 渲染（人格画像用） ----------
function mdToHtml(md) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = String(md || '').split('\n')
  const out = []
  let inList = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { closeList(); continue }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) { closeList(); out.push(`<div class="ml-h ml-h${h[1].length}">${esc(h[2])}</div>`); continue }
    const li = /^[-*]\s+(.*)$/.exec(line)
    if (li) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${esc(li[1]).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`); continue }
    closeList()
    out.push(`<div class="ml-p">${esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`)
  }
  closeList()
  return out.join('')
}

// ForceGraph 已升级为 3D 星云版 → src/graph3d.jsx（NebulaGraph）

// ---------- 遗忘曲线 SVG ----------
function CurveChart({ curve }) {
  // 曲线数据：weeks_ago → avg_strength；补画理论艾宾浩斯保留率作对照
  const W = 520, H = 160, PAD = 28
  const pts = (curve || []).filter((c) => c.weeks_ago >= 0 && c.n > 0).slice(0, 5)
  if (!pts.length) return <div className="ml-empty">还没有可画的曲线 —— 长期记忆积累后再看。</div>
  const maxW = Math.max(...pts.map((p) => p.weeks_ago), 4)
  const x = (w) => PAD + (w / maxW) * (W - PAD * 2)
  const y = (s) => H - PAD - s * (H - PAD * 2)
  const actual = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.weeks_ago).toFixed(1)},${y(p.avg_strength).toFixed(1)}`).join(' ')
  const theory = []
  for (let d = 0; d <= maxW * 7; d += 2) {
    const s = Math.exp(-d / 2.5)
    theory.push(`${theory.length ? 'L' : 'M'}${x(d / 7).toFixed(1)},${y(s).toFixed(1)}`)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ml-curve">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--dsw-alias-border-l1, #ddd)" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--dsw-alias-border-l1, #ddd)" />
      <path d={theory.join(' ')} fill="none" strokeDasharray="4 3" stroke="var(--dsw-alias-border-l2, #aaa)" strokeWidth="1.2" />
      <path d={actual} fill="none" stroke="var(--dsw-alias-accent, #2563eb)" strokeWidth="2" />
      {pts.map((p) => (
        <g key={p.weeks_ago}>
          <circle cx={x(p.weeks_ago)} cy={y(p.avg_strength)} r="3.5" fill="var(--dsw-alias-accent, #2563eb)" />
          <text x={x(p.weeks_ago)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--dsw-alias-label-secondary, #888)">{p.weeks_ago}周前</text>
          <text x={x(p.weeks_ago)} y={y(p.avg_strength) - 8} fontSize="10" textAnchor="middle" fill="var(--dsw-alias-label-primary, #333)">{p.avg_strength}</text>
        </g>
      ))}
      <text x={PAD + 2} y={16} fontSize="10" textAnchor="start" fill="var(--dsw-alias-label-secondary, #888)">虚线 = 无复习的理论遗忘曲线</text>
    </svg>
  )
}

// ---------- 记忆卡片 ----------
function MemoryCard({ m, onAct, selectable }) {
  const [open, setOpen] = useState(false)
  const kindColor = KIND_COLOR[m.kind] || '#6B7280'
  return (
    <div className="ml-card" data-layer={m.layer} data-status={m.status}>
      <div className="ml-card-head" onClick={() => setOpen(!open)}>
        <span className="ml-kind-dot" style={{ background: kindColor }} title={KIND_LABEL[m.kind] || m.kind} />
        <span className="ml-card-title">{m.title}</span>
        <span className="ml-card-meta">
          {m.layer === 'stm' ? <em className="ml-chip ml-chip-stm">短期</em> : <em className="ml-chip" title={'强度 ' + m.strength}>强度 {Number(m.strength).toFixed(2)}</em>}
          {m.status !== 'active' && <em className={'ml-chip ml-chip-' + m.status}>{STATUS_LABEL[m.status] || m.status}</em>}
        </span>
      </div>
      {open && (
        <div className="ml-card-body">
          <pre className="ml-body">{m.body}</pre>
          {!!m.tags?.length && <div className="ml-tags">{m.tags.map((t) => <span key={t} className="ml-tag">{t}</span>)}</div>}
          <div className="ml-card-actions">
            {m.status === 'pending' && <><button onClick={() => onAct('approve', m)}>通过</button><button onClick={() => onAct('reject', m)}>驳回</button></>}
            {m.status === 'active' && <><button onClick={() => onAct('reinforce', m)}>强化</button><button onClick={() => onAct('sleep', m)}>沉睡</button></>}
            {m.status === 'sleeping' && <button onClick={() => onAct('awaken', m)}>唤醒</button>}
            {m.status !== 'deleted' && <button className="ml-danger" onClick={() => onAct('delete', m)}>删除</button>}
            <span className="ml-dim">#{m.id} · {LAYER_LABEL[m.layer]} · {KIND_LABEL[m.kind] || m.kind} · {SOURCE_LABEL[m.source] || m.source || '—'} · 复习 {m.review_count} 次 · 命中 {m.hits}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 快照 diff（行级，够用即可） ----------
function diffLines(oldText, newText) {
  const norm = (t) => String(t || '').split('\n').map((s) => s.trim()).filter((s) => s && !/^#\s/.test(s))
  const a = norm(oldText), b = norm(newText)
  const setA = new Set(a), setB = new Set(b)
  return { added: b.filter((l) => !setA.has(l)), removed: a.filter((l) => !setB.has(l)) }
}

// ---------- 主应用 ----------
// App 同时服务设置页 section / 侧栏弹窗 / 本地预览（tools/preview-graph.mjs）
export function App({ t }) {
  const [tab, setTab] = useState('overview')
  const [graphFull, setGraphFull] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [ov, setOv] = useState(null)
  const [items, setItems] = useState([])
  const [reviewItems, setReviewItems] = useState([])
  const [filter, setFilter] = useState({ layer: '', status: '', kind: '', q: '' })
  const [graphData, setGraphData] = useState(null)
  const [persona, setPersona] = useState(null)
  const [patrol, setPatrol] = useState(null)
  const [patrolOpen, setPatrolOpen] = useState(false)
  const [queue, setQueue] = useState(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const [working, setWorking] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }, [])

  const loadOverview = useCallback(() => api('/overview').then((d) => d.ok && setOv(d)), [])
  const loadPatrol = useCallback(() => api('/patrol').then((d) => d.ok && setPatrol(d)), [])
  const loadWorking = useCallback(() => api('/working').then((d) => d.ok && setWorking(d.items || [])), [])
  const loadQueue = useCallback(() => api('/patrol/queue').then((d) => d.ok && setQueue(d)), [])
  const patrolAct = async (action, payload) => {
    const r = await api('/patrol/action', { method: 'POST', body: { action, ...payload } })
    say(r.ok ? '已处理' : '失败：' + (r.error || '未知错误'))
    loadQueue(); loadOverview(); loadPatrol(); loadWorking()
  }
  const loadList = useCallback(() => {
    const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v))
    api('/list?' + p).then((d) => d.ok && setItems(d.items))
  }, [filter])
  const loadReview = useCallback(() => api('/list?status=pending').then((d) => d.ok && setReviewItems(d.items)), [])
  const loadGraph = useCallback(() => api('/graph').then((d) => d.ok && setGraphData(d)), [])
  const loadPersona = useCallback(() => api('/persona').then((d) => d.ok && setPersona(d)), [])
  const loadCfg = useCallback(() => api('/config').then((d) => d.ok && setCfg(d)), [])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => { if (tab === 'overview') { loadPatrol(); loadWorking() } }, [tab, loadPatrol, loadWorking])
  useEffect(() => { if (tab === 'list') loadList() }, [tab, loadList])
  useEffect(() => { if (tab === 'review') loadReview() }, [tab, loadReview])
  useEffect(() => { if (tab === 'graph') loadGraph() }, [tab, loadGraph])
  useEffect(() => { if (tab === 'persona') loadPersona() }, [tab, loadPersona])
  useEffect(() => { if (tab === 'config') loadCfg() }, [tab, loadCfg])

  const act = async (action, m) => {
    if (action === 'reinforce') return onReinforce(m) // 审核中心里的强化按钮也走这里（踩过：错走 /audit 报「未知操作」）
    const r = await api('/audit', { method: 'POST', body: { id: m.id, action } })
    say(r.ok ? `#${m.id} ${STATUS_LABEL[action] || action}完成` : `操作失败：${r.error}`)
    loadList(); loadReview(); loadOverview()
  }
  const onReinforce = async (m) => {
    const r = await api('/reinforce', { method: 'POST', body: { id: m.id, quality: 5 } })
    say(r.ok ? `#${m.id} 已强化` : '强化失败')
    loadList(); loadReview(); loadOverview()
  }
  const runSweep = async () => {
    const r = await api('/sweep', { method: 'POST', body: {} })
    say(r.ok ? `清扫完成：衰减 ${r.stats.decayed} · 沉睡 ${r.stats.slept} · 晋升 ${r.stats.promoted} · 淘汰 ${r.stats.expired}` : '清扫失败：' + r.error)
    loadOverview()
  }
  const synthesize = async () => {
    say('正在合成人格画像…')
    const r = await api('/persona/synthesize', { method: 'POST', body: {} })
    say(r.ok
      ? `画像 v${r.id} 已生成（${r.mode === 'llm' ? '模型合成' : '本地聚合兜底'}）${r.note ? ' · ' + r.note : ''}`
      : '合成失败：' + r.error)
    loadPersona()
  }
  const saveCfg = async (patch) => {
    const r = await api('/config', { method: 'POST', body: { patch } })
    say(r.ok ? '配置已保存' : '保存失败：' + r.error)
    loadCfg()
  }

  const pendingCount = ov?.totals?.pending ?? 0
  const TABS = [
    ['overview', '概览'], ['list', '记忆'], ['review', `审核${pendingCount ? ` (${pendingCount})` : ''}`],
    ['persona', '人格'], ['graph', '云图'], ['config', '配置'],
  ]

  return (
    <div className="ml-root">
      <div className="ml-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={'ml-tab' + (tab === id ? ' ml-on' : '')} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && ov && (
        <div className="ml-pane">
          <div className="ml-stats">
            <div className="ml-stat"><b>{ov.totals.ltmActive}</b><span>长期记忆</span></div>
            <div className="ml-stat"><b>{ov.totals.stmActive}</b><span>短期记忆</span></div>
            <div className="ml-stat"><b>{ov.totals.pending}</b><span>待审核</span></div>
            <div className="ml-stat"><b>{ov.due}</b><span>待复习（到期）</span></div>
            <div className="ml-stat"><b>{ov.totals.sleeping}</b><span>沉睡中</span></div>
          </div>
          <div className="ml-panel">
            <div className="ml-panel-head"><span>记忆强度分布（长期）</span><button onClick={runSweep}>立即清扫</button></div>
            <div className="ml-bars">
              <div className="ml-bar-row"><span>强 (≥2)</span><div className="ml-bar"><i style={{ width: pct(ov.strengthBuckets.high, ov.totals.ltmActive), background: '#10B981' }} /></div><b>{ov.strengthBuckets.high}</b></div>
              <div className="ml-bar-row"><span>中 (0.6-2)</span><div className="ml-bar"><i style={{ width: pct(ov.strengthBuckets.mid, ov.totals.ltmActive), background: '#F59E0B' }} /></div><b>{ov.strengthBuckets.mid}</b></div>
              <div className="ml-bar-row"><span>弱 (≤0.6)</span><div className="ml-bar"><i style={{ width: pct(ov.strengthBuckets.low, ov.totals.ltmActive), background: '#EF4444' }} /></div><b>{ov.strengthBuckets.low}</b></div>
            </div>
          </div>
          <div className="ml-panel">
            <div className="ml-panel-head"><span>遗忘曲线（近 30 天实际强度）</span></div>
            <CurveChart curve={ov.curve} />
          </div>
          <div className="ml-panel">
            <div className="ml-panel-head">
              <span>夜巡 · {patrol?.latest?.day || '还没有报告'}</span>
              <span className="ml-graph-tools">
                {patrol?.latest && <button onClick={() => setPatrolOpen(!patrolOpen)}>{patrolOpen ? '收起' : '查看报告'}</button>}
                <button onClick={async () => { if (!queueOpen) loadQueue(); setQueueOpen(!queueOpen) }}>{queueOpen ? '收起队列' : '处理队列'}</button>
                <button onClick={async () => { const r = await api('/patrol', { method: 'POST', body: {} }); say(r.ok ? '夜巡完成：' + r.summary : '夜巡失败'); loadPatrol(); loadOverview(); if (queueOpen) loadQueue() }}>立即夜巡</button>
              </span>
            </div>
            {patrol?.latest
              ? <>
                <div className="ml-hint">{patrol.latest.summary}</div>
                {patrolOpen && <pre className="ml-patrol">{patrol.content}</pre>}
              </>
              : <div className="ml-empty">每天 18 点后自动生成（也可以点「立即夜巡」）</div>}
          </div>
          {queueOpen && queue && (
            <div className="ml-panel">
              <div className="ml-panel-head">
                <span>夜巡队列 · 可直接处理{queue.truncated ? `（只扫最近 ${queue.scanLimit} 条）` : ''}</span>
                <button onClick={loadQueue}>刷新</button>
              </div>
              {!queue.neverHit.length && !queue.dups.length && !queue.conflicts.length && !queue.fading.length && !queue.unclassified.length
                ? <div className="ml-empty">队列是空的 ✓</div>
                : <>
                  {!!queue.neverHit.length && <>
                    <div className="ml-q-sec">久未命中（{queue.neverHit.length}）· 没被用过的记忆</div>
                    {queue.neverHit.map((it) => (
                      <div key={it.id} className="ml-q-row">
                        <span className="ml-q-id">#{it.id}</span>
                        <span className="ml-q-title">{it.title}</span>
                        <span className="ml-q-actions">
                          <button onClick={() => patrolAct('strengthen', { ids: [it.id] })}>留用·强化</button>
                          <button className="ml-danger" onClick={() => patrolAct('delete', { ids: [it.id] })}>删除</button>
                        </span>
                      </div>
                    ))}
                  </>}
                  {!!queue.dups.length && <>
                    <div className="ml-q-sec">疑似重复（{queue.dups.length} 对）· 选一条保留，另一条归档</div>
                    {queue.dups.map((p) => (
                      <div key={p.a.id + '-' + p.b.id} className="ml-q-row">
                        <span className="ml-q-title">#{p.a.id} {p.a.title} ↔ #{p.b.id} {p.b.title}</span>
                        <span className="ml-q-actions">
                          <button onClick={() => patrolAct('merge', { keep: p.a.id, ids: [p.a.id, p.b.id] })}>保留 A</button>
                          <button onClick={() => patrolAct('merge', { keep: p.b.id, ids: [p.a.id, p.b.id] })}>保留 B</button>
                        </span>
                      </div>
                    ))}
                  </>}
                  {!!queue.conflicts.length && <>
                    <div className="ml-q-sec">矛盾候选（{queue.conflicts.length} 对）· 口径相反，选一条留下</div>
                    {queue.conflicts.map((p) => (
                      <div key={p.a.id + '-' + p.b.id} className="ml-q-row">
                        <span className="ml-q-title">#{p.a.id} {p.a.title} ↔ #{p.b.id} {p.b.title}</span>
                        <span className="ml-q-actions">
                          <button onClick={() => patrolAct('delete', { ids: [p.b.id] })}>删 B</button>
                          <button onClick={() => patrolAct('delete', { ids: [p.a.id] })}>删 A</button>
                          <button onClick={() => patrolAct('sleep', { ids: [p.a.id, p.b.id] })}>都先睡</button>
                        </span>
                      </div>
                    ))}
                  </>}
                  {!!queue.fading.length && <>
                    <div className="ml-q-sec">将被遗忘（{queue.fading.length}）· 强度低，快要沉睡</div>
                    {queue.fading.map((it) => (
                      <div key={it.id} className="ml-q-row">
                        <span className="ml-q-id">#{it.id}</span>
                        <span className="ml-q-title">{it.title}</span>
                        <span className="ml-q-actions">
                          <button onClick={() => patrolAct('strengthen', { ids: [it.id] })}>强化</button>
                          <button onClick={() => patrolAct('sleep', { ids: [it.id] })}>任它睡</button>
                        </span>
                      </div>
                    ))}
                  </>}
                  {!!queue.unclassified.length && <>
                    <div className="ml-q-sec">未归类（{queue.unclassified.length}）· 补个标签就能进云图</div>
                    {queue.unclassified.map((it) => (
                      <div key={it.id} className="ml-q-row">
                        <span className="ml-q-id">#{it.id}</span>
                        <span className="ml-q-title">{it.title}</span>
                        <span className="ml-q-actions">
                          <input
                            className="ml-q-tag"
                            placeholder="标签"
                            onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) patrolAct('tag', { ids: [it.id], tag: e.target.value.trim() }) }}
                          />
                        </span>
                      </div>
                    ))}
                  </>}
                </>}
            </div>
          )}
          {!!working.length && (
            <div className="ml-panel">
              <div className="ml-panel-head"><span>待办 / 承诺（工作记忆）</span></div>
              {working.map((w) => (
                <div key={w.id} className="ml-working-row">
                  <span>
                    {w.suggested ? <em className="ml-chip ml-chip-pending">建议</em> : null}
                    {w.kind === 'promise' ? '答应过' : '待办'}：{w.text}
                  </span>
                  <span className="ml-q-actions">
                    {w.suggested
                      ? <>
                          <button onClick={async () => { await api('/working', { method: 'POST', body: { action: 'confirm', id: w.id } }); loadWorking() }}>保留</button>
                          <button className="ml-danger" onClick={async () => { await api('/working', { method: 'POST', body: { action: 'drop', id: w.id } }); loadWorking() }}>忽略</button>
                        </>
                      : <button onClick={async () => { await api('/working', { method: 'POST', body: { action: 'complete', text: w.text } }); loadWorking() }}>完成</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div className="ml-pane">
          <div className="ml-filter">
            <input placeholder="搜索记忆…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && loadList()} />
            <select value={filter.layer} onChange={(e) => setFilter({ ...filter, layer: e.target.value })}>
              <option value="">全部层次</option><option value="ltm">长期</option><option value="stm">短期</option>
            </select>
            <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">生效中</option><option value="active">生效</option><option value="pending">待审</option>
              <option value="sleeping">沉睡</option><option value="rejected">已驳回</option><option value="deleted">回收站</option>
            </select>
            <select value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}>
              <option value="">全部类型</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={loadList}>查询</button>
          </div>
          {items.length ? items.map((m) => (
            <MemoryCard key={m.id} m={m} selectable onAct={(a, mm) => a === 'reinforce' ? onReinforce(mm) : act(a, mm)} />
          )) : <div className="ml-empty">没有匹配的记忆</div>}
        </div>
      )}

      {tab === 'review' && (
        <div className="ml-pane">
          <div className="ml-hint">长期记忆写入与晋升都要过这里：通过 → 生效参与召回；驳回 → 进已驳回（可重新提交）。</div>
          {reviewItems.length ? reviewItems.map((m) => <MemoryCard key={m.id} m={m} onAct={act} />) : <div className="ml-empty">审核队列是空的 ✓</div>}
        </div>
      )}

      {tab === 'persona' && persona && (
        <div className="ml-pane">
          <div className="ml-panel-head">
            <span>当前画像 {persona.current ? (persona.current.exact ? `（快照 ${persona.current.createdAt.slice(0, 10)}）` : '（实时聚合，尚未快照）') : ''}</span>
            <button onClick={synthesize}>立即合成</button>
          </div>
          {persona.current
            ? <div className="ml-md" dangerouslySetInnerHTML={{ __html: mdToHtml(persona.current.content) }} />
            : <div className="ml-empty">还没有画像 —— 等长期记忆里出现特质/偏好/目标类内容后合成。</div>}
          {(!!persona.evidence?.length || !!persona.excludedEvidence?.length) && (
            <div className="ml-panel">
              <div className="ml-panel-head"><span>画像证据（{persona.evidence?.length || 0} 条在用）</span></div>
              {(persona.evidence || []).map((e) => (
                <div key={e.id} className="ml-q-row">
                  <span className="ml-q-id">#{e.id}</span>
                  <span className="ml-q-title">{e.title}</span>
                  <span className="ml-q-meta">{KIND_LABEL[e.kind] || e.kind} · 强度{e.strength}</span>
                  <span className="ml-q-actions">
                    <button onClick={async () => {
                      const r = await api('/persona/exclude', { method: 'POST', body: { id: e.id } })
                      say(r.ok ? '已从画像排除' : '操作失败'); loadPersona()
                    }}>否定这条</button>
                  </span>
                </div>
              ))}
              {!!persona.excludedEvidence?.length && (
                <>
                  <div className="ml-q-sec">已排除（{persona.excludedEvidence.length}）· 不参与下次合成</div>
                  {persona.excludedEvidence.map((e) => (
                    <div key={e.id} className="ml-q-row">
                      <span className="ml-q-id">#{e.id}</span>
                      <span className="ml-q-title">{e.title}</span>
                      <span className="ml-q-actions">
                        <button onClick={async () => {
                          const r = await api('/persona/exclude', { method: 'POST', body: { id: e.id, exclude: false } })
                          say(r.ok ? '已恢复' : '操作失败'); loadPersona()
                        }}>恢复</button>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {!!persona.timeline?.length && (
            <>
              <div className="ml-panel-head" style={{ marginTop: 14 }}><span>成长时间线（{persona.timeline.length} 版）</span></div>
              <div className="ml-timeline">
                {persona.timeline.map((s) => (
                  <div key={s.id} className="ml-snap" onClick={async () => {
                    const d = await api('/persona/snapshot?id=' + s.id)
                    if (d.ok) setPersona((p) => ({ ...p, viewing: d.snapshot, viewingEvidence: d.evidence || [] }))
                  }}>
                    <b>v{persona.timeline.length - persona.timeline.indexOf(s)} · {s.created_at.slice(0, 16).replace('T', ' ')}</b>
                    <span>{s.trigger} · 素材 {s.memory_count} 条 · {s.summary.slice(0, 40)}…</span>
                  </div>
                ))}
              </div>
              {persona.viewing && (
                <div className="ml-md ml-snap-view">
                  <div className="ml-panel-head"><span>历史快照 #{persona.viewing.id}</span><button onClick={() => setPersona((p) => ({ ...p, viewing: null }))}>关闭</button></div>
                  {persona.current && (() => {
                    const d = diffLines(persona.viewing.content, persona.current.content)
                    return (
                      <div className="ml-diff">
                        <div>与当前版本的差异：新增 {d.added.length} 行 · 消失 {d.removed.length} 行</div>
                        {d.added.slice(0, 5).map((l, i) => <div key={'a' + i} className="ml-diff-add">+ {l}</div>)}
                        {d.removed.slice(0, 5).map((l, i) => <div key={'r' + i} className="ml-diff-del">− {l}</div>)}
                      </div>
                    )
                  })()}
                  {!!persona.viewingEvidence?.length && (
                    <div className="ml-evidence">
                      <div className="ml-q-sec">这版画像的证据链（{persona.viewingEvidence.length} 条）</div>
                      {persona.viewingEvidence.map((e) => (
                        <div key={e.id} className="ml-q-row">
                          <span className="ml-q-id">#{e.id}</span>
                          <span className="ml-q-title">{e.title}</span>
                          <span className="ml-q-meta">
                            {KIND_LABEL[e.kind] || e.kind} · {SOURCE_LABEL[e.source] || e.source || '—'} · 强度{e.strength}
                            {' · '}命中{e.hits} · 确认{e.confirmed}次{e.lastReview ? ` · 复习于 ${String(e.lastReview).slice(0, 10)}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div dangerouslySetInnerHTML={{ __html: mdToHtml(persona.viewing.content) }} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'graph' && (
        <div className="ml-pane">
          <div className="ml-panel-head">
            <span>记忆星云 · {graphData?.nodes?.length ?? 0} 节点</span>
            <span className="ml-graph-tools">
              <button className={autoRotate ? 'ml-tgl-on' : ''} onClick={() => setAutoRotate(!autoRotate)}>{autoRotate ? '◉ 自转' : '○ 自转'}</button>
              <button className={showLabels ? 'ml-tgl-on' : ''} onClick={() => setShowLabels(!showLabels)}>{showLabels ? '◉ 标签' : '○ 标签'}</button>
              <button onClick={() => setGraphFull(true)}>放大查看</button>
            </span>
          </div>
          <div className="ml-graph-wrap ml-graph-nebula" style={{ height: 500 }}>
            <NebulaGraph data={graphData} onSelect={setSelectedNode} selectedId={selectedNode?.id} autoRotate={autoRotate} showLabels={showLabels} />
            {selectedNode && (
              <div className="ml-node-info">
                <b style={{ color: KIND_COLOR[selectedNode.kind] }}>{selectedNode.label}</b>
                <span>{LAYER_LABEL[selectedNode.layer]} · {KIND_LABEL[selectedNode.kind]} · 强度 {selectedNode.strength.toFixed(2)}</span>
                <button onClick={() => setSelectedNode(null)}>×</button>
              </div>
            )}
          </div>
          {graphFull && createPortal(
            <div className="ml-modal-mask" onClick={(e) => { if (e.target === e.currentTarget) setGraphFull(false) }}>
              <div className="ml-modal ml-modal-graph" data-windows-titlebar>
                <div className="ml-modal-head">
                  <span>记忆星云</span>
                  <button onClick={() => setGraphFull(false)}>×</button>
                </div>
                <div className="ml-graph-wrap ml-graph-full ml-graph-nebula">
                  <NebulaGraph data={graphData} onSelect={setSelectedNode} selectedId={selectedNode?.id} autoRotate={autoRotate} showLabels={showLabels} />
                  {selectedNode && (
                    <div className="ml-node-info">
                      <b style={{ color: KIND_COLOR[selectedNode.kind] }}>{selectedNode.label}</b>
                      <span>{LAYER_LABEL[selectedNode.layer]} · {KIND_LABEL[selectedNode.kind]} · 强度 {selectedNode.strength.toFixed(2)}</span>
                      <button onClick={() => setSelectedNode(null)}>×</button>
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}

      {tab === 'config' && cfg && <ConfigForm cfg={cfg} onSave={saveCfg} onImported={() => { loadOverview(); loadList(); loadCfg() }} />}

      {toast && <div className="ml-toast">{toast}</div>}
    </div>
  )
}

function pct(v, total) { return total ? Math.min(100, Math.round(v / total * 100)) + '%' : '0%' }

function ConfigForm({ cfg, onSave, onImported }) {
  const s = cfg.settings || {}
  const [form, setForm] = useState({
    autoCapture: s.autoCapture !== false,
    autoRecall: s.autoRecall !== false,
    distillEnabled: s.distillEnabled === true,
    decayEnabled: s.decayEnabled !== false,
    personaEnabled: s.personaEnabled !== false,
    auditMode: s.auditMode === 'none' ? 'none' : 'all',
    captureProvider: s.captureProvider || '',
    captureModel: s.captureModel || '',
    stmTtlHours: s.stmTtlHours ?? 48,
    maxPerDay: s.maxPerDay ?? 80,
    captureMinChars: s.captureMinChars ?? 200,
    dedupThreshold: s.dedupThreshold ?? 0.85,
    recallLimit: s.recallLimit ?? 5,
    personaIntervalHours: s.personaIntervalHours ?? 24,
    personaAutoSynth: s.personaAutoSynth === true,
    personaProvider: s.personaProvider || '',
    personaModel: s.personaModel || '',
    retentionPolicy: s.retentionPolicy ?? 'event:90,knowledge:365',
    retentionCounts: s.retentionCounts ?? '',
    maxMemories: s.maxMemories ?? 20000,
    conflictAutoResolve: s.conflictAutoResolve === true,
    semanticRecall: s.semanticRecall === true,
    vectorRecall: s.vectorRecall !== false,
  })
  // Provider 列表（蒸馏出站必须让用户显式选择；拿不到 llm 服务就只剩「未选择」）
  const [providers, setProviders] = useState([])
  const [providerNote, setProviderNote] = useState('')
  useEffect(() => {
    api('/providers').then((d) => {
      if (d.ok) { setProviders(d.providers || []); setProviderNote(d.note || (d.providers?.length ? '' : '宿主没有可用的模型 Provider')) }
    })
  }, [])
  const models = providers.find((p) => p.id === form.captureProvider)?.models || []
  const personaModels = providers.find((p) => p.id === form.personaProvider)?.models || []
  const num = (k, label, hint) => (
    <label className="ml-field">
      <span>{label}</span>
      <input type="number" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
      {hint && <small>{hint}</small>}
    </label>
  )
  const bool = (k, label, hint) => (
    <label className="ml-field ml-field-check">
      <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </label>
  )
  return (
    <div className="ml-pane">
      <div className="ml-field">
        <span>审核模式</span>
        <select value={form.auditMode} onChange={(e) => setForm({ ...form, auditMode: e.target.value })}>
          <option value="all">all —— 长期记忆全部进审核中心（推荐）</option>
          <option value="none">none —— 全部免审直达</option>
        </select>
        <small>短期记忆永远免审（48h 生命期的草稿层）</small>
      </div>
      {bool('autoCapture', '自动捕获', '每轮对话结束把值得记的内容写进短期记忆（本地，不出网）')}
      {bool('distillEnabled', 'LLM 蒸馏（会出站）', '开启后每轮把最多 12,000 字对话发给你指定的模型 Provider 做压缩；默认关闭')}
      <label className="ml-field">
        <span>蒸馏 Provider</span>
        <select
          value={form.captureProvider}
          disabled={!form.distillEnabled}
          onChange={(e) => setForm({ ...form, captureProvider: e.target.value, captureModel: '' })}
        >
          <option value="">（未选择 · 不出站）</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <small>{providerNote || '开启蒸馏后必须选一个；未选时插件不会发出任何请求'}</small>
      </label>
      <label className="ml-field">
        <span>蒸馏模型（可选）</span>
        <select
          value={form.captureModel}
          disabled={!form.distillEnabled || !models.length}
          onChange={(e) => setForm({ ...form, captureModel: e.target.value })}
        >
          <option value="">（用该 Provider 的默认模型）</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <div className="ml-hint">
        隐私边界：自动捕获的原文只留在本地短期层，不会自动拼进系统提示；只有经你在审核中心批准的长期记忆才会被注入（免审模式下也会排除自动来源）。
        蒸馏关闭时零出站；开启但未选 Provider 时同样不出站。
      </div>
      {bool('autoRecall', '自动召回注入', 'systemPrompt 注入记忆规则、待办与人格画像（仅可信记忆）')}
      {bool('decayEnabled', '遗忘衰减', '关闭后记忆不再沉睡（不推荐，就没有「遗忘」了）')}
      {bool('personaEnabled', '人格画像', '从长期记忆持续合成用户画像并注入会话')}
      {num('stmTtlHours', '短期记忆生命期（小时）')}
      {num('maxPerDay', '每日写入上限')}
      {num('captureMinChars', '捕获最小对话字数')}
      {num('dedupThreshold', '去重阈值 (0-1)', '与已有记忆相似度超过它就追加而不是新建')}
      {num('recallLimit', '召回条数上限')}
      {num('personaIntervalHours', '人格合成间隔（小时）')}
      {bool('personaAutoSynth', 'LLM 合成人格（会出站）', '开启后按间隔把画像素材发给你下面指定的 Provider；默认关 —— 关着时只跑本地规则兜底，零出站')}
      <label className="ml-field">
        <span>人格 Provider</span>
        <select
          value={form.personaProvider}
          disabled={!form.personaAutoSynth}
          onChange={(e) => setForm({ ...form, personaProvider: e.target.value, personaModel: '' })}
        >
          <option value="">（未选择 · 只跑本地兜底）</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <small>{form.personaAutoSynth ? '必须选一个，否则每次合成都退回本地兜底' : '未开启 LLM 合成，此项不生效'}</small>
      </label>
      <label className="ml-field">
        <span>人格模型（可选）</span>
        <select
          value={form.personaModel}
          disabled={!form.personaAutoSynth || !personaModels.length}
          onChange={(e) => setForm({ ...form, personaModel: e.target.value })}
        >
          <option value="">（用该 Provider 的默认模型）</option>
          {personaModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <RetentionGrid
        daysText={form.retentionPolicy} countsText={form.retentionCounts}
        onChangeDays={(v) => setForm({ ...form, retentionPolicy: v })}
        onChangeCounts={(v) => setForm({ ...form, retentionCounts: v })}
      />
      {num('maxMemories', '记忆库容量上限', '超过后从「最弱且没被用过」的开始淘汰（核心层豁免）；0 = 不限')}
      {bool('conflictAutoResolve', '矛盾自动裁决', '夜巡时把「0 命中且强度 < 1」的矛盾一方置为沉睡（可唤醒）；默认关')}
      {bool('vectorRecall', '本地向量语义召回', '分布论向量（本地计算、零出站）：补「换个说法、字面不沾边」的召回死角')}
      {bool('semanticRecall', '模型扩写召回（会出站）', 'memory_recall 结果不足时用模型改写查询；需先选 Provider，默认关')}
      <ImportPanel onDone={onImported} />
      <BackupPanel />
      <div className="ml-actions">
        <button className="ml-primary" onClick={() => onSave(form)}>保存配置</button>
        <button className="ml-danger" onClick={async () => {
          if (!window.confirm('将硬删除全部记忆、人格快照、待办与审计日志，且不可恢复。确定清空？')) return
          const r = await api('/wipe', { method: 'POST', body: { confirm: 'CLEAR' } })
          alert(r.ok ? `已清空：记忆 ${r.removed.memories} 条 · 画像快照 ${r.removed.personas} 条` : '清空失败：' + r.error)
        }}>清空记忆库</button>
      </div>
    </div>
  )
}

// ---------- 保留期限：按类型的图形化配置 ----------
// 之前是一行 "event:90,knowledge:365" 文本 —— 用户得记住类型名和格式，写错就静默不生效。
// 现在每个类型一个输入框：留空 = 不设期限；核心层（特质/偏好/目标）物理上不可设期限
// （它们在遗忘引擎里本来就不衰减，给个能填的框只会让人误以为能设）。
const RETENTION_KINDS = [
  { kind: 'knowledge', label: '知识' },
  { kind: 'decision', label: '决策' },
  { kind: 'mistake', label: '踩坑' },
  { kind: 'event', label: '事件' },
  { kind: 'fact', label: '事实' },
  { kind: 'preference', label: '偏好', core: true },
  { kind: 'goal', label: '目标', core: true },
  { kind: 'trait', label: '特质', core: true },
]
const parsePolicyMap = (text) => {
  const out = {}
  for (const part of String(text || '').split(',')) {
    const [k, d] = part.split(':').map((s) => String(s || '').trim())
    const n = Number(d)
    if (k && Number.isFinite(n) && n > 0) out[k] = Math.round(n)
  }
  return out
}
const formatPolicyMap = (map) => Object.entries(map)
  .filter(([k, d]) => d > 0 && !RETENTION_KINDS.some((x) => x.kind === k && x.core))
  .map(([k, d]) => `${k}:${d}`).join(',')

function RetentionGrid({ daysText, countsText, onChangeDays, onChangeCounts }) {
  const days = parsePolicyMap(daysText)
  const maxes = parsePolicyMap(countsText)
  const setOne = (map, kind, raw, emit) => {
    const next = { ...map }
    const n = Math.round(Number(raw))
    if (!raw || !Number.isFinite(n) || n <= 0) delete next[kind]
    else next[kind] = n
    emit(formatPolicyMap(next))
  }
  return (
    <div className="ml-field">
      <span>保留策略（按类型）</span>
      <div className="ml-retention-head">
        <span>类型</span><span>期限（天）</span><span>条数上限</span>
      </div>
      <div className="ml-retention-grid">
        {RETENTION_KINDS.map((k) => (
          <div key={k.kind} className={'ml-retention-cell' + (k.core ? ' ml-retention-core' : '')}>
            <span className="ml-retention-kind">{k.label}</span>
            {k.core ? (
              <em title="核心层永不衰减、也不设条数上限">无期限 · 不限条数</em>
            ) : (
              <>
                <input
                  type="number" min="1" placeholder="不限" title="超过这么多天且从没被召回 → 淘汰"
                  value={days[k.kind] ?? ''}
                  onChange={(e) => setOne(days, k.kind, e.target.value, onChangeDays)}
                />
                <input
                  type="number" min="1" placeholder="不限" title="这一类最多保留多少条，超出先淘汰最弱/最久未用的"
                  value={maxes[k.kind] ?? ''}
                  onChange={(e) => setOne(maxes, k.kind, e.target.value, onChangeCounts)}
                />
              </>
            )}
          </div>
        ))}
      </div>
      <small>
        期限：只淘汰「从没被召回」且超过天数的条目。条数：这一类超过上限时，按「命中次数 → 强度 → 最后更新」从弱到强淘汰。
        两者均为软删除（进回收站），留空 = 不限。核心层（特质 / 偏好 / 目标）永不淘汰。
      </small>
    </div>
  )
}

// ---------- 备份（加密 / 增量） ----------
// 全量适合「换机器」；增量适合「每天一次」：只带上次之后变过的条目 + 一份删除清单。
// 口令只在 POST body 里传一次，服务端 scrypt→AES-256-GCM 加密后回文本，这里直接存文件。
function BackupPanel() {
  const [mode, setMode] = useState('full')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [watermark, setWatermark] = useState('')
  useEffect(() => {
    api('/backup').then((d) => { if (d.ok && d.watermark) setWatermark(d.watermark) })
  }, [])
  const run = async () => {
    if (pass && pass.length < 8) { setErr('口令至少 8 个字符'); return }
    setBusy(true); setErr(''); setInfo(null)
    const r = await api('/backup', { method: 'POST', body: { full: mode === 'full', passphrase: pass } })
    setBusy(false)
    if (!r.ok) { setErr(r.error || '备份失败'); return }
    const day = new Date().toISOString().slice(0, 10)
    const name = `memory-lattice-${mode === 'full' ? 'full' : 'delta'}-${day}${pass ? '.enc' : ''}.json`
    const blob = new Blob([r.text], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    setInfo({ ...r.stats, name })
    setWatermark(r.stats.watermark)
  }
  return (
    <div className="ml-field ml-import">
      <span>备份（加密 / 增量）</span>
      <div className="ml-import-row">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="full">全量 —— 全部记忆与画像快照</option>
          <option value="incremental">增量 —— 只导出上次备份之后的变化{watermark ? '' : '（还没有备份记录，首次等同全量）'}</option>
        </select>
        <input
          type="password" placeholder="口令（可选，≥8 字符）" value={pass}
          onChange={(e) => setPass(e.target.value)} autoComplete="new-password"
        />
        <button className="ml-primary" disabled={busy} onClick={run}>{busy ? '生成中…' : '生成并下载'}</button>
      </div>
      {watermark && <small>上次备份水位：{watermark.replace('T', ' ').slice(0, 19)}（增量从这个时间点之后取）</small>}
      {info && (
        <div className="ml-import-preview">
          <div>
            {info.mode === 'incremental' ? '增量' : '全量'} · 记忆 <b>{info.memories}</b> 条
            {info.personas ? ` · 画像快照 ${info.personas}` : ''}
            {info.deletions ? ` · 删除记录 ${info.deletions}` : ''}
            {' · '}<b>{Math.max(1, Math.round(info.bytes / 1024))}KB</b>{info.encrypted ? ' · 已加密' : ' · 明文'}
          </div>
          <div className="ml-dim">{info.name}</div>
        </div>
      )}
      {err && <small>{err}</small>}
      <small>
        加密用 scrypt 派生 + AES-256-GCM 认证加密；口令不落盘、不进日志，**忘了就无法恢复**。
        增量备份会带「对端已删除」清单，恢复时同步删除，不会越恢复越多。
      </small>
    </div>
  )
}

// ---------- 导入 / 迁移 ----------
// 流程刻意分两步：先解析预览（会发生什么），确认后才写库。
// 整库替换要求手输 REPLACE —— 和「清空记忆库」同级危险，不能只点一下。
function ImportPanel({ onDone }) {
  const [payload, setPayload] = useState('')
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState('skip')
  const [preview, setPreview] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const pick = async (file) => {
    if (!file) return
    setBusy(true); setMsg(''); setPreview(null)
    try {
      const text = await file.text()
      setPayload(text); setFileName(file.name)
      const r = await api('/import/preview', { method: 'POST', body: { payload: text, mode, passphrase: pass } })
      if (r.ok) setPreview(r)
      else setMsg('解析失败：' + (r.error || '未知错误'))
    } catch (e) { setMsg('读取文件失败：' + String(e?.message || e)) }
    setBusy(false)
  }
  const rePreview = async (nextMode) => {
    setMode(nextMode); setPreview(null)
    if (!payload) return
    const r = await api('/import/preview', { method: 'POST', body: { payload, mode: nextMode, passphrase: pass } })
    if (r.ok) setPreview(r); else setMsg('解析失败：' + (r.error || ''))
  }
  const run = async () => {
    if (mode === 'replace' && confirmText !== 'REPLACE') { setMsg('整库替换需要输入 REPLACE 确认'); return }
    setBusy(true); setMsg('')
    const r = await api('/import', { method: 'POST', body: { payload, mode, confirm: confirmText, passphrase: pass } })
    setBusy(false)
    if (r.ok) {
      setMsg(`导入完成：新建 ${r.created} · 跳过 ${r.skipped} · 合并 ${r.merged} · 画像快照 ${r.personas}${r.wiped ? ` · 先清空 ${r.wiped}` : ''}`)
      setPreview(null); setPayload(''); setFileName(''); setConfirmText('')
      onDone?.()
    } else setMsg('导入失败：' + (r.error || '未知错误'))
  }

  return (
    <div className="ml-field ml-import">
      <span>导入 / 迁移</span>
      <div className="ml-import-row">
        <input type="file" accept=".json,application/json" onChange={(e) => pick(e.target.files?.[0])} />
        {fileName && <span className="ml-dim">{fileName}</span>}
      </div>
      <div className="ml-import-row">
        <input type="password" placeholder="加密备份口令（明文文件留空）" value={pass} autoComplete="off"
          onChange={(e) => setPass(e.target.value)} onBlur={() => { if (payload) rePreview(mode) }} />
      </div>
      <div className="ml-import-row">
        <select value={mode} onChange={(e) => rePreview(e.target.value)}>
          <option value="skip">skip —— 同内容跳过，其余新建（推荐，可重复执行）</option>
          <option value="merge">merge —— 近似重复改为强化已有条目</option>
          <option value="new">new —— 全部新建（允许重复）</option>
          <option value="replace">replace —— 先清空再导入（危险）</option>
        </select>
      </div>
      {preview && (
        <div className="ml-import-preview">
          <div>共 <b>{preview.total}</b> 条 → 新建 <b>{preview.create}</b> · 跳过 <b>{preview.skip}</b> · 合并 <b>{preview.merge}</b>
            {preview.update ? <> · 更新 <b>{preview.update}</b></> : null}
            {preview.deleted ? ` · 同步删除 ${preview.deleted}` : ''}
            {preview.personaTotal ? ` · 画像快照 ${preview.personaNew}/${preview.personaTotal} 新增` : ''}
            {preview.encrypted ? ' · 已解密' : ''}</div>
          <div className="ml-dim">
            {Object.entries(preview.byKind || {}).map(([k, n]) => `${KIND_LABEL[k] || k} ${n}`).join(' · ')}
          </div>
          {(preview.issues || []).length > 0 && <div className="ml-dim">提示：{preview.issues.join('；')}</div>}
          {mode === 'replace' && (
            <div className="ml-import-row">
              <input placeholder="输入 REPLACE 确认整库替换" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
          )}
          <div className="ml-import-row">
            <button className={mode === 'replace' ? 'ml-danger' : 'ml-primary'} disabled={busy} onClick={run}>
              {busy ? '导入中…' : mode === 'replace' ? '清空并导入' : '执行导入'}
            </button>
          </div>
        </div>
      )}
      {msg && <small>{msg}</small>}
      <small>从本插件导出的 JSON 或别的工具的记忆 JSON 都能导入；调度状态（强度 / 间隔 / 复习次数）一起搬，导入后遗忘曲线接着走。</small>
    </div>
  )
}

// ---------- 侧栏入口（弹窗） ----------
// 按钮样式对齐 memory-eternal 的 footer 模式：footerActions 是纵向 wrap 容器，
// 必须 :has() 把容器撑成整行，否则按钮被裁成一条缝（lesson from me-footer issue #2）。
function SidebarButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="ml-footer-btn" title="忆枢 · 记忆库" onClick={() => setOpen(true)}>
        <span className="ml-footer-ico">🧠</span>
        <span className="ml-footer-label">忆枢记忆</span>
      </button>
      {open && createPortal(
        <div className="ml-modal-mask" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="ml-modal" data-windows-titlebar>
            <div className="ml-modal-head">
              <span>忆枢 · 记忆库</span>
              <button onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="ml-modal-body"><App /></div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ---------- 注册 ----------
export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => {
    const el = document.createElement('style')
    el.id = PLUGIN_ID + '-style'
    el.textContent = CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, PLUGIN_ID + ': styles')

  ctx.effect(() => ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section', id: PLUGIN_ID, order: 26,
      label: () => '忆枢记忆', locale: PLUGIN_ID, inject: () => ({}),
    }, () => <App />),
  ), PLUGIN_ID + ': settings section')

  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({
      name: 'sidebar.footer.action', id: PLUGIN_ID + ':footer', order: 101,
      label: () => '忆枢记忆', locale: PLUGIN_ID, inject: () => ({}),
    }, () => <SidebarButton />),
  ), PLUGIN_ID + ': sidebar entry')
}
