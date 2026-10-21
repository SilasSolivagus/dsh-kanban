import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

const NOW = '2026-10-21T00:00:00.000Z'

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
    now: () => NOW,
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

async function setup() {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  return { store, project, task }
}

function activityFor(store, taskId) {
  return store.getTaskDetail(taskId).activity
}

function questionInput(overrides = {}) {
  return {
    version: 1,
    prompt: 'Which name?',
    note: '',
    options: [
      { id: 'a', label: 'A', detail: '' },
      { id: 'b', label: 'B', detail: '' },
    ],
    ...overrides,
  }
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

test('task creation records one status activity with the local user', async () => {
  const { store, task } = await setup()
  const activity = activityFor(store, task.id)
  assert.equal(activity.length, 1)
  assert.deepEqual(activity[0].changes, [{ field: 'status', before: null, after: 'backlog' }])
  assert.deepEqual(activity[0].actor, { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null })
  assert.equal(activity[0].taskId, task.id)
  assert.equal(activity[0].createdAt, NOW)
})

test('addComment trims the body and stamps the local user', async () => {
  const { store, task } = await setup()
  const comment = await store.addComment(task.id, '  hello  ')
  assert.equal(comment.id, 'id-3')
  assert.equal(comment.taskId, task.id)
  assert.equal(comment.body, 'hello')
  assert.deepEqual(comment.author, { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null })
  assert.equal(comment.createdAt, NOW)
  assert.equal(comment.updatedAt, NOW)

  const longest = await store.addComment(task.id, 'x'.repeat(10000))
  assert.equal(longest.body.length, 10000)
  assert.equal(store.getTaskDetail(task.id).comments.length, 2)
})

test('addComment rejects bodies outside 1..10000 characters', async () => {
  const { store, task } = await setup()
  for (const body of ['', '   ', 'x'.repeat(10001), 42, null, undefined, ['hello']]) {
    await assert.rejects(
      () => store.addComment(task.id, body),
      (error) => error.code === 'INVALID_FIELD' && error.details.field === 'body',
    )
  }
  assert.equal(store.getTaskDetail(task.id).comments.length, 0)
})

test('addComment rejects archived projects and archived tasks', async () => {
  const { store: projectStore, project, task } = await setup()
  await projectStore.archiveProject(project.id)
  await assert.rejects(
    () => projectStore.addComment(task.id, 'hello'),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )

  const { store: taskStore, task: otherTask } = await setup()
  await taskStore.archiveTask(otherTask.id, { version: 1 })
  await assert.rejects(
    () => taskStore.addComment(otherTask.id, 'hello'),
    (error) => error.code === 'TASK_ARCHIVED',
  )
})

test('deleteComment removes only the specified comment on the specified task', async () => {
  const { store, task } = await setup()
  const first = await store.addComment(task.id, 'one')
  const second = await store.addComment(task.id, 'two')
  const otherProject = await store.createProject({ name: 'Other' })
  const otherTask = await store.createTask({ projectId: otherProject.id, title: 'other' })
  const otherComment = await store.addComment(otherTask.id, 'other')

  const result = await store.deleteComment(task.id, first.id)
  assert.equal(result, undefined)
  assert.deepEqual(store.getTaskDetail(task.id).comments.map((comment) => comment.id), [second.id])
  assert.deepEqual(store.getTaskDetail(otherTask.id).comments.map((comment) => comment.id), [otherComment.id])

  await assert.rejects(
    () => store.deleteComment(task.id, otherComment.id),
    (error) => error.code === 'NOT_FOUND',
  )
  await assert.rejects(
    () => store.deleteComment(task.id, 'missing'),
    (error) => error.code === 'NOT_FOUND',
  )
  assert.equal(store.getTaskDetail(otherTask.id).comments.length, 1)
})

test('deleteComment rejects archived projects and archived tasks', async () => {
  const { store: projectStore, project, task } = await setup()
  const projectComment = await projectStore.addComment(task.id, 'hello')
  await projectStore.archiveProject(project.id)
  await assert.rejects(
    () => projectStore.deleteComment(task.id, projectComment.id),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
  assert.equal(projectStore.getTaskDetail(task.id).comments.length, 1)

  const { store: taskStore, task: otherTask } = await setup()
  const taskComment = await taskStore.addComment(otherTask.id, 'hello')
  await taskStore.archiveTask(otherTask.id, { version: 1 })
  await assert.rejects(
    () => taskStore.deleteComment(otherTask.id, taskComment.id),
    (error) => error.code === 'TASK_ARCHIVED',
  )
  assert.equal(taskStore.getTaskDetail(otherTask.id).comments.length, 1)
})

test('comments do not generate activity', async () => {
  const { store, task } = await setup()
  const before = activityFor(store, task.id).length
  const comment = await store.addComment(task.id, 'hello')
  await store.deleteComment(task.id, comment.id)
  assert.equal(activityFor(store, task.id).length, before)
})

test('updateTask records each changed user-visible field', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, {
    version: 1,
    title: 'renamed',
    description: 'details',
    status: 'in_progress',
    priority: 'high',
    labels: ['one'],
    links: [{ id: 'l1', label: 'Spec', url: 'https://example.com/spec' }],
    blockedReason: 'waiting',
  })

  const event = activityFor(store, task.id).at(-1)
  assert.deepEqual(event.changes, [
    { field: 'title', before: 'task', after: 'renamed' },
    { field: 'description', before: '', after: 'details' },
    { field: 'status', before: 'backlog', after: 'in_progress' },
    { field: 'priority', before: 'none', after: 'high' },
    { field: 'labels', before: [], after: ['one'] },
    { field: 'links', before: [], after: [{ id: 'l1', label: 'Spec', url: 'https://example.com/spec' }] },
    { field: 'blockedReason', before: null, after: 'waiting' },
  ])
  assert.deepEqual(event.actor, { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null })
  assert.equal(event.createdAt, NOW)
  assert.equal(event.taskId, task.id)

  await store.updateTask(task.id, { version: 2, blockedReason: null })
  const cleared = activityFor(store, task.id).at(-1)
  assert.deepEqual(cleared.changes, [{ field: 'blockedReason', before: 'waiting', after: null }])
})

