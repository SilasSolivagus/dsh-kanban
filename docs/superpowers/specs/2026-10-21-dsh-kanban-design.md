# DSH Kanban Design

- Status: Draft for user review
- Date: 2026-10-21
- Upstream reference: <https://github.com/chuspeeism/dashi-taskboard>
- Delivery: native DeepSeek Harness plugin, no iframe

## 1. Summary

DSH Kanban is a native task board for DeepSeek Harness. It borrows the
project/task model and operating principles of `dashi-taskboard`, while using
the final four-column interface agreed with the user:

```text
Backlog | Running | Needs you | Done
```

The board is backed by a Host plugin and DSH `storageDomain`; the Client is a
native React page registered in the Harness main column. No separate Node
process, SQLite database, or iframe is used.

The four columns are a view over a smaller stored workflow. Blocking and
waiting-for-input are attention overlays, not duplicate workflow states, so a
task never loses its underlying stage when it needs human attention.

## 2. Locked Decisions

1. Delivery is a native DSH plugin with Host persistence.
2. Persistence uses `storageDomain`, not SQLite and not localStorage.
3. Client-to-Host communication uses a same-origin `/kanban-api` HTTP route.
4. `Needs you` is an automatic attention queue. It cannot be selected by drag.
5. Project archive is read-only and restorable. This is an extension over
   upstream, which only supports deleting empty projects.
6. First release is the usable core: projects, four-column board, tasks,
   task detail, comments, attachments, external links, activity, approval.
7. Upstream Dashboard, Gantt, list view, Jira, Cloud, AI Chat, task relations,
   DSH session binding, and agent tools are out of scope for v1.

## 3. Product Model

### 3.1 Hierarchy

```text
All projects
└─ Project
   └─ Task
      ├─ Comments
      ├─ Attachments
      ├─ External links
      └─ Activity
```

A project is a first-class grouping and lifecycle container. A task belongs to
exactly one project. A board is a view over tasks; it is not a child object of
a project.

### 3.2 Views

v1 has one primary view: the board. The project switcher chooses between all
projects and one project. There is no separate list, dashboard, or Gantt view.

### 3.3 Attention

Attention is derived, never stored as a column. A task needs human attention
when it has an unresolved question, a blocker, or is waiting for review.

## 4. Architecture

### 4.1 Runtime Shape

```text
DSH Web UI
└─ Kanban page (React)
      │ fetch /kanban-api
      ▼
DSH Host
└─ Kanban Host plugin
   ├─ KanbanService
   ├─ storageDomain
   └─ webServer route
```

### 4.2 Module Boundaries

```text
dsh-kanban/
├─ package.json
├─ cordis.patch.yml
├─ index.js                     generated Host bundle
├─ client.js                    generated Client bundle
├─ src/
│  ├─ shared/
│  │  ├─ statuses.js            statuses, column mapping, labels
│  │  ├─ rules.js               attention, archive, identifier rules
│  │  └─ __tests__/
│  ├─ host/
│  │  ├─ entry.js               apply(), dependency injection
│  │  ├─ domain.js              storageDomain spec and zod schemas
│  │  ├─ service.js             KanbanService, all mutations
│  │  ├─ http.js                /kanban-api router
│  │  ├─ attachments.js         DSH attachment adapter
│  │  └─ __tests__/
│  └─ client/
│     ├─ entry.js               __ModuleLoader__.load handoff
│     ├─ api.js                 fetch wrapper
│     ├─ store.js               snapshot, optimistic updates, errors
│     ├─ components/
│     │  ├─ App.js
│     │  ├─ Board.js
│     │  ├─ Column.js
│     │  ├─ TaskCard.js
│     │  ├─ ProjectSwitcher.js
│     │  ├─ TaskDrawer.js
│     │  ├─ dialogs.js
│     │  └─ icons.js
│     └─ styles.css
├─ scripts/
│  └─ build.mjs                 esbuild Host + Client bundles
└─ docs/
   ├─ superpowers/specs/
   └─ superpowers/plans/
```

