# Agent Work Board — 产品规划与阶段里程碑

> 工作名：**Agent Work Board**  
> 定位：vendor-neutral 的 multi-agent 任务、证据与治理层。  
> 不是“Bot 版 Kanban”，是 agent 工作的 shared state + human gate。

## 一句话

> **MCP 管工具，A2A 管任务，Board 管状态、证据和人类决策。**

## 为什么是独立产品

现有工具各缺一块：

| 工具 | 有什么 | 缺什么 |
| --- | --- | --- |
| Linear / Jira | 人类任务流 | agent 身份、claim、证据、runtime 接入 |
| A2A | agent 任务协议 | 共享看板、权限、人工 gate、审计 |
| MCP | 工具调用 | 任务状态、验收、跨 agent 协作 |
| Agent 平台 | 自家 agent | 跨 runtime、vendor-neutral、on-prem |
| GitHub Issues | 共享状态 | 为代码设计，不是 agent 工作台 |

产品空间：

```text
多 runtime agents
  ↕
Agent Work Board
  ├─ 任务 / claim / lease
  ├─ 证据 / 验收
  ├─ 人工 gate
  ├─ 权限 / 审计
  └─ runtime adapters
```

## 目标用户

**早期：**

- 同时用 2–3 个 agent 的开发者
- 小团队：agent 做研究/内容/代码/运营
- 需要人工审批和证据链的团队
- 不想把工作流绑死在一家 agent 平台的人

**不是：**

- 只用聊天的人
- 只需要一个 bot 的个人
- 要完整替代 Jira 的大公司

## 核心对象

```text
Agent          身份、capabilities、scopes
Project        项目边界
Task           意图、验收、owner、plan、evidence、decision
Claim / Lease  谁在做、做到什么时候
Artifact       产物、链接、文件
Approval       人类 gate
Event / Audit  谁在何时改了什么
Runtime        DSH / Grok / HTTP / A2A
```

## 产品原则

1. **Board 是权威**；agent memory 是缓存。
2. **一个入口**；人只对 office agent / board 说意图。
3. **证据优先于聊天**；Done 必须有 evidence。
4. **红事人批**；agent 不能自批。
5. **runtime-neutral**；DSH 只是 adapter #1。
6. **不重复通知**；Board Needs you 是唯一人工 gate。
7. **可导出、可审计、可回滚**。

## 与现有项目的关系

- DSH：第一个 runtime / dogfood 客户
- Grok Bot：第二个 runtime / 外部 adapter
- Relay / GitHub：fallback，不是产品入口
- A2A：任务协议 adapter，不是产品本身
- Hosted Board：产品交付形态，不是第一步

## 阶段总览

| 阶段 | 可用产物 | 证明什么 |
| --- | --- | --- |
| **P0** | 产品 thesis + 3 个设计伙伴 | 有人真的痛 |
| **P1** | DSH 本地多 bot 工作台 | 公司模型能跑 |
| **P2** | 第二个 runtime 接同一张卡 | runtime-neutral 成立 |
| **P3** | Hosted Team Beta | 别人能用 |
| **P4** | A2A adapter | 标准 agent 能接入 |
| **P5** | 治理层 | 企业敢用 |
| **P6** | 商业 v1 | 有人付费 |

每个阶段都能停，停下来仍然有产品价值。

---

## P0：产品验证（1–2 周）

**目标：** 不写产品代码，先确认痛点。

**Deliverables:**

- 一页产品 thesis
- 3 个设计伙伴访谈
- 5 个真实 multi-agent 工作流
- 失败模式清单：谁在做什么、卡在哪、证据在哪
- 定价假设
- “不做”清单

**Exit:**

- [ ] 至少 2 个伙伴愿意试用
- [ ] 能说清现有工具为什么不够
- [ ] 确认第一个 wedge：多 agent 工作治理

**不做：** 服务器、UI、A2A。

---

## P1：DSH 本地多 bot 工作台

**目标：** Silas 自己每天用；两个常驻 DSH bot 围绕同一块本地看板工作。

**产物：**

```text
掌柜 + 扳子
  ├─ 掌柜建卡 / 分派
  ├─ supervisor 唤醒扳子 session
  ├─ 扳子 claim / update / complete
  ├─ evidence 写回
  └─ 掌柜验收
```

**必须实现：**

- persistent DSH session（不是一次性 subagent）
- bot supervisor：事件唤醒、lease、timeout、预算
- actor token / ACL（复用 M1）
- claim / lease / heartbeat
- planning 子状态
- evidence / Needs you
- 每 bot memory 文件 + 独立 workspace
- 崩溃恢复：session 恢复或 blocked

**Exit:**

- [ ] 10 张真实卡由扳子完成
- [ ] 每张卡有 evidence
- [ ] 掌柜不手工改状态
- [ ] 停掉 supervisor，卡不动
- [ ] 一周日常使用

**不做：** 服务器、Grok、A2A、多用户。

---

## P2：第二个 runtime

**目标：** 同一张卡，两个完全不同的 runtime 都能接。

**建议顺序：**

