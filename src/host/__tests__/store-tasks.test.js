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

function makeStoreWithTables() {
  const tables = {
    projects: new MemoryTable(),
    tasks: new MemoryTable(),
    comments: new MemoryTable(),
    attachments: new MemoryTable(),
    activity: new MemoryTable(),
  }
  const store = new KanbanStore({
    tables,
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
  return { store, tables }
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

test('archived projects reject every task mutation', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const live = await store.createTask({ projectId: project.id, title: 'live' })
  const hidden = await store.createTask({ projectId: project.id, title: 'hidden' })
  await store.archiveTask(hidden.id, { version: 1 })
  await store.archiveProject(project.id)

  await assert.rejects(
    () => store.createTask({ projectId: project.id, title: 'new' }),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
  await assert.rejects(
    () => store.updateTask(live.id, { version: 1, priority: 'high' }),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
  await assert.rejects(
    () => store.archiveTask(live.id, { version: 1 }),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
  await assert.rejects(
    () => store.restoreTask(hidden.id, { version: 2 }),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
  await assert.rejects(
    () => store.deleteTask(hidden.id, { version: 2 }),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
})

test('delete requires an archived task with the current version and removes dependents', async () => {
  const { store, tables } = makeStoreWithTables()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  await assert.rejects(
    () => store.deleteTask(task.id, { version: 1 }),
    (error) => error.code === 'TASK_NOT_ARCHIVED',
  )
  await store.archiveTask(task.id, { version: 1 })
  await tables.comments.put('comment-1', { id: 'comment-1', taskId: task.id, body: 'hi' })
  await tables.attachments.put('attachment-1', { id: 'attachment-1', taskId: task.id, filename: 'f.txt' })
  await tables.activity.put('event-1', { id: 'event-1', taskId: task.id, changes: [] })
  await assert.rejects(
    () => store.deleteTask(task.id, { version: 1 }),
    (error) => error.code === 'TASK_VERSION_CONFLICT',
  )
  await store.deleteTask(task.id, { version: 2 })
  assert.throws(() => store.getTaskDetail(task.id), (error) => error.code === 'TASK_NOT_FOUND')
  assert.equal(tables.comments.size, 0)
  assert.equal(tables.attachments.size, 0)
  assert.equal(tables.activity.size, 0)
})

test('create rejects invalid input with INVALID_FIELD', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const invalid = [
    {},
    { title: '' },
    { title: '   ' },
    { title: 'ok', status: 'blocked' },
    { title: 'ok', priority: 'critical' },
    { title: 'ok', description: 42 },
    { title: 'ok', labels: ['ok', ''] },
    { title: 'ok', labels: Array.from({ length: 21 }, (_, index) => `label-${index}`) },
    { title: 'ok', links: [{ id: 'l1', label: 'bad', url: 'ftp://example.com' }] },
    { title: 'ok', links: [{ id: 'l1', label: 'bad', url: 'not a url' }] },
    { title: 'ok', sortOrder: 'first' },
    { title: 'ok', assigneeTarget: 'agent' },
  ]
  for (const input of invalid) {
    await assert.rejects(
      () => store.createTask({ projectId: project.id, ...input }),
      (error) => error.code === 'INVALID_FIELD',
    )
  }
  assert.equal(store.bootstrap().tasks.length, 0)
  assert.equal(store.bootstrap().projects[0].nextTaskNumber, 1)
})

test('create trims the title and accepts a valid link list', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({
    projectId: project.id,
    title: '  first  ',
    links: [{ id: 'l1', label: 'Spec', url: 'https://example.com/spec' }],
  })
  assert.equal(task.title, 'first')
  assert.equal(task.links.length, 1)
})

test('update rejects unknown and immutable fields with INVALID_FIELD', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  const invalid = [
    { id: 'other' },
    { projectId: 'other' },
    { identifier: 'DSH-9' },
    { createdAt: '2026-10-20T00:00:00.000Z' },
    { assignee: { type: 'agent', id: 'agent-1', name: 'Agent', avatarUrl: null } },
    { statusSince: '2026-10-20T00:00:00.000Z' },
    { updatedAt: '2026-10-20T00:00:00.000Z' },
    { archivedAt: '2026-10-20T00:00:00.000Z' },
    { versionInput: 'ignored' },
    { surprise: true },
  ]
  for (const patch of invalid) {
    await assert.rejects(
      () => store.updateTask(task.id, { version: 1, ...patch }),
      (error) => error.code === 'INVALID_FIELD',
    )
  }
  assert.equal(store.getTaskDetail(task.id).task.version, 1)
})

test('update rejects invalid field values with INVALID_FIELD', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  const invalid = [
    { title: '' },
    { title: '   ' },
    { status: 'blocked' },
    { priority: 'critical' },
    { description: 42 },
    { description: 'x'.repeat(100001) },
    { labels: ['ok', ''] },
    { labels: Array.from({ length: 21 }, (_, index) => `label-${index}`) },
    { links: [{ id: 'l1', label: 'bad', url: 'javascript:alert(1)' }] },
    { links: [{ id: 'l1', label: 'bad', url: 'not a url' }] },
    { blockedReason: 5 },
    { blockedReason: 'x'.repeat(2001) },
    { sortOrder: Number.POSITIVE_INFINITY },
    { assigneeTarget: 'agent' },
  ]
  for (const patch of invalid) {
    await assert.rejects(
      () => store.updateTask(task.id, { version: 1, ...patch }),
      (error) => error.code === 'INVALID_FIELD',
    )
  }
  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.task.version, 1)
  assert.equal(detail.task.title, 'first')
  assert.equal(detail.task.labels.length, 0)
})

test('update trims the title, persists allowed fields, and drops transport-only fields', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  const updated = await store.updateTask(task.id, {
    version: 1,
    title: '  renamed  ',
    description: 'details',
    priority: 'high',
    labels: ['ui'],
    links: [{ id: 'l1', label: 'Spec', url: 'https://example.com/spec' }],
    sortOrder: 42,
    blockedReason: null,
    assigneeTarget: 'current-user',
  })
  assert.equal(updated.title, 'renamed')
  assert.equal(updated.description, 'details')
  assert.equal(updated.priority, 'high')
  assert.equal(updated.sortOrder, 42)
  assert.equal(updated.version, 2)
  assert.equal(updated.assigneeTarget, undefined)
  assert.equal(updated.versionInput, undefined)
  assert.deepEqual(updated.assignee, task.assignee)
  assert.equal(updated.links[0].url, 'https://example.com/spec')
})

test('task detail returns the summary with comments, attachments, and activity', async () => {
  const { store, tables } = makeStoreWithTables()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  await tables.comments.put('comment-1', { id: 'comment-1', taskId: task.id, body: 'hi' })
  await tables.comments.put('comment-2', { id: 'comment-2', taskId: 'other', body: 'other' })
  await tables.attachments.put('attachment-1', { id: 'attachment-1', taskId: task.id, filename: 'f.txt' })
  await tables.activity.put('event-1', { id: 'event-1', taskId: task.id, changes: [] })
  await tables.activity.put('event-2', { id: 'event-2', taskId: 'other', changes: [] })

  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.task.id, task.id)
  assert.equal(detail.task.column, 'backlog')
  assert.deepEqual(detail.comments.map((comment) => comment.id), ['comment-1'])
  assert.deepEqual(detail.attachments.map((attachment) => attachment.id), ['attachment-1'])
  const activityIds = detail.activity.map((event) => event.id)
  // createTask allocates the task id ('id-1') and then the creation activity id ('id-2').
  assert.deepEqual(activityIds, ['id-2', 'event-1'])
})