### 4.3 Host Responsibilities

- Open and close the `storageDomain` domain.
- Validate every write.
- Serialize writes through one operation queue.
- Generate project IDs, task prefixes, task identifiers, and timestamps.
- Maintain `version` and reject stale task updates.
- Enforce archived-project read-only behavior.
- Store attachment metadata and delegate bytes to DSH attachments.
- Serve `/kanban-api` with JSON envelopes and no-store caching.

### 4.4 Client Responsibilities

- Register the `kanban` main panel and sidebar icon.
- Render the project switcher, board, cards, drawer, and dialogs.
- Keep a client snapshot and apply optimistic updates.
- Call the API through `src/client/api.js`.
- Roll back optimistic changes on failure.
- Use DSH theme tokens and locale dictionaries.
- Persist only UI preferences in localStorage: collapsed columns.

### 4.5 Build

- Host: esbuild, Node platform, ESM, external `@deepseek-ai/*` packages.
- Client: esbuild, browser platform, IIFE, external `react`.
- JSX uses `React.createElement` (classic transform), so no
  `react/jsx-runtime` dependency is required.
- CSS is imported as text and rendered as a component-local `<style>`.
- `zod` is bundled into the Host artifact because it is used by the domain
  schemas.
- Generated `index.js` and `client.js` are committed. Installing the bundle
  never runs a build.

## 5. Data Model

Domain name: `dsh-kanban`. Domain version: `1`.

Tables:

```text
projects
tasks
comments
attachments
task_activity
```

All stored timestamps are ISO-8601 UTC strings. All record validation happens
at the durable boundary with zod. A single in-process operation queue
serializes mutations.

### 5.1 Project

```text
id              string, lowercase slug, immutable
name            string, 1..120
workspacePath   string | null
taskPrefix      string, uppercase A-Z0-9, 2..6, unique
labels          string[], at most 50, each 1..64
nextTaskNumber  integer >= 1
archivedAt      string | null
createdAt       string
updatedAt       string
```

Project creation:

- Client sends `name` and optional `workspacePath`.
- Host generates `id` from the name, appending `-2`, `-3`, ... on collision.
- Host generates a unique `taskPrefix` from the name; collisions append a
  digit.
- A new project is selected by the client after creation.

Project lifecycle:

- Rename changes `name` only. `id` and `taskPrefix` never change.
- Archive sets `archivedAt`. Archived projects are read-only.
- Restore clears `archivedAt`.
- Delete is allowed only when the project has no tasks at all, including
  archived tasks.
- Archived projects remain visible in the archived-projects list.

### 5.2 Task

```text
id                string, UUID
identifier        string, e.g. DSH-12, unique
projectId         string
title             string, 1..240
description       string, 0..100000
status            stored workflow status
priority          none | low | medium | high | urgent
labels            string[], at most 20, each 1..64
assignee          Actor
sortOrder         finite number
statusSince       string
blockedReason     string | null, max 2000
blockedSince      string | null
pendingQuestion   PendingQuestion | null
questionResolution QuestionResolution | null
links             ExternalLink[], at most 50
archivedAt        string | null
version           integer >= 1
createdAt         string
updatedAt         string
```

Stored workflow statuses:

```text
backlog
todo
in_progress
in_review
done
canceled
```

`blocked` is intentionally not a stored status in v1. Blocking is represented by
`blockedReason` and `blockedSince`, so a task keeps its underlying stage. This
is a deliberate improvement over upstream: clearing a blocker returns the task
to its existing column without a separate "previous status" field.

`Actor`:

```text
{
  type: "user" | "agent",
  id: string,
  name: string,
  avatarUrl: string | null
}
```

v1 uses one local user identity. The shape is kept so agent-authored comments
and activity can be added later without migration.

