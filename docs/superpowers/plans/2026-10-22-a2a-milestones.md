# DSH Kanban → A2A：可用阶段里程碑

> 每个里程碑都必须是一个**可以用的东西**，不是内部层完成度。  
> 任何阶段都可以停下来，仍然有价值。

**最终目标：** Kanban 成为 A2A 兼容的共享任务工作台；人和 agent 围绕卡工作。

**架构：** Kanban = A2A Task store；agent = 有身份的 actor；A2A = 任务协议；MCP = 工具接口；Grok Bot = 第一个 adapter，不是协议本身。

**技术：** Node 22、Cordis、zod、DSH `storageDomain`、A2A v1.0、`@a2a-js/sdk@1.3.0`。

## 总览

| 阶段 | 可用产物 | 用户能做什么 |
| --- | --- | --- |
| **M1** | Bot 能上板 | 把一张卡分给扳子，扳子能更新、评论，活动记录是扳子 |
| **M2** | Bot 能接活 | 老板往 Inbox 放事，扳子认领、提方案、等确认、交付 |
| **M3** | 两个 Bot 能交接 | 扳子做完交给门神验收，一张卡两个 actor |
| **M4** | 外部 Agent 能接入 | 任意 A2A client 能创建/认领/完成卡，不只 Grok Bot |
| **M5** | 手机能批 | Needs you 到手机，老板批完，bot 继续 |
| **M6** | 掌柜能代管 | 老板只放意图，掌柜建卡、分派、汇总、兜底 |
| **M7** | 生产可用 | 安全、备份、限流、文档、回滚 |

## 阶段前：A2A 决策（不是里程碑）

**1–2 天，不写产品代码。**

- 写 `docs/adr/0001-a2a-and-kanban.md`
- 写 `docs/a2a-mapping.md`
- 审计当前 `actor`、`assignee`、`activity`、`version`、`/kanban-api`
- 定 A2A 宿主方向（本地网关 / 云端服务）

**产出物：** 决策记录 + 映射表。  
**不阻塞 M1：** M1 不依赖 A2A server。

---

## M1：Bot 能上板（v0.1）

**一句话：** 看板不再是单人板。扳子有自己的身份，能更新自己负责的卡。

**用户能做什么：**

1. 建一张卡，assignee 选“扳子”
2. 扳子用 scoped token 更新状态 / 评论
3. 卡片活动显示“扳子”，不是“本地用户”
4. 扳子看不到别的项目，也不能批准红色发布

**必须实现：**

- Actor registry：human / agent
- Scoped token：项目读、自己的卡写、评论
- `assignee` 支持 actor，不再只允许 `current-user`
- `activity` / comment 记录真实 actor
- 项目 ACL
- 一个最小 bot API：`update card` / `comment`

**Demo：**

```text
Silas 建卡 "TEST-001"
→ 分配给扳子
→ 扳子 PATCH 状态 + 评论
→ 看板显示：扳子 / 已更新
```

**退出条件：**

- [ ] Bot A 能更新自己的卡
- [ ] Bot B 不能更新 A 的卡（403）
- [ ] Bot 不能跨项目读
- [ ] Bot 不能批准红色发布 / 删除 / 归档
- [ ] 活动记录 actor 正确
- [ ] 现有 121 测试仍通过

**这是第一个能用的阶段。**  
哪怕没有 A2A、没有 Planning、没有 handoff，这张板已经能“把活派给 bot”。

---

## M2：Bot 能接活（v0.2）

**一句话：** 老板只往 Inbox 放事；扳子自己评估、提方案、认领、交付。

**用户能做什么：**

1. 往 Inbox 放一条意图
2. 扳子在 Planning 提评估和方案
3. 老板确认方案
4. 扳子认领、进 Running、报进展、交证据
5. 门神/老板验收后 Done

**必须实现：**

- `Planning` 子状态（不要先加第五列）
- `claim` + lease + heartbeat
- `plan` / `assessment` / `evidence` / `cost` 字段
- 方案确认（老板或 owner）
- 事件流：卡变更通知，不用全板轮询
- `Needs you` 只收人的 gate

**Demo：**

```text
Inbox: "给看板加方案确认"
→ 扳子评估：2 天，风险中
→ 扳子提方案
→ Silas 确认
→ 扳子 Running → 交 PR / 证据
→ 门神通过 → Done
```

**退出条件：**

- [ ] 两个 actor 不能同时持有同一张卡
- [ ] lease 过期可回收
- [ ] handoff 必须显式接受
- [ ] 未确认方案不能进 Running
- [ ] 一次卡变更只发一个事件

**可用产物：** 一个 bot 可以从 Inbox 干到 Done，老板只在方案和验收出现。

---

## M3：两个 Bot 能交接（v0.3）

**一句话：** 一张卡可以从扳子交给门神，所有权和验收可见。

**用户能做什么：**

1. 扳子完成实现，handoff 给门神
2. 门神接受，做验收
3. 门神放行或退回，卡上留痕
4. 老板只看到一张卡的状态，不需要在群里追

**必须实现：**

- 第二个 bot actor + 独立 token
- `handoff`：提议 → 接受 / 拒绝
- 验收状态：`in_review` / `blocked`
- 活动记录 owner 变化
- 防止双写 / 重复验收

**Demo：**

```text
扳子：实现完成，handoff 门神
门神：接受 → 验收 → 放行 / 退回
卡：owner、状态、证据、activity 完整
```

**退出条件：**

