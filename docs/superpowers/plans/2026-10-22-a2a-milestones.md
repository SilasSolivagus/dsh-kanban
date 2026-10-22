# A2A Iteration Milestones

> **For agentic workers:** This is a milestone roadmap, not a task-level implementation plan. Before executing any milestone, write a separate task-level plan with TDD steps and exact files. Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Evolve DSH Kanban from a single-user decision board into an A2A-compatible shared task board where scoped human and agent actors work around cards.

**Architecture:** Kanban is the A2A Task store. Agents are A2A clients. Grok Bot is the first adapter, not the protocol. A2A handles discovery, task lifecycle, messages and artifacts; MCP remains the tool interface. Local DSH stays the source of truth until a reachable A2A endpoint is proven.

**Tech Stack:** Node 22, Cordis, zod, DSH `storageDomain`, A2A v1.0, `@a2a-js/sdk` 1.3.0, existing HTTP API and React client.

**Spec:** [A2A v1.0](https://a2a-protocol.org/latest/specification/), [A2A and MCP](https://a2a-protocol.org/latest/topics/a2a-and-mcp/), [Life of a task](https://a2a-protocol.org/latest/topics/life-of-a-task/), current bridge experiments TEST-001..003.

## Global Constraints

- A2A protocol version: `1.0`.
- SDK: `@a2a-js/sdk@1.3.0` (server and client).
- No new UI framework; use the existing Cordis plugin and React client.
- Kanban remains the source of truth for task state; agent memory is a cache.
- One card = one A2A Task; comments = A2A Messages; links/attachments = A2A Artifacts.
- No public board exposure without scoped auth and project ACL.
- One pilot project and at most four active agents before M4.
- No secrets, PRD content, health data, or customer data in A2A messages or the bridge repo.
- Every write is versioned and idempotent; duplicate delivery must not duplicate work.
- MCP is not the A2A transport; it remains a tool interface.
- Each milestone ends with a demo, tests, and a written exit review.

## Milestone M0 — Baseline and A2A decision

**Duration:** 1–2 days. **No behavior change.**

**Deliverables:**

- `docs/adr/0001-a2a-and-kanban.md`: why A2A, what it owns, what MCP owns, what Kanban owns.
- `docs/a2a-mapping.md`: A2A objects, task states, and board fields.
- Baseline audit of `actor`, `assignee`, `activity`, `version`, `/kanban-api`, and local auth.
- Decision on A2A server hosting: local gateway vs cloud service (can remain open until M3, but must be named).

**Files:**

- Create: `docs/adr/0001-a2a-and-kanban.md`
- Create: `docs/a2a-mapping.md`
- Read: `src/host/schema.js`, `src/host/store.js`, `src/host/http.js`

**Exit criteria:**

- [ ] A2A mapping covers `Agent Card`, `Task`, `Message`, `Part`, `Artifact`.
- [ ] Task state table is explicit: `submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`, `auth-required`.
- [ ] ADR states that Kanban, not agent memory, is authoritative.
- [ ] Hosting decision is recorded as either chosen or explicitly deferred to M3.
- [ ] `pnpm check` still passes 121 tests; no source files changed.

## Milestone M1 — Actor and access foundation

**Duration:** 3–5 days. **The first code milestone.**

**Deliverables:**

- Actor registry: human and agent actors, roles, scopes.
- Scoped agent tokens: project read, own-card write, comment; no red approval, no delete, no archive.
- Real `assignee` selection by actor, not `current-user`.
- Activity and comments record the real actor.
- Project ACL: an agent sees only its projects.

**Files:**

- Create: `src/host/actors.js`
- Modify: `src/host/schema.js`, `src/host/store.js`, `src/host/http.js`, `src/host/entry.js`
- Modify: `src/client/components/TaskDrawer.js`, `src/client/components/App.js`
- Test: `src/host/__tests__/actors.test.js`, `src/host/__tests__/access.test.js`

**Interfaces:**

- Produces: `actors.list()`, `actors.resolve(token)`, `actors.assertCan(actor, action, card)`
- Produces: token scopes `board:read:<project>`, `board:write:own`, `board:comment`, `board:claim`
- Consumes: existing `task.version` conflict semantics.

**Exit criteria:**

- [ ] Bot A can update a card assigned to A.
- [ ] Bot B cannot update A's card; API returns `403`.
- [ ] Bot A cannot read a project outside its scope.
- [ ] Bot cannot approve a red decision or delete/archive a card.
- [ ] Activity and comment `actor` show the bot, not `LOCAL_USER`.
- [ ] Tests cover positive and negative access paths.

## Milestone M2 — Shared workspace semantics

**Duration:** 5–7 days.

**Deliverables:**

- `Planning` as a Backlog sub-state: bot assessment, proposed plan, owner, estimate, risk.
- Claim with lease and heartbeat; double claim returns `409`.
- Explicit handoff; ownership does not change silently.
- Card fields: `intent`, `acceptance`, `assessment`, `plan`, `progress`, `evidence`, `cost`, `runId`.
- Event stream for card changes; no full-board polling.
- `Needs you` only for human gates: decision, blocker, review, auth.

**Files:**

- Modify: `src/host/schema.js`, `src/host/store.js`, `src/host/http.js`
- Modify: `src/client/components/App.js`, `TaskCard.js`, `TaskDrawer.js`
- Test: `src/host/__tests__/claim.test.js`, `src/host/__tests__/handoff.test.js`, `src/host/__tests__/planning.test.js`

**Exit criteria:**

- [ ] Two actors cannot hold the same lease.
- [ ] Expired lease can be reclaimed; activity records both.
- [ ] Handoff requires acceptance.
- [ ] Plan approval is recorded; unapproved large work cannot enter Running.
- [ ] A card change emits one event consumed by a test client.
- [ ] `Needs you` precedence remains question > blocker > review.

## Milestone M3 — A2A-lite server

**Duration:** 5–7 days.

**Deliverables:**

- Agent Card at `/.well-known/agent-card.json` for the Kanban board.
- A2A methods: `SendMessage`, `GetTask`, `ListTasks`.
- Task state mapping to board columns.
- Message → comment; Artifact → link/attachment.
- Bearer auth and project scopes.
- No streaming, push, or cancellation yet.

**Files:**

- Create: `src/host/a2a/agent-card.js`, `src/host/a2a/server.js`, `src/host/a2a/tasks.js`, `src/host/a2a/auth.js`
- Modify: `src/host/entry.js`, `src/host/http.js`
- Test: `src/host/__tests__/a2a-server.test.js`, `src/host/__tests__/a2a-conformance.test.js`

**Interfaces:**

- Produces: A2A task IDs mapped to card IDs; `contextId` stored on card.
- Produces: `a2a.sendMessage`, `a2a.getTask`, `a2a.listTasks`.
- Consumes: M1 actor/token model; M2 claim/plan fields.

**Exit criteria:**

- [ ] Agent Card validates against A2A v1.0.
- [ ] An A2A client creates a task that appears in Inbox.
- [ ] `GetTask` returns the correct board state.
- [ ] `ListTasks` filters by project and state.
- [ ] Unauthorized project access returns 403.
- [ ] A2A integration tests pass; no regression in 121 existing tests.

## Milestone M4 — Two independent adapters

**Duration:** 5–7 days.

**Deliverables:**

- Grok Bot adapter: webhook wake + GitHub issue comment translation to A2A.
- Second adapter: local A2A client/script, not Grok Bot.
- Conformance tests proving both clients use the same task semantics.
- No duplicate card/run on retries.

**Files:**

- Create: `src/host/a2a/adapters/grokbot.js`, `src/host/a2a/adapters/local-client.js`
- Create: `scripts/a2a-smoke-client.mjs`
- Modify: `src/host/a2a/server.js`, `src/host/http.js`
- Test: `src/host/__tests__/a2a-adapters.test.js`

**Exit criteria:**

- [ ] Both adapters create, claim, update, and complete the same card type.
- [ ] Retrying the same message does not duplicate a task or artifact.
- [ ] Grok Bot can still use the existing webhook/issue path.
- [ ] The second adapter does not depend on Grok Bot code.
- [ ] If only Grok Bot can pass, M4 is not complete.

## Milestone M5 — Async, push, and security

**Duration:** 5–7 days.

**Deliverables:**

- `SendStreamingMessage`, `SubscribeToTask`, `CancelTask`.
- A2A push notification configuration; Herald/mobile relay.
- Signed requests or verified agent identity; rate limits.
- Cost and artifact metadata in task updates.

**Files:**

- Create: `src/host/a2a/push.js`, `src/host/a2a/signatures.js`
- Modify: `src/host/a2a/server.js`, `src/host/a2a/auth.js`
- Test: `src/host/__tests__/a2a-push.test.js`, `src/host/__tests__/a2a-auth.test.js`

**Exit criteria:**

- [ ] A subscribed client receives a state update.
- [ ] A push notification reaches the configured endpoint.
- [ ] Canceled task stops work and records the actor.
- [ ] Invalid signature/token returns 401/403.
- [ ] Rate limit prevents a runaway agent.

## Milestone M6 — One entry and Office Chief

**Duration:** 5–7 days.

**Deliverables:**

- 掌柜 agent: curates cards, prepares decision briefs, routes work, maintains board hygiene.
- Human view: intent → plan → progress → evidence → decision; agent topology hidden.
- Mobile `Needs you` approval path through Herald.
- Cost/attention summary for the chairman.

**Files:**

- Create: `src/host/office/curator.js`, `src/host/office/brief.js`
- Modify: `src/client/components/App.js`, `TaskDrawer.js`, `src/client/styles.css`
- Test: `src/host/__tests__/curator.test.js`, `src/client/__tests__/office.test.js`

**Exit criteria:**

- [ ] Silas can drop a card and see a plan without managing bot roles.
- [ ] 掌柜 can create, route, and summarize cards but cannot approve red decisions.
- [ ] Board shows owner, plan, progress, evidence, decision; not agent chatter.
- [ ] Mobile can approve/reject/defer one `Needs you` card.

## Milestone M7 — Hardening and launch

**Duration:** 3–5 days.

**Deliverables:**

- Security review, token rotation, audit log, backup/restore.
- Migration notes for existing cards and `LOCAL_USER`.
- Documentation: A2A setup, adapters, scopes, failure modes.
- Performance check with 100 cards and 5 agents.
- Rollback plan to the pre-A2A board.

**Exit criteria:**

- [ ] No public endpoint without auth.
- [ ] Backup/restore verified on a real board.
- [ ] A2A docs and adapter docs complete.
- [ ] `pnpm check` passes; manual smoke test passes.
- [ ] Rollback tested.

## Task state mapping

| A2A state | Kanban |
| --- | --- |
| `submitted` | Inbox / Backlog |
| `working` | Running |
| `input-required` | Needs you |
| `completed` | Done |
| `failed` | Blocked / failed |
| `canceled` | Canceled / archived |
| `auth-required` | Needs you / permission blocked |

## Risks

| Risk | Mitigation |
| --- | --- |
| Grok Bot is not A2A-native | Keep the GB adapter; do not call it A2A |
| Local board not reachable | Decide hosting at M3; gateway or cloud service |
| Duplicate task stores | Kanban is authoritative; no agent-side task board |
| Agent memory wins over board | Read card before start; card wins |
| A2A spec drift | Pin v1.0 and SDK 1.3.0; conformance tests |
| Token cost | Scope reads, events not polling, one card per task |
| Permission bypass | Scoped tokens, negative tests, no red approval |

## Out of scope

- Multi-tenant A2A discovery marketplace
- Public internet exposure before M5
- Custom columns and WIP limits
- 42-bot onboarding
- Replacing MCP
- Full A2A streaming before M5
- Agent self-approval

## Start here

**Do M0 only.** No source code, no A2A server, no dependency addition until the ADR and mapping are reviewed.

After M0, write a task-level TDD plan for M1 (actor and access) and execute it in an isolated worktree.
