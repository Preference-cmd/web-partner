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

## 已定下的部分

无论上面选哪个，以下已经确定，不随本 ADR 变化：

- pnpm workspace，应用在 `apps/*`，共享代码在 `packages/*`；
- TypeScript strict（`tsconfig.base.json` 为下限）；
- Biome 负责格式化与 lint，Conventional Commits 由 commitlint 强制；
- 每个应用自带 `wrangler.jsonc`，生产部署走手动触发的 `deploy.yml`。

## 决策

（待用户确认后填写。接受时把 `Status` 改为 `accepted`，并同步更新根
`AGENTS.md` 的 fact sources 表与本页的「建议」段。）

## 后果

（决策后填写：受影响的应用结构、测试策略、CI 增加的步骤。）
