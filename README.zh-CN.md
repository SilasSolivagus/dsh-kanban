<p align="center">
  <img src="icon.svg" width="76" alt="DSH 看板图标" />
</p>

<h1 align="center">DSH 看板</h1>

<p align="center">
  <strong>DeepSeek Harness 的原生看板，以及让常驻 DSH worker 围绕看板工作的 supervisor。</strong><br/>
  人做决策，agent 干活，证据可验证。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/SilasSolivagus/dsh-kanban/actions/workflows/ci.yml"><img src="https://github.com/SilasSolivagus/dsh-kanban/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/version-2.0.0-2F6FB2?style=flat-square" alt="version 2.0.0" />
  <img src="https://img.shields.io/badge/tests-316%20passing-2EA043?style=flat-square" alt="316 tests passing" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA043?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <img src="docs/assets/kanban-board.png" alt="DSH 看板四列界面" width="100%" />
</p>

## 看板是共享状态

DSH 看板是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生 Cordis 插件。它包含两层：

1. **看板**：项目、卡、评论、附件、审批、活动。
2. **Supervisor**：唤醒常驻 DSH worker，claim + lease，执行证据契约，没有 evidence 不写 Done。

> **Chat 管会话，看板管工作。**<br/>
> agent 的 memory 是缓存，卡才是权威。

一张卡不是聊天消息，而是一个承诺：

```text
意图 → 验收 → owner → 方案 → 进展 → 证据 → 决定
```

## ✨ 能力

### 看板

- 四列：Backlog / Running / Needs you / Done
- Needs you 自动汇总问题、阻塞、评审
- 卡内审批、评论、附件、活动
- `storageDomain` 持久化
- 归档 / 只读项目
- 搜索 / 过滤
- 原生主题和 zh / en

### 常驻 DSH worker（P1 alpha）

- 每个 worker 一个持久 child，不是每张卡新建 subagent
- 所有写入带真实 actor，例如 `builder`
- claim + lease；lease = worker timeout + 60s
- 过期 lease 可 reclaim
- worker 必须返回 JSON + evidence
- blocked / timeout / 缺文件 / 模糊需求 → Needs you
- SIGKILL 和插件 reload 后不重复 prompt、不丢 lease
- 没有 evidence 不写 Done

## 🧭 架构

```text
DSH Web UI
  → /kanban-api
  → KanbanStore → storageDomain
  ↑
Supervisor
  ├─ LeaseStore
  ├─ DshWorkerSession
  └─ persistent builder child
        ↓
     JSON evidence
```

- 看板是 source of truth。
- Supervisor 负责 claim、唤醒、写回。
- Worker 只做卡范围内的工作，不直接改看板状态。
- 状态文件：
  - `~/.dsh/kanban-supervisor-state.json`
  - `~/.dsh/kanban-worker-sessions.json`

## 🚀 快速开始

要求：DSH `0.2.1-rc.2`+、Node 22+、pnpm 10+。

```bash
git clone https://github.com/SilasSolivagus/dsh-kanban.git
cd dsh-kanban
pnpm install
pnpm check
```

然后在 DSH → Settings → Plugins 安装本地 bundle，启用 `@local/dsh-kanban`，刷新后打开 Kanban。

没有 worker 配置时，看板正常工作，supervisor 不启动。

## 🤖 启用常驻 worker

### 1. Actor token

创建 `~/.dsh/kanban-agents.json`，权限 `0600`。至少需要 `office` 和 `builder` 两个 actor。

```json
{
  "agents": [
    {
      "id": "office",
      "name": "Office",
      "role": "office",
      "projects": ["*"],
      "scopes": ["board:read", "board:create", "board:assign", "board:update:any", "board:comment"],
      "token": "replace-with-a-random-token"
    },
    {
      "id": "builder",
      "name": "Builder",
      "role": "builder",
      "projects": ["your-project-id"],
      "scopes": ["board:read", "board:update:own", "board:comment"],
      "token": "replace-with-a-random-token"
    }
  ]
}
```

### 2. Worker 配置

创建 `~/.dsh/kanban-workers.json`，权限 `0600`。文件存在时 supervisor 自动启动。

```json
{
  "workers": [
    {
      "id": "builder",
      "name": "Builder",
      "role": "builder",
      "cwd": "/absolute/path/to/builder-workspace",
      "agentPreset": "standard",
      "maxConcurrent": 1,
      "timeoutSeconds": 300
    }
  ]
}
```

- `cwd` 必须是存在的绝对路径。
- `agentPreset` 建议 `standard`。
- P1 单 supervisor、单 worker/role。
- 删除配置文件或禁用插件即可停止 supervisor。

