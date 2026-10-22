# DSH Kanban — Usage Guide

This is the English operations guide for [DSH Kanban](../README.md). It covers projects, tasks, the four-column board, approvals, the task drawer, attachments, archive flows, limits and the HTTP API.

## 1. Open the board

Refresh DSH, then click **Kanban** in the left sidebar.

With no projects yet, the board shows an empty state. Click **Create project** to start.

The header contains:

| Area | Purpose |
| --- | --- |
| Project menu | Switch projects, all projects, create/manage/archived projects, archived tasks |
| Search | Search title, description, project name and labels |
| Filters | Filter by project, priority, label or assignee |
| Running count | Tasks with `in_progress` in the current view |
| Refresh | Re-read data from the Host |

## 2. Projects

### Create a project

1. Open the project menu.
2. Click **Create project**.
3. Enter a **Project name** (required, 1–120 characters).
4. Optionally set a **Workspace path** (≤4096 characters).
5. Click **Create**.

The new project is selected automatically.

### Switch projects

- **All projects** shows tasks from every active project.
- A single project shows only that project's tasks.
- **Archived projects** in the project menu opens archived projects; selecting one opens a read-only board.
- **Manage projects** handles rename, archive, restore and delete.

### Archive a project

Project menu → **Manage projects** → **Archive**.

- The project moves to **Archived projects**.
- Its tasks are preserved.
- The board is read-only: no create, drag, edit, comment or upload.
- A read-only banner shows **Restore project**.

### Delete a project

Only empty projects can be deleted. If tasks remain, the dialog shows the task count; archive and permanently delete those tasks first.

## 3. Create a task

Each column footer has **+ New card**. The creation dialog contains:

| Field | Notes |
| --- | --- |
| Project | Required; must be chosen in All projects |
| Title | Required, 1–240 characters |
| Description | Optional, ≤100,000 characters |
| Status | Defaults from the column you clicked |
| Priority | None / Low / Medium / High / Urgent |
| Labels | Comma-separated; ≤20 per task |
| Assignee | Current user only in v2 |

Column defaults:

| Column | Status |
| --- | --- |
| Backlog | `backlog` |
| Running | `in_progress` |
| Needs you | `in_review` |
| Done | `done` |

`canceled` is a stored Host status but is intentionally not offered in the UI, so a task cannot disappear from the four-column board.

## 4. Columns and drag rules

| Column | Meaning |
| --- | --- |
| **Backlog** | `backlog` (not started) or `todo` (waiting to be claimed) |
| **Running** | `in_progress` |
| **Needs you** | Derived: unanswered question, blocker or review |
| **Done** | `done` |

Drag behavior:

- You can drag between Backlog, Running and Done.
- You cannot drop a card directly into **Needs you**; it is derived.
- A card in **Needs you** cannot leave until its question/blocker/review is resolved.
- A card in **Needs you** cannot move directly to Done.
- Reordering inside Backlog keeps the underlying `backlog` / `todo` status.
- Dropping on a card inserts before it; dropping on empty column space appends.
- Rejected drops show a toast. Version conflicts reload the board.

### Collapse columns

Use the chevron in the column header. The collapsed state is stored in browser localStorage under `dsh-kanban.collapsed-columns`.

## 5. Needs you and approvals

A task enters **Needs you** when any of these is true:

1. It has a pending question (no `questionResolution`).
2. It has a blocker (`blockedReason`).
3. It is `in_review` with no other attention.

Precedence: **question → blocker → review**.

### Answer a question

In the card:

1. Select one option.
2. Optionally add a note.
3. Click **Approve** or **Reject**.

| Decision | Result |
| --- | --- |
| Approve | `done` |
| Reject | `backlog` |

If the task is blocked, Approve is rejected with `TASK_NEEDS_ATTENTION`. Clear the blocker first.

### Request input

In the task drawer → **Question & requests**:

1. Enter a prompt.
2. Optionally add a note.
3. Fill 2–5 options; add or remove rows as needed.
4. Click **Request input**.

The task enters Needs you. Asking a question on a Done task reopens it as `in_review`, so Done never carries unresolved attention.

### Review tasks

A task that is `in_review` without a pending question shows **Confirm / Return**:

- **Confirm** → `done`
- **Return** → `backlog`

### Blockers

In the drawer → **Blocker**:

1. Enter the reason.
2. Click **Set blocker**.
3. The card moves to Needs you and shows the reason.
4. Click **Clear blocker** when resolved.

## 6. Task drawer

Click a card title, the chevron, or the comment/attachment/link count to open the right-side drawer.

