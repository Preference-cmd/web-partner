# 代码库事实

**Status:** current
**Updated:** 2026-11-06

`docs/` 记录这个仓库当前的事实与已定下的决策。根 `AGENTS.md` 是全局入口；
本页只负责列出主题与入口，进入具体页面后再按需往下读。实现变化时同步修正
对应事实页；本目录不承担待办队列。

## 主题

| 主题 | 入口 | 内容 |
| --- | --- | --- |
| 主提案 | [proposals/](proposals/README.md) | 做什么、不做什么、怎样算做完；当前主提案是《伴侣小生命：情绪互动与状态调试原型》 |
| 决策记录 | [adr/](adr/) | 逐条记录取舍与理由；栈、渲染路线、素材授权三份均为 proposed |
| 调研 | [research/2026-11-06-companion-prototype.md](research/2026-11-06-companion-prototype.md) | 伴侣小生命原型：需求拆解、素材与渲染选型、情绪系统、成本与里程碑 |
| 部署 | `deployment.md` | Worker 名称、绑定、环境与密钥——首个子应用建好后补建 |

## 维护约定

- 文件名用小写 kebab-case；目录索引用 `README.md`。
- 每页标题下写两行元信息：`**Status:**` 与 `**Updated:**`（最后核对日期，
  `YYYY-MM-DD`）。
- `Status` 取值：`current` 已对照代码核实；`stale` 已知与代码不一致、待核对；
  `draft` 尚未核实。
- 改动事实页时同步更新 `Updated`；发现内容与代码不符，先把 `Status` 改成
  `stale`，再核对修正。
- 本目录用中文书写（见 `AGENTS.md` 的语言约定）；代码、提交信息与根文档用英文。
