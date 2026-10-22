# M1：掌柜接意图 + 扳子上板 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Silas 对掌柜说意图，掌柜用 scoped token 建卡并分配给扳子；扳子只能更新自己的卡，活动和评论记录真实 actor。

**Architecture:** 新增静态 actor registry 与 token 解析；store 接收 actor 并写入 assignee/activity/comment；HTTP 在路由层做身份与项目 scope 校验；CLI 给掌柜和扳子提供最小工具。无 A2A、无 Planning、无 handoff、无 UI 新列。

**Tech Stack:** Node 22, Cordis, zod, DSH `storageDomain`, Node `fetch`, `node:test`.

**Spec:** `docs/superpowers/plans/2026-10-22-a2a-milestones.md` M1.

## Global Constraints

- 不新增 A2A server、MCP、webhook、Planning、handoff。
- 不新增 UI 列；现有四列不变。
- 不把 token 写进仓库；token 文件在 `~/.dsh/kanban-agents.json`。
- 人（本地 UI）继续可用；bot 必须使用 `Authorization: Bearer <token>`。
- 无 token 的请求按本地人类处理；无效 token 返回 401。
- 每个 bot 只能读自己的项目，只能写自己负责的卡。
- 活动与评论必须记录真实 actor。
- 每次写入保留现有 `version` 冲突语义。

## File Structure

- Create: `src/host/actors.js` — actor definitions, token loading, `resolveActor`, `assertCan`.
- Modify: `src/host/store.js` — actor-aware create/update/comment/activity, `assigneeId`.
- Modify: `src/host/http.js` — auth + scope checks, pass actor, map 401/403.
- Modify: `src/host/entry.js` — create registry, pass to HTTP handler.
- Create: `scripts/kanban-agent.mjs` — CLI for 掌柜/扳子.
- Create: `docs/office-chief.md` — 掌柜的建卡规则与命令示例.
- Create: `src/host/__tests__/actors.test.js`
- Create: `src/host/__tests__/store-actors.test.js`
- Create: `src/host/__tests__/http-actors.test.js`

---

### Task 1: Actor registry and token resolution

**Files:**
- Create: `src/host/actors.js`
- Test: `src/host/__tests__/actors.test.js`

**Interfaces:**
- Produces: `createActorRegistry({ tokenFile } = {})`
- Produces: `registry.resolve(headers)` → actor | `null` (invalid bearer) | `LOCAL_USER` (no bearer)
- Produces: `registry.get(id)` → actor | `undefined`
- Produces: `registry.list()` → actor definitions for UI/bootstrap
- Produces: `registry.assertCan(actor, action, resource)` → throws `FORBIDDEN`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createActorRegistry, LOCAL_USER } from '../actors.js'

const tokens = {
  'dsh.shopkeeper': 'shop-token',
  'gb.banzi': 'banzi-token',
}

test('no bearer resolves to local human', () => {
  const registry = createActorRegistry({ tokens })
  assert.equal(registry.resolve({}).id, LOCAL_USER.id)
})

test('valid bearer resolves agent', () => {
  const registry = createActorRegistry({ tokens })
  const actor = registry.resolve({ authorization: 'Bearer banzi-token' })
  assert.equal(actor.id, 'gb.banzi')
  assert.equal(actor.name, '扳子')
})

test('invalid bearer resolves null', () => {
  const registry = createActorRegistry({ tokens })
  assert.equal(registry.resolve({ authorization: 'Bearer nope' }), null)
})

