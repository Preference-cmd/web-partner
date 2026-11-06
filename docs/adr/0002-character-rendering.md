# 0002 — 角色渲染路线：3D、Spine 或 Live2D

**Status:** proposed
**Date:** 2026-11-06
**Decision owner:** 用户
**Blocks:** `apps/web` 的角色层、美术资产采购、M1 的起点

## 背景

主提案 [《伴侣小生命》](../proposals/feature/2026-11-06-companion-prototype.md) 要求：
四种情绪状态、角色与背景光影联动、移动端可用、三天内产出可演示版本、部署在
Cloudflare Workers、开发由单人 + AI agent 完成、不购买昂贵的商业授权。

"3D 还是 2D"看起来是渲染技术之争，实际上**瓶颈在资产管线，不在运行时**。本文先
澄清三个产品的区别，再按资产、授权、集成、观感四个维度比较。

## 先澄清：Spine、Live2D、3D 是三种不同的东西

| | 本质 | 资产形态 | 驱动方式 | 用法心智 |
| --- | --- | --- | --- | --- |
| 3D（three.js + GLB） | 网格 + 骨骼 + morph | `.glb` | 播放 clip，可叠加 morph 权重与程序化变换 | 与 Spine 相似：按名字播动作 |
| Spine（Esoteric） | 2D 骨骼 + 网格变形 + 关键帧 | `.skel` / `.atlas` | 播放 clip，可用 `AnimationState` 混合 | 2D 骨骼动画，和 3D 同一套心智 |
| Live2D（Cubism） | 分层插画 + 参数 + 物理 | `.moc3` + 贴图 + `.model3.json` | 设参数（角度、瞳孔、口型、呼吸） | 不是"播动作"，是"调表情" |

顺带一提 Rive：运行时免费、内置状态机、Web 集成好，同样需要专有编辑器产资产，
生态更偏 UI 与游戏 HUD，不是角色动画的主流选择，本文不单独展开。

这个区别直接影响端口设计：**Spine 与 3D 可以共用"播 clip"的抽象，Live2D 不能**。
详见文末「可逆性」。

## 对比

| 维度 | 3D（GLB） | Spine | Live2D |
| --- | --- | --- | --- |
| 现成可用素材 | **多**：RobotExpressive 已实测（CC0，14 clip，头部 3 个 morph） | 少，免费可商用素材稀缺 | 官方样例可用但受条款约束；社区模型多为二手授权 |
| 授权成本 | **零**（CC0 + MIT 运行时） | 编辑器按人头付费，$69 起 | 开发免费；个人/小规模发布免签约 |
| 美术依赖 | **可无**（用现成素材） | 必须有 2D 美术 | 必须有 2D 美术 |
| 运行时体积 | 较大（three ≈170 KB gzip） | 小（`spine-player` 官方维护） | 中（Cubism Core + 渲染层） |
| Web 集成成熟度 | **高**（r3f 9 + drei 10，React 19 配对） | 高（官方 4.3.13，持续更新） | 中：官方 Web SDK 非 npm、需手动集成；社区封装质量参差 |
| 情绪表现力 | 高：clip + morph + 真灯光 | 很高：网格变形让 2D 表情细腻 | **最高**：为表情、目光、呼吸专门设计 |
| 空间感与光影联动 | **强**：真实光源、Bloom、景深、投影 | 弱：平面，靠叠加光效 | 弱：平面，靠 shader 遮罩 |
| 移动端性能 | 中：GPU 压力大 | 高 | 高 |
| 出原型的**总耗时** | **约 3 天**（无美术） | 1–2 周（含绘制与绑定） | 1–2 周（含建模与参数） |

## 授权事实（核实于 2026-11-06）

**Spine** — 关键约束不是价格而是"谁能产出资产"：

- Essential **$69**（原价 $99）、Professional **$379**（原价 $449）；
  Enterprise **$2,499 起 + $379/人/年**。年营收 ≥ **$500,000** 必须 Enterprise。
