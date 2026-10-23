# P1：DSH 常驻多 bot 工作台 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox syntax.

**Goal:** 掌柜 + 扳子，两个 DSH 角色围绕同一块本地看板工作。扳子是持久 session，不是一次性 subagent。完成 10 张有 evidence 的真卡。

**Architecture:** 本地 Kanban 仍是 state store。新增 supervisor 插件/工具：监听卡、claim/lease、唤醒持久 DSH worker session、收集结果、写回 evidence。掌柜是当前主 DSH session；扳子是持续 child/team session。没有服务器、Grok、A2A。

**Tech Stack:** Node 22、Cordis、现有 Kanban store/API、DSH `agentTeams` / `subagents` / `agentLoop` 服务、`node:test`。

**Spec:** `docs/superpowers/plans/2026-10-23-agent-board-product.md` P1；`docs/superpowers/plans/2026-10-22-a2a-milestones.md` M1。

## Global Constraints

- 不做 Hosted Board、Grok、A2A、MCP。
- 不做新 UI；看板复用现有。
- 掌柜不手工改状态；supervisor 负责。
- 扳子 session 必须可恢复；不是每张卡都新建 subagent。
- 所有 worker 写回带 actor=builder。
- 看板是权威；worker memory 是缓存。
- 每张卡必须有 evidence 才能 Done。
- worker 失败 → blocked / Needs you，不能假 Done。
- 单机、单用户、单项目 pilot；不做多租户。
- 默认最多 1 个 builder worker；不做 7 bot。

## 关键决策

### 掌柜不是 supervisor

- 掌柜 = 当前主 DSH session，人类入口。
- supervisor = 后台/工具层，负责调度。
- 扳子 = 持久 worker session。

### 先做 Session API spike

DSH 已暴露：

- `ctx.agentTeams.spawnTeammate(caller, request)`
- `ctx.agentTeams.sendMessage(caller, request)`
- `ctx.agentTeams.waitForChange(caller, timeout, signal)`
- `ctx.subagents.startActivation(spec)`
- `ctx.subagents.prompt(request)`
- `ctx.subagents.listChildren(parentId)`
- `ctx.agentLoop.createAgent/resume`

但“谁能作为 caller/parent”“插件是否能拿到 live 掌柜 Agent”需要 spike 验证。P1.0 不通过，就不写 supervisor。

## 文件结构

```text
src/host/supervisor/
  config.js          worker registry / limits
  board-port.js      BoardPort interface + LocalBoardAdapter
  worker-session.js  WorkerSession interface + DshWorkerSession
  prompt.js          card → worker prompt
  lease.js           claim/lease/timeouts
  supervisor.js      one cycle loop
  index.js           wiring
src/host/__tests__/
  supervisor-config.test.js
  supervisor-board.test.js
  supervisor-lease.test.js
  supervisor-prompt.test.js
  supervisor-session.test.js
  supervisor-cycle.test.js
docs/agents/
  office.md
  builder.md
config/
  workers.example.json
```

## Worker 配置

`~/.dsh/kanban-workers.json`：

```json
{
  "workers": [
    {
      "id": "builder",
      "name": "扳子",
      "role": "builder",
      "agentPreset": "builder",
      "cwd": "/Users/silas/.../worktrees/builder",
      "maxConcurrent": 1,
      "timeoutSeconds": 900
    }
  ]
}
```

Token 仍来自 `~/.dsh/kanban-agents.json`，不重复存。

---

## Task 0: Session API spike

**No production code.**

验证：

1. 从当前 DSH session 创建一个 continuable child `builder-spike`。
2. 发一条 prompt，让它返回 `PONG`。
3. 等结果。
4. 让它 idle。
5. 再发一条 prompt，确认是同一个 session，不是新建。
6. 模拟进程重启/resume。
7. 列出 child catalog；确认能找回 session id。
8. 中断一次长任务。

**Output:** `docs/spikes/dsh-persistent-session.md`

**Decision:**

- 如果 `agentTeams` 可用：用 team child。
- 如果 `subagents` 可用：用 continuable child。
- 如果都不行：P1-lite 用 one-shot subagent，明确不叫“常驻”；P1 目标降级。

**Exit:**

- [ ] 同一 child 连续两次 prompt
- [ ] 重启后能 resume 或明确不能
- [ ] 有 session id 持久化方案
- [ ] 有 interrupt 路径

没有结论就停，不写 supervisor。

---

## Task 1: Worker registry + config

**Files:** `supervisor/config.js`, `config/workers.example.json`, `docs/agents/*.md`, tests.

**Interfaces:**

- `loadWorkers(path)` -> `{ workers }`; validate id/name/role/cwd/maxConcurrent/timeout.
- `workerByRole(workers, role)`.
- Env override `DSH_KANBAN_WORKERS_FILE`.
- Role prompt file `docs/agents/<role>.md`; missing file -> config error.

Tests:

- valid config.
- duplicate id rejected.
- unknown role rejected.
- missing cwd rejected.
- missing prompt file rejected.

Run `node --test src/host/__tests__/supervisor-config.test.js`.

Commit `feat: add supervisor worker registry`.

---

## Task 2: BoardPort + local adapter