![Task drawer](assets/kanban-drawer.png)

Sections:

- **Properties:** status, priority, labels, assignee, elapsed time
- **Description:** read-only until **Edit description**; save or cancel
- **Blocker:** set/clear a blocker
- **Links:** label + http(s) URL; add/remove
- **Question & requests:** request input, answer pending questions, review actions
- **Comments:** add and delete
- **Attachments:** upload, list, download, delete
- **Activity:** reverse-chronological field changes
- **Actions:** archive, restore, permanently delete (archived only)

All mutations send the current `version`. On `TASK_VERSION_CONFLICT`, the drawer reloads the latest detail and shows a message.

## 7. Comments, attachments, links and activity

| Type | Location | Notes |
| --- | --- | --- |
| Comments | Drawer → Comments | Plain text, 1–10,000 characters |
| Attachments | Drawer → Attachments | DSH attachment storage; ≤20 MiB each, ≤50 per task |
| Links | Drawer → Links | http/https only |
| Activity | Drawer → Activity | Recorded by the Host; comments are not activity events |

Card footer counts open the same drawer.

## 8. Search and filters

Search matches title, description, project name and labels.

Filters support project, priority, label and assignee, in any combination. The panel shows the active count and a clear action.

Card chips are shortcuts:

- Click the project chip to filter by that project.
- Click the priority chip to filter by that priority.
- Click the same chip again to clear it.

If a project filter conflicts with the selected project, the board switches to All projects instead of showing an unexplained empty view.

## 9. Archive and read-only

### Archive a task

Drawer → **Archive task**. The task leaves the board and appears under **Archived tasks**.

The archived-tasks modal groups by project, supports search, and offers:

- **Open** — read-only drawer
- **Restore**
- **Delete** — permanent, with confirmation

### Restore a task

Open **Archived tasks** → **Restore**. The task returns to its previous status/column.

### Permanently delete a task

1. Archive the task.
2. Open **Archived tasks**.
3. Click **Delete** and confirm.

Active tasks cannot be permanently deleted; the Host returns `TASK_NOT_ARCHIVED`.

### Archived projects

Archived projects are read-only:

- no create, drag, edit, comment or upload
- a read-only banner with **Restore project**
- tasks are preserved
- task-level restore/delete requires restoring the project first (`PROJECT_ARCHIVED`)

## 10. Theme and language

- Colors use DSH theme tokens and follow light/dark mode.
- UI strings are available in `zh` and `en`; the active locale follows DSH.
- Timestamps currently use the browser's local formatting.

## 11. Data, limits and concurrency

### Where data lives

- Projects, tasks, comments, attachment metadata and activity: DSH `storageDomain` (`dsh_kanban`).
- Attachment bytes: DSH `ctx.attachments`.
- Column collapse preference: browser localStorage only.

No iframe, SQLite or external service. Data survives refresh and restart.

### Limits

| Field | Limit |
| --- | --- |
| Project name | 1–120 characters |
| Workspace path | ≤4096 characters |
| Task title | 1–240 characters |
| Task description | ≤100,000 characters |
| Comment | 1–10,000 characters |
| Labels | ≤20 per task, ≤64 characters each |
| Links | ≤50 per task |
| Attachments | ≤20 MiB each, ≤50 per task |
| Question options | 2–5 |

Project ids are capped at 64 characters; task prefixes are normalized to 2–6 uppercase letters/digits so every written record passes the domain schema after a restart.

### Concurrency

Every task write includes a `version`. A stale write returns `TASK_VERSION_CONFLICT` (HTTP 409). The UI reports that the task changed and reloads.

## 12. API quick reference

The API is same-origin under `/kanban-api`, returns JSON envelopes, and sets `Cache-Control: no-store`.

```json
{ "error": { "code": "TASK_VERSION_CONFLICT", "message": "Task changed elsewhere", "details": {} } }
```

### Read

```bash
# Active projects and tasks
curl http://127.0.0.1:51970/kanban-api/bootstrap

# Task detail with comments, attachments and activity
curl http://127.0.0.1:51970/kanban-api/tasks/<taskId>

# Archived tasks (optionally scoped)
curl 'http://127.0.0.1:51970/kanban-api/archived-tasks?projectId=<projectId>'

# Download an attachment
curl -OJ http://127.0.0.1:51970/kanban-api/attachments/<attachmentId>
```

The port is whatever the current DSH window uses; `51970` is only an example.

### Projects

