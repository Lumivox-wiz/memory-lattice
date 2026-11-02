// 忆枢 · 客户端打包
// esbuild 把 src/client.jsx 打成 CJS，包进 DSH 客户端加载器的 __ModuleLoader 约定：
//   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
// react / react-dom / jsx-runtime 全部 external —— 由宿主的 require 提供（插件契约，
// dsh.client.inject 声明了 dsh-client-ui-settings；react 三件套是 loader 内建 spec）。
// Run: node tools/build.mjs
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'lib', 'client.js')

const banner = `window.__ModuleLoader__.load({ id: "memory-lattice", factory: (require) => {
var __module = { exports: {} };
var __origExports = __module.exports;
(function (module, exports) {
`
const footer = `
})(__module, __module.exports);
return __module.exports;
} });
`

mkdirSync(join(ROOT, 'lib'), { recursive: true })
const result = await build({
  entryPoints: [join(ROOT, 'src', 'client.jsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: banner },
  footer: { js: footer },
  outfile: OUT,
  minify: false,
  sourcemap: false,
  logLevel: 'warning',
})
if (result.errors.length) {
  console.error('build failed')
  process.exit(1)
}
// 自检：产物必须是合法脚本（wrapper 拼接错误会在这里炸出来，而不是到 DSH 里静默白屏）
await import('node:child_process').then(({ execFileSync }) => {
  execFileSync(process.execPath, ['--check', OUT], { stdio: 'pipe' })
})
console.log('built →', OUT)
