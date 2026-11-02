// 负向控制：逐个破坏守卫，确认对应测试变红（改 src/lib → 跑 smoke → 还原）
import { readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const cases = [
  { name: '向量通道失效（sem 恒 0）', file: 'lib/store.js', from: 'const sem = semRaw > SEMANTIC_FLOOR ? Math.min(1, (semRaw - SEMANTIC_FLOOR) / SEMANTIC_SPAN) : 0', to: 'const sem = 0', expect: '向量通道补回' },
  { name: 'lex 不夹紧（融合会压低分数）', file: 'lib/store.js', from: 'const lex = literalOk ? Math.min(1, Math.sqrt(bm25 / qIdfSum)) : 0', to: 'const lex = literalOk ? Math.sqrt(bm25 / qIdfSum) : 0', expect: '不会压低' },
  { name: '导入失去幂等（不看内容指纹）', file: 'lib/importer.js', from: "if (mode !== 'new' && sigs.has(sig)) { skipped++; continue }", to: 'if (false) { skipped++; continue }', expect: '重复导入幂等' },
  { name: '整库替换不校验确认', file: 'lib/importer.js', from: "if (mode === 'replace' && confirm !== 'REPLACE') return fail(", to: "if (false) return fail(", expect: '需要 confirm' },
  { name: '核心层标记失效', file: 'lib/api.js', from: 'core: isCoreKind(k), days: map[k] ?? null, max: counts[k] ?? null', to: 'core: false, days: map[k] ?? null, max: counts[k] ?? null', expect: '核心层被标记' },
  // 第二轮安全复核（读接口鉴权 / 人格出站 / 退役接口 / 索引阻塞）
  { name: '读接口不校验会话令牌', file: 'lib/api.js', from: 'if (!tokenEquals(presentedToken(req), sessionToken)) {', to: 'if (false) {', expect: '裸请求（无令牌）读 /export 被拒' },
  { name: '人格合成为默认自选 Provider', file: 'lib/api.js', from: 'const wantLlm = st.personaAutoSynth === true && !!provider', to: 'const wantLlm = true', expect: '默认设置下人格合成不出站' },
  { name: '向量索引改回同步阻塞', file: 'lib/vectors.js', from: 'if (!hit) { scheduleBuild(root); return null }', to: 'if (!hit) { return warmIndex(root) }', expect: '冷缓存首查不阻塞' },
  { name: '退役的 audit-mode 影子接口被放回', file: 'lib/api.js', from: "      return json(res, 404, { ok: false, error: 'unknown route: ' + route })", to: "      if (route === '/config/audit-mode' && method === 'POST') { const b = await readBody(req); return json(res, 200, { ok: true, echo: b }) }\n      return json(res, 404, { ok: false, error: 'unknown route: ' + route })", expect: '影子接口已移除' },
  // 第三轮（加密备份 / 增量对齐 / 条数上限）
  { name: '加密退化成明文', file: 'lib/backup.js', from: '  const cipher = createCipheriv(ALG, keyFrom(pass, salt), iv)', to: "  return JSON.stringify(payload) // mutated: 不加密\n  const cipher = createCipheriv(ALG, keyFrom(pass, salt), iv)", expect: '密文里不含明文正文' },
  { name: '增量不同步删除', file: 'lib/importer.js', from: '  for (const d of parsed.deletions) {', to: '  for (const d of []) {', expect: '对端删除被同步' },
  { name: '条数淘汰顺序反过来（先删常用的）', file: 'lib/retention.js', from: 'ORDER BY hits ASC, strength ASC, updated_at ASC', to: 'ORDER BY hits DESC, strength ASC, updated_at ASC', expect: '优先淘汰 0 命中的最弱项' },
  { name: '增量比较退回裸字符串（时间格式不归一）', file: 'lib/backup.js', from: 'WHERE (datetime(updated_at) >= datetime(?)) OR (deleted_at IS NOT NULL AND datetime(deleted_at) >= datetime(?))', to: 'WHERE (updated_at >= ?) OR (deleted_at IS NOT NULL AND deleted_at >= ?)', expect: 'ISO 时间戳行' },
  // 交付件（开源元数据）
  { name: '权限清单多报凭据', file: 'package.json', from: '"credentials": [],', to: '"credentials": ["*"],', expect: '权限清单不索取凭据' },
  { name: 'LICENSE 留着模板占位符', file: 'LICENSE', from: 'Copyright (c) 2026 澪梦 (Lumivox-wiz)', to: 'Copyright (c) <year> <copyright holders>', expect: 'LICENSE 没有占位符' },
  { name: 'lockfile 缺 resolved（npm ci 不可复现）', file: 'package-lock.json', from: '"resolved": "https://registry.npmjs.org/@deepseek-ai/cordis/-/cordis-4.0.5.tgz",\n      "integrity": "sha512-Sktq5axy0owk9PdnivBRNOJjHEVEibCt0+TDDZcv0+UH2KS1M910fX4kn5y45YFsrpZIi1mJf/1s5VzywMUnyg==",', to: '"integrity": "sha512-Sktq5axy0owk9PdnivBRNOJjHEVEibCt0+TDDZcv0+UH2KS1M910fX4kn5y45YFsrpZIi1mJf/1s5VzywMUnyg==",', expect: 'lockfile 每条都有 resolved' },
]

let bad = 0
for (const c of cases) {
  const p = `${ROOT}/${c.file}`
  const bak = p + '.neg'
  copyFileSync(p, bak)
  const src = readFileSync(p, 'utf8')
  if (!src.includes(c.from)) { console.log(`  ?? 变异点没找到：${c.name}`); bad++; copyFileSync(bak, p); continue }
  writeFileSync(p, src.replace(c.from, c.to))
  let out = ''
  try {
    out = execFileSync('node', [`${ROOT}/tools/smoke.mjs`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '')
  }
  copyFileSync(bak, p)
  rmSync(bak, { force: true })
  const fails = out.split('\n').filter((l) => l.startsWith('FAIL'))
  const hit = fails.some((l) => l.includes(c.expect))
  const total = /==== (\d+) pass \/ (\d+) fail ====/.exec(out)
  console.log(`${hit ? 'ok  ' : 'BAD '} ${c.name} → ${fails.length} FAIL${total ? ` (${total[1]} pass/${total[2]} fail)` : ''}`)
  if (!hit) { bad++; console.log('     失败项：' + fails.slice(0, 4).join(' | ')) }
}

console.log(bad ? `\n${bad} 个负向控制无效` : '\n全部负向控制有效')
process.exit(bad ? 1 : 0)