`PendingQuestion`:

```text
{
  prompt: string, 1..2000,
  note: string, 0..2000,
  options: Array<{ id, label, detail }>, 2..5,
  selected: string | null,
  createdAt: string
}
```

`QuestionResolution`:

```text
{
  decision: "approve" | "reject",
  optionId: string | null,
  optionLabel: string | null,
  note: string,
  at: string
}
```

`ExternalLink`:

```text
{
  id: string,
  label: string, 1..120,
  url: string, http(s) only
}
```

Task creation:

- Host computes the next identifier from `taskPrefix` and
  `max(project.nextTaskNumber, maxExistingTaskNumber + 1)`.
- Host writes the task, then updates `nextTaskNumber` to the chosen number + 1.
- If the process stops between the two writes, the next creation recomputes
  from the existing maximum and does not duplicate an identifier.
- `sortOrder` defaults to `min(sortOrder in column) - 1000`, so new tasks appear
  at the top; if the column is empty it starts at `1000`.
- `statusSince` is set at creation.

### 5.3 Comment

```text
id          string, UUID
taskId      string
body        string, 1..10000
author      Actor
createdAt   string
updatedAt   string
```

v1 supports adding and deleting comments. Editing is deferred.

### 5.4 Attachment

```text
id            string, UUID
taskId        string
filename      string, 1..255
contentType   string, 1..200
size          integer >= 0
storageRef    { attachmentId, name, bytes }
createdAt     string
```

Bytes are stored through `ctx.attachments.admitEncodedFile()`.
The domain stores only metadata and the durable reference. Download streams
bytes through `readFileStream`.

Limits:

- 20 MiB per file.
- 50 attachments per task.
- Any content type accepted byte-for-byte.
- Upload to an archived project or archived task is rejected.

### 5.5 TaskActivity

```text
id          string, UUID
taskId      string
actor       Actor
changes     Array<{ field, before, after }>
createdAt   string
```

Activity is append-only and generated by the service. It records:

- task created
- status, priority, assignee, labels, or title changes
- blocker set or cleared
- question created or resolved
- task archived or restored
- attachment added or removed

Comments do not generate activity records; they are their own timeline.

### 5.6 Derived Task Summary

The bootstrap response includes derived fields that are not stored:

```text
attentionReason   "question" | "blocked" | "review" | null
commentCount      integer
attachmentCount   integer
linkCount         integer
```

## 6. Status and Attention

### 6.1 Display Columns

```text
Backlog     status in [backlog, todo], no attention
Running     status = in_progress, no attention
Needs you   attentionReason != null
Done        status = done, no attention
```

`canceled` and archived tasks do not appear in the four main columns.

### 6.2 Attention Derivation

```text
attentionReason(task):
  if task.archivedAt != null: return null
  if task.pendingQuestion != null and task.questionResolution == null:
    return "question"
  if task.blockedReason != null:
    return "blocked"
  if task.status == "in_review":
    return "review"
  return null
```

Order is intentional: a question outranks a blocker, because the question is
the thing the user must answer first.

Timers:

- question: elapsed since `pendingQuestion.createdAt`
- blocked: elapsed since `blockedSince`
- review: elapsed since `statusSince`
- running: elapsed since `statusSince`
- done: elapsed since `statusSince`

Card footer labels:

```text
question -> "Needs you"
blocked  -> "Blocked"
review   -> "Needs you"
running  -> "Running"
done     -> "Done"
backlog  -> "Backlog"
todo     -> "Backlog · 待认领"
```

### 6.3 Drag Rules

- Dragging between Backlog, Running, and Done changes `status`.
- Dragging inside a column changes `sortOrder` only.
- Dropping into Needs you is rejected with a toast.
- A task with attention cannot be dragged out of Needs you. The user must
  answer the question, clear the blocker, or complete review first.