### 3. 角色 prompt

worker 读取 `docs/agents/builder.md` 作为角色契约，输出必须是：

```json
{
  "outcome": "done | blocked",
  "summary": "不超过 500 字",
  "evidence": ["真实命令输出、文件路径或链接"],
  "notes": "可选"
}
```

## 🔁 一张卡的流程

```text
Silas → Office → 建卡，assignee=builder
  → supervisor claim lease
  → builder 持久 session 收到卡
  → builder 返回 JSON + evidence
  → reviewer pass → Done；reviewer reject → Needs you
  → 没有 reviewer 时：supervisor 写评论 + Done
```

P1 live trial：**12 Done 有 evidence，4 Needs you，16 张卡**，包括：

- 内容、文件、命令、评审任务
- 模糊需求 → blocked
- 缺文件 → blocked
- done 但不给 evidence → blocked
- 过期 lease → live reclaim
- 真实 SIGKILL → app 重启，不重复 prompt

## 🔍 Review gate

当 worker 配置里声明了 `reviewer` 角色时，builder 的 Done 候选会多走一步：

- builder 返回 `done` 后，卡进入 `reviewing`，而不是直接 Done。
- reviewer 是独立的常驻 DSH worker，有自己的 `cwd` 和 `docs/agents/reviewer.md`。
- reviewer `pass` → Done，结论和证据以评论写回卡上。
- reviewer `reject` → 卡停留在 `reviewing` 并写入 `blockedReason`，进入 **Needs you**。
- `reviewing` 的卡在下一个 supervisor 周期被评审，不在同一个周期。
- `in_review` 仍是人工处理状态；reviewer 不使用它。
- 没有配置 reviewer 时，只有 builder 的原有路径不变。
- reviewer 不评审分配给自己的卡。
- **人工 override**：supervisor 的 gate 对 builder 和 reviewer 的写入生效；人可以从卡抽屉把 `reviewing` 卡明确拖到 Done。这是有意保留的人工 override，不算 reviewer pass。
- 新建卡时不提供 `reviewing`，但人工编辑已有卡的状态时可以选择它。

**Live 验收：2026-10-23 PASS。** builder → reviewing → reviewer pass → Done（DSH-31）和 reviewer reject → **Needs you**（DSH-32）均已在 live 看板验证。详见 [P1.2 review gate 记录](docs/spikes/p1.2-review-gate.md)。

## 🛡️ 安全

- token 不进卡、评论、prompt、Git。
- agent 写入带 actor。
- worker 不能批红、删除/归档任务、管理项目。
- blocked 卡留在 in_progress + blockedReason，进入 Needs you。
- 没有 evidence 不写 Done。
- 每个 worker 独立 workspace / hidden parent。
- P1 只适合本地单用户，不是敌对多租户沙箱。

## ⚠️ 当前限制

- 单 supervisor、单 builder，无多进程协调。
- Mac/DSH 必须开着；还没有 hosted board。
- worker 工具依赖 DSH preset，默认假设 `standard`。
- 真实 crash 后 reclaim 已测，但 7 天 soak 未做。
- review gate 已于 2026-10-23 live 验收 PASS（[记录](docs/spikes/p1.2-review-gate.md)）；7 天 soak 和 Office 入口仍未完成。
- 还没有 A2A、MCP、Grok adapter、hosted board。

## 🗺️ 路线

- [x] M1：actor、token、项目 ACL、真实 activity
- [x] P1 alpha：持久 worker、supervisor、lease、evidence、blocked/reclaim
- [x] P1.2 review gate：reviewer pass/reject，2026-10-23 live 验收
- [ ] P1.2 剩余：7 天 soak、Office 入口
- [ ] P1.3：贵主管 + 便宜工人，复用 review gate
- [ ] P2：第二个 runtime adapter（HTTP / Grok）
- [ ] P3：Hosted Board（Postgres、TLS、auth、多用户）
- [ ] P4：A2A adapter

## 📚 文档

- [英文 README](README.md)
- [Usage guide](docs/usage.en.md)
- [使用说明](docs/usage.md)
- [P1 trial](docs/spikes/p1.1-ten-card-trial.md)
- [Lease / crash probe](docs/spikes/p1.1-lease-and-crash.md)
- [SIGKILL probe](docs/spikes/p1.1-kill9.md)
- [P1.2 review gate runbook](docs/spikes/p1.2-review-gate.md)

## 🛠️ 开发

```bash
pnpm build
pnpm test
pnpm check
```

## 📄 License

[MIT](LICENSE) © 2026 Silas Solivagus.
