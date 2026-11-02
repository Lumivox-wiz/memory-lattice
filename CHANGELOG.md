# Changelog

按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 组织，版本号遵循语义化版本。

## [0.2.6] - 2026-11-03

补齐发布链路的最后一环（无功能改动）。

### Changed

- `publish.yml` 在发完 npm 后自动建 GitHub Release 并挂上预构建 tarball。此前 `v0.2.3` ~ `v0.2.5` **只有 tag、没有 Release**，而市场条目里的 `tarball:` 指向的就是 Release 资产 —— 链接会是 404。

## [0.2.5] - 2026-11-03

修掉一条会在 CI 上空转的守卫（无功能改动）。

### Fixed

- 「融合不会压低字面命中」这条守卫，在语义通道没给出分数时**融合前后分数恒等**，于是恒绿 —— CI 上因此报出「1 个负向控制无效」。现在比对前同步建一次索引（慢机器上 3s 签名缓存可能刚好过期），并新增守卫断言「语义通道确实给了分」，空转会被判红。
- 对应的负向控制改成确定性变异：原来只去掉夹紧时「能否被抓到」取决于语料统计（`sqrt(bm25/qIdfSum)` 是否 >1），本机与 CI 结论不一致，等于把守卫有效性交给运气。

## [0.2.4] - 2026-11-03

发布链路与文档的自我约束（无功能改动）。

### Changed

- `publish.yml` 的 Actions 固定到 commit SHA（与 `ci.yml` 一致）；新增「tag 与 `package.json` 版本不一致就拒绝发布」，避免标签指向名不副实的版本。
- `ci.yml` 里写死的守卫数量改为不带数字（数字会漂移），数量改由冒烟自身与 README 对照。

### Fixed

- README 的守卫数（237 → 264）与负向控制数（18 → 30）已与实际一致，并新增守卫防止再次漂移。

## [0.2.3] - 2026-11-03

发布方式改为 npm Trusted Publishing（OIDC）。

### Changed

- 新增 `.github/workflows/publish.yml`：push `v*` 标签或手动触发时，先跑满守卫，再通过 OIDC 发布。
- **发布不再需要凭据**：npm 账号已把本仓库注册为 trusted publisher，CI 里 `npm publish` 不用 `NPM_TOKEN`、不用 2FA 验证码，且每次发布自动附带 provenance（可验证这个包确实来自本仓库的某次构建）。
- 本机不再保存 npm token（旧的发布 token 已作废/撤销）。

## [0.2.2] - 2026-11-02

补上「已知未做」第 2 条：自动定时备份（此前只能手动点，或自己把 CLI 挂到系统计划任务）。

### Added

- 自动定时备份：默认关，开启后按 `backupIntervalHours`（默认 24h）自动跑增量备份写到库内目录，只保留最近 `backupKeep` 份（默认 7）。复用现有的加密信封 + 增量水位机制。
- 备份面板显示自动备份状态（开关 / 间隔 / 保留 / 加密 / 上次时间 / 目录），并提供「立即备份一次」手动触发 —— 走的是与定时任务完全相同的 `runAutoBackup`，所以「手动能加密成功」就等于「定时也能」。

### 三条边界（写死在守卫里）

- **默认关闭**：与蒸馏、人格合成、语义扩写等闸门一致 —— 有副作用的功能一律显式开启。
- **口令不落盘**：加密口令只从环境变量 `MEMORY_LATTICE_BACKUP_PASSPHRASE` 读取，配置 schema 里不存在任何口令字段；环境变量缺失时**跳过本次且不写任何文件**，绝不静默降级成明文。
- **目录锁在库内**：`backupDir` 越界（`../` / 绝对路径）回落到 `<vaultDir>/backups`；清理旧备份时只删 `memory-lattice-backup-*.json`，目录里用户自己的其他文件一个都不碰。

### Changed

- README「已知未做」移除「备份没有自动定时任务」一条。
- 修正「已知未做」第 1 条关于 embedding 的表述：本地 embedding 模型（如 bge-small-zh，约 23MB）下载后完全离线推理、**记忆内容不出站**，真正冲突的是「零第三方依赖」而非「零出站」。原文笼统写成「属于出站」，会低估本地方案的可行性。

### Tests

- 冒烟 237 → **257**（新增 20 项：目录越界回落 / 口令缺失跳过且不写文件 / 首次全量·次次增量 / 加密落信封 / 保留份数只删自家前缀 / 默认关闭 / schema 无口令字段 / 定时器 unref + 清理）。
- 负向控制 18 → **24**（新增 6 条，逐条验证能红）。

## [0.2.1] - 2026-11-02

第三轮发布前复核（仓库与发布卫生），运行时代码零改动。

### 交付