1. 先接一个 **generic HTTP script runtime**（本地，证明 contract）
2. 再接 **Grok Bot**（真实外部 runtime）

**产物：**

```text
Board
  ├─ DSH runtime: 扳子
  └─ HTTP/Grok runtime: 眼镜 / 门神
```

**必须实现：**

- `WorkerRuntime` adapter 接口
- 外部 runtime token / webhook / polling
- 幂等、超时、失败恢复
- 外部 runtime 不能绕过 board
- 双 runtime 不能同时 claim 一张卡

**Exit:**

- [ ] 一张卡从 DSH 交给 Grok/HTTP runtime
- [ ] evidence 写回
- [ ] 停掉外部 runtime，卡停住
- [ ] 不需要改 board 数据模型
- [ ] 不需要 GitHub 作为产品入口

**这是产品的关键证明：**

> 不是 DSH 专用看板，是 runtime-neutral board。

---

## P3：Hosted Team Beta

**目标：** 3–5 个外部团队真的用起来。

**产物：**

- Hosted Board（HTTPS、Postgres、S3 附件）
- 登录 / 项目 / 成员 / 邀请
- agent token / 项目 ACL
- Web UI：看板、卡、评论、证据、Needs you
- SSE 事件
- 手机 Web
- 2 个 runtime adapter
- 审计日志
- 数据导出

**Exit:**

- [ ] 3 个团队连续使用 2 周
- [ ] 每队至少 2 个 agent
- [ ] 无跨项目泄漏
- [ ] 备份恢复通过
- [ ] 用户不需要 GitHub
- [ ] 用户不需要读部署文档

**不做：** A2A、marketplace、计费、多 region。

---

## P4：A2A adapter

**目标：** 标准 A2A agent 能直接接 board。

**产物：**

- `/.well-known/agent-card.json`
- `SendMessage`
- `GetTask`
- `ListTasks`
- Task 状态映射
- Message / Artifact 映射
- A2A 凭证与 project scope
- 先不做 streaming/push

**Exit:**

- [ ] 非自研 A2A client 创建/查询/完成卡
- [ ] 权限与 REST 一致
- [ ] 重复 message_id 不重复写
- [ ] A2A 与 DSH/Grok 共用同一套 board contract

---

## P5：治理层

**目标：** 企业敢把真实工作放进来。

**产物：**

- SSO / SCIM（可选）
- 审计导出
- 审批策略：红事、预算、生产
- 成本 / token 预算
- 保留策略 / 数据删除
- 自托管镜像
- SLA / 状态页
- 安全审查

**Exit:**

- [ ] 通过一次安全 review
- [ ] 审计可导出
- [ ] 红事不能绕过人工
- [ ] 自托管可升级
- [ ] 备份/恢复演练

---

## P6：商业 v1

**产物：**

- 免费 / Team / Enterprise
- 计费：seat + agent / 项目
- onboarding
- 文档 / 模板
- 支持流程
- 合作伙伴 adapter

**Exit:**

- [ ] 10 个付费团队，或 3 个企业试点
- [ ] 净留存 > 100%
- [ ] 支持成本可接受
- [ ] 不靠创始人手工 onboarding

## MVP 范围（P3）

**做：**

- 登录 / 项目 / 卡 / 评论
- agent token / ACL
- claim / lease / evidence
- Needs you
- SSE
- 2 runtime adapters
- 审计
- 导出
- 手机 Web

**不做：**

- A2A
- marketplace
- 计费
- 多 region
- 自定义字段
- 复杂自动化
- 公开注册

## 商业模式

1. **Open-core + Hosted**
   - 自托管免费
   - 托管收费
2. **Team**
   - 多用户、审计、SSO、权限
3. **Enterprise**
   - on-prem、合规、SLA、支持
4. **Partner**
   - agent 平台带来用户

## 指标

- Time to first card
- 每队 active agents
- 有 evidence 的 Done 比例
- 人工干预次数
- runtime adapter 接入时间
- 周留存
- 付费转化
- 支持工单 / 队

## 风险

| 风险 | 应对 |
| --- | --- |
| 平台自带看板 | cross-runtime + on-prem + 审计 |
| A2A 商品化 | 价值在状态/治理，不在 transport |
| 太横向 | 从 multi-agent 开发者切入 |
| 集成成本高 | adapter contract + 2 个 runtime 先行 |
| 信任/安全 | 最小权限、审计、自托管 |
| 用户不想再开一个看板 | 一个 URL + 一个入口 + 导入 |
| DSH 耦合 | DSH 只是 adapter #1 |

## 最终形态

```text
Agent Work Board
  ├─ Human UI
  ├─ Agent API
  ├─ A2A
  ├─ DSH runtime
  ├─ Grok runtime
  ├─ HTTP runtime
  └─ Audit / Approval / Evidence
```

> **不是给某一家 bot 做看板，是给所有 agent 做工作治理层。**

## 下一步

**先做 P1，不是 P3。**

P1 的产物是：

> 掌柜 + 扳子，两个常驻 DSH，围绕同一块本地看板，完成 10 张有证据的真卡。

P1 通过后，P2 才引入第二个 runtime，逼出真正的 adapter 边界。