- A task with `pendingQuestion` cannot be moved to Done by drag; use Approve.
- A task with `blockedReason` cannot be moved to Done by drag; clear the blocker
  first.
- `PATCH status = done` is rejected with `409 TASK_NEEDS_ATTENTION` while an
  unresolved question or a blocker exists. Done is reached through Approve or
  after clearing the blocker.
- Keyboard alternative: the task drawer has a "Move to" select that follows the
  same rules.

### 6.4 Review and Questions

- Setting `status = in_review` puts a task in Needs you with reason `review`.
- "Request input" creates `pendingQuestion`; it does not change `status`.
- A question can coexist with any workflow status.
- Approve:
  - resolves a pending question when present,
  - otherwise records a generic review resolution,
  - sets `status = done`,
  - sets `statusSince`.
- Reject:
  - resolves a pending question when present,
  - otherwise records a generic review rejection,
  - sets `status = backlog`,
  - sets `statusSince`.
- Resolution keeps the original `pendingQuestion` for history; attention is
  cleared because `questionResolution` is non-null.

### 6.5 Blocking

- Setting `blockedReason` also sets `blockedSince` if it was previously empty.
- It does not change `status`.
- Clearing `blockedReason` clears `blockedSince`.
- The task returns to the column matching its unchanged status.
- Blocking an archived task is rejected.

### 6.6 Todo Inside Backlog

- `todo` means "waiting for claim".
- It appears in the Backlog column with a small `待认领` marker.
- The task drawer has "标记为待认领" and "移回待立项".
- Dropping a task into Backlog sets `backlog`, not `todo`.

### 6.7 Archive

Task archive:

- sets `archivedAt`,
- removes the task from the board,
- keeps comments, attachments, and activity,
- can be restored,
- permanent delete is allowed only for archived tasks.

Project archive:

- sets project `archivedAt`,
- hides the project from the active project switcher,
- makes the project board and all task operations read-only,
- keeps all data,
- can be restored.

Project delete:

- allowed only for an empty project,
- returns `409 PROJECT_NOT_EMPTY` with a task count when non-empty,
- deletes the project record and its labels only.

## 7. HTTP API

Base path: `/kanban-api`.

Conventions:

- JSON requests and responses.
- `Cache-Control: no-store`.
- Success returns the affected DTO.
- Errors use:

```json
{
  "error": {
    "code": "TASK_VERSION_CONFLICT",
    "message": "The task changed elsewhere.",
    "details": {}
  }
}
```

- Task mutations require the current `version`.
- Project mutations do not require a version because they are serialized and
  single-user.
- Actor is the local user in v1.

### 7.1 Bootstrap

```http
GET /kanban-api/bootstrap
```

Response:

```json
{
  "projects": [ProjectSummary],
  "tasks": [TaskSummary]
}
```

`ProjectSummary` adds `taskCount` to the project record. `taskCount` counts
non-archived tasks in that project. `TaskSummary` is the task record plus
`attentionReason`, `commentCount`, `attachmentCount`, and `linkCount`.
Archived tasks are excluded.

### 7.2 Projects

```http
POST   /kanban-api/projects
PATCH  /kanban-api/projects/:id
POST   /kanban-api/projects/:id/archive
POST   /kanban-api/projects/:id/restore
DELETE /kanban-api/projects/:id
```

Create body:

```json
{ "name": "DSH 看板", "workspacePath": null }
```

Patch body:

```json
{ "name": "DSH Kanban" }
```

Archive/restore have empty bodies and are idempotent.

### 7.3 Tasks

```http
POST   /kanban-api/tasks
PATCH  /kanban-api/tasks/:id
GET    /kanban-api/tasks/:id
POST   /kanban-api/tasks/:id/archive
POST   /kanban-api/tasks/:id/restore
DELETE /kanban-api/tasks/:id
POST   /kanban-api/tasks/:id/question
POST   /kanban-api/tasks/:id/answer
GET    /kanban-api/archived-tasks?projectId=...
```

