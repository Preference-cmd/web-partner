# 提案规范

**Status:** current
**Updated:** 2026-11-06

`docs/proposals/` 存放当前产品的提案：做什么、不做什么、怎样算做完。它与 `docs/adr/`
分工明确——**提案描述要达成的结果，ADR 记录换取该结果的取舍**。两者都不是待办队列。

本目录纳入 Git 版本控制。`AGENTS.md` 里被忽略的 `.agents/` 是机器本地的 agent 工作区，
不能承担产品记录：换一台机器、换一个协作者，主提案必须还在。

## 路径与命名

```text
docs/proposals/<class>/YYYY-MM-DD-<slug>.md
```

`<class>` 取 `feature | bug-fix | architecture | simplification | process | testing`
之一，`<slug>` 为 2–6 个 kebab-case 词。日期是立项日，不是最后修改日。

## 模板

```md
# <动作导向的标题>

**Class:** feature
**Status:** proposed
**Date:** YYYY-MM-DD
**Source:** <上游文档或父提案>

## Goal
<为什么做，做成什么样>

## 范围
- 做：<可观察的能力>
- 不做：<本期明确排除的，写清楚以免"顺手"扩进来>

## Decision
<引用相关 ADR；列出已定与未定>

## Accept
- [ ] <可被外部观察者验证的结果>

## Phases
| 阶段 | 交付 | 退出条件 |

## Risks
## Open
```

## 当前提案

| 提案 | Class | 状态 |
| --- | --- | --- |
| [伴侣小生命：情绪互动与状态调试原型](feature/2026-11-06-companion-prototype.md) | feature | proposed |

## 状态

| 状态 | 含义 |
| --- | --- |
| `proposed` | 已登记，未获批准，不得据此写实现代码 |
| `implemented` | 验收项全部勾选 |
| `rejected` | 明确不做，理由留在文档里 |
| `archived` | 被后续提案取代 |

改状态时同步更新本页的索引表。验收项只能由证据勾选，不能由"感觉做完了"勾选。
