# 伴侣小生命 — 功能与技术栈调研

**Status:** stale
**Updated:** 2026-11-06

> **后续变更：** 本文是选型前的调研快照。用户随后指定了角色形象（社区鲸鱼娘），
> §3 的角色素材结论与 §9 的待决项已被
> [`docs/adr/0002-character-rendering.md`](../adr/0002-character-rendering.md) 的修订取代，
> 素材授权见 [`docs/adr/0003-character-assets.md`](../adr/0003-character-assets.md)。
> 三维环境层（灯光、Bloom、粒子）与情绪系统的结论仍然有效。

调研对象：《伴侣小生命情绪互动 + 状态调试面板》Web 原型。本文只做调研与选型建议，
不写实现；结论一旦确认，按 `docs/adr/` 的流程落成 ADR 再动手。

## 1. 结论先行

| 决定点 | 建议 | 关键依据 |
| --- | --- | --- |
| 前端栈 | Vite 8 + React 19 + TypeScript，不用 Next/Astro | 体验全在客户端 WebGL，SSR 无收益；官方 Vite 插件让 dev 直接跑在 `workerd` |
| 部署形态 | 单 Worker：静态资源 + `/api/*` | `@cloudflare/vite-plugin` 的 `assets` + `run_worker_first: ["/api/*"]` |
| 3D | three r187 + `@react-three/fiber` 9 + `drei` 10 | React 19 生态唯一成熟方案；r3f v9 与 React 19 配对 |
| 角色素材 | `RobotExpressive.glb`（CC0，464 KB，14 段动画，头部 3 个表情 morph） | 实测读取：骨骼、clip 名与时长、morph 全部可用，许可证干净 |
| 情绪判断 | 本地启发式分类器为默认，Workers AI 为可选叠加 | 断网/无 key 仍可演示；免费额度足够（约 2 万次/天，见 §6.3） |
| 光影氛围 | CSS 变量驱动背景 + three 灯光同步，情绪切换 800 ms 过渡 | 比后期处理更稳、更省；Bloom 只做点缀 |

一句话：**React SPA + R3F，模型与分类器都做成可替换的实现，核心体验不依赖网络。**

## 2. 需求拆解与验收

| 编号 | 功能 | 验收标准 |
| --- | --- | --- |
| F1 | 角色呈现 | 模型加载后持续播放待机呼吸，有轻微头部摆动；卸载时不泄漏 GPU 资源 |
| F2 | 输入与快捷互动 | 1 个输入框 + 3 个按钮（摸摸头 / 夸夸它 / 哄它睡觉），回车与点击均可触发 |
| F3 | 情绪切换 | ≥4 种状态，动作、表情、环境光影同时切换；1 秒内可感知，连贯不跳帧 |
| F4 | 环境联动 | 背景光晕、粒子速度、暗角随情绪平滑变化，过渡 ≥600 ms，全程无白屏闪烁 |
| F5 | 回应文案 | 每种情绪至少 4 条本地文案，随机取样且不连续重复 |
| F6 | 调试面板 | 显示情绪状态码、内部 mood 值、当前 clip、互动日志；可强制切状态、切灯光主题、发系统气泡 |
| F7 | 降级与可访问 | WebGL 不可用时降级为 CSS 角色且有提示；尊重 `prefers-reduced-motion`；控件可键盘操作 |
| F8 | 部署 | `wrangler deploy` 一次上线；`/api/classify` 缺失时前端自动回退本地分类器 |

非功能目标：首屏可交互 < 2.5 s（宽带）；桌面 60 fps，中端移动 ≥ 45 fps；
3D 资源 ≤ 600 KB；**断网时 F1–F7 全部可用**。

## 3. 角色呈现选型

