# DSH Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `@local/dsh-kanban` as a native DSH plugin with Host persistence, a `/kanban-api` HTTP bridge, and the agreed four-column task board.

**Architecture:** A Host plugin opens a `storageDomain` domain and owns all mutations through `KanbanStore`; a same-origin `/kanban-api` route exposes JSON endpoints. A React Client page registers in the `main` and `sidebar.panellist` slots. The Client uses a small fetch wrapper and an optimistic store. Generated Host/Client bundles are committed.

**Tech Stack:** Node.js 22, DSH Cordis, `@deepseek-ai/dsh-storage-domain`, `zod`, React 18, esbuild, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-21-dsh-kanban-design.md`

## Global Constraints

- No iframe, no external Taskboard service, no SQLite.
- Persistence uses `storageDomain`; localStorage is allowed only for collapsed-column UI state.
- Stored statuses are `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`.
- Blocking is `blockedReason` + `blockedSince`, not a stored status.
- `Needs you` is derived; it cannot be a drop target.
- Archived projects are read-only and restorable.
- API base path is `/kanban-api`; all responses use `Cache-Control: no-store`.
- Task mutations require the current `version`.
- UI uses only DSH `--dsw-alias-*` theme tokens for color.
- Generated `index.js` and `client.js` are committed; installation never builds.
- Every code task follows red-green TDD. Run the failing test before implementation.
- Commit after every task.

---

### Task 1: Scaffold the plugin and build pipeline

**Files:**
- Create: `package.json`
- Create: `cordis.patch.yml`
- Create: `scripts/build.mjs`
- Create: `src/host/entry.js`
- Create: `src/client/index.jsx`
- Create: `src/client/styles.css`
- Keep: `icon.svg`, `locale/en.json`, `locale/zh.json`

**Interfaces:**
- Produces: `pnpm build` → `index.js` (Host ESM) and `client.js` (module-loader bundle)
- Produces: `pnpm test` → Node test runner

- [ ] **Step 1: Confirm the isolated worktree baseline**

```bash
git status --short --branch
git log --oneline -2
```

Expected: the implementation branch is checked out; only spec, plan and
`.gitignore` are tracked. The old prototype remains in the main working tree
and is not part of this branch.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@local/dsh-kanban",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "description": "Native task board for DeepSeek Harness.",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": [
    "index.js",
    "client.js",
    "cordis.patch.yml",
    "locale/*.json",
    "icon.svg",
    "src/**/*.js",
    "src/**/*.jsx",
    "src/**/*.css"
  ],
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test",
    "check": "pnpm build && pnpm test"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "zod": "^4.4.3"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-layout"]
    }
  }
}
```

- [ ] **Step 3: Write `cordis.patch.yml`**

```yaml
- insert:
    - id: dsh-kanban
      name: '@local/dsh-kanban'
```

- [ ] **Step 4: Write `scripts/build.mjs`**

```js
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

await build({
  entryPoints: ['src/host/entry.js'],
  outfile: 'index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@deepseek-ai/*'],
  logLevel: 'info',
})

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const client = await build({
  entryPoints: ['src/client/index.jsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs',
  target: ['chrome120'],
  external: ['react'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.css': 'text' },
  logLevel: 'info',
})

const code = client.outputFiles[0].text
const handoff = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  },
});
`
await writeFile('client.js', handoff)
```

- [ ] **Step 5: Write minimal Host entry**

```js
export const inject = ['webServer', 'storageDomain', 'attachments']

export async function apply() {}
```

- [ ] **Step 6: Write minimal Client entry**

```jsx
import React from 'react'

export const inject = ['slots', 'locale']

export function apply() {}
```

- [ ] **Step 7: Write an empty stylesheet**

```css
.dkb { box-sizing: border-box; }
```

- [ ] **Step 8: Install dependencies and build**

Run:

```bash
pnpm install
pnpm build
node --check index.js
node --check client.js
```

Expected: both files are emitted, `node --check` exits 0, and `client.js` starts with `window.__ModuleLoader__.load`.

- [ ] **Step 9: Commit**

```bash
git add package.json cordis.patch.yml scripts/build.mjs src
git commit -m "chore: scaffold native kanban plugin"
```

---

### Task 2: Shared statuses and attention rules

**Files:**
- Create: `src/shared/statuses.js`
- Create: `src/shared/rules.js`
- Test: `src/shared/__tests__/rules.test.js`

**Interfaces:**
- Produces: `STATUSES`, `PRIORITIES`, `STATUS_LABELS`, `PRIORITY_LABELS`, `COLUMN_IDS`
- Produces: `attentionReason(task)`, `columnForTask(task)`, `canDrop(task, columnId)`, `elapsedStart(task)`, `nextIdentifier(project, tasks)`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attentionReason,
  columnForTask,
  canDrop,
  elapsedStart,
  nextIdentifier,
} from '../rules.js'

const base = {
  id: 't1',
  projectId: 'dsh-kanban',
  identifier: 'DSH-1',
  title: 'task',
  status: 'in_progress',
  archivedAt: null,
  blockedReason: null,
  blockedSince: null,
  pendingQuestion: null,
  questionResolution: null,
  statusSince: '2026-10-21T00:00:00.000Z',
}

test('question outranks blocker and review', () => {
  const task = {
    ...base,
    status: 'in_review',
    blockedReason: 'waiting',
    pendingQuestion: { createdAt: '2026-10-21T01:00:00.000Z' },
  }
  assert.equal(attentionReason(task), 'question')
  assert.equal(columnForTask(task), 'needs')
  assert.equal(elapsedStart(task), '2026-10-21T01:00:00.000Z')
})

test('blocker outranks review and uses blockedSince', () => {
  const task = {
    ...base,
    status: 'in_review',
    blockedReason: 'waiting',
    blockedSince: '2026-10-21T02:00:00.000Z',
  }
  assert.equal(attentionReason(task), 'blocked')
  assert.equal(elapsedStart(task), '2026-10-21T02:00:00.000Z')
})

test('review is attention and uses statusSince', () => {
  const task = { ...base, status: 'in_review' }
  assert.equal(attentionReason(task), 'review')
  assert.equal(elapsedStart(task), base.statusSince)
})

test('normal columns map to backlog, running and done', () => {
  assert.equal(columnForTask({ ...base, status: 'backlog' }), 'backlog')
  assert.equal(columnForTask({ ...base, status: 'todo' }), 'backlog')
  assert.equal(columnForTask(base), 'running')
  assert.equal(columnForTask({ ...base, status: 'done' }), 'done')
  assert.equal(columnForTask({ ...base, status: 'canceled' }), null)
})

test('attention tasks cannot leave Needs you and Needs you cannot be a target', () => {
  const attention = { ...base, status: 'in_review' }
  assert.equal(canDrop(attention, 'done').ok, false)
  assert.equal(canDrop(base, 'needs').ok, false)
  assert.equal(canDrop(base, 'done').ok, true)
})

test('identifier uses the higher of nextTaskNumber and existing max', () => {
  const project = { id: 'dsh-kanban', name: 'DSH 看板', taskPrefix: 'DSH', nextTaskNumber: 2 }
  const tasks = [{ identifier: 'DSH-7' }, { identifier: 'DSH-3' }]
  assert.equal(nextIdentifier(project, tasks), 'DSH-8')
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
node --test src/shared/__tests__/rules.test.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `../rules.js`.

- [ ] **Step 3: Implement `src/shared/statuses.js`**

```js
export const STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
]

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent']

export const COLUMN_IDS = ['backlog', 'running', 'needs', 'done']

export const STATUS_LABELS = {
  backlog: '待立项',
  todo: '等待认领',
  in_progress: '处理中',
  in_review: '等你确认',
  done: '完成',
  canceled: '取消',
}

