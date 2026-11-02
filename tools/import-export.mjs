#!/usr/bin/env node
// 忆枢 · 命令行导入 / 导出（不依赖 DSH 运行，直接操作 SQLite 库）
//
// 用法：
//   node tools/import-export.mjs --export backup.json
//   node tools/import-export.mjs --import backup.json --dry-run
//   node tools/import-export.mjs --import backup.json --mode merge
//   node tools/import-export.mjs --import backup.json --mode replace --confirm REPLACE
//
//   --vault <dir>   指定记忆库目录（默认 $MEMORY_LATTICE_DIR 或 $DSH_HOME/memory-lattice）
//   --mode          skip（默认）| merge | new | replace
//   --dry-run       只预览，不写库
//   --confirm       整库替换时必须传 REPLACE
//
// 为什么要有它：插件只能在 DSH 里跑；换机器 / 备份恢复 / 批量搬迁时，
// 一个不依赖宿主的 CLI 比「先启动 DSH 再点按钮」可靠得多。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import process from 'node:process'
import { getDb, closeAllDb } from '../lib/db.js'
import { previewImport, applyImport, IMPORT_MODES, EXPORT_FORMAT } from '../lib/importer.js'

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : 'true'
}
const has = (name) => process.argv.includes(`--${name}`)

export function resolveVaultDir() {
  const explicit = String(arg('vault') || process.env.MEMORY_LATTICE_DIR || '').trim()
  if (explicit) return path.resolve(explicit)
  const home = String(process.env.DSH_HOME || '').trim() || path.join(os.homedir(), '.dsh')
  return path.join(home, 'memory-lattice')
}

function doExport(root, outPath) {
  const db = getDb(root)
  const memories = db.prepare(`SELECT id, layer, kind, title, body, tags, status, strength, ease, interval_hours,
    due_at, last_review_at, review_count, hits, source, submitted_by, created_at, updated_at, sleeping_at
    FROM memories WHERE deleted_at IS NULL ORDER BY id`).all()
  const personaSnapshots = db.prepare('SELECT id, content, summary, trigger, memory_count, created_at FROM persona_snapshots ORDER BY id').all()
  const payload = { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), memories, personaSnapshots }
  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  writeFileSync(path.resolve(outPath), JSON.stringify(payload, null, 2), 'utf8')
  return { memories: memories.length, personaSnapshots: personaSnapshots.length }
}

function main() {
  const root = resolveVaultDir()
  const exportTo = arg('export')
  const importFrom = arg('import')

  if (exportTo && exportTo !== 'true') {
    const r = doExport(root, exportTo)
    console.log(`导出完成 → ${path.resolve(exportTo)}`)
    console.log(`  记忆 ${r.memories} 条 · 画像快照 ${r.personaSnapshots} 个 · 来源库 ${root}`)
    return 0
  }

  if (importFrom && importFrom !== 'true') {
    const raw = readFileSync(path.resolve(importFrom), 'utf8')
    const mode = IMPORT_MODES.includes(arg('mode', 'skip')) ? arg('mode', 'skip') : 'skip'
    if (has('dry-run')) {
      const p = previewImport(root, raw, { mode })
      if (!p.ok) { console.error('预览失败：' + p.error); return 1 }
      console.log(`[dry-run] 模式 ${mode} · 目标库 ${root}`)
      console.log(`  共 ${p.total} 条 → 新建 ${p.create} · 跳过 ${p.skip} · 合并 ${p.merge}`)
      console.log('  按类型：' + Object.entries(p.byKind).map(([k, n]) => `${k}:${n}`).join(' '))
      console.log('  按层：' + Object.entries(p.byLayer).map(([k, n]) => `${k}:${n}`).join(' '))
      if (p.personaTotal) console.log(`  画像快照：${p.personaTotal} 个（新增 ${p.personaNew}）`)
      if (p.issues.length) console.log('  提示：' + p.issues.join('；'))
      for (const s of p.samples) console.log(`   - [${s.action}] ${s.title}${s.nearId ? ` → #${s.nearId}` : ''}`)
      return 0
    }
    const r = applyImport(root, raw, { mode, confirm: arg('confirm') })
    if (!r.ok) { console.error('导入失败：' + r.error); return 1 }
    console.log(`导入完成（${r.mode}）`)
    console.log(`  新建 ${r.created} · 跳过 ${r.skipped} · 合并 ${r.merged} · 画像 ${r.personas}${r.wiped ? ` · 先清空 ${r.wiped}` : ''}`)
    return 0
  }

  console.error('用法：')
  console.error('  node tools/import-export.mjs --export <out.json> [--vault <dir>]')
  console.error('  node tools/import-export.mjs --import <in.json> [--mode skip|merge|new|replace] [--dry-run] [--confirm REPLACE]')
  return 1
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('import-export.mjs')) {
  let code = 1
  try { code = main() } catch (e) { console.error('出错：' + String(e?.message || e)); code = 1 }
  finally { closeAllDb() }
  process.exit(code)
}