test('updateTask skips non user-visible fields and unchanged values', async () => {
  const { store, task } = await setup()
  const before = activityFor(store, task.id).length
  await store.updateTask(task.id, {
    version: 1,
    title: 'task',
    description: '',
    status: 'backlog',
    sortOrder: 5,
    assigneeTarget: 'current-user',
    labels: [],
    links: [],
    blockedReason: null,
  })
  assert.equal(activityFor(store, task.id).length, before)
})

test('askQuestion records the pending question and answerQuestion records the resolution and status', async () => {
  const { store, task } = await setup()
  await store.askQuestion(task.id, questionInput())

  const asked = activityFor(store, task.id).at(-1)
  assert.deepEqual(asked.changes, [{ field: 'pendingQuestion', before: null, after: 'Which name?' }])

  const approved = await store.answerQuestion(task.id, {
    version: 2,
    decision: 'approve',
    selected: 'a',
    note: 'go with A',
  })
  const answered = activityFor(store, task.id).at(-1)
  assert.deepEqual(answered.changes, [
    { field: 'questionResolution', before: null, after: approved.questionResolution },
    { field: 'status', before: 'backlog', after: 'done' },
  ])
})

test('archiveTask and restoreTask record archivedAt', async () => {
  const { store, task } = await setup()
  const archived = await store.archiveTask(task.id, { version: 1 })
  assert.deepEqual(activityFor(store, task.id).at(-1).changes, [
    { field: 'archivedAt', before: null, after: NOW },
  ])

  await store.restoreTask(task.id, { version: archived.version })
  assert.deepEqual(activityFor(store, task.id).at(-1).changes, [
    { field: 'archivedAt', before: NOW, after: null },
  ])
})