export const PRIORITY_LABELS = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}
```

- [ ] **Step 4: Implement `src/shared/rules.js`**

```js
export function attentionReason(task) {
  if (task.archivedAt) return null
  if (task.pendingQuestion && !task.questionResolution) return 'question'
  if (task.blockedReason) return 'blocked'
  if (task.status === 'in_review') return 'review'
  return null
}

export function columnForTask(task) {
  const attention = attentionReason(task)
  if (attention) return 'needs'
  if (task.status === 'backlog' || task.status === 'todo') return 'backlog'
  if (task.status === 'in_progress') return 'running'
  if (task.status === 'done') return 'done'
  return null
}

export function elapsedStart(task) {
  const attention = attentionReason(task)
  if (attention === 'question') return task.pendingQuestion.createdAt
  if (attention === 'blocked') return task.blockedSince || task.statusSince
  return task.statusSince
}

export function canDrop(task, columnId) {
  if (columnId === 'needs') return { ok: false, reason: 'Needs you is automatic' }
  if (attentionReason(task) && columnForTask(task) === 'needs') {
    return { ok: false, reason: 'Resolve attention before moving' }
  }
  if (columnId === 'done' && attentionReason(task)) {
    return { ok: false, reason: 'Resolve attention before Done' }
  }
  return { ok: true }
}

export function nextIdentifier(project, tasks) {
  const prefix = project.taskPrefix
  let max = 0
  for (const task of tasks) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(task.identifier)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${prefix}-${Math.max(project.nextTaskNumber, max + 1)}`
}
```

- [ ] **Step 5: Run the tests and verify green**

```bash
node --test src/shared/__tests__/rules.test.js
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared
git commit -m "feat: add shared status and attention rules"
```

---

### Task 3: Domain schema

**Files:**
- Create: `src/host/domain.js`
- Test: `src/host/__tests__/domain.test.js`

**Interfaces:**
- Produces: `kanbanDomainSpec`
- Table schemas validate projects, tasks, comments, attachments, activity

- [ ] **Step 1: Write the failing schema tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { kanbanDomainSpec } from '../domain.js'

const project = {
  id: 'dsh-kanban',
  name: 'DSH 看板',
  workspacePath: null,
  taskPrefix: 'DSH',
  labels: [],
  nextTaskNumber: 1,
  archivedAt: null,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
}

const task = {
  id: 't1',
  identifier: 'DSH-1',
  projectId: project.id,
  title: 'task',
  description: '',
  status: 'backlog',
  priority: 'none',
  labels: [],
  assignee: { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null },
  sortOrder: 1000,
  statusSince: '2026-10-21T00:00:00.000Z',
  blockedReason: null,
  blockedSince: null,
  pendingQuestion: null,
  questionResolution: null,
  links: [],
  archivedAt: null,
  version: 1,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
}

test('valid project and task parse', () => {
  assert.equal(kanbanDomainSpec.tables.projects.valueSchema.safeParse(project).success, true)
  assert.equal(kanbanDomainSpec.tables.tasks.valueSchema.safeParse(task).success, true)
})

test('blocked is not a stored status', () => {
  const invalid = { ...task, status: 'blocked' }
  assert.equal(kanbanDomainSpec.tables.tasks.valueSchema.safeParse(invalid).success, false)
})

test('invalid priority is rejected', () => {
  assert.equal(
    kanbanDomainSpec.tables.tasks.valueSchema.safeParse({ ...task, priority: 'P0' }).success,
    false,
  )
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/host/__tests__/domain.test.js
```

Expected: cannot find `../domain.js`.

- [ ] **Step 3: Implement `src/host/domain.js`**

```js
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { PRIORITIES, STATUSES } from '../shared/statuses.js'

const iso = z.string().min(1)
const actor = z.object({
  type: z.enum(['user', 'agent']),
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().nullable(),
})
const link = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  url: z.string().refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'URL must use http or https'),
})
const questionOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  detail: z.string().max(1000).default(''),
})
const pendingQuestion = z.object({
  prompt: z.string().min(1).max(2000),
  note: z.string().max(2000).default(''),
  options: z.array(questionOption).min(2).max(5),
  selected: z.string().nullable(),
  createdAt: iso,
})
const questionResolution = z.object({
  decision: z.enum(['approve', 'reject']),
  optionId: z.string().nullable(),
  optionLabel: z.string().nullable(),
  note: z.string().max(2000).default(''),
  at: iso,
})

const projectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  workspacePath: z.string().nullable(),
  taskPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/),
  labels: z.array(z.string().min(1).max(64)).max(50),
  nextTaskNumber: z.number().int().min(1),
  archivedAt: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
})

const taskSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).max(240),
  description: z.string().max(100000),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  labels: z.array(z.string().min(1).max(64)).max(20),
  assignee: actor,
  sortOrder: z.number().finite(),
  statusSince: iso,
  blockedReason: z.string().max(2000).nullable(),
  blockedSince: iso.nullable(),
  pendingQuestion: pendingQuestion.nullable(),
  questionResolution: questionResolution.nullable(),
  links: z.array(link).max(50),
  archivedAt: z.string().nullable(),
  version: z.number().int().min(1),
  createdAt: iso,
  updatedAt: iso,
})

const commentSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  body: z.string().min(1).max(10000),
  author: actor,
  createdAt: iso,
  updatedAt: iso,
})

const attachmentSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  size: z.number().int().min(0),
  storageRef: z.object({
    attachmentId: z.string().min(1),
    name: z.string().min(1),
    bytes: z.number().int().min(0),
  }),
  createdAt: iso,
})

const activitySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  actor,
  changes: z.array(z.object({
    field: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
  })),
  createdAt: iso,
})

export const kanbanDomainSpec = defineDomain({
  name: 'dsh-kanban',
  version: 1,
  tables: {
    projects: domainTable(projectSchema),
    tasks: domainTable(taskSchema),
    comments: domainTable(commentSchema),
    attachments: domainTable(attachmentSchema),
    task_activity: domainTable(activitySchema),
  },
})
```

- [ ] **Step 4: Run the tests**

```bash
node --test src/host/__tests__/domain.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/host/domain.js src/host/__tests__/domain.test.js
git commit -m "feat: add kanban storage domain schema"
```

---

### Task 4: Project operations in `KanbanStore`

**Files:**
- Create: `src/host/store.js`
- Create: `src/host/__tests__/memory-table.js`
- Test: `src/host/__tests__/store-projects.test.js`

**Interfaces:**
- Produces: `KanbanStore({ tables, attachments, now, newId })`
- Produces: `bootstrap()`, `createProject()`, `renameProject()`, `archiveProject()`, `restoreProject()`, `deleteProject()`

- [ ] **Step 1: Write the in-memory table helper**

```js
export class MemoryTable {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial))
  }
  get(key) { return this.map.get(key) }
  entries() { return this.map.entries() }
  keys() { return this.map.keys() }
  get size() { return this.map.size }
  async put(key, value) { this.map.set(key, value) }
  async delete(key) { return this.map.delete(key) }
  async update(key, fn) {
    const next = fn(this.map.get(key))
    this.map.set(key, next)
    return next
  }
}
```

- [ ] **Step 2: Write the failing project tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

function makeStore() {
  return new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

test('create, rename, archive, restore, delete empty project', async () => {
  const store = makeStore()
  const created = await store.createProject({ name: 'DSH 看板' })
  assert.equal(created.id, 'dsh-kanban')
  assert.equal(created.taskPrefix, 'DSH')

  const renamed = await store.renameProject(created.id, 'DSH Kanban')
  assert.equal(renamed.name, 'DSH Kanban')

  const archived = await store.archiveProject(created.id)
  assert.equal(archived.archivedAt, '2026-10-21T00:00:00.000Z')

  const restored = await store.restoreProject(created.id)
  assert.equal(restored.archivedAt, null)

  await store.deleteProject(created.id)
  assert.equal(store.bootstrap().projects.length, 0)
})

test('delete rejects a non-empty project', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  await store.createTask({ projectId: project.id, title: 'task' })
  await assert.rejects(
    () => store.deleteProject(project.id),
    (error) => error.code === 'PROJECT_NOT_EMPTY',
  )
})
```

