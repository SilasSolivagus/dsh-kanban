# Hosted Kanban + A2A 长期方案

> **For agentic workers:** This is a program-level plan. Before implementing any phase, write a task-level TDD plan for that phase. Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** 把 DSH Kanban 从本地插件升级为可部署的 **Hosted Kanban + A2A 服务**。本地 DSH 保留执行能力，云端 bot 直接连服务器，不再依赖 localhost relay 或 GitHub issue。

**Architecture:** 服务器只跑 **board / API / A2A / auth / storage**，不跑完整 DSH。看板是 source of truth；本地 DSH 是客户端；bot 是带 token 的 actor。Relay 和 GitHub 降级为 fallback。

**Tech Stack:** Node 22、Fastify、PostgreSQL 16、Zod、React（复用现有客户端）、`@a2a-js/sdk@1.3.0`、Caddy、Docker Compose、S3 兼容对象存储。

**Spec:** M1 actor/access、M1.5 relay/TEST-004、A2A v1.0。

## 核心判断

> **不要把完整 DSH 暴露到公网。**  
> 只把看板和 A2A 服务放服务器。

原因：

- DSH 能执行命令、读写文件、拿本地凭据。
- 公网 DSH 等于公网执行环境，需要多租户隔离、沙箱、审计。
- Hosted Kanban 已经解决 bot 可达性，风险小得多。

## 目标拓扑

```text
Internet
  │ HTTPS
  ▼
Caddy (TLS / rate limit)
  │
  ├─ Kanban API + Web (Node/Fastify)
  ├─ A2A endpoint
  ├─ PostgreSQL (private)
  └─ S3-compatible object storage (attachments)

Local Mac
  └─ DSH agent ──HTTPS──> Kanban API
       └─ 掌柜 / 扳子 CLI

Cloud bots
  └─ HTTPS / A2A ──> Kanban API
```

- 服务器不暴露 shell、文件系统、DSH host。
- 所有 bot 走 HTTPS。
- relay 只给“不能直连”的 bot。
- GitHub 只做 fallback/审计。

## 非目标

- 把完整 DSH 放进公网
- 一开始就多租户 SaaS
- 自建 A2A 替代标准
- 移动端 App
- 公开注册
- 无鉴权的公网看板

## 阶段总览

| 阶段 | 可用产物 | 关键能力 |
| --- | --- | --- |
| **H0** | 服务器上的空看板 | TLS、Postgres、登录、项目/卡 API |
| **H1** | 可用的 Hosted Board | Web UI、本地 DSH 远程模式、附件 |
| **H2** | Bot 直连 | agent token、ACL、actor、事件 |
| **H3** | A2A-lite | Agent Card、Task、SendMessage/GetTask/ListTasks |
| **H4** | 迁移 | 现有本地卡、评论、活动迁入 |
| **H5** | 生产加固 | 备份、监控、限流、审计、恢复演练 |
| **H6** | 可选 | 多租户、relay fallback、GitHub fallback |

每个阶段都能停下来使用。

---

## H0：服务器骨骼

**目标：** 一台服务器上有一个能登录、能建项目、能建卡的空看板。

**Deliverables:**

- VPS / 云主机：2 vCPU / 4 GB 起步
- 域名 + Caddy TLS
- Docker Compose：`app`、`postgres`、`caddy`
- Fastify 健康检查 `/healthz`
- Postgres schema v1
- 单管理员登录（OIDC 或 magic link）
- `POST /v1/projects`、`POST /v1/tasks`、`GET /v1/bootstrap`
- 结构化日志；不打印 token
- 备份脚本（pg_dump → S3/B2）

**Exit:**

- [ ] HTTPS 可访问
- [ ] 登录后能建项目/卡
- [ ] 重启后数据仍在
- [ ] 备份可恢复
- [ ] 无未鉴权写接口

**不做：** 完整 UI、A2A、bot token、迁移。

---

## H1：Hosted Board 可用

**目标：** 人和本地 DSH 都能用这块看板。

**Deliverables:**

- 复用现有 React 客户端，接 `/v1` API
- 项目列表 / 看板 / 卡详情 / 评论 / 活动
- 本地 DSH remote mode：
  - `KANBAN_REMOTE_URL`
  - `KANBAN_AGENT_TOKEN`
  - 读远端、写远端
- 附件：S3 预签名上传/下载
- 事件：SSE `/v1/events`，不轮询全板
- 断线重连、版本冲突提示

**Exit:**

- [ ] 浏览器可完整操作看板
- [ ] 本地 DSH 能建卡/更新/评论
- [ ] 附件上传下载可用
- [ ] 两个客户端同时写，版本冲突可见
- [ ] 断网恢复后不丢写

**不做：** A2A、多租户、relay。

---

## H2：Bot 直连

**目标：** 一个真实 bot 直接连服务器，不经过 relay/GitHub。

**Deliverables:**

- `agents` / `agent_tokens` 表
- token 哈希存储；前缀识别；轮换
- scopes：`board:read`、`board:create`、`board:update:own`、`board:comment`、`board:assign`
- project membership / ACL
- activity actor = token actor
- rate limit per token
- bot direct API 文档
- `tools/agent-cli`（或复用现有 CLI）

**Exit:**

- [ ] bot 用自己的 token 读项目、更新自己的卡、评论
- [ ] 跨项目 403
- [ ] 改别人卡 403
- [ ] token 轮换后旧 token 失效
- [ ] 事件只推给有权限的 client