- `.gitignore` 补隐私模式：`.env*` / `*.pem` / `*.key` / `*.db` / `*.sqlite` / `*.wal` / `*.shm`，防止库文件与密钥误提交。
- `tools/preview-*.png` 不再入库（`npm run preview` 本地再生），文档截图只保留 `docs/screenshots/`；星云截图重新生成，去掉底部残留的调试 JSON。
- `package.json` 的 `files` 收窄到运行件 + 导入导出 CLI：`src/` 与构建 / 冒烟 / 负向 / 预览工具不再进 npm 包。
- CI 固定 `actions/checkout` / `actions/setup-node` 到 commit SHA（v4.4.0），新增 `npm audit --omit=dev` 供应链审计步骤。
- 冒烟新增守卫：发布清单只含运行件与导入导出 CLI、`.gitignore` 覆盖隐私文件模式（237 项）；负向控制对应增加 2 条（18 条；0.2.0 记为 15 条系漏数，实为 16 条）。

## [0.2.0] - 2026-11-02

「已知未做」清空 + 安全复核第二轮 + GitHub 交付。

### 新增

- **加密备份**：scrypt 派生 + AES-256-GCM，导出成 JSON 信封（`memory-lattice-export/v2`）；口令只走 POST body，不落盘、不进日志、不进 URL。
- **增量备份**：按水位只导出「上次之后变过的条目」，并带一份 `deletions` 清单；恢复时同步删除，不会越恢复越多。增量恢复按 `id + updated_at` upsert，内容没变就跳过。
- **按类型条数上限** `retentionCounts`：与天数策略正交，核心层豁免；淘汰顺序为「命中次数 → 强度 → 最后更新」，从最弱、最久没用的开始。
- 保留策略在配置页改成「类型 / 期限 / 条数上限」三列表格输入。
- `tools/import-export.mjs`：不依赖 DSH 的命令行导出/导入（`--dry-run` 预览）。

### 安全

- 本机 API 全部路由（含只读 `/export`、`/list`、`/persona`）要求**进程内会话令牌**；握手本身也要来源证明 + 限流。
- 人格 LLM 合成改为默认本地兜底：必须显式 `personaAutoSynth` + `personaProvider` 才会出站。
- 删除 `/config/audit-mode` 影子接口与手写的 SQLite 镜像，审核模式以宿主设置为唯一真源。
- README 增加「威胁模型（适用 / 不适用）」，明确不做 OS 级隔离。

### 改进

- 本地向量语义召回：滑窗局部语境 + PPMI + 随机投影；索引后台构建（不阻塞提示组装），余弦做单调标定后与 BM25 融合（只加不减）。
- 检索分数夹到 [0,1]：修复极短文档上 `sqrt(bm25/IDF和)` 超过 1 导致融合反而降分的问题。
- 导入支持四种模式（skip/merge/new/replace），外部字段一律夹紧。

### 修复

- 增量备份的时间水位与库内 `datetime('now')` 格式不一致导致「看起来没有变化」；现在统一经 SQLite `datetime()` 归一，并正确处理本地时区解析陷阱。
- 云图双层容器导致弹窗画布被内层固定高度卡死。
- `package-lock.json` 里 27 个 `@deepseek-ai/*` 条目没有 `resolved`，`npm ci` 在干净机器上无法复现；已从公共 npm 重新生成（每条带 `resolved` + `integrity`）。

### 交付

- 加入 `LICENSE`（MIT）、`.gitignore`、`.gitattributes`（全仓 LF，`.ps1` 走 CRLF）、`SECURITY.md`、`.github/workflows/ci.yml`。
- CI：`npm ci` → 冒烟（236 项）→ 负向控制（16 条，改坏必须变红）→ `lib/client.js` 与源码一致。
- 冒烟新增「开源交付件元数据」守卫：LICENSE 无占位符、作者与 `package.json` 一致、仓库地址齐全、README 无 `your-name` 占位、发布清单排除预览产物、lockfile 每条可解析、权限清单不索取凭据 / 外部服务 / 未使用的子进程能力。
- `npm pack` 体积 698KB → 163KB（预览 bundle 与截图不再进包）。
- 权限清单 `commands` 由 `node` 改为 `[]`：插件运行时从不启子进程，原来属于过度声明。

## [0.1.0] - 2026-11-01

首个可用版本。

- 短期记忆（48h）→ 长期记忆（SM-2 调度）→ 沉睡区（可唤醒）三层生命周期。
- 审核中心：LTM 写入与 STM 晋升都停在待审；systemPrompt 注入「禁止自行批准」红线。
- 工具 `memory_recall` / `memory_write` / `memory_about`；命中即完成一次复习强化。
- 自动召回注入：每轮按当前消息检索，只取「长期层 + 已生效」，带数据边界声明。
- 人格画像：低频合成、版本化快照、证据链与一键否定。
- 工作记忆（待办/承诺）、夜巡报告与可执行队列。
- 记忆星云（3D 透视 + 分簇 + 自转 + 聚焦）、遗忘曲线、概览/记忆/审核/人格/配置页。
- 零第三方运行时依赖（`node:sqlite` + 自研 BM25）。