- [ ] **Step 3: Run and watch fail**

```bash
node --test src/host/__tests__/store-projects.test.js
```

Expected: cannot find `../store.js`.

- [ ] **Step 4: Implement the project part of `KanbanStore`**

```js
import { attentionReason, columnForTask, nextIdentifier } from '../shared/rules.js'

const LOCAL_USER = { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null }

export class KanbanStore {
  #tables
  #attachments
  #now
  #newId
  #tail = Promise.resolve()

  constructor({ tables, attachments, now = () => new Date().toISOString(), newId = () => crypto.randomUUID() }) {
    this.#tables = tables
    this.#attachments = attachments
    this.#now = now
    this.#newId = newId
  }

  #run(operation) {
    const next = this.#tail.then(operation)
    this.#tail = next.catch(() => {})
    return next
  }

  #project(id) {
    const project = this.#tables.projects.get(id)
    if (!project) throw Object.assign(new Error('Project not found'), { code: 'PROJECT_NOT_FOUND' })
    return project
  }

  #task(id) {
    const task = this.#tables.tasks.get(id)
    if (!task) throw Object.assign(new Error('Task not found'), { code: 'TASK_NOT_FOUND' })
    return task
  }

  bootstrap() {
    const projects = [...this.#tables.projects.entries()].map(([, project]) => ({
      ...project,
      taskCount: [...this.#tables.tasks.entries()].filter(([, task]) => task.projectId === project.id && !task.archivedAt).length,
    }))
    const tasks = [...this.#tables.tasks.entries()]
      .map(([, task]) => task)
      .filter((task) => !task.archivedAt)
      .map((task) => this.#summary(task))
    return { projects, tasks }
  }

  createProject({ name, workspacePath = null }) {
    return this.#run(async () => {
      const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      let id = base
      let suffix = 2
      while (this.#tables.projects.get(id)) id = `${base}-${suffix++}`
      const prefixBase = String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 3) || 'TSK'
      let taskPrefix = prefixBase
      suffix = 2
      while ([...this.#tables.projects.entries()].some(([, project]) => project.taskPrefix === taskPrefix)) {
        taskPrefix = `${prefixBase.slice(0, 5)}${suffix++}`
      }
      const timestamp = this.#now()
      const project = {
        id,
        name: String(name).trim(),
        workspacePath,
        taskPrefix,
        labels: [],
        nextTaskNumber: 1,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.projects.put(id, project)
      return project
    })
  }

  renameProject(id, name) {
    return this.#run(async () => {
      const project = this.#project(id)
      const next = { ...project, name: String(name).trim(), updatedAt: this.#now() }
      await this.#tables.projects.put(id, next)
      return next
    })
  }

  archiveProject(id) {
    return this.#run(async () => {
      const project = this.#project(id)
      const next = { ...project, archivedAt: project.archivedAt ?? this.#now(), updatedAt: this.#now() }
      await this.#tables.projects.put(id, next)
      return next
    })
  }

  restoreProject(id) {
    return this.#run(async () => {
      const project = this.#project(id)
      const next = { ...project, archivedAt: null, updatedAt: this.#now() }
      await this.#tables.projects.put(id, next)
      return next
    })
  }

  deleteProject(id) {
    return this.#run(async () => {
      this.#project(id)
      const count = [...this.#tables.tasks.entries()].filter(([, task]) => task.projectId === id).length
      if (count > 0) {
        throw Object.assign(new Error('Project still contains tasks'), { code: 'PROJECT_NOT_EMPTY', details: { taskCount: count } })
      }
      await this.#tables.projects.delete(id)
    })
  }

  #summary(task) {
    return {
      ...task,
      attentionReason: attentionReason(task),
      column: columnForTask(task),
      commentCount: [...this.#tables.comments.entries()].filter(([, comment]) => comment.taskId === task.id).length,
      attachmentCount: [...this.#tables.attachments.entries()].filter(([, attachment]) => attachment.taskId === task.id).length,
      linkCount: task.links.length,
    }
  }
}
```

- [ ] **Step 5: Run tests**

The second test needs `createTask`; implement Task 5 before running both, or temporarily remove it. To keep this task self-contained, implement a minimal `createTask` now:

```js
  createTask({ projectId, title, status = 'backlog', priority = 'none' }) {
    return this.#run(async () => {
      const project = this.#project(projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const tasks = [...this.#tables.tasks.entries()].map(([, task]) => task)
      const identifier = nextIdentifier(project, tasks)
      const timestamp = this.#now()
      const task = {
        id: this.#newId(),
        identifier,
        projectId,
        title: String(title).trim(),
        description: '',
        status,
        priority,
        labels: [],
        assignee: LOCAL_USER,
        sortOrder: 1000,
        statusSince: timestamp,
        blockedReason: null,
        blockedSince: null,
        pendingQuestion: null,
        questionResolution: null,
        links: [],
        archivedAt: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.tasks.put(task.id, task)
      await this.#tables.projects.put(projectId, { ...project, nextTaskNumber: Number(identifier.split('-').at(-1)) + 1, updatedAt: timestamp })
      return task
    })
  }
```

Run:

```bash
node --test src/host/__tests__/store-projects.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/host/store.js src/host/__tests__/memory-table.js src/host/__tests__/store-projects.test.js
git commit -m "feat: add project operations to kanban store"
```

---

### Task 5: Task create, patch, detail, and archive

**Files:**
- Modify: `src/host/store.js`
- Test: `src/host/__tests__/store-tasks.test.js`

**Interfaces:**
- Produces: `createTask()`, `updateTask()`, `getTaskDetail()`, `archiveTask()`, `restoreTask()`, `deleteTask()`, `listArchivedTasks()`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

function makeStore() {
  return new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

test('create task and increment nextTaskNumber', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  assert.equal(task.identifier, 'DSH-1')
  assert.equal(task.status, 'backlog')
  assert.equal(store.bootstrap().projects[0].nextTaskNumber, 2)
})

test('patch increments version and rejects stale versions', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  const updated = await store.updateTask(task.id, { version: 1, priority: 'high' })
  assert.equal(updated.priority, 'high')
  assert.equal(updated.version, 2)
  await assert.rejects(
    () => store.updateTask(task.id, { version: 1, priority: 'low' }),
    (error) => error.code === 'TASK_VERSION_CONFLICT',
  )
})

