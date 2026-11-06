# 0001 — 前端技术栈

**Status:** proposed
**Date:** 2026-11-06
**Decision owner:** 用户
**Blocks:** `apps/web` 的脚手架、依赖安装、CI 的 build 步骤

## 背景

Partner 是一个部署在 Cloudflare Workers 上的 Web 应用。仓库已按 pnpm workspace
定好形态（`apps/*` 与 `packages/*`），工作流也已就位，但前端技术栈尚未决定。
这个决定牵动三件事：

1. 渲染模型——静态预渲染、SSR，还是纯客户端 SPA；
2. 本地开发与生产是否跑同一个 Workers 运行时（`workerd`），而不是 Node 近似；
3. 未来绑定（KV、D1、R2、Queues、Durable Objects）如何暴露给代码。

约束：单人开发 + AI agent 协作；部署目标是 Workers；希望本地开发与线上运行时
一致；不希望在还没有产品形态时引入过重的适配层。

## 选项

| 方案 | 渲染 | 本地开发 | 优点 | 代价 |
| --- | --- | --- | --- | --- |
| Astro + React islands + `@astrojs/cloudflare` | 静态预渲染 + 按需 SSR | `astro dev`（Vite） | 与既有 causa/portfolio 的 Workers 部署路径一致；内容页几乎零 JS；绑定通过 adapter 注入 | SSR 路由与 island 边界需要刻意设计 |
| Vite + React SPA + Hono Worker | 纯客户端 + Worker API | `vite dev` + `wrangler dev` | 前后端边界最清晰；Worker 侧就是普通 Hono 应用，绑定即类型 | 自己拼装静态资源绑定与 SPA 回退；首屏与 SEO 需要额外处理 |
| Next.js + `@opennextjs/cloudflare` | SSR/RSC | `next dev`，部署前需 OpenNext 构建 | 生态与文档最完整 | 适配层最重；构建产物与调试链路复杂，冷启动需实测 |
| SvelteKit + `@sveltejs/adapter-cloudflare` | 静态 + SSR | `vite dev` | 产物小、心智负担低 | 与用户既有 React 经验不一致 |

## 建议

若产品以「页面 + 少量交互」为主，选 Astro；若以「登录后的应用界面 + 大量 API
交互」为主，选 Vite + React + Hono。两者都满足「本地生产同运行时」的约束。
Next.js 只有在明确需要其生态与 RSC 能力时才值得付适配层成本。

## 调研结论（2026-11-06）

首个产品形态已明确为《伴侣小生命情绪互动 + 状态调试面板》，完整调研见
[`docs/research/2026-11-06-companion-prototype.md`](../research/2026-11-06-companion-prototype.md)。

它对选型的影响是决定性的：核心体验是一个持续渲染的 WebGL 角色与情绪联动的光影，
没有内容页、没有 SEO 诉求、没有服务端数据拼装。Astro 的预渲染优势在此为零，
Next.js 的 RSC 与适配层完全不参与这条路径。

因此**建议选第二项**：Vite + React SPA + Worker API，具体为：

- Vite 8 + React 19 + TypeScript；
- `@cloudflare/vite-plugin` 让 `pnpm dev` 直接跑在 `workerd`，与生产同运行时；
- 单个 Worker 同时承担静态资源与 `/api/*`（Hono 路由），不拆两个 Worker；
- 角色用 Canvas 2D 自绘（非 three.js），理由见
  [ADR 0002 修订二](0002-character-rendering.md)；素材为社区鲸鱼娘立绘，
  授权见 [ADR 0003](0003-character-assets.md)。

### 依赖清单

版本于 2026-11-06 核对，写进 `apps/web/package.json` 时按此锁定：

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| `vite` | 8.3.6 | 构建与 dev server |
| `@vitejs/plugin-react` | 6.2.1 | React 编译（peer 要求 vite ^8） |
| `react` / `react-dom` | 19.3.1 | UI |
| `typescript` | ^6.0.3 | 与仓库根一致 |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.4 | 样式 |
| `zustand` | 5.0.16 | 情绪状态与调试面板共享 |
| `hono` | 4.13.16 | `/api/classify` 路由 |
| `wrangler` | 4.158.0 | 部署与本地 workerd |
| `@cloudflare/vite-plugin` | 1.67.0 | dev/build 与 Workers 集成 |
| `@cloudflare/workers-types` | 5.20261106.1 | Worker 侧类型 |
| `vitest` | 5.1.0 | 分类器与 reducer 单测 |
| `@fontsource/jetbrains-mono` | 5.3.0 | 调试面板等宽字体（自托管） |
| `motion` | 14.10.0 | 可选：气泡与抽屉的弹簧动画，CSS 能覆盖就不用 |

不引入 three.js、`@react-three/fiber`、drei 与后处理：角色是平面立绘，
WebGL 在这条路径上换不来观感，只换来约 250 KB gzip 和一套额外的布局系统。
中文正文不打包字体，用系统 CJK 栈（`PingFang SC` / `Microsoft YaHei` /
`Noto Sans SC`）避免 10 MB 级的字体文件。

副作用：`apps/web` 的 `build` 产出 `dist/`（含 client 与 Worker 产物），`deploy`
用 `wrangler deploy` 读取构建输出的 `wrangler.json`，与根 `AGENTS.md` 的约定一致。

## 已定下的部分

无论上面选哪个，以下已经确定，不随本 ADR 变化：

- pnpm workspace，应用在 `apps/*`，共享代码在 `packages/*`；
- TypeScript strict（`tsconfig.base.json` 为下限）；
- Biome 负责格式化与 lint，Conventional Commits 由 commitlint 强制；
- 每个应用自带 `wrangler.jsonc`，生产部署走手动触发的 `deploy.yml`。

## 决策

（待用户确认后填写。接受时把 `Status` 改为 `accepted`，把「建议」替换为最终选择，
并同步更新根 `AGENTS.md` 的 fact sources 表与本页的「后果」段。）

## 后果

（决策后填写：受影响的应用结构、测试策略、CI 增加的步骤。）