- **每个使用编辑器的人各需一份许可**，按人头而非按项目计。
- 试用版**不能保存或导出**，也就是说没有许可证就产不出 `.skel`。
- 把 Spine Runtimes 集成进产品同样需要持证；授权期内做出的产品之后可继续分发。
- 来源：[购买页](https://esotericsoftware.com/spine-purchase)、
  [官方论坛对许可条款的解释](https://esotericsoftware.com/forum/d/30678-game-license-question/)

**Live2D Cubism** — 对个人原型友好，但对"谁能产出资产"同样没有让步：

- 开发与验证阶段**免费**；发布时才需要 SDK Release License。
- **个人与小规模企业免签约、免付费**（Expandable Application 除外）；年营收
  ≥ 1000 万日元的法人进入签约计划。Web 应用按其 AI/Chatbot 使用形态归类。
- 来源：[SDK Release License](https://www.live2d.com/en/sdk/license/)
- 但 `.moc3` 只能由 Cubism Editor 产出，编辑器分 FREE/PRO 两档，PRO 为订阅制。

**3D** — three.js 为 MIT；`RobotExpressive.glb` 为 CC0 1.0（作者 Tomás Laulhé /
Quaternius，Don McCurdy 加了三个表情 morph）。零授权成本、可商用、可修改。

## 决定性因素：资产

把上面的表压缩成一句话：**3D 的资产问题已经解决，2D 的资产问题没有解决。**

- 3D：模型已在仓库外验证——464 KB、74 节点、14 段动画（含 Idle 3.33 s、Dance 3.33 s、
  Sitting 0.42 s）、头部网格带 Angry / Surprised / Sad 三个 morph。这意味着
  M1 当天就能看到角色在页面上呼吸，且不需要任何人画一张图。
- Spine / Live2D：运行时我能接，**资产我产不出**。`.moc3` 与 `.skel` 都是专有编辑器的
  产物，不能由代码或 AI 生成；界面上能做的只有调用参数与播放 clip。
  本项目的排期瓶颈恰好在"谁来画"这一步。
- 外包市价参考：半身 Live2D 角色建模 + 绑定 + 四套情绪参数，常见报价在
  **3000–8000 元**区间；Spine 角色 + 四套动作同量级。原型阶段这是不必要的支出，
  且引入外包就引入等待。

## 建议

**本期选 3D**，理由按权重排序：

1. **能在三天内交付可演示结果**，且不欠美术债——机器人本身是"赛博小生命"，
   与题目允许的风格一致。
2. **授权与合规零风险**，素材 CC0、运行时 MIT，不必为演示环境准备许可证。
3. **光影联动是 3D 的强项**：题目要求"背景光影氛围随心情变化"，真光源 + Bloom +
   投影比 2D 的叠加光效更有说服力，而这正是评分点之一。

同时给出两个**转向条件**，避免把"现在不做"误当成"永远不做"：

| 转向 | 触发条件 |
| --- | --- |
| → Live2D | 已有（或愿意采购）Live2D 模型，且产品定位明确是人形虚拟伴侣，插画质感是卖点而非加分项。此时 Live2D 的观感上限最高。 |
| → Spine | 已持有 Spine 许可证且有 2D 美术；需要布料/发丝的网格变形手感，但不需要 Live2D 的面部参数化。 |

## 可逆性：端口定在"情绪"层，不定在"动作"层

状态机不应该知道底层是 clip 还是参数，否则换实现要重写状态机。端口这样定：

```ts
type EmotionId = 'idle' | 'happy' | 'shy' | 'sleepy';

interface CharacterController {
  /** 进入某情绪；intensity 影响幅度，由实现决定怎么用。 */
  play(emotion: EmotionId, options?: { intensity?: number }): void;
  dispose(): void;
}
```

三种实现各自怎么落这个端口：

| 情绪 | 3D 实现 | Live2D 实现（参数预设） |
| --- | --- | --- |
| idle | Idle 循环 + 呼吸正弦 + 头部轻摆 | `ParamBreath` 正弦、角度归零 |
| happy | Dance 循环，入场 Jump 一次；Surprised 0.35 | `ParamEyeOpen` 放大、`ParamMouthForm` +1、`ParamBodyAngleZ` 轻摆 |
| shy | No 播一次 → Idle；Sad 0.7 | `ParamAngleY` 下压、`ParamEyeOpen` 0.3、脸红层淡入 |
| sleepy | Sitting 一次 → 慢速 Idle；Sad 0.45 | `ParamEyeOpen` 0.1、`ParamAngleZ` 缓慢摇摆、`ParamBreath` 放慢 |

反例：如果端口写成 `playClip('Dance')`，clip 名就泄漏进状态机，Live2D 根本无对应物，
届时不是"换实现"而是"重写"。**这是本 ADR 里唯一必须现在就守住的约束。**

## 决策

（待用户确认。若同意 3D，则把 `Status` 改为 `accepted`，并在主提案 §Decision 中
引用本 ADR；若改选 Live2D 或 Spine，先补一份资产来源说明再改状态。）

## 后果

- **选 3D**：三天交付；无美术依赖；观感取决于灯光与后期调校。技术债是"模型不是原创"，
  上线产品前需要替换为自研或定制资产，替换成本约等于重做一次 `CharacterController`
  的内部（端口不变）。
- **选 Live2D**：观感上限最高，但排期增加 1–2 周（含资产采购或制作），且发布条款
  需要按营收规模再确认一次。
- **选 Spine**：先付 $69 起的编辑器费用，仍需美术产出，相对 Live2D 的收益不明显；
  只在已持有许可证时合理。
