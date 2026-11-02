# 忆枢（memory-lattice）本地部署：把源码拷进 DSH profile 的 node_modules
#
# 为什么是「拷贝」而不是 junction：pnpm 的 hoisted 布局下 node_modules 是可丢弃的
# 部署副本，本仓库才是唯一真相源；而 junction 会让 ESM 的 realpath 沿真实路径往上找
# node_modules，peer 依赖（@deepseek-ai/dsh-*）就解析不到了。
#
# 用法：
#   pwsh -File deploy.ps1                 # 拷贝 + 注册 bundle
#   pwsh -File deploy.ps1 -SkipProfile    # 只拷贝（已经注册过时用）
#   pwsh -File deploy.ps1 -Profile <dir>  # 指定别的 profile 目录
#
# profile 目录解析顺序：-Profile 参数 → $env:DSH_HOME/profiles/desktop → ~/.dsh/profiles/desktop

param(
  [switch]$SkipProfile,
  [string]$Profile = ''
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot

if (-not (Test-Path (Join-Path $src 'index.js'))) { throw "源码路径不对：$src" }

if ($Profile) {
  $profileDir = $Profile
} elseif ($env:DSH_HOME) {
  $profileDir = Join-Path $env:DSH_HOME 'profiles/desktop'
} else {
  $profileDir = Join-Path $HOME '.dsh/profiles/desktop'
}
$dst = Join-Path $profileDir 'node_modules/memory-lattice'

# ① 拷贝（排除 .git / node_modules / 负向控制的临时备份 / 预览产物）
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
robocopy $src $dst /E /XD .git node_modules .github /XF deploy.ps1 *.neg *.check *.bak preview-bundle.js preview-graph.html /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy 失败：$LASTEXITCODE" }

# ② 语法自检（入口 + 全部 lib，含打包产物）
node --check (Join-Path $dst 'index.js')
Get-ChildItem (Join-Path $dst 'lib/*.js') | ForEach-Object { node --check $_.FullName }

# ③ 注册进 profile（依赖 + bundle；幂等）
if (-not $SkipProfile) {
  $pkgPath = Join-Path $profileDir 'package.json'
  if (-not (Test-Path $pkgPath)) { throw "找不到 profile 的 package.json：$pkgPath（用 -Profile 指定）" }
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  $linkPath = 'link:' + ($src -replace '\\', '/')
  if (-not $pkg.dependencies.PSObject.Properties['memory-lattice']) {
    $pkg.dependencies | Add-Member -NotePropertyName 'memory-lattice' -NotePropertyValue $linkPath
  } else {
    $pkg.dependencies.'memory-lattice' = $linkPath
  }
  if ($pkg.dsh.profile.bundles -notcontains 'memory-lattice') {
    $pkg.dsh.profile.bundles += 'memory-lattice'
  }
  $pkg | ConvertTo-Json -Depth 16 | Set-Content $pkgPath -Encoding utf8NoBOM
  Write-Host "已注册进 $pkgPath（dependencies + bundles）"
}

Write-Host "已部署 → $dst"
Write-Host "下一步：完全退出 DSH Desktop（含托盘）再启动 —— bundle 按 URL 缓存在内存里"