test('archive hides from bootstrap and restore returns it', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  await store.archiveTask(task.id, { version: 1 })
  assert.equal(store.bootstrap().tasks.length, 0)
  assert.equal(store.listArchivedTasks().length, 1)
  const restored = await store.restoreTask(task.id, { version: 2 })
  assert.equal(restored.archivedAt, null)
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/host/__tests__/store-tasks.test.js
```

Expected: `updateTask is not a function`.

- [ ] **Step 3: Implement task methods**

Replace the minimal `createTask` from Task 4 with the full version, then add
the methods below.

```js
  createTask({ projectId, title, description = '', status = 'backlog', priority = 'none', labels = [], assigneeTarget = 'current-user', sortOrder }) {
    return this.#run(async () => {
      const project = this.#project(projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const tasks = [...this.#tables.tasks.entries()].map(([, task]) => task)
      const identifier = nextIdentifier(project, tasks)
      const timestamp = this.#now()
      const siblings = tasks.filter((task) => task.projectId === projectId && task.status === status && !task.archivedAt)
      const order = sortOrder ?? (siblings.length ? Math.min(...siblings.map((task) => task.sortOrder)) - 1000 : 1000)
      const task = {
        id: this.#newId(),
        identifier,
        projectId,
        title: String(title).trim(),
        description: String(description),
        status,
        priority,
        labels: [...labels],
        assignee: LOCAL_USER,
        sortOrder: order,
        statusSince: timestamp,
        blockedReason: null,
        blockedSince: null,
        pendingQuestion: null,
        questionResolution: null,
        links: [],
        archivedAt: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.tasks.put(task.id, task)
      await this.#tables.projects.put(projectId, {
        ...project,
        nextTaskNumber: Number(identifier.split('-').at(-1)) + 1,
        updatedAt: timestamp,
      })
      return task
    })
  }

  updateTask(id, patch) {
    return this.#run(async () => {
      const task = this.#task(id)
      if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
      if (patch.version !== task.version) {
        throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      }
      const project = this.#project(task.projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const now = this.#now()
      const next = { ...task, ...patch, version: task.version + 1, updatedAt: now }
      if (patch.status && patch.status !== task.status) next.statusSince = now
      if (patch.blockedReason && !task.blockedReason) next.blockedSince = now
      if (patch.blockedReason === null) next.blockedSince = null
      delete next.versionInput
      await this.#tables.tasks.put(id, next)
      return next
    })
  }

  getTaskDetail(id) {
    const task = this.#task(id)
    return {
      task: this.#summary(task),
      comments: [...this.#tables.comments.entries()].map(([, comment]) => comment).filter((comment) => comment.taskId === id),
      attachments: [...this.#tables.attachments.entries()].map(([, attachment]) => attachment).filter((attachment) => attachment.taskId === id),
      activity: [...this.#tables.activity.entries()].map(([, event]) => event).filter((event) => event.taskId === id),
    }
  }

  archiveTask(id, { version }) {
    return this.#run(async () => {
      const task = this.#task(id)
      if (version !== task.version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      const next = { ...task, archivedAt: this.#now(), updatedAt: this.#now(), version: task.version + 1 }
      await this.#tables.tasks.put(id, next)
      return next
    })
  }

  restoreTask(id, { version }) {
    return this.#run(async () => {
      const task = this.#task(id)
      if (!task.archivedAt) throw Object.assign(new Error('Task is not archived'), { code: 'TASK_NOT_ARCHIVED' })
      if (version !== task.version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      const next = { ...task, archivedAt: null, updatedAt: this.#now(), version: task.version + 1 }
      await this.#tables.tasks.put(id, next)
      return next
    })
  }

  deleteTask(id, { version }) {
    return this.#run(async () => {
      const task = this.#task(id)
      if (!task.archivedAt) throw Object.assign(new Error('Task is not archived'), { code: 'TASK_NOT_ARCHIVED' })
      if (version !== task.version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      await this.#tables.tasks.delete(id)
      for (const [key, comment] of this.#tables.comments.entries()) if (comment.taskId === id) await this.#tables.comments.delete(key)
      for (const [key, attachment] of this.#tables.attachments.entries()) if (attachment.taskId === id) await this.#tables.attachments.delete(key)
      for (const [key, event] of this.#tables.activity.entries()) if (event.taskId === id) await this.#tables.activity.delete(key)
    })
  }

  listArchivedTasks(projectId) {
    return [...this.#tables.tasks.entries()]
      .map(([, task]) => task)
      .filter((task) => task.archivedAt && (!projectId || task.projectId === projectId))
      .map((task) => this.#summary(task))
  }
```

- [ ] **Step 4: Run tests**

```bash
node --test src/host/__tests__/store-tasks.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/host/store.js src/host/__tests__/store-tasks.test.js
git commit -m "feat: add task operations to kanban store"
```

---

### Task 6: Attention, blocking, questions, and approvals

**Files:**
- Modify: `src/host/store.js`
- Test: `src/host/__tests__/store-attention.test.js`

**Interfaces:**
- Produces: `askQuestion()`, `answerQuestion()`
- `updateTask` handles `blockedReason` timestamps

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

function makeStore() {
  return new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

async function setup() {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  return { store, task }
}

test('blocking sets blockedSince and clearing removes it', async () => {
  const { store, task } = await setup()
  const blocked = await store.updateTask(task.id, { version: 1, blockedReason: 'waiting' })
  assert.equal(blocked.blockedSince, '2026-10-21T00:00:00.000Z')
  const cleared = await store.updateTask(task.id, { version: 2, blockedReason: null })
  assert.equal(cleared.blockedSince, null)
})

test('question enters Needs you; approve finishes and reject returns to backlog', async () => {
  const { store, task } = await setup()
  const asked = await store.askQuestion(task.id, {
    version: 1,
    prompt: 'Which name?',
    note: '',
    options: [
      { id: 'a', label: 'A', detail: '' },
      { id: 'b', label: 'B', detail: '' },
    ],
  })
  assert.equal(asked.attentionReason, 'question')
  const approved = await store.answerQuestion(task.id, {
    version: 2,
    decision: 'approve',
    selected: 'a',
    note: '',
  })
  assert.equal(approved.status, 'done')
  assert.equal(approved.attentionReason, null)
})

test('done is rejected while attention is unresolved', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, blockedReason: 'waiting' })
  await assert.rejects(
    () => store.updateTask(task.id, { version: 2, status: 'done' }),
    (error) => error.code === 'TASK_NEEDS_ATTENTION',
  )
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/host/__tests__/store-attention.test.js
```

Expected: `askQuestion is not a function`.

- [ ] **Step 3: Add the attention guard and methods**

In `updateTask`, before writing:

```js
      const candidate = { ...task, ...patch, version: task.version + 1, updatedAt: now }
      if (candidate.status === 'done' && (candidate.pendingQuestion && !candidate.questionResolution || candidate.blockedReason)) {
        throw Object.assign(new Error('Resolve attention before Done'), { code: 'TASK_NEEDS_ATTENTION' })
      }
```

Add methods:

```js
  askQuestion(id, { version, prompt, note = '', options }) {
    return this.#run(async () => {
      const task = this.#task(id)
      if (task.version !== version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      if (task.pendingQuestion && !task.questionResolution) throw Object.assign(new Error('Question already pending'), { code: 'QUESTION_ALREADY_PENDING' })
      const next = {
        ...task,
        pendingQuestion: {
          prompt,
          note,
          options,
          selected: null,
          createdAt: this.#now(),
        },
        questionResolution: null,
        version: task.version + 1,
        updatedAt: this.#now(),
      }
      await this.#tables.tasks.put(id, next)
      return this.#summary(next)
    })
  }

  answerQuestion(id, { version, decision, selected = null, note = '' }) {
    return this.#run(async () => {
      const task = this.#task(id)
      if (task.version !== version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      if (!task.pendingQuestion && task.status !== 'in_review') {
        throw Object.assign(new Error('Task is not awaiting review'), { code: 'TASK_NOT_IN_REVIEW' })
      }
      const option = task.pendingQuestion?.options.find((item) => item.id === selected) ?? null
      if (task.pendingQuestion && !option) {
        throw Object.assign(new Error('Selected option is required'), { code: 'INVALID_FIELD' })
      }
      const now = this.#now()
      const next = {
        ...task,
        status: decision === 'approve' ? 'done' : 'backlog',
        statusSince: now,
        questionResolution: {
          decision,
          optionId: option?.id ?? null,
          optionLabel: option?.label ?? null,
          note,
          at: now,
        },
        version: task.version + 1,
        updatedAt: now,
      }
      await this.#tables.tasks.put(id, next)
      return this.#summary(next)
    })
  }
```

- [ ] **Step 4: Run tests**

```bash
node --test src/host/__tests__/store-attention.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/host/store.js src/host/__tests__/store-attention.test.js
git commit -m "feat: add attention, blocking and approval rules"
```

---

### Task 7: Comments and activity

**Files:**
- Modify: `src/host/store.js`
- Test: `src/host/__tests__/store-comments.test.js`

**Interfaces:**
- Produces: `addComment()`, `deleteComment()`
- Produces: internal `#activity()`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

function makeStore() {
  return new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

test('comments add and delete, and activity records task creation', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  const comment = await store.addComment(task.id, 'hello')
  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.comments.length, 1)
  assert.equal(detail.comments[0].body, 'hello')
  assert.ok(detail.activity.some((event) => event.changes.some((change) => change.field === 'status')))
  await store.deleteComment(task.id, comment.id)
  assert.equal(store.getTaskDetail(task.id).comments.length, 0)
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/host/__tests__/store-comments.test.js
```

Expected: `addComment is not a function`.

- [ ] **Step 3: Implement comments and activity**

```js
  async #activity(taskId, changes) {
    const event = {
      id: this.#newId(),
      taskId,
      actor: LOCAL_USER,
      changes,
      createdAt: this.#now(),
    }
    await this.#tables.activity.put(event.id, event)
  }

  addComment(taskId, body) {
    return this.#run(async () => {
      const task = this.#task(taskId)
      if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
      const project = this.#project(task.projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const timestamp = this.#now()
      const comment = {
        id: this.#newId(),
        taskId,
        body: String(body).trim(),
        author: LOCAL_USER,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.comments.put(comment.id, comment)
      return comment
    })
  }

  deleteComment(taskId, commentId) {
    return this.#run(async () => {
      const comment = this.#tables.comments.get(commentId)
      if (!comment || comment.taskId !== taskId) throw Object.assign(new Error('Comment not found'), { code: 'NOT_FOUND' })
      await this.#tables.comments.delete(commentId)
    })
  }
```

Call `await this.#activity(task.id, [{ field: 'status', before: null, after: task.status }])` after creating a task. Call activity from `updateTask` for each changed field, `askQuestion`, `answerQuestion`, `archiveTask`, `restoreTask`, and attachment methods.

- [ ] **Step 4: Run tests**

```bash
node --test src/host/__tests__/store-comments.test.js
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/host/store.js src/host/__tests__/store-comments.test.js
git commit -m "feat: add comments and task activity"
```

---

### Task 8: Attachments and HTTP route foundation

**Files:**
- Modify: `src/host/store.js`
- Create: `src/host/http.js`
- Test: `src/host/__tests__/store-attachments.test.js`
- Test: `src/host/__tests__/http-bootstrap.test.js`

**Interfaces:**
- Produces: `addAttachment()`, `deleteAttachment()`, `readAttachment()`
- Produces: `createHttpHandler(store)` and `handleRequest(store, request)`

- [ ] **Step 1: Write failing attachment/store test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

test('attachment metadata is stored after byte admission', async () => {
  const store = new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f.txt', bytes: 3 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: () => 'att-1',
  })
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  const attachment = await store.addAttachment(task.id, {
    filename: 'f.txt',
    contentType: 'text/plain',
    data: 'YWJj',
  })
  assert.equal(attachment.filename, 'f.txt')
  assert.equal(store.getTaskDetail(task.id).attachments.length, 1)
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/host/__tests__/store-attachments.test.js
```

Expected: `addAttachment is not a function`.

- [ ] **Step 3: Implement attachments**

```js
  addAttachment(taskId, { filename, contentType, data }) {
    return this.#run(async () => {
      const task = this.#task(taskId)
      const project = this.#project(task.projectId)
      if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const count = [...this.#tables.attachments.entries()].filter(([, attachment]) => attachment.taskId === taskId).length
      if (count >= 50) throw Object.assign(new Error('Attachment limit reached'), { code: 'ATTACHMENT_LIMIT_REACHED' })
      const bytes = Buffer.from(data, 'base64')
      if (bytes.length > 20 * 1024 * 1024) {
        throw Object.assign(new Error('Attachment is too large'), { code: 'ATTACHMENT_TOO_LARGE' })
      }
      const ref = await this.#attachments.admitEncodedFile({ data, name: filename })
      const attachment = {
        id: this.#newId(),
        taskId,
        filename,
        contentType,
        size: ref.bytes,
        storageRef: { attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes },
        createdAt: this.#now(),
      }
      await this.#tables.attachments.put(attachment.id, attachment)
      await this.#activity(taskId, [{ field: 'attachment', before: null, after: filename }])
      return attachment
    })
  }

  deleteAttachment(taskId, attachmentId) {
    return this.#run(async () => {
      const attachment = this.#tables.attachments.get(attachmentId)
      if (!attachment || attachment.taskId !== taskId) throw Object.assign(new Error('Attachment not found'), { code: 'NOT_FOUND' })
      await this.#tables.attachments.delete(attachmentId)
    })
  }

  readAttachment(attachmentId) {
    const attachment = this.#tables.attachments.get(attachmentId)
    if (!attachment) throw Object.assign(new Error('Attachment not found'), { code: 'NOT_FOUND' })
    return {
      attachment,
      stream: this.#attachments.readFileStream(attachment.storageRef),
    }
  }
```

- [ ] **Step 4: Write failing HTTP bootstrap test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'
import { handleRequest } from '../http.js'

test('bootstrap returns projects and tasks', async () => {
  const store = new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: () => 'id-1',
  })
  const project = await store.createProject({ name: 'DSH 看板' })
  await store.createTask({ projectId: project.id, title: 'task' })
  const response = await handleRequest(store, {
    method: 'GET',
    pathname: '/kanban-api/bootstrap',
    searchParams: new URLSearchParams(),
    body: null,
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.projects.length, 1)
  assert.equal(response.body.tasks.length, 1)
})
```

- [ ] **Step 5: Run and watch fail**

```bash
node --test src/host/__tests__/http-bootstrap.test.js
```

Expected: cannot find `../http.js`.

- [ ] **Step 6: Implement the route dispatcher and Node adapter**

```js
import { Readable } from 'node:stream'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function ok(body, status = 200) { return { status, headers: JSON_HEADERS, body } }
function fail(status, code, message, details = {}) { return { status, headers: JSON_HEADERS, body: { error: { code, message, details } } } }

export async function handleRequest(store, request) {
  const { method, pathname, searchParams, body } = request
  if (method === 'GET' && pathname === '/kanban-api/bootstrap') return ok(store.bootstrap())
  if (method === 'POST' && pathname === '/kanban-api/projects') {
    try { return ok(await store.createProject(body), 201) } catch (error) { return toError(error) }
  }
  return fail(404, 'NOT_FOUND', 'Not found')
}

const STATUS_BY_CODE = {
  PROJECT_ARCHIVED: 403,
  TASK_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  PROJECT_EXISTS: 409,
  PROJECT_NOT_EMPTY: 409,
  TASK_VERSION_CONFLICT: 409,
  TASK_ARCHIVED: 409,
  TASK_NOT_ARCHIVED: 409,
  TASK_NOT_IN_REVIEW: 409,
  TASK_NEEDS_ATTENTION: 409,
  QUESTION_ALREADY_PENDING: 409,
  QUESTION_NOT_PENDING: 409,
  ATTACHMENT_TOO_LARGE: 413,
  ATTACHMENT_LIMIT_REACHED: 413,
}

function toError(error) {
  const status = STATUS_BY_CODE[error.code] ?? 400
  return fail(status, error.code ?? 'INTERNAL_ERROR', error.message, error.details)
}

const MAX_BODY_BYTES = 30 * 1024 * 1024

export function createHttpHandler(store) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const download = /^\/kanban-api\/attachments\/([^/]+)$/.exec(url.pathname)
    if (download && request.method === 'GET') {
      try {
        const { attachment, stream } = store.readAttachment(decodeURIComponent(download[1]))
        response.writeHead(200, {
          'content-type': attachment.contentType,
          'content-disposition': `attachment; filename="${attachment.filename.replace(/"/g, '')}"`,
          'content-length': String(attachment.size),
          'cache-control': 'no-store',
        })
        for await (const chunk of stream) response.write(chunk)
        response.end()
      } catch (error) {
        response.writeHead(404, JSON_HEADERS)
        response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Attachment not found', details: {} } }))
      }
      return
    }

    let body = null
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      const chunks = []
      let total = 0
      for await (const chunk of request) {
        total += chunk.length
        if (total > MAX_BODY_BYTES) {
          response.writeHead(413, JSON_HEADERS)
          response.end(JSON.stringify({ error: { code: 'ATTACHMENT_TOO_LARGE', message: 'Request body is too large', details: {} } }))
          return
        }
        chunks.push(chunk)
      }
      const text = Buffer.concat(chunks).toString('utf8')
      body = text ? JSON.parse(text) : {}
    }
    try {
      const result = await handleRequest(store, {
        method: request.method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body,
      })
      response.writeHead(result.status, result.headers)
      response.end(result.body === null ? undefined : JSON.stringify(result.body))
    } catch (error) {
      response.writeHead(500, JSON_HEADERS)
      response.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: String(error), details: {} } }))
    }
  }
}
```

- [ ] **Step 7: Run tests**

```bash
node --test src/host/__tests__/store-attachments.test.js src/host/__tests__/http-bootstrap.test.js
```

Expected: 2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/host/store.js src/host/http.js src/host/__tests__/store-attachments.test.js src/host/__tests__/http-bootstrap.test.js
git commit -m "feat: add attachments and HTTP bootstrap route"
```