test('banzi can update own card only', () => {
  const registry = createActorRegistry({ tokens })
  const banzi = registry.get('gb.banzi')
  assert.doesNotThrow(() => registry.assertCan(banzi, 'board:update', {
    projectId: 'dsh-kanban',
    assignee: { id: 'gb.banzi' },
  }))
  assert.throws(() => registry.assertCan(banzi, 'board:update', {
    projectId: 'dsh-kanban',
    assignee: { id: 'dsh.shopkeeper' },
  }), /FORBIDDEN/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/host/__tests__/actors.test.js`
Expected: FAIL, cannot find `actors.js`.

- [ ] **Step 3: Implement `src/host/actors.js`**

Use static definitions:

```js
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'

export const LOCAL_USER = { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null }

const AGENTS = [
  {
    type: 'agent', id: 'dsh.shopkeeper', name: '掌柜', role: 'office',
    avatarUrl: null, projects: ['*'],
    scopes: ['board:read', 'board:create', 'board:assign', 'board:update:any', 'board:comment'],
  },
  {
    type: 'agent', id: 'gb.banzi', name: '扳子', role: 'builder',
    avatarUrl: null, projects: ['dsh-kanban'],
    scopes: ['board:read', 'board:update:own', 'board:comment'],
  },
]

function digest(value) {
  return createHash('sha256').update(value).digest()
}

export function createActorRegistry({ tokens = loadTokens(), tokenFile } = {}) {
  const byId = new Map(AGENTS.map((agent) => [agent.id, agent]))
  function resolve(headers = {}) {
    const auth = headers.authorization
    if (!auth) return LOCAL_USER
    const match = /^Bearer\s+(.+)$/i.exec(auth)
    if (!match) return null
    const tokenDigest = digest(match[1])
    for (const [id, expected] of Object.entries(tokens)) {
      if (digest(expected).length !== tokenDigest.length) continue
      if (timingSafeEqual(digest(expected), tokenDigest)) return byId.get(id) ?? null
    }
    return null
  }
  function assertCan(actor, action, resource) {
    if (actor.type === 'user') return
    const scopes = actor.scopes ?? []
    const projectAllowed = actor.projects?.includes('*') || actor.projects?.includes(resource.projectId)
    const owns = resource.assignee?.id === actor.id
    const allowed = projectAllowed && (
      scopes.includes(action) ||
      (action === 'board:update' && (scopes.includes('board:update:any') || (scopes.includes('board:update:own') && owns))) ||
      (action === 'board:create' && scopes.includes('board:create'))
    )
    if (!allowed) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }
  return { resolve, get: (id) => byId.get(id), list: () => [LOCAL_USER, ...AGENTS], assertCan }
}

export function loadTokens() {
  const file = process.env.DSH_KANBAN_AGENT_TOKENS_FILE || join(homedir(), '.dsh', 'kanban-agents.json')
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/host/__tests__/actors.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/host/actors.js src/host/__tests__/actors.test.js
git commit -m "feat: add kanban actor registry and token scopes"
```

---

### Task 2: Actor-aware store writes

**Files:**
- Modify: `src/host/store.js`
- Test: `src/host/__tests__/store-actors.test.js`

**Interfaces:**
- `createTask(input, actor = LOCAL_USER)` accepts `assigneeId`.
- `updateTask(id, patch, actor = LOCAL_USER)` accepts `assigneeId`.
- `addComment(taskId, body, actor = LOCAL_USER)`.
- `#activity(taskId, changes, actor)` records actor.

- [ ] **Step 1: Write failing tests**

Create project; create task as 掌柜 assigned to `gb.banzi`; assert `task.assignee.id === 'gb.banzi'`; assert activity actor 掌柜; add comment as 扳子; assert comment author.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/host/__tests__/store-actors.test.js`
Expected: FAIL, assignee is local user / activity author local user.

- [ ] **Step 3: Implement minimal changes**

- Add `assigneeId` to `TASK_PATCH_FIELDS`.
- Add `resolveAssignee(input.assigneeId, actor)` using a registry or actor map passed to store? For M1, pass `actors` to store constructor: `new KanbanStore({ ..., actors })`. `entry.js` creates registry and passes.
- Default `assignee` to `LOCAL_USER`.
- Use `actor` parameter for `assignee`, comments, activity:
  - `createTask`: `assignee = this.#actors.get(input.assigneeId) ?? LOCAL_USER`; `#activity(..., actor)`.
  - `updateTask`: if `assigneeId`, set `next.assignee`; record `assignee` change; `#activity(..., actor)`.
  - `addComment`: `author: actor`.
- Thread actor through only create/update/comment for M1; do not change question/attachment methods yet.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/host/__tests__/store-actors.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/host/store.js src/host/__tests__/store-actors.test.js
git commit -m "feat: record real actors on cards and comments"
```

---

### Task 3: HTTP auth and project scope

**Files:**
- Modify: `src/host/http.js`
- Modify: `src/host/entry.js`
- Test: `src/host/__tests__/http-actors.test.js`

**Interfaces:**
- `createHttpHandler(store, { actors })`
- `handleRequest(store, request, actors)`
- `request.actor` is resolved before routing.
- `POST /kanban-api/tasks` requires `board:create`; `PATCH /tasks/:id` requires `board:update`; `POST /tasks/:id/comments` requires `board:comment`.
- Invalid bearer → 401; scope/project violation → 403.

- [ ] **Step 1: Write failing tests**

Use `createHttpHandler` or `handleRequest` with bearer tokens:
- shopkeeper creates task assigned to `gb.banzi` → 201, activity actor.
- banzi updates own task → 200.
- banzi updates shopkeeper task → 403.
- banzi creates task → 403.
- banzi reads another project → 403.
- no token → local human works.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/host/__tests__/http-actors.test.js`
Expected: FAIL, no auth/403.

- [ ] **Step 3: Implement**

- `createHttpHandler(store, { actors = createActorRegistry() } = {})`.
- Resolve actor from `request.headers`; if `null`, `401 UNAUTHORIZED`.
- Pass actor into `handleRequest`.
- In `handleRequest`, before create/update/comment:
  - `POST /tasks`: `actors.assertCan(actor, 'board:create', { projectId: payload.projectId })`.
  - `PATCH /tasks/:id`: fetch `store.getTaskDetail(id).task`; `assertCan(actor, 'board:update', task)`.
  - `POST /comments`: same resource check with `board:comment`.
- Add `FORBIDDEN: 403`, `UNAUTHORIZED: 401` to `STATUS_BY_CODE`.
- Filter `bootstrap` tasks/projects for agent project scopes; human all.
- `entry.js`: `const actors = createActorRegistry(); const store = new KanbanStore({ ..., actors }); createHttpHandler(store, { actors })`.

- [ ] **Step 4: Run HTTP tests**

Run: `node --test src/host/__tests__/http-actors.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `pnpm test`
Expected: 121 + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/host/http.js src/host/entry.js src/host/__tests__/http-actors.test.js
git commit -m "feat: enforce agent identity and project scopes"
```

---

### Task 4: CLI for 掌柜 and 扳子

**Files:**
- Create: `scripts/kanban-agent.mjs`
- Create: `docs/office-chief.md`

**CLI:**

```bash
DSH_KANBAN_URL=http://127.0.0.1:<port>/kanban-api \
DSH_KANBAN_TOKEN=... \
node scripts/kanban-agent.mjs create \
  --project dsh \
  --title '给看板加方案确认' \
  --acceptance '掌柜建卡，扳子能更新' \
  --assignee gb.banzi
```

Commands:

- `create --project --title --acceptance --assignee`
- `update --id --version --status --comment`
- `comment --id --body`
- `bootstrap`

The CLI must:

- Send `Authorization: Bearer $DSH_KANBAN_TOKEN`
- Use `fetch`
- Print JSON
- Exit non-zero on non-2xx

`docs/office-chief.md` is the 掌柜 rules:

- Silas 只给意图；掌柜补验收/优先级
- 不直接改状态；建卡/分派用 CLI
- 有缺口时只问必要问题
- 不替 Silas 批红
- 不在 UI 手工建卡

- [ ] **Step 1: Implement CLI and doc**
- [ ] **Step 2: Smoke test**

```bash
node scripts/kanban-agent.mjs bootstrap
node scripts/kanban-agent.mjs create ...
```

- [ ] **Step 3: Commit**

```bash
git add scripts/kanban-agent.mjs docs/office-chief.md
git commit -m "feat: add agent CLI and office chief rules"
```

---

### Task 5: M1 end-to-end verification

**Setup:**

Create `~/.dsh/kanban-agents.json`:

```json
{
  "dsh.shopkeeper": "replace-with-random-token",
  "gb.banzi": "replace-with-random-token"
}
```

Restart the plugin after creating the file.

**Demo:**

1. In DSH chat, say to 掌柜: “给看板加方案确认，找扳子。”
2. 掌柜 creates card via CLI.
3. Verify card assignee = 扳子; activity actor = 掌柜.
4. 扳子 runs `update --status running --comment "收到"`.
5. Verify activity actor = 扳子.
6. Try 扳子 updating another actor's card → 403.
7. Try 扳子 creating a project/task → 403.

**Verification:**

```bash
pnpm check
node --test src/host/__tests__/actors.test.js
node --test src/host/__tests__/store-actors.test.js
node --test src/host/__tests__/http-actors.test.js
```

- [ ] **Demo passed**
- [ ] 121 existing tests + new tests pass
- [ ] No token committed
- [ ] UI displays 掌柜/扳子 correctly

## Out of Scope

- Planning
- Claim/lease
- Handoff
- A2A
- MCP
- Mobile
- 门神
- UI assignee selector (display only in M1)

## Execution Handoff

After approval, implement in an isolated worktree using `superpowers:using-git-worktrees` and `superpowers:subagent-driven-development`. Do not start with A2A.
