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

test('task detail returns the summary with comments, attachments, and activity', async () => {
  const { store, tables } = makeStoreWithTables()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'first' })
  await tables.comments.put('comment-1', { id: 'comment-1', taskId: task.id, body: 'hi' })
  await tables.comments.put('comment-2', { id: 'comment-2', taskId: 'other', body: 'other' })
  await tables.attachments.put('attachment-1', { id: 'attachment-1', taskId: task.id, filename: 'f.txt' })
  await tables.activity.put('event-1', { id: 'event-1', taskId: task.id, changes: [] })

  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.task.id, task.id)
  assert.equal(detail.task.column, 'backlog')
  assert.deepEqual(detail.comments.map((comment) => comment.id), ['comment-1'])
  assert.deepEqual(detail.attachments.map((attachment) => attachment.id), ['attachment-1'])
  assert.deepEqual(detail.activity.map((event) => event.id), ['event-1'])
})