---

### Task 9: Complete HTTP routes and Host entry

**Files:**
- Modify: `src/host/http.js`
- Modify: `src/host/entry.js`
- Test: `src/host/__tests__/http-routes.test.js`

**Interfaces:**
- Completes project/task/question/comment/attachment/archive routes
- `apply` opens the domain, provides `kanban`, registers the route

- [ ] **Step 1: Write route tests**

Cover each operation with a fake store:

```js
test('project archive and task move routes', async () => {
  const calls = []
  const store = {
    archiveProject: async (id) => { calls.push(['archiveProject', id]); return { id, archivedAt: 'now' } },
    updateTask: async (id, body) => { calls.push(['updateTask', id, body]); return { id, version: body.version + 1 } },
    bootstrap: () => ({ projects: [], tasks: [] }),
  }
  const a = await handleRequest(store, { method: 'POST', pathname: '/kanban-api/projects/p1/archive', searchParams: new URLSearchParams(), body: {} })
  assert.equal(a.status, 200)
  const b = await handleRequest(store, { method: 'PATCH', pathname: '/kanban-api/tasks/t1', searchParams: new URLSearchParams(), body: { version: 1, status: 'in_progress' } })
  assert.equal(b.status, 200)
  assert.equal(calls.length, 2)
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/host/__tests__/http-routes.test.js
```

