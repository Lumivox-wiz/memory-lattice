#!/usr/bin/env node
/**
 * 干净 profile 安装验证（L1–L3）—— 对齐 dshbase 的判定标准。
 *
 * dshbase 的「Verified」定义（见 ylwl1997/dshbase/docs/dshbase-catalog.md）：
 *   L1 Install  —— `dsh plugin add` 进干净 profile
 *   L2 Load     —— profile 启动 / dump-config 成功
 *   L3 Runtime  —— headless 问答退出码 0（返回 web-only 不算过）
 * L3 返回 web-only 时才需要 L4 Web CDP。
 *
 * 用法：
 *   node tools/verify-install.mjs              # 跑 L1–L3
 *   node tools/verify-install.mjs --keep       # 保留验证 profile（调试用）
 *
 * 需要：DSH_HOME 指向 DSH 数据目录；L3 需要可用的 DeepSeek 凭据
 * （从 $DSH_HOME/.credentials.yaml 读，或用环境变量 DEEPSEEK_API_KEY）。
 *
 * 退出码：0 = 全过；1 = 有环节失败（打印具体环节）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const KEEP = process.argv.includes('--keep')
const HOME = process.env.DSH_HOME || path.join(process.homedir(), '.dsh')

/** 找 DSH Desktop 安装目录（Electron 应用）。 */
function findAppRoot() {
  const candidates = [
    process.env.DSH_APP_ROOT,
    'F:/DSH NEXT',
    'C:/Program Files/DSH NEXT',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DSH NEXT'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (existsSync(path.join(c, 'resources', 'app', 'lib', 'plugin-cli.js'))) return c
  }
  return null
}

/** 找内置 node（DSH 自带，保证版本与宿主一致）。 */
function findNode(appRoot) {
  const candidates = [
    path.join(appRoot, 'resources', 'runtime', 'x64', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    path.join(appRoot, 'resources', 'runtime', 'x64', 'primary-runtime', 'dependencies', 'node', 'bin', 'node'),
    process.execPath,
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return null
}

/** 从凭据文件里取 DeepSeek key（只写进子进程环境，不打印）。 */
function readApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  const file = path.join(HOME, '.credentials.yaml')
  if (!existsSync(file)) return ''
  try {
    const m = /DEEPSEEK_API_KEY:[ \t]*["']?([^\s"'\r\n]+)/.exec(readFileSync(file, 'utf8'))
    return m ? m[1] : ''
  } catch {
    return ''
  }
}

function run(cmd, args, opts = {}) {
  // cwd 必须存在，否则 spawnSync 直接抛 ENOENT（Windows 上 DSH_HOME 常写成 F:\dsh-home
  // 这种反斜杠形式，path.join 会混用分隔符 —— 先归一化成绝对路径再校验）
  let cwd = opts.cwd
  if (cwd) {
    cwd = path.resolve(cwd)
    if (!existsSync(cwd)) cwd = undefined
  }
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 300000,
    env: { ...process.env, ...(opts.env || {}) },
    cwd,
    // 必须把子进程的输出接到文件描述符上：用管道时 Windows 上进程被 exit(1) 收尾
    // 会截断 stdout，父进程只看到 status=null、输出为空 —— 看起来像「什么都没发生」。
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  })
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? String(r.error.stack || r.error) : ''}`
  return { code: r.status ?? 1, out, killed: !!r.signal, error: r.error ? String(r.error.message || r.error) : '' }
}

/**
 * 找一个与本机 dsh 运行时兼容的 dsh-headless 版本。
 *
 * 宿主有版本兼容闸门：装错版本会被拒（报错里写着 "incompatible with dsh X"）。
 * 所以策略是：装最新版 → 被拒 → 从报错里读出本机版本号 → 取同号版本再试。
 */
function findHeadlessVersion(node, pluginCli, profile, home) {
  const view = run(node, ['--expose-internals', pluginCli, profile, 'view', '@deepseek-ai/dsh-headless', 'versions'], {
    cwd: path.join(home, 'profiles'),
    timeout: 120000,
  })
  const versions = [...view.out.matchAll(/"(\d+\.\d+\.\d+[-][\w.]+)"/g)].map((m) => m[1])
  if (!versions.length) return { ok: false, detail: `拿不到 dsh-headless 版本列表（${view.out.trim().slice(0, 200)}）` }

  // 逐个试；第一个不报「incompatible」的就是它
  for (const v of versions.slice().reverse()) {
    const r = run(node, ['--expose-internals', pluginCli, profile, 'add', `@deepseek-ai/dsh-headless@${v}`], {
      cwd: path.join(home, 'profiles'),
      timeout: 180000,
    })
    if (r.code === 0) return { ok: true, version: v }
    if (!/incompatible/i.test(r.out)) {
      return { ok: false, detail: `dsh-headless@${v} 装不上（非版本不兼容）：${r.out.trim().split('\n')[0].slice(0, 200)}` }
    }
  }
  return { ok: false, detail: `没有与本机 dsh 兼容的 dsh-headless 版本（试了 ${versions.length} 个）` }
}

const appRoot = findAppRoot()
if (!appRoot) {
  console.error('找不到 DSH Desktop 安装目录（设 DSH_APP_ROOT 后重试）')
  process.exit(1)
}
const node = findNode(appRoot)
const pluginCli = path.join(appRoot, 'resources', 'app', 'lib', 'plugin-cli.js')
const desktopCli = path.join(appRoot, 'resources', 'app', 'lib', 'desktop-cli.js')
if (!node) {
  console.error('找不到可用的 node 运行时')
  process.exit(1)
}

const profile = `verify-${process.pid.toString(36)}`
const results = []
const record = (level, ok, detail) => {
  results.push({ level, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${level}${detail ? ' — ' + detail : ''}`)
}