| 方案 | 视觉上限 | 工作量 | 依赖体积 | 判断 |
| --- | --- | --- | --- | --- |
| GLB + 骨骼动画（three/R3F） | 高，可加 Bloom、景深、发光 | 中 | three ≈ 170 KB gzip | **采用** |
| VRM 虚拟形象（`@pixiv/three-vrm`） | 高，人形亲和力强 | 高（素材授权、表情绑定复杂） | three + three-vrm | 留作二期 |
| Lottie / Rive 2D | 中，2D 精致但缺空间感 | 低 | 小 | 备选降级方案 |
| 纯 CSS/Canvas 绘制 | 中高，取决于手绘功力 | 高 | 极小 | 备选降级方案 |

### 3.1 素材事实（从 GLB 实测读出）

`RobotExpressive.glb`，464 KB，FBX2glTF 导出，74 节点 / 2 骨骼 / 14 网格 / 3 材质，
**无贴图**（顶点色 + 材质色），加载后无额外图片请求。

| clip | 时长 | clip | 时长 |
| --- | --- | --- | --- |
| Idle | 3.33 s | Dance | 3.33 s |
| Jump | 0.71 s | ThumbsUp | 1.58 s |
| Wave | 1.83 s | Yes | 1.67 s |
| No | 1.67 s | Punch | 0.83 s |
| Sitting | 0.42 s | Standing | 0.42 s |
| Walking | 0.96 s | Running | 0.96 s |
| WalkJump | 0.83 s | Death | 0.96 s |

头部网格带三个 morph target：**Angry / Surprised / Sad**——正好用来做表情叠加，
比只切 clip 更有"活气"。没有眨眼 morph，眨眼需要另做（缩放眼球网格或二期补）。

- 出处与许可：模型作者 Tomás Laulhé（Quaternius），**CC0 1.0**；Don McCurdy 加了
  三个表情 morph 并做了材质清理。仓库内 `examples/models/gltf/RobotExpressive/README.md`
  记录了这一变更链。CC0 意味着可商用、可修改、无需署名（仍会在 README 致谢）。
- 备选素材：Quaternius 的 Animated Animal Pack（CC0，12 只低多边形动物，含走/跑/吃/倒下），
  风格更"生物"但面数低、表情缺失；Poly Pizza 上有同作者的 CC0 GLB 可直接取用。

### 3.2 情绪 → 动作映射

| 状态 | 状态码 | 进入 clip | 停留 | 表情 morph | 说明 |
| --- | --- | --- | --- | --- | --- |
| 待机 | `EMO_IDLE` | Idle（loop） | 持续 | 无 | 呼吸缩放 + 头部正弦轻摆叠加在 clip 之上 |
| 开心 | `EMO_HAPPY` | Dance（loop），入场先 Jump 一次 | 8 s 后回落 Idle | Surprised 0.35 | 触摸/夸奖首选 |
| 害羞/委屈 | `EMO_SHY` | No 播一次 → Idle | 6 s 后回落 | Sad 0.7 | 摇头是"别扭"的通用语汇 |
| 犯困 | `EMO_SLEEPY` | Sitting 播一次 → 慢速 Idle | 保持到用户互动 | Sad 0.45 | Sitting 仅 0.42 s，是姿态而非循环，需要 `clampWhenFinished` |

切换用 `AnimationMixer.crossFadeTo(0.35)`；单次 clip 用 `LoopOnce` + `finished` 事件
回落。呼吸与摆头不占用 clip，作为第 2 条 `AnimationMixer` 的轨道叠加，避免与动作打架。

## 4. 情绪系统设计

### 4.1 信号模型

```ts
type EmotionId = 'idle' | 'happy' | 'shy' | 'sleepy';

interface EmotionSignal {
  emotion: EmotionId;
  confidence: number; // 0..1
  intensity: number;  // 0..1，影响动效幅度
  source: 'heuristic' | 'llm' | 'debug';
  reason: string;     // 命中词或模型理由，直接进调试日志
}
```

`confidence < 0.45` 时不切换，只推进日志——避免一句话把角色拍来拍去。