```bash
curl -X POST http://127.0.0.1:51970/kanban-api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"My project","workspacePath":"/path/to/workspace"}'

curl -X PATCH http://127.0.0.1:51970/kanban-api/projects/<projectId> \
  -H 'content-type: application/json' \
  -d '{"name":"New name"}'

curl -X POST http://127.0.0.1:51970/kanban-api/projects/<projectId>/archive
curl -X POST http://127.0.0.1:51970/kanban-api/projects/<projectId>/restore

# Empty projects only
curl -X DELETE http://127.0.0.1:51970/kanban-api/projects/<projectId>
```

### Tasks

```bash
curl -X POST http://127.0.0.1:51970/kanban-api/tasks \
  -H 'content-type: application/json' \
  -d '{"projectId":"<projectId>","title":"Task title","status":"backlog","priority":"medium"}'

# Every write sends the current version
curl -X PATCH http://127.0.0.1:51970/kanban-api/tasks/<taskId> \
  -H 'content-type: application/json' \
  -d '{"version":1,"status":"in_progress"}'

curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/archive \
  -H 'content-type: application/json' -d '{"version":2}'
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/restore \
  -H 'content-type: application/json' -d '{"version":3}'

# Archived tasks only
curl -X DELETE http://127.0.0.1:51970/kanban-api/tasks/<taskId> \
  -H 'content-type: application/json' -d '{"version":4}'
```

### Questions and approvals

```bash
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/question \
  -H 'content-type: application/json' \
  -d '{"version":1,"prompt":"Which option?","note":"","options":[{"id":"a","label":"Option A"},{"id":"b","label":"Option B"}]}'

curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/answer \
  -H 'content-type: application/json' \
  -d '{"version":2,"decision":"approve","selected":"a","note":"Looks good"}'
```

### Comments and attachments

```bash
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/comments \
  -H 'content-type: application/json' -d '{"body":"Looks good"}'

curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/attachments \
  -H 'content-type: application/json' \
  -d '{"filename":"note.txt","contentType":"text/plain","data":"aGVsbG8="}'

curl -X DELETE http://127.0.0.1:51970/kanban-api/tasks/<taskId>/comments/<commentId>
curl -X DELETE http://127.0.0.1:51970/kanban-api/tasks/<taskId>/attachments/<attachmentId>
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_FIELD` | 400 | Field validation failed (`details.field`) |
| `INVALID_PATH` | 400 | Malformed URL encoding |
| `PROJECT_ARCHIVED` | 403 | Project is read-only |
| `TASK_NOT_FOUND` / `PROJECT_NOT_FOUND` / `NOT_FOUND` | 404 | Record not found |
| `TASK_VERSION_CONFLICT` | 409 | Stale version; reload and retry |
| `TASK_NEEDS_ATTENTION` | 409 | Task has unresolved attention; cannot be Done |
| `QUESTION_ALREADY_PENDING` | 409 | A question is already waiting |
| `TASK_NOT_IN_REVIEW` | 409 | Task is not in review |
| `TASK_ARCHIVED` / `TASK_NOT_ARCHIVED` | 409 | Archive state does not match the operation |
| `PROJECT_NOT_EMPTY` | 409 | Project still has tasks |
| `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_LIMIT_REACHED` | 413 | File too large / too many files |
| `INTERNAL_ERROR` | 500 | Host failure |

## 13. Troubleshooting

### The board is empty

Check whether you are in All projects or an empty project. Then:

```bash
curl http://127.0.0.1:51970/kanban-api/bootstrap
```

A `200` with data means the Host is fine; refresh the page. A `404` means the plugin route is not registered.

### A card will not drop

- Target is Needs you? Not allowed.
- Card is in Needs you? Resolve its question/blocker/review first.
- Target is Done and the card still has attention? Resolve it first.
- Project is archived? The board is read-only.

### Approve fails

The task may still be blocked. Clear the blocker first. `TASK_NEEDS_ATTENTION` means something is still unresolved.

### Attachment upload fails

- File larger than 20 MiB?
- Already 50 attachments on the task?
- Control characters in the filename?
- `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_LIMIT_REACHED` from the Host?

### Permanent delete is unavailable

Archive the task first. Permanent delete is only exposed for archived tasks.

### A project cannot be deleted

The project must be empty. Archive and permanently delete its tasks first.

### The sidebar has no Kanban entry

1. Confirm `@local/dsh-kanban` is enabled in Settings → Plugins.
2. Refresh the page.
3. Disable and enable the plugin once, or restart DSH.

### Does uninstalling remove data?

No. Domain data stays in the profile. Reinstalling reads it back. Delete the domain manually only if you intend to wipe it.
