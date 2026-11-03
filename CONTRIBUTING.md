# 参与贡献

欢迎提 Issue 与 PR。动手前先扫一眼这里，能省掉一轮来回。

## 报 Issue

- **Bug**：说清 DSH 版本、profile（desktop / web / headless）、触发路径、最小复现配置与实际结果。
- **功能建议**：写清「谁、在什么场景下、被什么卡住」，比只描述期望行为更容易被接受。
- 请**不要**在公开 Issue 里贴真实记忆内容、对话原文或本机路径。

安全问题请按 [SECURITY.md](./SECURITY.md) 的流程走，**不要**开公开 PR 或 Issue。

## 提 PR

1. Fork 仓库，认领一个分支（`feat/…` / `fix/…` / `docs/…`）。
2. 本地跑通完整验收链（下面「改完要做什么」一节），三条命令都要绿。
3. PR 描述写清：**改了什么、为什么改、对使用者意味着什么、有没有动配置**。
4. 一次 PR 只做一件事。跨版本号的改动请拆开。

## 开发环境

```bash
npm ci          # 安装（含 peer：dsh-tools / dsh-llm / cordis）
npm run build   # esbuild 打包客户端 → lib/client.js
npm test        # 守卫
npm run neg     # 负向控制：确认守卫真的会红
npm run preview # 用假数据渲染 UI 并截图到 tools/preview-*.png
```

装好依赖后可以把 profile 的 `dependencies` 指向本仓库（`link:<repo>`），改完 `npm run build` 后重启客户端生效。

```powershell
pwsh -File deploy.ps1              # 拷贝进 profile + 注册 bundle
pwsh -File deploy.ps1 -SkipProfile # 已注册过，只同步文件
```

## 改完要做什么

按这个顺序，缺一步就可能留下不一致：

1. **改了 `src/`** → 必须 `npm run build`（`lib/client.js` 是构建产物，与源码不一致会被 CI 拦下）。
2. **改了运行时逻辑** → `npm test` 要绿；新增能力要同时新增**能红的守卫**。
3. **加/改守卫** → 还要在 `tools/neg-controls.mjs` 里配一条对应的负向控制，确认改坏它守卫真的会红。守卫写了但改不坏，说明它可能是空转的。
4. **改了文档里的数量或版本号** → 数量交给守卫去对照实测值，别手写；版本号要三处一起改（`package.json`、CHANGELOG 顶部条目、README 安装说明里的 tarball 链接）。
5. **改了公开文案**（README / CHANGELOG / Release）→ 只写「改了什么、对使用者意味着什么」，不写内部开发过程（守卫数量、复核轮次、自己的历史笔误）。
6. **改了 `package.json` 的 `files`** → 发布清单只留运行所需文件；预览产物与截图不入库。

## 代码约定

- 运行时**零第三方依赖**：`node:sqlite` + 自研检索。新增依赖前先想清楚要不要破这条。
- **零出站**：任何会发起网络请求的路径都必须显式开启，且在权限清单里如实写明（`dsh.permissions`）。
- 交互式功能一律有**默认关闭**的开关；写盘、出站、删除这类副作用不能默认开启。
- 密码 / 口令 / 密钥**不落配置**，只从环境变量读；缺失时宁可跳过，不要静默降级。
- 只声明你真的用到的权限。插件运行时不用子进程就别在 `commands` 里写 `node`。
- 中文文案里的标点用全角（`，`、`。`、`「」`），代码与标识符用半角。

## 目录速查

| 路径 | 是什么 |
|---|---|
| `index.js` | 插件入口：设置命名空间、工具注册、systemPrompt 注入、定时任务、API 路由 |
| `lib/` | 后端：建表、检索、遗忘引擎、向量、备份、导入、API |
| `src/` | 前端源码（JSX） |
| `lib/client.js` | **构建产物**，由 `npm run build` 生成，别手改 |
| `tools/` | 构建、冒烟、负向控制、预览截图、导入导出 CLI |

更细的说明见 [README 的目录结构一节](./README.md#目录结构)。