Expected: archive route returns 404.

- [ ] **Step 3: Implement routes**

Use regex matching:

```js
  const projectMatch = /^\/kanban-api\/projects\/([^/]+)$/.exec(pathname)
  if (projectMatch) {
    const id = decodeURIComponent(projectMatch[1])
    if (method === 'PATCH') return ok(await store.renameProject(id, body.name))
    if (method === 'DELETE') { await store.deleteProject(id); return { status: 204, headers: {}, body: null } }
  }
  const projectAction = /^\/kanban-api\/projects\/([^/]+)\/(archive|restore)$/.exec(pathname)
  if (projectAction && method === 'POST') {
    return ok(await (projectAction[2] === 'archive' ? store.archiveProject(projectAction[1]) : store.restoreProject(projectAction[1])))
  }
  const taskMatch = /^\/kanban-api\/tasks\/([^/]+)$/.exec(pathname)
  if (taskMatch) {
    const id = decodeURIComponent(taskMatch[1])
    if (method === 'GET') return ok(store.getTaskDetail(id))
    if (method === 'PATCH') return ok(await store.updateTask(id, body))
    if (method === 'DELETE') { await store.deleteTask(id, body); return { status: 204, headers: {}, body: null } }
  }
  const taskAction = /^\/kanban-api\/tasks\/([^/]+)\/(archive|restore|question|answer)$/.exec(pathname)
  if (taskAction && method === 'POST') {
    const id = decodeURIComponent(taskAction[1])
    if (taskAction[2] === 'archive') return ok(await store.archiveTask(id, body))
    if (taskAction[2] === 'restore') return ok(await store.restoreTask(id, body))
    if (taskAction[2] === 'question') return ok(await store.askQuestion(id, body))
    if (taskAction[2] === 'answer') return ok(await store.answerQuestion(id, body))
  }
  if (method === 'POST' && pathname === '/kanban-api/tasks') {
    return ok(await store.createTask(body), 201)
  }
  if (method === 'GET' && pathname === '/kanban-api/archived-tasks') {
    return ok({ tasks: store.listArchivedTasks(searchParams.get('projectId') ?? undefined) })
  }
  const commentMatch = /^\/kanban-api\/tasks\/([^/]+)\/comments$/.exec(pathname)
  if (commentMatch) {
    const id = decodeURIComponent(commentMatch[1])
    if (method === 'GET') return ok(store.getTaskDetail(id).comments)
    if (method === 'POST') return ok(await store.addComment(id, body.body), 201)
  }
  const commentDelete = /^\/kanban-api\/tasks\/([^/]+)\/comments\/([^/]+)$/.exec(pathname)
  if (commentDelete && method === 'DELETE') {
    await store.deleteComment(decodeURIComponent(commentDelete[1]), decodeURIComponent(commentDelete[2]))
    return { status: 204, headers: {}, body: null }
  }
  const attachmentMatch = /^\/kanban-api\/tasks\/([^/]+)\/attachments$/.exec(pathname)
  if (attachmentMatch) {
    const id = decodeURIComponent(attachmentMatch[1])
    if (method === 'GET') return ok(store.getTaskDetail(id).attachments)
    if (method === 'POST') return ok(await store.addAttachment(id, body), 201)
  }
  const attachmentDelete = /^\/kanban-api\/tasks\/([^/]+)\/attachments\/([^/]+)$/.exec(pathname)
  if (attachmentDelete && method === 'DELETE') {
    await store.deleteAttachment(decodeURIComponent(attachmentDelete[1]), decodeURIComponent(attachmentDelete[2]))
    return { status: 204, headers: {}, body: null }
  }
```

Implement every branch with the same `try/catch → toError` pattern. `GET /kanban-api/attachments/:id` is handled by the Node adapter because it streams bytes rather than returning JSON.

- [ ] **Step 4: Write `src/host/entry.js`**

```js
import { kanbanDomainSpec } from './domain.js'
import { KanbanStore } from './store.js'
import { createHttpHandler } from './http.js'

export const inject = ['webServer', 'storageDomain', 'attachments']

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(kanbanDomainSpec)
  ctx.effect(() => () => domain.close(), 'dsh-kanban: close domain')
  const store = new KanbanStore({
    tables: {
      projects: domain.table('projects'),
      tasks: domain.table('tasks'),
      comments: domain.table('comments'),
      attachments: domain.table('attachments'),
      activity: domain.table('task_activity'),
    },
    attachments: ctx.attachments,
  })
  ctx.provide('kanban', store)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/kanban-api',
    handler: createHttpHandler(store),
  }), 'dsh-kanban: HTTP route')
}
```

- [ ] **Step 5: Run all Host tests and build**

```bash
node --test src/host/__tests__ src/shared/__tests__
pnpm build
node --check index.js
```