Create body:

```json
{
  "projectId": "dsh-kanban",
  "title": "为卡片增加按项目筛选",
  "description": "",
  "status": "backlog",
  "priority": "medium",
  "labels": [],
  "assigneeTarget": "current-user"
}
```

Patch body:

```json
{
  "version": 3,
  "status": "in_progress",
  "priority": "high",
  "labels": ["feature"],
  "blockedReason": null,
  "links": [],
  "sortOrder": 1500
}
```

Only supplied fields change. `blockedReason: null` clears blocking.
`status: "in_review"` requests review.
`status` must be one of the six stored statuses.
`status: "done"` is rejected with `409 TASK_NEEDS_ATTENTION` while an
unresolved question or a blocker exists.

`GET /kanban-api/archived-tasks?projectId=...` returns
`{ "tasks": [TaskSummary] }`. Without `projectId`, it returns archived tasks
across all projects. Archived project tasks are included in this read-only
listing.

Task detail response:

```json
{
  "task": { "...": "..." },
  "comments": [],
  "attachments": [],
  "activity": []
}
```

Archive/restore bodies:

```json
{ "version": 4 }
```

Permanent delete requires the task to be archived and includes `version`.

Question body:

```json
{
  "version": 4,
  "prompt": "默认看板采用哪个名称？",
  "note": "首次启动时写入。",
  "options": [
    { "id": "dsh", "label": "DSH 看板", "detail": "与插件名一致，推荐" },
    { "id": "mine", "label": "我的看板", "detail": "更个人化的命名" }
  ]
}
```

Answer body:

```json
{
  "version": 5,
  "decision": "approve",
  "selected": "dsh",
  "note": "就这样"
}
```

`selected` is required when a pending question exists. It is optional for
generic review.

### 7.4 Comments

```http
GET    /kanban-api/tasks/:id/comments
POST   /kanban-api/tasks/:id/comments
DELETE /kanban-api/tasks/:taskId/comments/:commentId
```

Create body:

```json
{ "body": "同源校验还要覆盖桌面端。" }
```

### 7.5 Attachments

```http
GET    /kanban-api/tasks/:id/attachments
POST   /kanban-api/tasks/:id/attachments
GET    /kanban-api/attachments/:id
DELETE /kanban-api/attachments/:id
```

Upload body:

```json
{
  "filename": "sse-notes.md",
  "contentType": "text/markdown",
  "data": "base64..."
}
```

`data` is canonical base64. The Host rejects invalid base64, empty filenames,
files over 20 MiB, and more than 50 attachments per task.

Download:

- `Content-Type` from the attachment metadata.
- `Content-Disposition: attachment; filename="..."`.
- Bytes streamed from `readFileStream`.
- No cache.

### 7.6 Activity

```http
GET /kanban-api/tasks/:id/activity
```

Read-only.

### 7.7 Error Codes

```text
INVALID_BODY
INVALID_FIELD
INVALID_PROJECT_ID
PROJECT_NOT_FOUND
PROJECT_EXISTS
PROJECT_ARCHIVED
PROJECT_NOT_EMPTY
TASK_NOT_FOUND
TASK_ARCHIVED
TASK_VERSION_CONFLICT
TASK_NOT_ARCHIVED
TASK_NOT_IN_REVIEW
TASK_NEEDS_ATTENTION
QUESTION_ALREADY_PENDING
QUESTION_NOT_PENDING
ATTACHMENT_TOO_LARGE
ATTACHMENT_LIMIT_REACHED
INVALID_ATTACHMENT
NOT_FOUND
INTERNAL_ERROR
```

HTTP status mapping:

```text
400 INVALID_*
404 NOT_FOUND
409 version/state conflicts
413 ATTACHMENT_TOO_LARGE
403 archived project
500 INTERNAL_ERROR
```

## 8. UI

### 8.1 Layout