**Files:** `supervisor/board-port.js`, tests.

**Interface:**

```js
class BoardPort {
  listAssigned(actorId, statuses)
  getTask(id)
  claim(id, actor, leaseSeconds)
  updateStatus(id, version, status, actor)
  comment(id, body, actor)
  release(id, actor)
}
```

`LocalBoardAdapter` wraps existing `KanbanStore`; all writes pass `actor` (M1).

Tests with `MemoryTable`:

- list only assigned tasks.
- claim sets lease metadata in supervisor state.
- update/comment actor = builder.
- version conflict propagated.
- release clears lease.

Commit `feat: add supervisor board port`.

---

## Task 3: Lease and claim

**Files:** `supervisor/lease.js`, tests.

Rules:

- one lease per card.
- lease TTL default 900s.
- heartbeat extends only owner.
- expired lease can be reclaimed; activity records both.
- no lease for Done/Canceled.
- supervisor restart must not duplicate claim.
- lease state persisted in `~/.dsh/kanban-supervisor-state.json`.

Tests:

- claim twice -> second rejected.
- expiry reclaim.
- heartbeat owner only.
- restart restores lease.
- corrupt state fails loudly.

Commit `feat: add supervisor lease and claim`.

---

## Task 4: Worker prompt

**Files:** `supervisor/prompt.js`, tests.

Prompt contains:

- role rules from `docs/agents/<role>.md`
- card identifier/title/description
- acceptance
- current status/version
- required output contract:

```json
{
  "outcome": "done | blocked",
  "summary": "...",
  "evidence": ["..."],
  "notes": "..."
}
```

Rules:

- no work outside card.
- no editing board directly.
- no secrets.
- blocked must say where.
- summary <= 500 chars.
- evidence >= 1 for done.

Tests:

- prompt includes card and role.
- escaped/malicious card text does not break prompt.
- missing evidence rejected.
- blocked accepted without evidence.

Commit `feat: add worker prompt contract`.

---

## Task 5: DSH worker session

**Files:** `supervisor/worker-session.js`, tests.

**Interface:**

```js
class WorkerSession {
  ensure(worker)        // create/resume persistent child
  prompt(worker, text)  // wake
  wait(worker, timeout) // result or timeout
  interrupt(worker)
}
```

`DshWorkerSession` uses the spike-selected API.

- session id persisted in `~/.dsh/kanban-worker-sessions.json`
- worker restart uses resume
- no new session per card
- timeout -> interrupt -> blocked
- child failure -> blocked, not done

Tests use a fake session service; no model calls.

Commit `feat: add persistent DSH worker session`.

---

## Task 6: Supervisor cycle

**Files:** `supervisor/supervisor.js`, `supervisor/index.js`, tests.

One cycle:

1. load workers/leases.
2. `board.listAssigned('builder', ['todo','backlog'])`.
3. skip if leased or terminal.
4. claim + set `in_progress` (actor builder).
5. ensure worker session.
6. prompt with card.
7. wait up to timeout.
8. parse result.
9. done: comment evidence + status done + release; close lease.
10. blocked/error/timeout: comment blocked reason; keep `in_progress`/Needs you; release.
11. save state after each step.

Tests with fakes:

- one card -> claim -> prompt -> done.
- duplicate card -> one prompt.
- timeout -> blocked.
- evidence required.
- restart mid-lease -> no duplicate.
- two cycles -> no re-prompt completed card.
- actor = builder on all writes.

Commit `feat: add supervisor cycle`.

---

## Task 7: 10-card trial

**Preconditions:**

- live local Kanban
- worker config
- `builder` actor token
- 掌柜 main session

**Trial:**

1. Silas → 掌柜: 10 real tasks.
2. 掌柜 creates 10 cards assigned builder.
3. Supervisor completes them one at a time.
4. Each card has evidence.
5. At least 2 cards need review; 门神 not yet; 掌柜 can review.
6. One card intentionally ambiguous; worker must ask/blocked.
7. Kill supervisor mid-card; restart; no duplicate.
8. Stop supervisor; new card stays.

**Exit:**

- [ ] 10 Done with evidence
- [ ] 1 blocked/Needs you handled
- [ ] 0 duplicate prompts
- [ ] restart recovery works
- [ ] no manual status edits
- [ ] 1 week daily use

## Out of Scope

- Grok / server / A2A / MCP
- 门神 / 眼镜 / 管家
- multi-user
- mobile
- new UI
- multi-project
- cost dashboard

## Risks

| Risk | Mitigation |
| --- | --- |
| DSH session API not stable | P1.0 spike; fallback P1-lite |
| Worker loops / burns tokens | timeout + maxConcurrent=1 + budget |
| Duplicate claim | lease + atomic state + tests |
| Fake Done | evidence required; blocked path |
| Shared workspace conflict | one worker, own worktree/cwd |
| Supervisor crash | state file + resume |
| 掌柜 still manual | CLI + skill; no UI edits |
| Model quality | acceptance + blocked, not auto-approve |

## Definition of Done

> 10 张真实卡由扳子完成；每张有 evidence；  
> 停掉 supervisor，卡不动；重启后不重复；  
> 掌柜不手工改状态。

P1 通过后才做 P2：第二个 runtime adapter。