Expected: all tests pass, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/host src/shared
git commit -m "feat: add complete kanban HTTP API and host entry"
```

---

### Task 10: Client API and store

**Files:**
- Create: `src/client/api.js`
- Create: `src/client/store-state.js`
- Test: `src/client/__tests__/store-state.test.js`

**Interfaces:**
- Produces: `createApi(base = '')` with `bootstrap`, project/task/comment/attachment methods
- Produces: pure `applyTaskPatch(tasks, taskId, patch)` and `groupTasks(tasks)`

- [ ] **Step 1: Write failing selector tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { groupTasks, applyTaskPatch } from '../store-state.js'

test('groupTasks maps tasks into four columns', () => {
  const tasks = [
    { id: 'a', column: 'backlog' },
    { id: 'b', column: 'running' },
    { id: 'c', column: 'needs' },
    { id: 'd', column: 'done' },
  ]
  const grouped = groupTasks(tasks)
  assert.deepEqual(grouped.backlog.map((task) => task.id), ['a'])
  assert.deepEqual(grouped.needs.map((task) => task.id), ['c'])
})

test('applyTaskPatch replaces one task by id', () => {
  const next = applyTaskPatch([{ id: 'a', title: 'old' }], 'a', { title: 'new' })
  assert.equal(next[0].title, 'new')
})
```

- [ ] **Step 2: Run and watch fail**

```bash
node --test src/client/__tests__/store-state.test.js
```

Expected: cannot find `../store-state.js`.

- [ ] **Step 3: Implement pure state helpers**

```js
export function groupTasks(tasks) {
  return {
    backlog: tasks.filter((task) => task.column === 'backlog'),
    running: tasks.filter((task) => task.column === 'running'),
    needs: tasks.filter((task) => task.column === 'needs'),
    done: tasks.filter((task) => task.column === 'done'),
  }
}

export function applyTaskPatch(tasks, taskId, patch) {
  return tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task)
}
```

- [ ] **Step 4: Implement `src/client/api.js`**

```js
async function request(path, options = {}) {
  const response = await fetch(`/kanban-api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  })
  const body = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? response.statusText)
    error.code = body?.error?.code
    error.details = body?.error?.details
    throw error
  }
  return body
}