```text
┌────────────────────────────────────────────────────────────┐
│ [所有项目 ▾] [搜索…] [Filters]        1 running   ↻        │
├────────────────────────────────────────────────────────────┤
│ Backlog (n)   Running (n)   Needs you (n)   Done (n)       │
│ [Card]        [Card]        [Card]          [Card]          │
│ ...           ...           ...             ...             │
│ + New card    + New card    + New card      + New card      │
└────────────────────────────────────────────────────────────┘
```

The only addition versus the supplied screenshot is the project switcher to the
left of search. It is required for project creation, switching, and archive.

### 8.2 Project Switcher

Menu:

```text
所有项目
────────────
✓ dsh-kanban
  其他项目
────────────
+ 创建项目
⚙ 管理项目
🗄 已归档项目
📦 已归档任务
```

- Default is All projects.
- Selecting a project filters the board.
- Creating a project selects it.
- Manage projects opens a dialog with active and archived lists.
- Archived projects open a read-only board with a restore banner.
- Archived tasks opens a modal grouped by project, with restore/delete actions.

### 8.3 Board

- Four fixed columns.
- Column header: status icon, label, count, collapse chevron, add button.
- Collapsed state is stored in localStorage.
- Column footer: `+ New card`.
- Empty column: drop hint.
- Active drag target: tinted column border.
- Search: title, description, labels, project name.
- Filters: project, priority, label, assignee. Active filter count on button.
- Running count: number of `in_progress` tasks.
- Refresh button: fetch bootstrap. Window focus triggers a quiet refresh.
- No polling and no SSE in v1.

### 8.4 Task Card

```text
Title
Description
Project chip · priority · labels
Current activity / block reason
[question block]
Status · timer        attachments comments links
```

- Project chip filters by project.
- Priority chip filters by priority.
- Counts are buttons that open the drawer at that section.
- Title and chevron open the drawer.
- Question block shows options, note, Reject, Approve.
- Generic review cards show Confirm / Return.
- Blocked cards show the block reason and cannot be dragged out.
- Cards from archived projects are read-only.

### 8.5 Task Drawer

Right-side drawer, width min(560px, 100vw), overlay with focus trap.

Sections:

1. Header: identifier, project, title, close, overflow menu.
2. Properties: status, priority, labels, assignee.
3. Description.
4. Blocker: reason input, set/clear.
5. External links: add/remove/open.
6. Question: request input, options preview, resolution.
7. Comments: list, add, delete.
8. Attachments: list, upload, download, delete.
9. Activity: read-only timeline.
10. Footer actions: archive, restore, permanent delete when archived.

Behavior:

- Property changes PATCH immediately.
- Failed mutations roll back and show a toast.
- Version conflict triggers bootstrap refresh and an explanatory toast.
- Esc closes; focus returns to the trigger.
- Archived project/task disables all mutation controls.

### 8.6 Dialogs

- Create project: name, optional workspace path.
- Rename project: name.
- Archive project: confirmation.
- Delete project: empty-only; error includes task count.
- Create task: project, title, description, status, priority, labels, assignee.
- Archived tasks: grouped list with restore/delete.
- Attachment upload progress is shown inline in the drawer.

### 8.7 Empty, Loading, Error

- First load: board skeleton.
- Initial API failure: full-page error with retry.
- Later API failure: top error bar, keep current data.
- No projects: "创建第一个项目".
- No tasks: "创建第一张任务".
- No search/filter results: "没有匹配的任务" with clear action.
- Archived project: read-only banner with restore.

### 8.8 Shortcuts and Accessibility

- `Cmd/Ctrl+K`: focus search.
- `Esc`: close drawer, dialog, filter menu, or clear search focus.
- Dialogs trap focus and restore it on close.
- Drag targets have keyboard alternatives through the drawer "Move to" control.
- All icon-only buttons have `aria-label`.
- Colors use only `--dsw-alias-*` theme tokens.
- Light and dark themes are both supported.
- Font sizes and spacing follow the host UI conventions.

