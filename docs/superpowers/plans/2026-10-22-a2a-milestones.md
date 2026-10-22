# DSH Kanban → A2A：可用阶段里程碑

> 每个里程碑都必须是一个**可以用的东西**。  
> 任何阶段都可以停下来，仍然有价值。

**最终目标：** Kanban 成为 A2A 兼容的共享任务工作台。  
**入口规则：** Silas 只对掌柜说意图；掌柜建卡；bot 围绕卡工作。  
**架构：** Kanban = A2A Task store；agent = 有身份的 actor；A2A = 任务协议；MCP = 工具接口；Grok Bot = 第一个 adapter。

**技术：** Node 22、Cordis、zod、DSH `storageDomain`、A2A v1.0、`@a2a-js/sdk@1.3.0`。

## 先定两条规则

### 1. 谁建卡

```text
Silas → 掌柜：意图 / 验收 / 优先级
掌柜 → Kanban：建卡、补字段、分派
Bot → Kanban：评估、方案、进展、证据
Silas → 掌柜：确认 / 拍板
```

**Silas 不直接建卡。**  
除了紧急兜底，所有卡都从掌柜进入。

### 2. Planning 还要不要

要，但**不是第五列**。

```text
Backlog
  ├─ Inbox        老板/掌柜刚放进来
  └─ Planning     bot 评估、提方案、等确认
Running
Needs you
Done
```

- `Planning` 是 Backlog 内部的子状态，卡片仍在 Backlog
- 小任务可以跳过 Planning，直接 Running
- 大任务必须：评估 → 方案 → 掌柜/Silas 确认 → Running
- A2A 没有 `planning` 标准状态：用卡上的 `planning` 扩展字段；需要人确认方案时，A2A 用 `input-required`

**M1 不做 Planning；M2 才做。**

## 阶段总览

| 阶段 | 可用产物 | 入口 | Planning | 可停下来的价值 |
| --- | --- | --- | --- | --- |
| **M1** | 掌柜 + 扳子 | Silas → 掌柜 | 无 | 老板说一句，掌柜建卡，扳子能更新 |
| **M2** | 扳子先提方案再干 | Silas → 掌柜 | 有，子状态 | 大任务不再闷头开干 |
| **M3** | 门神验收 | Silas → 掌柜 | 有 | 一张卡两段式交付 |
| **M4** | 外部 A2A agent | Silas → 掌柜 | 有 | 不只 Grok Bot 能接 |
| **M5** | 手机审批 | Silas → 手机 | 有 | 人离开桌面也能拍板 |
| **M6** | 掌柜代管 | Silas → 掌柜 | 有 | 一个入口，多个项目 |
| **M7** | 生产可用 | Silas → 掌柜/手机 | 有 | 安全、备份、回滚 |

---

## M1：掌柜接意图，扳子上板（v0.1）

**一句话：** Silas 不建卡；他对掌柜说一句，掌柜建卡，扳子能更新。

**用户流程：**

```text
Silas：给看板加“方案确认”
  ↓
掌柜：补问验收 / 优先级
  ↓
掌柜：建卡，assignee=扳子
  ↓
扳子：收到卡，更新 Running + 评论
  ↓
掌柜：向 Silas 汇总
```

**必须实现：**

- 掌柜的最小能力：意图 → 卡（title / intent / acceptance / assignee / priority）
- Actor registry：掌柜（DSH agent）、扳子（bot）
- Scoped token：扳子只能读自己的项目、写自己的卡、评论
- `assignee` 支持 actor
- `activity` / comment 记录真实 actor
- 项目 ACL
- 最小 bot API：`update card` / `comment`

**Demo：**

```text
Silas 对掌柜说：“给看板加方案确认，找扳子”
→ 掌柜建卡 DSH-001，assignee=扳子
→ 扳子更新 Running，评论“收到”
→ 看板显示：掌柜创建 / 扳子更新
```

**退出条件：**

- [ ] Silas 不需要打开看板建卡
- [ ] 掌柜能建卡、补验收、分派
- [ ] 扳子能更新自己的卡
- [ ] 扳子不能改别人的卡、不能跨项目
- [ ] 扳子不能批准红事 / 删除 / 归档
- [ ] 活动 actor 正确
- [ ] 现有 121 测试通过