**不做：** A2A 标准、claim/lease。

---

## H3：A2A-lite

**目标：** 服务器成为 A2A Task store；外部 A2A client 能接入。

**Deliverables:**

- `/.well-known/agent-card.json`
- `SendMessage`
- `GetTask`
- `ListTasks`
- Task 状态映射
- Message → comment；Artifact → attachment/link
- bearer/OAuth；project scope
- 先不做 streaming/push

**状态映射：**

```text
submitted → Backlog/Inbox
working → Running
input-required → Needs you
completed → Done
failed → Blocked
canceled → Canceled
auth-required → Needs you / 权限阻塞
```

**Exit:**

- [ ] Agent Card 通过 A2A v1.0 校验
- [ ] 非自研 A2A client 能创建/查询/完成卡
- [ ] 权限与 REST 一致
- [ ] 重复 message_id 不重复写
- [ ] 无 A2A 凭证不能写

**不做：** streaming/push、多 agent 发现市场。

---

## H4：迁移

**目标：** 现有本地看板数据完整迁到服务器。

**步骤：**

1. 冻结本地写（只读窗口）
2. 导出 projects/tasks/comments/activity/attachments
3. 导入 Postgres；保留 identifier / createdAt
4. 上传附件到 S3；重写 attachment ref
5. 校验数量、版本、activity、评论顺序
6. 切换本地 DSH 到 remote
7. 保留本地只读快照 7 天

**Exit:**

- [ ] 项目/卡/评论/活动数量一致
- [ ] identifier 不变
- [ ] 附件可打开
- [ ] 本地 DSH 切换后能正常工作
- [ ] 回滚可在 30 分钟内完成

---

## H5：生产加固

**Deliverables:**

- 每日备份 + 每周恢复演练
- 监控：uptime、5xx、DB 连接、磁盘、备份年龄
- 限流：登录、token、写接口
- 审计日志：谁在何时改了什么
- 安全头、CSP、CSRF、session 过期
- token 轮换流程
- 依赖更新与漏洞扫描
- 故障手册与回滚手册

**Exit:**

- [ ] 备份恢复演练通过
- [ ] 401/403/429 负向测试通过
- [ ] 无 secret 在日志/仓库
- [ ] 有 on-call/故障处理文档
- [ ] 压测 100 卡 / 5 bot 可接受

---

## H6：可选扩展

- 多租户（tenant_id、隔离、配额）
- Relay fallback（本地/受限网络）
- GitHub fallback（零基础设施）
- SSE → WebSocket
- 移动审批
- A2A streaming/push

只有 H0–H5 稳定后才做。

## 数据模型

```text
tenants (optional)
users
agents
agent_tokens
projects
project_members
tasks
comments
attachments
activity
leases (later)
events / outbox
a2a_tasks (or task fields)
```

关键约束：

- `tasks.version` 乐观锁
- `activity` append-only
- `agent_tokens.token_hash` 唯一
- `tasks.a2a_task_id` 可空，唯一
- `attachments` 只存对象 key，不存文件
- 所有表带 `tenant_id` 预留

## API 边界

```text
/v1/bootstrap
/v1/projects
/v1/tasks
/v1/tasks/:id/comments
/v1/tasks/:id/activity
/v1/events (SSE)
/v1/attachments
/a2a
/.well-known/agent-card.json
/healthz
```

- 所有写接口要求 `Idempotency-Key` 或 `version`。
- 不提供公网 shell/exec。
- 不把 DSH host 暴露出去。

## 安全

- 人类：OIDC / magic link；短 session；CSRF。
- Agent：bearer token，哈希存储，scope + project ACL。
- A2A：独立凭证，最小 scope。
- 附件：类型/大小限制，签名 URL，病毒扫描后置。
- 数据库只在内网；不暴露 5432。
- TLS 终止在 Caddy；HSTS。
- 日志脱敏；token 永不入日志。
- 备份加密；恢复演练。
- 管理后台不开放公开注册。

## 成本

- 单租户：2 vCPU / 4 GB VPS + 对象存储，足够。
- 多租户：需要 DB 连接池、对象存储配额、限流、隔离。
- 不建议一开始上 Kubernetes。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 把完整 DSH 暴露公网 | 只部署 board/API/A2A |
| 数据丢失 | 每日备份 + 恢复演练 |
| 迁移丢卡 | 冻结、双读校验、7 天回滚 |
| token 泄漏 | 哈希、轮换、最小 scope、限流 |
| bot 绕过 UI 权限 | REST 与 A2A 共用 ACL |
| 事件丢 | outbox + 客户端 cursor |
| 单点故障 | 监控 + 快速恢复；后续 HA |
| 延迟 | 服务器近 bot；SSE，不轮询 |

## 决策记录

- **Hosted board，不是 hosted DSH。**
- **Postgres，不是 SQLite**：并发 bot、备份、迁移。
- **单租户先行**，schema 预留 `tenant_id`。
- **SSE 先行**，WebSocket 后置。
- **A2A 在 H3**，先有 auth/ACL。
- **Relay/GitHub 降级为 fallback。**

## 下一步

先做 **H0 的 task-level TDD 计划**：

- Compose + Caddy + Postgres
- Fastify 健康检查
- OIDC/magic link
- `projects`/`tasks` schema
- 最小 API
- 备份脚本

H0 通过后，H1 才做完整 UI 和本地 DSH remote mode。