## 9. Persistence and Consistency

- All writes go through `KanbanService`, never directly through HTTP handlers.
- The service serializes writes through a promise queue.
- Task updates check `version` before writing and increment it after success.
- Project archive and task archive are checked on every mutation.
- Attachment metadata is written only after the byte store succeeds.
- On attachment metadata write failure, the service attempts to leave the
  attachment reference unreferenced; no domain record is created.
- On task delete, comment, attachment metadata, and activity records are
  deleted with the task.
- On project delete, all domain rows for that project must already be absent.
- No partial task mutations: build the next record, validate it, then write.
- The service never mutates an archived project or archived task.

## 10. Testing and Verification

TDD applies to the Host and shared rules.

### 10.1 Shared Rule Tests

- `attentionReason` order: question > blocked > review > null.
- Column mapping for all six stored statuses.
- `todo` appears in Backlog with the marker.
- Drag legality: normal columns allowed, Needs you rejected, attention tasks
  cannot leave Needs you.
- Project archive read-only.
- Project delete empty-only.
- Identifier generation, collision handling, and gap recovery.
- Blocker set/clear timestamps.

### 10.2 Host Service Tests

- Project create, rename, archive, restore, delete.
- Task create, patch, archive, restore, permanent delete.
- Version conflict.
- Question create and answer.
- Comment add/delete.
- Attachment metadata lifecycle with a fake attachment adapter.
- Activity records for each mutation.
- Archived project mutation rejection.

### 10.3 HTTP Tests

- Bootstrap shape.
- Each endpoint's success and error envelope.
- Unknown fields and invalid types.
- 404/409/413 mappings.
- No-store header.
- Attachment streaming headers.

### 10.4 Client Tests

- Pure selectors: filtering, grouping, counts, attention labels, timers.
- Optimistic update rollback on failure.
- Version conflict triggers refresh.
- Archived read-only mode disables controls.

### 10.5 Live Verification

- Install the bundle in the current profile.
- Confirm the `kanban` main panel and sidebar entry are active.
- Create a project and a task.
- Drag across columns.
- Set a blocker; verify Needs you and the timer.
- Ask a question; approve and reject.
- Add a comment and a file attachment; download it.
- Archive and restore a task; archive and restore a project.
- Refresh the page; verify persistence.
- Verify light and dark themes.
- Confirm no slot crash in the browser console.

Because this environment has no browser screenshot control, visual acceptance is
performed by the user in the live DSH page.

## 11. Acceptance Criteria

A release is acceptable when:

1. Projects can be created, renamed, archived, restored, and empty-deleted.
2. The project switcher supports All projects and one project.
3. Tasks can be created, edited, dragged, archived, restored, and deleted.
4. The four columns correctly reflect the six stored statuses and attention.
5. Needs you is automatic and cannot be faked by drag.
6. Approve and Reject work for questions and generic reviews.
7. Blocking a task is reversible and preserves its underlying stage.
8. Comments, attachments, links, and activity are real and persistent.
9. Archived projects and tasks are read-only.
10. Refreshing the page preserves all data.
11. Version conflicts are handled without silent data loss.
12. The UI uses DSH theme tokens and works in light and dark themes.
13. The plugin installs and registers both the main panel and sidebar entry.
14. The user has visually accepted the final board.

## 12. Out of Scope and Future Work

Out of scope for v1:

- task relations (parent/blocks/related)
- DSH session binding
- agent tools / CLI
- list, dashboard, and Gantt views
- SSE or WebSocket real-time updates
- comment attachments and inline images
- Jira sync
- cloud collaboration
- multi-user identity and permissions
- project colors or descriptions
- customizable workflow columns

Future work can add these without changing the core project/task ownership
model. The `Actor` shape and attachment references are already forward
compatible.
