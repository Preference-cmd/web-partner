# 0004 — 角色渲染槽位（2D 与 3D 共存）

**Status:** proposed
**Date:** 2026-11-06
**Decision owner:** 用户
**Blocks:** `apps/web` 的渲染层结构、M1 的拆分方式

## 背景

用户要求角色渲染做成**槽位**：2D 与 3D 都预留，不把路线焊死在代码里。
这个要求是对的——[ADR 0002](0002-character-rendering.md) 已经改过两次结论
（3D → 2.5D 立绘 → Canvas 2D），每次都推翻一次实现，说明"路线"的确定性被高估了。
槽位把这个不可逆的押注变成运行时可切换的配置。

约束来自两侧：

- 2D 侧已有素材（512×512 立绘，CC BY-NC-SA 4.0，见 [ADR 0003](0003-character-assets.md)），
  2D 适配器必须能马上跑通；
- 3D 侧目前**没有任何资产**（[ADR 0002](0002-character-rendering.md) 已核实：该角色无
  GLB/VRM），所以 3D 只能是预留，不能是半成品实现。

## 决策

### 1. 定义一个端口，应用只依赖端口

```ts
export type EmotionId = 'idle' | 'happy' | 'shy' | 'sleepy';
export type RendererId = 'canvas2d' | 'pixi2d' | 'live2d' | 'three3d';

export interface EmotionCommand {
  readonly emotion: EmotionId;
  /** 0..1，影响幅度；实现决定怎么用，可以是位移幅度、滤镜强度或动作速度。 */
  readonly intensity: number;
}

export interface RendererCapabilities {
  readonly backend: 'canvas2d' | 'webgl' | 'webgpu';
  /** 是否支持网格变形（发丝/裙摆的横向摆动）。 */
  readonly gridDeformation: boolean;
  /** 是否支持滤镜或自定义着色。 */
  readonly filters: boolean;
  /** 是否骨骼动画。 */
  readonly skeletal: boolean;
  /** 是否能独立叠加面部表情。 */
  readonly facialMorph: boolean;
}

export interface CharacterRenderer {
  readonly id: RendererId;
  readonly capabilities: RendererCapabilities;
  mount(host: HTMLElement, options: MountOptions): Promise<void>;
  setEmotion(command: EmotionCommand): void;
  setReducedMotion(enabled: boolean): void;
  resize(size: { width: number; height: number; dpr: number }): void;
  dispose(): void;
}
```

**状态层只发情绪，不发姿势。** 这条是硬约束：一旦 `setEmotion` 变成
`playPose('celebrate')`，槽位就退化成"只有 2D 能用的开关"，3D 与 Live2D 都接不进来。
姿势名、clip 名、帧号都留在适配器内部。

### 2. 适配器注册表与懒加载

```ts
const adapters = {
  canvas2d: () => import('./canvas2d'),
  pixi2d: () => import('./pixi2d'),
  // live2d 与 three3d：只在拿到对应资产后补实现，见「预留」一节
} as const;
```

每个适配器是独立 chunk，未选中的不会进首屏包。3D 适配器日后引入 three 时，
那 250 KB 也只落在选择它的人身上。

### 3. 选择顺序与回退

```text
?renderer=pixi2d  >  localStorage  >  构建时默认（canvas2d）  >  能力回退
```

- 值必须在注册表内，否则忽略并记一条日志；
- 能力回退：选了 WebGL 适配器但 `WebGL2RenderingContext` 不可用时，回退到
  `canvas2d`，并在调试面板显示一条 `renderer.fallback` 事件；
- 回退只发生一次，不来回抖动。

### 4. 环境层不在槽位里

背景渐变、氛围粒子、暗角、视差属于**应用层**，与角色并列而非包含。
这样换角色渲染器时，环境氛围保持不变；也不会出现"2D 适配器把背景烘焙进 canvas"
这种换渲染器就换皮肤的问题。

### 5. 资产按渲染器分别声明

```jsonc
// public/character/2d/manifest.json
{
  "renderer": "canvas2d",
  "canvas": { "width": 512, "height": 512 },
  "anchor": { "x": 0.5, "y": 1 },
  "poses": {
    "idle": "idle.webp",
    "happy": "celebrate.webp",
    "shy": "blush.webp",
    "sleepy": "sleep.webp"
  }
}
```

3D 的清单**结构先定、文件不建**：

```jsonc
{
  "renderer": "three3d",
  "model": "model.glb",
  "clips": { "idle": "Idle", "happy": "Dance", "shy": "No", "sleepy": "Sitting" },
  "morphs": { "shy": { "Sad": 0.7 } }
}
```

换图、换模型都是改清单，不改代码。

### 6. 调试面板暴露槽位

面板增加四项：当前渲染器、能力标志、切换下拉、最近一次挂载耗时与回退事件。
槽位如果不可观测，就等于没有——这四项让"换渲染器"在演示时是一个可讲的点，
而不是埋在代码里的 if。

## 预留 3D 的具体含义

**做：** 端口、注册表条目（注释形式）、清单 schema、能力标志的取值约定。

**不做：** 任何 three.js 适配器代码。理由：现在没有 3D 资产，写了也无从验证，
只会留下需要维护的死代码。[`AGENTS.md`](../../AGENTS.md) 里"不留半成品脚手架"
这条同样适用。

触发条件写清楚：当出现一份可用的 GLB/VRM（自带 Idle 等 clip，最好有表情 morph）时，
再开一份 ADR 决定 3D 适配器的范围，而不是顺手把 three 加进依赖。

## 后果

- **成本**：多一层间接。每个适配器约 200~300 行，端口本身约 60 行。
- **收益**：路线可回退。ADR 0002 已经证明这个产品会在"3D / 2D / Pixi"之间移动，
  每次移动的代价从"重写渲染层"降到"加一个文件"。
- **可验证性**：两个以上的适配器上线后，调试面板的渲染器下拉就是槽位的活证据；
  只留一个适配器时，它退化为一个高级配置项，成本仍然可控。
- **后续**：Live2D 作为第三个适配器接入时，端口不需要改，这正是本设计的目标形态。