**可用产物：** 一个“掌柜 + 一个 bot”的最小工作台。  
没有 Planning、没有 A2A、没有门神，但已经能真实派活。

---

## M2：扳子先提方案再干（v0.2）

**一句话：** 掌柜建卡后，扳子先评估、提方案，确认后才进 Running。

**用户流程：**

```text
Silas：给看板加“方案确认”
  ↓
掌柜：建卡 DSH-002，planning=requested，assignee=扳子
  ↓
扳子：写评估 + 方案
  ↓
掌柜/Silas：确认方案
  ↓
扳子：Running → 交证据
  ↓
掌柜：Done / 需要门神（M3）
```

**Planning 规则：**

- `planning = none | requested | proposed | approved`
- 卡仍在 Backlog，显示“待方案 / 方案中”
- 小任务：`planning=none`，直接 Running
- 大任务：工作量 > 1 天、碰生产/发布、需求模糊、跨项目 → 必须方案确认
- 方案确认人：掌柜；红事/超阈值由 Silas
- A2A 映射：需要人确认方案 → `input-required`；确认后 → `working`

**必须实现：**

- `Planning` 子状态
- `assessment` / `plan` / `estimate` / `risk`
- `claim` + lease + heartbeat
- 方案确认按钮/命令
- `evidence` / `cost` / `progress`
- 事件流：卡变更通知

**Demo：**

```text
掌柜建卡，planning=requested
→ 扳子：2 天，风险中，方案 3 步
→ 掌柜确认
→ 扳子 Running → PR + 证据
→ 掌柜标记 Done
```

**退出条件：**

- [ ] 未确认方案不能进 Running
- [ ] 两个 actor 不能同时持有同一张卡
- [ ] 方案变更要重新确认
- [ ] 小任务可跳过 Planning
- [ ] 卡变更只发一个事件
- [ ] 活动完整记录评估/方案/确认

**可用产物：** 一个 bot 可以从“掌柜建卡”走到“按方案交付”。  
老板只在方案确认和验收出现。

---

## M3：门神验收（v0.3）

**一句话：** 扳子做完交给门神验收，一张卡两个 actor。

**用户流程：**

```text
扳子：实现完成，handoff 门神
门神：接受 → 验收 → 放行 / 退回
掌柜：向 Silas 汇总
```

**必须实现：**

- 第二个 bot actor：门神
- `handoff`：提议 → 接受 / 拒绝
- 验收状态：`in_review` / `blocked`
- owner 变化记录
- 防止双写 / 重复验收

**Demo：**

```text
扳子 handoff 门神
→ 门神接受
→ 验收放行 / 退回 Running
→ 卡上 owner、状态、证据、activity 完整
```

**退出条件：**

- [ ] handoff 接受前 owner 不变
- [ ] 两个 bot 不能同时验收同一张卡
- [ ] 退回后回 Running，不是 Done
- [ ] 活动可追溯

**可用产物：** 一条真实的两段式交付链。  
老板不用在群里追“做完没、谁验的”。

---

## M4：外部 A2A agent 接入（v0.4）

**一句话：** 不只 Grok Bot。任何 A2A client 都能创建、认领、更新、完成一张卡。

**用户流程：**

```text
Silas → 掌柜：意图
掌柜 → Kanban：建卡
A2A client：GetTask / claim / update / complete
Grok Bot adapter：仍然可用
掌柜 → Silas：汇总
```

**A2A 必须实现：**

- `/.well-known/agent-card.json`
- `SendMessage`
- `GetTask`
- `ListTasks`
- Task 状态映射
- Message → comment；Artifact → link/attachment
- Bearer auth + project scope
- 先不做 streaming / push

**状态映射：**

```text
submitted → Inbox / Backlog
working → Running
input-required → Needs you（方案确认 / 决策 / 阻塞）
completed → Done
failed → Blocked
canceled → Canceled
auth-required → Needs you / 权限阻塞
```

**Planning 在 A2A 里的表示：**

```json
{
  "planning": "requested | proposed | approved",
  "assessment": "...",
  "plan": "...",
  "approvedBy": "掌柜"
}
```

A2A 没有 `planning` 状态；它是 board extension，需要人确认时用 `input-required`。

**Demo：**

```text
本地 A2A client 创建 TASK-004
→ 看板 Inbox
→ client GetTask
→ client claim → Running
→ comment/artifact
→ complete → Done
```