### 4.2 分类器：两层，默认可离线

- **启发式（默认）**：中英文关键词加权 + 标点/表情/重复字符（"呜呜呜""！！！"）+ 上一状态
  惯性。纯函数、<1 ms、可单测，是仓库里最值得写测试的部分。
- **Workers AI（可选叠加）**：`/api/classify` 调 `@cf/meta/llama-3.2-1b-instruct`，JSON mode
  返回 `{emotion, confidence}`。超时 1.5 s，失败即回落启发式并记日志。
- 调试面板提供「对比模式」：同一句话同时跑两条路径，并排显示结果与耗时——这既是演示点，
  也是判断要不要付费接大模型的依据。

不采用"只接云端大模型"：演示环境网络不可控，且一句话的情绪分类用 70 亿参数模型是浪费。

### 4.3 状态机

- 进入新状态后 **最少停留 2 s**，防止抖动；
- 无互动时按时长衰减回 `idle`（happy 8 s / shy 6 s / sleepy 不衰减）；
- 用户输入可随时打断，调试面板的强制切换优先级最高；
- 所有迁移写成显式 reducer，单测覆盖"连续夸奖""先哄睡再摸头"这类组合。

### 4.4 环境联动

| 状态 | 主色 | 背景 | 粒子 | 灯光 |
| --- | --- | --- | --- | --- |
| idle | `#8AB4FF` 冷蓝 | 深空径向渐变 | 缓慢漂浮 | 低强度顶光 |
| happy | `#FFB86B` 暖橙 | 暖色光晕从中心扩散 | 上升、加速 | 暖色补光 + 轻微 Bloom |
| shy | `#C084FC` 紫粉 | 暗角加重、边缘偏粉 | 聚拢、减少 | 侧逆光 |
| sleepy | `#4C5FD5` 靛蓝 | 整体压暗、模糊 | 极慢、几乎静止 | 顶光降到 30% |

实现：主题色写进 CSS 自定义属性，容器 `transition: 800ms cubic-bezier(.4,0,.2,1)`；
three 侧的灯光颜色与强度订阅同一状态，保证 DOM 与 WebGL 同步，不出现"背景变了角色还是冷色"。

## 5. 调试面板设计

右侧抽屉（宽 320 px，移动端改为底部抽屉），暗色玻璃拟态，代码用等宽字体。

| 区域 | 内容 |
| --- | --- |
| 状态头 | 状态码 `EMO_HAPPY`、mood 值（valence/arousal）、当前 clip 与播放进度 |
| 互动日志 | 最近 50 条：时间、来源（user/quick/debug/llm/system）、原文、命中信号、实际切换 |
| 强制状态 | 4 个按钮直接切状态，绕过分类器（`source: 'debug'`） |
| 灯光主题 | 4 个色块切主题，可与情绪解耦，验证"环境联动"是否独立 |
| 系统气泡 | 输入文本 → 主画面顶部弹出系统提示，用于演示非对话通道 |
| 运行信息 | FPS、DPR、WebGL 渲染器字符串、分类器模式（本地/云端/对比） |

日志是纯前端内存环形缓冲，刷新即清空——原型阶段不引入持久化，减少一半复杂度。
若需要留存，`localStorage` 存最近一次会话即可，不上 D1。

## 6. 技术栈与版本

### 6.1 版本与约束（已核对 peer 依赖）