- [ ] handoff 接受前 owner 不变
- [ ] 两个 bot 不能同时验收同一张卡
- [ ] 退回后回到 Running，不是 Done
- [ ] 活动可追溯

**可用产物：** 一条真实的两段式交付链，已经比“42 个 bot 群聊”清楚。

---

## M4：外部 Agent 能接入（A2A-lite v0.1）

**一句话：** 不只 Grok Bot。任何 A2A client 都能创建、认领、更新、完成一张卡。

**用户能做什么：**

1. 一个非 Grok Bot 的 A2A client 创建任务
2. 看板显示成一张卡
3. client 查询状态、认领、更新
4. Grok Bot adapter 仍然可用
5. 两个 client 操作同一种卡，语义一致

**必须实现：**

- `/.well-known/agent-card.json`
- `SendMessage`
- `GetTask`
- `ListTasks`
- A2A Task 状态映射
- Message → comment；Artifact → link/attachment
- Bearer auth + project scope
- 先不做 streaming / push

**Task 状态映射：**

```text
submitted → Inbox
working → Running
input-required → Needs you
completed → Done
failed → Blocked
canceled → Canceled
auth-required → Needs you / 权限阻塞
```

**Demo：**

```text
本地 A2A client 创建 TASK-004
→ 看板 Inbox 出现卡
→ client GetTask 查状态
→ client 认领 → Running
→ comment/artifact 写回
→ complete → Done
```

**退出条件：**

- [ ] Agent Card 通过 A2A v1.0 校验
- [ ] 非 Grok Bot client 能完成全链路
- [ ] Grok Bot adapter 仍然通过
- [ ] 重复消息不重复建卡
- [ ] 未授权项目 403

**这是 A2A 的关键里程碑。**  
如果只有 Grok Bot 能接，M4 不算完成。

---

## M5：手机能批（Mobile v0.1）

**一句话：** Needs you 到手机，老板批完，bot 继续。

**用户能做什么：**

1. 卡进入 Needs you
2. 手机收到一条摘要（≤120 字）
3. 老板批准 / 退回 / 延后
4. bot 收到决定，继续或停止
5. 桌面看板同步更新

**必须实现：**

- A2A push / subscribe
- 传令兵 / Herald
- 短选项 + 详情链接
- 决定写回 + 幂等
- 超时提醒一次
- 红色发布必须桌面二次确认

**Demo：**

```text
门神：PR 已过 QA，等放行
→ 手机："TASK-004 发布放行？"
→ 老板点批准
→ 门神继续 / 卡进 Done
```

**退出条件：**

- [ ] 手机能收到一条真实 Needs you
- [ ] 批准/退回/延后都写回卡
- [ ] 重复点击不重复执行
- [ ] 红事不能只在手机一键完成

**可用产物：** 老板第一次可以离开桌面，仍然让公司继续跑。

---

## M6：掌柜能代管（Office Chief v0.1）

**一句话：** 老板只放意图，掌柜建卡、分派、汇总、兜底。

**用户能做什么：**

1. 对掌柜说“给看板加方案确认”
2. 掌柜建卡、补验收、分派给扳子
3. 掌柜在卡上汇总进展、标阻塞、准备决策简报
4. 老板只在 Needs you 出现
5. bot 的组织结构默认隐藏

**必须实现：**

- 掌柜 agent（DSH 本地）
- 建卡 / 分派 / 汇总 / 催办
- 决策简报：选项、建议、证据、deadline
- 成本 / 注意力摘要
- 不替老板批红
- 兜底模式：外部 bot 不可用时保关键路径

**Demo：**

```text
Silas："给看板加方案确认"
→ 掌柜建卡、写验收、分派扳子
→ 扳子提方案
→ 掌柜汇总给 Silas
→ Silas 确认
→ 扳子交付，门神验收
```

**退出条件：**

- [ ] 老板不需要自己建卡
- [ ] 掌柜不能自批红事
- [ ] 老板能看到 plan / progress / evidence / decision
- [ ] bot 组织不出现在主界面
- [ ] 外部 bot 断供时，掌柜能保关键路径

---

## M7：生产可用（v1.0）

**一句话：** 可以日常用，不怕丢数据、不怕乱权限、不怕回滚。

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
- [ ] 现有测试 + 新测试全绿

---

## 阶段原则

1. **每个阶段都有 demo。** 没有 demo 的里程碑不算。
2. **每个阶段都能停。** 停下来仍然有用。
3. **A2A 在 M4，不在 M1。** 先让 bot 上板，再谈协议。
4. **Actor / Access 是 M1 的内部实现，不是独立阶段。**
5. **M3 证明多 bot；M4 证明多协议。**
6. **M5 证明移动；M6 证明一个入口。**
7. **M7 才谈生产。**

## 风险

| 风险 | 处理 |
| --- | --- |
| 只有 Grok Bot 能接 | M4 必须有非 GB client |
| 本地看板不可达 | M4 前定宿主方案 |
| bot 记忆覆盖卡 | 卡是权威，记忆是缓存 |
| 重复消息 | message_id + task_id 幂等 |
| 权限泄漏 | scoped token + 项目 ACL + 负向测试 |
| token 浪费 | 事件订阅，不轮询全板 |

## 现在做什么

**M1，不是 A2A server。**

M1 的产物是：

> **一张板，扳子有自己的身份，能更新自己的卡。**

这是第一个“可用的东西”。  
A2A 是 M4 的事。

---

**下一步：** 为 M1 写 task-level TDD 计划（actor registry、token、assignee、activity、ACL），在隔离 worktree 执行。