export const api = {
  bootstrap: () => request('/bootstrap'),
  createProject: (body) => request('/projects', { method: 'POST', body: JSON.stringify(body) }),
  renameProject: (id, body) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveProject: (id) => request(`/projects/${id}/archive`, { method: 'POST', body: '{}' }),
  restoreProject: (id) => request(`/projects/${id}/restore`, { method: 'POST', body: '{}' }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  taskDetail: (id) => request(`/tasks/${id}`),
  archiveTask: (id, body) => request(`/tasks/${id}/archive`, { method: 'POST', body: JSON.stringify(body) }),
  restoreTask: (id, body) => request(`/tasks/${id}/restore`, { method: 'POST', body: JSON.stringify(body) }),
  deleteTask: (id, body) => request(`/tasks/${id}`, { method: 'DELETE', body: JSON.stringify(body) }),
  askQuestion: (id, body) => request(`/tasks/${id}/question`, { method: 'POST', body: JSON.stringify(body) }),
  answerQuestion: (id, body) => request(`/tasks/${id}/answer`, { method: 'POST', body: JSON.stringify(body) }),
  addComment: (id, body) => request(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteComment: (taskId, commentId) => request(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
  addAttachment: (id, body) => request(`/tasks/${id}/attachments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAttachment: (taskId, attachmentId) => request(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  archivedTasks: (projectId) => request(`/archived-tasks${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
}
```

- [ ] **Step 5: Run tests**

```bash
node --test src/client/__tests__/store-state.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/client/api.js src/client/store-state.js src/client/__tests__/store-state.test.js
git commit -m "feat: add client API and state helpers"
```

---

### Task 11: App shell, slots, and project switcher

**Files:**
- Create: `src/client/components/App.js`
- Create: `src/client/components/ProjectSwitcher.js`
- Create: `src/client/components/dialogs.js`
- Modify: `src/client/index.jsx`
- Modify: `src/client/styles.css`

**Interfaces:**
- `apply(ctx)` registers `main` key `kanban` and `sidebar.panellist` id `kanban`
- App receives `t` and owns bootstrap state
- ProjectSwitcher receives projects, selectedId, callbacks

- [ ] **Step 1: Register slots**

```jsx
import React from 'react'
import { App } from './components/App.js'

const NS = 'kanban'

const ZH = {
  nav: '看板',
  allProjects: '所有项目',
  createProject: '创建项目',
  manageProjects: '管理项目',
  archivedProjects: '已归档项目',
  archivedTasks: '已归档任务',
  search: '搜索标题 / 摘要 / 项目',
  filters: '筛选',
  runningCount: '{count} 个运行中',
  newCard: '新建卡片',
  backlog: 'Backlog',
  running: 'Running',
  needs: 'Needs you',
  done: 'Done',
}

const EN = {
  nav: 'Kanban',
  allProjects: 'All projects',
  createProject: 'Create project',
  manageProjects: 'Manage projects',
  archivedProjects: 'Archived projects',
  archivedTasks: 'Archived tasks',
  search: 'Search title / summary / project',
  filters: 'Filters',
  runningCount: '{count} running',
  newCard: 'New card',
  backlog: 'Backlog',
  running: 'Running',
  needs: 'Needs you',
  done: 'Done',
}

function SidebarIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2.2" y="2.5" width="3.3" height="13" rx="1.2" fill="currentColor" opacity=".38" />
    <rect x="7.35" y="2.5" width="3.3" height="13" rx="1.2" fill="currentColor" opacity=".66" />
    <rect x="12.5" y="2.5" width="3.3" height="13" rx="1.2" fill="currentColor" />
  </svg>
}

export function apply(ctx) {
  ctx.effect(() => {
    const offZh = ctx.locale.register(NS, 'zh', ZH)
    const offEn = ctx.locale.register(NS, 'en', EN)
    return () => { offZh(); offEn() }
  }, 'dsh-kanban: locale')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: 'kanban',
    locale: NS,
  }, App))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'kanban',
    order: 20,
    label: () => t('nav'),
  }, SidebarIcon))
}
```

- [ ] **Step 2: Implement the App shell**

Import the stylesheet as text in `src/client/components/App.js`:

```js
import styles from '../styles.css'
```

Render it once at the top of the App tree:

```jsx
<style>{styles}</style>
```

`App` must:

- call `api.bootstrap()` on mount
- hold `projects`, `tasks`, `selectedProjectId` (`'__all__'` by default)
- render header with project switcher, search, filters, running count, refresh
- render board via `groupTasks`
- open task drawer and dialogs

Use local state for now; Task 13 adds the drawer. The first version can render `null` board and an empty state until Task 12.

- [ ] **Step 3: Implement the project switcher**

Menu items:

- all projects
- active projects
- create project
- manage projects
- archived projects
- archived tasks

Use `useEffect` + document pointerdown for outside-click close. Use `role="menu"`, `aria-expanded`.

- [ ] **Step 4: Implement create/rename/archive dialogs**

Dialogs use `position: fixed`, focus the first input, handle Escape, and return focus to the trigger.

- [ ] **Step 5: Build and verify the slot registers**

```bash
pnpm build
node --check client.js
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/client
git commit -m "feat: add native kanban shell and project switcher"
```

---

### Task 12: Board, columns, and task cards

**Files:**
- Create: `src/client/components/Board.js`
- Create: `src/client/components/Column.js`
- Create: `src/client/components/TaskCard.js`
- Create: `src/client/components/icons.js`
- Modify: `src/client/components/App.js`
- Modify: `src/client/styles.css`

**Interfaces:**
- `Board({ tasks, collapsed, onToggleColumn, onOpenTask, onDropTask, onAddTask, t })`
- `Column({ id, title, tone, tasks, collapsed, ... })`
- `TaskCard({ task, t, onOpen, onFilterProject, onFilterPriority })`

- [ ] **Step 1: Render the four columns**

Use `groupTasks(tasks)` and a fixed metadata table:

```js
const COLUMNS = [
  { id: 'backlog', tone: 'backlog', labelKey: 'backlog' },
  { id: 'running', tone: 'running', labelKey: 'running' },
  { id: 'needs', tone: 'needs', labelKey: 'needs' },
  { id: 'done', tone: 'done', labelKey: 'done' },
]
```

- [ ] **Step 2: Render cards**

Card content:

- title
- description
- project chip (only when All projects)
- priority chip
- labels
- activity or blocked reason
- inline question block when `task.pendingQuestion` and no resolution
- footer: attention label + elapsed, comment/attachment/link counts
- archive/read-only indicator

- [ ] **Step 3: Implement drag and drop**

- `dataTransfer.setData('text/plain', task.id)`
- Reject drops into `needs` with a toast.
- Call `api.updateTask(task.id, { version, status, sortOrder })`.
- On failure, reload bootstrap and show error.

- [ ] **Step 4: Implement column collapse**

Store `collapsed` in `localStorage` under `dsh-kanban.collapsed-columns`. Render a 50px rail with icon, count, and vertical label when collapsed.

- [ ] **Step 5: Implement header search, filters, running count**

- Search across title, description, project name, labels.
- Filters: project, priority, label, assignee. Show active count.
- Running count from `tasks.filter(task => task.status === 'in_progress').length`.
- Refresh calls `api.bootstrap()`.

- [ ] **Step 6: Build and verify**

```bash
pnpm build
node --check client.js
```

- [ ] **Step 7: Commit**

```bash
git add src/client
git commit -m "feat: add four-column board and task cards"
```

---

### Task 13: Task drawer

**Files:**
- Create: `src/client/components/TaskDrawer.js`
- Create: `src/client/components/QuestionBlock.js`
- Modify: `src/client/components/App.js`
- Modify: `src/client/styles.css`

**Interfaces:**
- `TaskDrawer({ taskId, projects, onClose, onChanged, onArchived, t })`
- Loads `api.taskDetail(taskId)` on open
- All mutations call the API and update parent state

- [ ] **Step 1: Implement the drawer shell**

- fixed right panel, width `min(560px, 100vw)`
- overlay, focus trap, Escape close
- sections: properties, description, blocker, links, question, comments, attachments, activity
- archived mode disables inputs

- [ ] **Step 2: Implement property updates**

Status select, priority select, labels input, assignee select. Each change sends the current `version`, then updates local task.

- [ ] **Step 3: Implement blocker**

Input + "Set blocker" / "Clear blocker". Calls `updateTask` with `blockedReason`.

- [ ] **Step 4: Implement question and approval**

- "Request input" form with prompt, note, up to 5 options.
- Calls `api.askQuestion`.
- If `pendingQuestion`, render options, note, Reject/Approve.
- Calls `api.answerQuestion`.
- Generic `in_review` shows Confirm/Return.

- [ ] **Step 5: Implement comments and links**

- Comment list + input + delete.
- Link list + label/url + add/remove.
- Update the task via `updateTask` for links.

- [ ] **Step 6: Implement attachments**

- `<input type="file">`, read as base64, POST.
- Show filename, size, download link, delete.
- Download link points to `/kanban-api/attachments/:id`.
- Show upload progress and errors.

- [ ] **Step 7: Implement activity**

Render `activity` in reverse chronological order with field changes.

- [ ] **Step 8: Build and commit**

```bash
pnpm build
node --check client.js
git add src/client
git commit -m "feat: add task drawer with comments attachments and approvals"
```

---

### Task 14: Archived tasks, read-only mode, and styling polish

**Files:**
- Modify: `src/client/components/App.js`
- Modify: `src/client/components/ProjectSwitcher.js`
- Modify: `src/client/components/Board.js`
- Modify: `src/client/components/TaskDrawer.js`
- Modify: `src/client/styles.css`
- Modify: `locale/en.json`
- Modify: `locale/zh.json`
- Modify: `icon.svg` if needed

**Interfaces:**
- Archived tasks modal lists archived tasks grouped by project
- Archived project board shows a read-only banner with Restore

- [ ] **Step 1: Implement archived tasks modal**

- entry from project switcher
- fetch `api.archivedTasks(projectId)` for current project or all
- restore/delete actions
- empty state

- [ ] **Step 2: Implement archived project read-only mode**

- when selected project has `archivedAt`, show banner
- disable create, drag, drawer mutations, comments, attachments
- Restore button calls API and refreshes

- [ ] **Step 3: Style against the screenshot**

Use tokens only:

- page background `--dsw-alias-bg-base`
- columns with `color-mix` tints for backlog/running/needs/done
- cards `--dsw-alias-bg-layer-1`
- borders `--dsw-alias-border-l1/l2`
- needs/warn `--dsw-alias-state-warn-primary`
- running `--dsw-alias-brand-primary`
- done `--dsw-alias-state-success-primary`
- error `--dsw-alias-state-error-primary`
- modal mask `--dsw-alias-bg-mask-1` + `--dsw-mask-blur`
- shadows `--dsw-shadow-lv1/lv2/lv3`

Match the screenshot's spacing, card radius, badges, question block, and footer metrics.

- [ ] **Step 4: Update locale metadata**

`locale/zh.json`:

```json
{
  "meta": {
    "title": "DSH 看板",
    "description": "原生任务看板：项目、任务、审批、附件和活动记录。"
  }
}
```

`locale/en.json`:

```json
{
  "meta": {
    "title": "DSH Kanban",
    "description": "Native task board with projects, tasks, approvals, attachments and activity."
  }
}
```

- [ ] **Step 5: Build and commit**

```bash
pnpm build
node --check client.js
git add src/client locale icon.svg
git commit -m "feat: add archive flows and screenshot-aligned styling"
```

---

### Task 15: Build, install, and live verification

**Files:**
- Modify: `package.json` if build outputs need `files` adjustments
- Verify: `index.js`, `client.js`, `cordis.patch.yml`, `locale/*.json`, `icon.svg`

- [ ] **Step 1: Run all checks**

```bash
pnpm check
```

Expected: build exits 0; all tests pass.

- [ ] **Step 2: Install the bundle**

Use the plugin manager with the absolute package directory:

```text
plugin_manager install_bundle /Users/silas/Documents/deepseek-harness/default-workspace/dsh-kanban
```

Expected: `application: applied`, no warnings.

- [ ] **Step 3: Confirm slots**

Query the Client `Slots` provider for `main` and `sidebar.panellist`.

Expected:

- `main` has an active `kanban` occupant
- `sidebar.panellist` has an active `kanban` entry
- no slot crash

- [ ] **Step 4: Verify the live operation path**

In the DSH page:

1. Open Kanban from the sidebar.
2. Create a project.
3. Create a task.
4. Drag Backlog → Running → Done.
5. Set a blocker; confirm Needs you and the timer.
6. Ask a question; Approve it; confirm Done.
7. Add a comment and an attachment; download the attachment.
8. Archive and restore a task.
9. Archive and restore a project.
10. Refresh the page; confirm persistence.
11. Toggle light/dark theme.

- [ ] **Step 5: Record evidence and limitations**

Report:

- exact test command output
- build output
- install result
- slot status
- each live operation result
- any visual differences from the screenshot
- the fact that browser screenshot control is unavailable, so the user performs final visual acceptance

- [ ] **Step 6: Commit final artifacts**

```bash
git add index.js client.js package.json cordis.patch.yml locale icon.svg
git commit -m "chore: build and verify kanban plugin"
```

---

## Execution Handoff

After this plan is saved, choose one:

1. **Subagent-Driven (recommended)** — one fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Both paths use TDD and commit after each task.