**退出条件：**

- [ ] Agent Card 通过 A2A v1.0 校验
- [ ] 非 Grok Bot client 能完成全链路
- [ ] Grok Bot adapter 仍然通过
- [ ] 重复消息不重复建卡
- [ ] 未授权项目 403

**这是 A2A 的关键里程碑。**  
只有 Grok Bot 能接，不算完成。

---

## M5：手机能批（v0.5）

**一句话：** Needs you 到手机，老板批完，bot 继续。

**用户流程：**

```text
门神/掌柜：卡进 Needs you
→ 手机：摘要 + 选项
→ Silas：批准 / 退回 / 延后
→ 掌柜：写回
→ bot：继续 / 停止
```

**必须实现：**

- A2A push / subscribe
- 传令官 / Herald
- 短选项 + 详情链接
- 决定写回 + 幂等
- 超时提醒一次
- 红色发布必须桌面二次确认

**Demo：**

```text
门神：PR 已过 QA，等放行
→ 手机：“DSH-004 发布放行？”
→ Silas 批准
→ 卡进 Done
```

**退出条件：**

- [ ] 手机能收到真实 Needs you
- [ ] 批准/退回/延后都写回卡
- [ ] 重复点击不重复执行
- [ ] 红事不能只在手机一键完成

**可用产物：** 老板离开桌面，公司还能继续跑。

---

## M6：掌柜代管（v0.6）

**一句话：** 掌柜从“建卡助手”升级为“办公室主任”：多项目、汇总、调度、兜底。

**M1 的掌柜只做一件事：意图 → 卡。**  
M6 的掌柜做：

- 多项目建卡 / 分派
- 汇总进展、标阻塞、准备决策简报
- 催办、重排优先级
- 外部 bot 断供时的兜底
- 成本 / 注意力摘要
- 不替 Silas 批红

**用户流程：**

```text
Silas：“这周把 DSH 看板方案确认做完”
→ 掌柜：拆卡、分派、排优先级
→ 扳子 / 门神：评估、方案、交付、验收
→ 掌柜：每天一页汇总
→ Silas：只在 Needs you 出现
```

**退出条件：**

- [ ] 掌柜能同时管 2 个项目
- [ ] 每天一页汇总
- [ ] 卡住时能重排 / 催办
- [ ] 不能自批红事
- [ ] 外部 bot 不可用时保关键路径

---

## M7：生产可用（v1.0）

**必须实现：**

- 安全审查
- token 轮换
- 速率限制
- 备份/恢复
- 审计日志
- 迁移 `LOCAL_USER`
- 文档 / 故障模式 / 回滚
- 100 卡 + 5 agent 性能测试

**退出条件：**

- [ ] 无未鉴权公网端点
- [ ] 备份解压验证通过
- [ ] 迁移和回滚演练通过
- [ ] 文档完整
- [ ] 测试全绿

## 阶段原则

1. **每个阶段都有 demo。**
2. **每个阶段都能停。**
3. **M1 的入口就是掌柜，不是 Silas 建卡。**
4. **Planning 是 Backlog 子状态，不是第五列。**
5. **M1 不做 Planning；M2 才做。**
6. **A2A 在 M4，不在 M1。**
7. **M6 的掌柜是升级版，不是第一次出现。**

## 风险

| 风险 | 处理 |
| --- | --- |
| 掌柜建卡变成新瓶颈 | 模板 + 默认验收 + 批量建卡 |
| Planning 拖慢小任务 | 小任务跳过，只对大任务强制 |
| 只有 Grok Bot 能接 | M4 必须有非 GB client |
| 本地看板不可达 | M4 前定宿主方案 |
| bot 记忆覆盖卡 | 卡是权威，记忆是缓存 |
| 重复消息 | message_id + task_id 幂等 |
| 权限泄漏 | scoped token + 项目 ACL + 负向测试 |

## 现在做什么

**M1。**

产物：

> **Silas 对掌柜说一句，掌柜建卡，扳子能更新。**

不是 A2A，不是 Planning，不是门神。  
但这是第一个真实可用的“掌柜 + bot”工作台。

---

**下一步：** 为 M1 写 task-level TDD 计划（掌柜建卡工具、actor registry、token、assignee、activity、ACL），在隔离 worktree 执行。