| 包 | 版本 | 备注 |
| --- | --- | --- |
| vite | 8.3.6 | |
| @vitejs/plugin-react | 6.2.1 | peer 要求 vite ^8 |
| @cloudflare/vite-plugin | 1.67.0 | peer：vite ^6.1\|^7\|^8，wrangler ^4.156.1 |
| wrangler | 4.158.0 | |
| react / react-dom | 19.3.1 | **r3f 要求 `>=19 <19.4`，必须锁到 19.3.x，不能放 `^19`** |
| three | 0.187.0 | |
| @react-three/fiber | 9.8.2 | peer：react >=19 <19.4，three >=0.156 |
| @react-three/drei | 10.7.9 | peer：r3f ^9 |
| @react-three/postprocessing | 3.2.2 | Bloom 用；可选依赖 |
| zustand | 5.0.16 | 跨 canvas / DOM 共享状态 |
| motion | 14.10.0 | 面板与气泡动画（原 framer-motion） |
| tailwindcss | 4.3.4 | 与既有项目一致 |
| hono | 4.13.16 | `/api/*` 路由，比手写 if 分支清楚 |
| vitest | 5.1.0 | 分类器与 reducer 单测 |

风险点：Vite 8 与插件 1.67 都是新版本，若脚手架阶段出现兼容问题，**降级到 Vite 7 即可**，
`@cloudflare/vite-plugin` 同时支持 ^7；其余版本不受影响。

### 6.2 目录与路由

```text
apps/web/
  src/          React：scene/（R3F）、ui/、state/、lib/emotion/（分类器与 reducer）
  worker/       Worker 入口：/api/classify（Hono）
  public/       RobotExpressive.glb 等静态资源
  wrangler.jsonc
```

`wrangler.jsonc` 关键项：`main: "./worker/index.ts"`、`assets.not_found_handling: "single-page-application"`、
`assets.run_worker_first: ["/api/*"]`、`upload_source_maps: true`。
`/api/classify` 未配置 AI 绑定时返回 501，前端静默回落。

### 6.3 Workers AI 成本

免费额度 10,000 neurons/天（见 [Workers AI 定价](https://developers.cloudflare.com/workers-ai/platform/pricing/)）。
用 `@cf/meta/llama-3.2-1b-instruct`（2457 neurons/M 输入、18252 neurons/M 输出）估：
一次分类约 120 输入 token + 12 输出 token ≈ **0.51 neurons**，即 **每天约 2 万次**免费。
原型演示量级远低于此。注意部分大模型在 Free 计划会返回 403，1b/3b 不在限制之列。

## 7. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 移动端 WebGL 掉帧 | 观感直接崩 | DPR 夹到 `[1, 1.5]`，Bloom 在窄屏关闭，粒子数按面积缩放 |
| three 打包体积大 | 首屏慢 | Canvas 路由级动态 import，先渲染灯光骨架再挂模型 |
| 模型"像官方 demo" | 视觉廉价感 | 自定义灯光、Bloom、地面接触阴影、暗角与字体；不用默认环境光 |
| 中文在 canvas 里排版差 | 气泡模糊 | 气泡用 DOM 覆盖层，canvas 只画角色与光 |
| 云端分类延迟/失败 | 交互卡顿 | 本地分类器先行，云端结果只做覆盖，1.5 s 超时 |
| 状态抖动 | 角色"抽搐" | 最短停留 2 s + 置信度阈值 + reducer 单测 |

## 8. 里程碑

| 阶段 | 内容 | 预估 |
| --- | --- | --- |
| M1 | 脚手架、模型加载、Idle 呼吸、基础光 | 0.5 天 |
| M2 | 情绪 reducer + 4 状态映射 + 背景联动 + 输入与快捷按钮 | 1 天 |
| M3 | 调试面板（日志、强制切换、灯光、系统气泡） | 0.5 天 |
| M4 | 打磨：Bloom、粒子、移动端、降级与可访问性 | 1 天 |

## 9. 待拍板

本节已作废，保留以记录当时的未知项：

1. ~~角色形象~~ —— 已定：社区鲸鱼娘立绘（ADR 0002 修订）。
2. **情绪判断**：本地启发式即可（默认离线），还是把 Workers AI 的对比模式也做进面板？
3. **视觉基调**：深空冷色 + 情绪点缀色（建议），还是暖色治愈系？