console.log(`DSH_HOME=${HOME}`)
console.log(`profile=${profile}\n`)

try {
  // ---- L1 安装 ----
  // 注意：L3 需要 headless bundle，否则 profile 会启动完整 Desktop（Electron）一直挂着直到超时。
  // 宿主对 bundle 有版本兼容闸门，必须挑与本机 dsh 版本匹配的 —— 这里按报错重试解析即可。
  const l1 = run(node, ['--expose-internals', pluginCli, profile, 'add', 'memory-lattice'], {
    cwd: path.join(HOME, 'profiles'),
    timeout: 300000,
  })
  record('L1 安装', l1.code === 0, l1.code === 0 ? '' : l1.out.trim().split('\n').slice(0, 4).join(' ⏎ ').slice(0, 400))

  // ---- L1b 装 headless bundle（L3 的前提）----
  if (l1.code === 0) {
    const headless = findHeadlessVersion(node, pluginCli, profile, HOME)
    record('L1b headless bundle', headless.ok, headless.ok ? headless.version : headless.detail)
  }

  // ---- L2 加载（dump-config 退出码 0，且配置里有本插件段）----
  if (l1.code === 0) {
    const l2 = run(node, ['--expose-internals', desktopCli, '--profile', profile, '--dump-config'], {
      cwd: path.join(HOME, 'profiles', profile),
      timeout: 180000,
    })
    const hasPlugin = l2.out.includes('memory-lattice')
    record('L2 加载', l2.code === 0 && hasPlugin, l2.code === 0 ? (hasPlugin ? '' : 'dump-config 里没有 memory-lattice 段') : l2.out.trim().split('\n').slice(-3).join(' / '))
  }

  // ---- L3 运行时（headless 问答退出码 0）----
  if (results.every((r) => r.ok)) {
    const key = readApiKey()
    if (!key) {
      record('L3 运行时', false, '没有可用的 DeepSeek 凭据（需要 DEEPSEEK_API_KEY 或 $DSH_HOME/.credentials.yaml）')
    } else {
      const l3 = run(node, ['--expose-internals', desktopCli, '--profile', profile, 'Reply with exactly: OK'], {
        cwd: path.join(HOME, 'profiles', profile),
        timeout: 240000,
        env: { DEEPSEEK_API_KEY: key },
      })
      const answered = /\bOK\b/.test(l3.out)
      // 失败时带上输出 —— 错误消息常在**开头**（栈的第一行），只取尾部会把它切掉
      const detail = l3.out.trim() ? `输出：${l3.out.trim().split('\n').slice(0, 6).join(' ⏎ ').slice(0, 400)}` : ''
      record('L3 运行时', l3.code === 0 && answered, l3.code === 0 ? (answered ? '' : `退出码 0 但没输出 OK（${detail}）`) : detail)
    }
  }
} finally {
  if (!KEEP) {
    const dir = path.join(HOME, 'profiles', profile)
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* Windows 句柄延迟，无妨 */ }
    console.log(`\n已清理验证 profile：${dir}`)
  } else {
    console.log(`\n--keep：保留验证 profile ${path.join(HOME, 'profiles', profile)}`)
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n==== ${results.length - failed.length} pass / ${failed.length} fail ====`)
process.exit(failed.length ? 1 : 0)
