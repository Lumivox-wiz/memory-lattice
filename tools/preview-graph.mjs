// 忆枢 · 云图弹窗本地预览：headless Edge 截图，实测弹窗与画布布局
// 跑法：node tools/preview-graph.mjs   → tools/preview-graph.png
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(ROOT, 'tools', 'preview-entry.jsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: join(ROOT, 'tools', 'preview-bundle.js'),
  minify: false,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
})

writeFileSync(join(ROOT, 'tools', 'preview-graph.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>memory-lattice graph preview</title>
<style>
  /* 预览用最小 DSH 主题变量（浅色）。真实宿主会注入完整 --dsw-alias-* 令牌。 */
  :root {
    --dsw-alias-bg-base: #f7f8fb; --dsw-alias-bg-layer-1: #ffffff;
    --dsw-alias-border-l1: #e5e7eb; --dsw-alias-border-l2: #d1d5db;
    --dsw-alias-label-primary: #1f2937; --dsw-alias-label-secondary: #6b7280;
    --dsw-alias-accent: #2563eb;
  }
  body { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
    font: 13px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
</style></head>
<body><div id="root"></div>
<script src="./preview-bundle.js"></script></body></html>`)

const out = join(ROOT, 'tools', 'preview-graph.png')
const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)
const edge = edgeCandidates.find((p) => { try { return existsSync(p) } catch { return false } })
if (!edge) { console.error('找不到 msedge，用 EDGE_PATH 指定'); process.exit(1) }
execFileSync(edge, [
  '--headless=new',
  `--screenshot=${out}`,
  '--window-size=1080,711',
  '--virtual-time-budget=4000',
  '--disable-gpu',
  'file:///' + join(ROOT, 'tools', 'preview-graph.html').replace(/\\/g, '/'),
], { stdio: 'pipe', timeout: 30000 })
console.log('screenshot →', out)
// 结构化诊断：dump-dom 抓 #diag 全文（截图里的 JSON 会被截断）
const dom = execFileSync(edge, [
  '--headless=new', '--dump-dom', '--window-size=1080,711',
  '--virtual-time-budget=4000', '--disable-gpu',
  'file:///' + join(ROOT, 'tools', 'preview-graph.html').replace(/\\/g, '/'),
], { stdio: 'pipe', timeout: 30000 }).toString()
const m = /<pre id="diag"[^>]*>([\s\S]*?)<\/pre>/.exec(dom)
console.log('diag:', m ? m[1].replace(/&quot;/g, '"') : '(no diag found)')

// 概览页截图（不点击，停在 overview）
const out2 = join(ROOT, 'tools', 'preview-overview.png')
execFileSync(edge, [
  '--headless=new', `--screenshot=${out2}`, '--window-size=1080,900',
  '--virtual-time-budget=3000', '--disable-gpu',
  'file:///' + join(ROOT, 'tools', 'preview-graph.html').replace(/\\/g, '/') + '#overview',
], { stdio: 'pipe', timeout: 30000 })
console.log('screenshot →', out2)

// 配置页截图（选 Provider 的界面）
const out3 = join(ROOT, 'tools', 'preview-config.png')
execFileSync(edge, [
  '--headless=new', `--screenshot=${out3}`, '--window-size=1080,2150',
  '--virtual-time-budget=3000', '--disable-gpu',
  'file:///' + join(ROOT, 'tools', 'preview-graph.html').replace(/\\/g, '/') + '#config',
], { stdio: 'pipe', timeout: 30000 })
console.log('screenshot →', out3)

// 夜巡队列截图
const out4 = join(ROOT, 'tools', 'preview-queue.png')
execFileSync(edge, [
  '--headless=new', `--screenshot=${out4}`, '--window-size=1080,1300',
  '--virtual-time-budget=3500', '--disable-gpu',
  'file:///' + join(ROOT, 'tools', 'preview-graph.html').replace(/\\/g, '/') + '#queue',
], { stdio: 'pipe', timeout: 30000 })
console.log('screenshot →', out4)
