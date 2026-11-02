# Changelog

按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 组织，版本号遵循语义化版本。

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
- CI：`npm ci` → 冒烟（236 项）→ 负向控制（15 条，改坏必须变红）→ `lib/client.js` 与源码一致。
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
