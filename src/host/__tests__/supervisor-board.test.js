import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { createActorRegistry } from '../actors.js'
import { AGENTS } from './actor-fixture.js'
import { MemoryTable } from './memory-table.js'
import { BoardPort, LocalBoardAdapter } from '../supervisor/board-port.js'

const REVIEWER = Object.freeze({
  type: 'agent',
  id: 'reviewer',
  name: 'Reviewer',
  avatarUrl: null,
})

// The adapter depends on a narrow lease facade: claim(taskId, actor,
// leaseSeconds) and release(taskId, actor), with lease metadata kept in a small
// "state" map. getActive() is exposed so tests can inspect the held lease,
// mirroring the real lease store's read method.
function makeLeases() {
  const active = new Map()
  const calls = []
  return {
    active,
    calls,
    getActive(taskId) {
      return active.get(taskId) ?? null
    },
    async claim(taskId, actor, leaseSeconds) {
      calls.push({ op: 'claim', taskId, actor, leaseSeconds })
      if (active.has(taskId)) {
        throw Object.assign(new Error('Lease already held'), { code: 'LEASE_HELD' })
      }
      const lease = { taskId, actorId: actor.id, leaseSeconds, expiresAt: '2026-10-21T00:15:00.000Z' }
      active.set(taskId, lease)
      return lease
    },
    async release(taskId, actor) {
      calls.push({ op: 'release', taskId, actor })
      const lease = active.get(taskId) ?? null
      active.delete(taskId)
      return lease
    },
  }
}

function setup({ leases = makeLeases() } = {}) {
  const tables = {
    projects: new MemoryTable(),
    tasks: new MemoryTable(),
    comments: new MemoryTable(),
    attachments: new MemoryTable(),
    activity: new MemoryTable(),
  }
  const actors = createActorRegistry({ agents: AGENTS })
  const store = new KanbanStore({
    tables,
    actors,
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
  const board = new LocalBoardAdapter({ store, leases })
  return { store, tables, actors, leases, board }
}

async function seedTask({ store, actors }, overrides = {}) {
  const project = overrides.project ?? await store.createProject({ name: overrides.projectName ?? 'DSH Kanban' })
  return store.createTask({
    projectId: project.id,
    title: overrides.title ?? 'card',
    status: overrides.status ?? 'todo',
    assigneeId: overrides.assigneeId ?? 'builder',
  }, actors.get('office'))
}

test('BoardPort is an abstract interface', () => {
  const port = new BoardPort()
  for (const method of [
    'listAssigned',
    'getTask',
    'claim',
    'updateStatus',
    'comment',
    'block',
    'release',
    'listReviewQueue',
    'claimReview',
    'submitForReview',
  ]) {
    assert.throws(
      () => port[method](),
      (error) => error.code === 'BOARD_NOT_IMPLEMENTED' && error.details.method === method,
      `${method} should be abstract`,
    )
  }
})

test('LocalBoardAdapter requires a store and a lease facade', () => {
  assert.throws(() => new LocalBoardAdapter(), /store/)
  assert.throws(() => new LocalBoardAdapter({ store: {} }), /store/)
  assert.throws(() => new LocalBoardAdapter({ store: { getTaskDetail() {}, updateTask() {}, addComment() {}, bootstrap() {} } }), /leases/)
})

test('listAssigned returns only the actor cards in the requested statuses', async () => {
  const { store, actors, board } = setup()
  const project = await store.createProject({ name: 'DSH Kanban' })
  const office = actors.get('office')
  const make = (title, status, assigneeId = 'builder') =>
    store.createTask({ projectId: project.id, title, status, assigneeId }, office)

  const todo = await make('todo card', 'todo')
  const backlog = await make('backlog card', 'backlog')
  await make('running card', 'in_progress')
  await make('office card', 'todo', 'office')
  await make('done card', 'done')
  const archived = await make('archived card', 'todo')
  await store.archiveTask(archived.id, { version: archived.version })

  const archivedProject = await store.createProject({ name: 'Old board' })
  await store.createTask({ projectId: archivedProject.id, title: 'hidden', status: 'todo', assigneeId: 'builder' }, office)
  await store.archiveProject(archivedProject.id)

  const listed = board.listAssigned('builder', ['todo', 'backlog'])

  assert.deepEqual(listed.map((task) => task.id), [todo.id, backlog.id])
  assert.deepEqual(listed.map((task) => task.status), ['todo', 'backlog'])
  assert.ok(listed.every((task) => task.assignee.id === 'builder'))
})

test('listAssigned returns nothing for an empty status filter', async () => {
  const { board } = setup()
  assert.deepEqual(board.listAssigned('builder', []), [])
})

test('getTask returns the stored card', async () => {
  const { store, actors, board } = setup()
  const task = await seedTask({ store, actors }, { title: 'Read me' })

  const fetched = board.getTask(task.id)

  assert.equal(fetched.id, task.id)
  assert.equal(fetched.title, 'Read me')
  assert.equal(fetched.version, task.version)
  assert.equal(fetched.assignee.id, 'builder')
})

test('claim records lease metadata and moves the card to in_progress', async () => {
  const { store, actors, leases, board } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')

  const claimed = await board.claim(task.id, builder, 900)

  assert.deepEqual(leases.calls[0], { op: 'claim', taskId: task.id, actor: builder, leaseSeconds: 900 })
  assert.equal(leases.active.size, 1)
  assert.deepEqual(leases.active.get(task.id), {
    taskId: task.id,
    actorId: 'builder',
    leaseSeconds: 900,
    expiresAt: '2026-10-21T00:15:00.000Z',
  })
  assert.equal(claimed.status, 'in_progress')
  assert.equal(claimed.version, task.version + 1)
  assert.equal((await board.getTask(task.id)).status, 'in_progress')

  const activity = store.getTaskDetail(task.id).activity.at(-1)
  assert.equal(activity.actor.id, 'builder')
  assert.deepEqual(activity.changes, [{ field: 'status', before: 'todo', after: 'in_progress' }])
})

test('claim propagates a lease rejection without writing the card', async () => {
  const { store, actors, leases, board } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')
  const claimed = await board.claim(task.id, builder, 900)

  await assert.rejects(
    () => board.claim(task.id, builder, 900),
    (error) => error.code === 'LEASE_HELD',
  )

  const current = await board.getTask(task.id)
  assert.equal(current.status, 'in_progress')
  assert.equal(current.version, claimed.version)
  assert.equal(leases.active.size, 1)
})

test('claim releases the lease and rethrows when the status write fails', async () => {
  const { store, actors, leases } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')
  const failure = Object.assign(new Error('write failed'), { code: 'TEST_WRITE_FAILED' })
  const failingStore = {
    bootstrap: () => store.bootstrap(),
    getTaskDetail: (id) => store.getTaskDetail(id),
    updateTask: async () => { throw failure },
    addComment: (...args) => store.addComment(...args),
  }
  const board = new LocalBoardAdapter({ store: failingStore, leases })

  await assert.rejects(
    () => board.claim(task.id, builder, 900),
    (error) => error === failure,
  )

  assert.deepEqual(leases.calls.map((call) => call.op), ['claim', 'release'])
  assert.equal(leases.calls[1].taskId, task.id)
  assert.equal(leases.calls[1].actor.id, 'builder')
  assert.equal(leases.active.size, 0)
  assert.equal(store.getTaskDetail(task.id).task.status, 'todo')
})

test('updateStatus writes the builder actor and increments the version', async () => {
  const { store, actors, board } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')

  const updated = await board.updateStatus(task.id, task.version, 'in_progress', builder)

  assert.equal(updated.status, 'in_progress')
  assert.equal(updated.version, task.version + 1)
  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.task.status, 'in_progress')
  const activity = detail.activity.at(-1)
  assert.equal(activity.actor.id, 'builder')
  assert.deepEqual(activity.changes, [{ field: 'status', before: 'todo', after: 'in_progress' }])
})

test('updateStatus propagates a version conflict', async () => {
  const { store, actors, board } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')
  await board.updateStatus(task.id, task.version, 'in_progress', builder)

  await assert.rejects(
    () => board.updateStatus(task.id, task.version, 'done', builder),
    (error) => error.code === 'TASK_VERSION_CONFLICT',
  )

  assert.equal((await board.getTask(task.id)).status, 'in_progress')
})

test('comment records the builder as author', async () => {
  const { store, actors, board } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')

  const comment = await board.comment(task.id, 'Implemented and tested', builder)

  assert.equal(comment.taskId, task.id)
  assert.equal(comment.body, 'Implemented and tested')
  assert.equal(comment.author.id, 'builder')
  assert.equal(store.getTaskDetail(task.id).comments.at(-1).author.id, 'builder')
})

test('release clears the lease without regressing the card status', async () => {
  const { store, actors, leases, board } = setup()
  const task = await seedTask({ store, actors })
  const builder = actors.get('builder')
  const claimed = await board.claim(task.id, builder, 900)

  const released = await board.release(task.id, builder)

  assert.equal(released.taskId, task.id)
  assert.equal(released.actorId, 'builder')
  assert.equal(leases.active.size, 0)
  assert.deepEqual(leases.calls.map((call) => call.op), ['claim', 'release'])
  const detail = store.getTaskDetail(task.id).task
  assert.equal(detail.status, 'in_progress')
  assert.equal(detail.version, claimed.version)
})

test('lists only reviewing cards in the review queue', async () => {
  const { store, actors, board } = setup()
  const reviewing = await seedTask({ store, actors }, { status: 'reviewing' })
  await seedTask({ store, actors }, { status: 'in_progress' })

  const queue = await board.listReviewQueue('reviewer')

  assert.equal(queue.length, 1)
  assert.equal(queue[0].id, reviewing.id)
  assert.equal(queue[0].status, 'reviewing')
})

test('listReviewQueue hides archived cards and cards in archived projects', async () => {
  const { store, actors, board } = setup()
  // store.bootstrap() already drops archived tasks; this test covers both the
  // adapter's belt-and-braces guard and the archived-project filter.
  const live = await seedTask({ store, actors }, { status: 'reviewing' })

  const archivedCard = await seedTask({ store, actors }, { status: 'reviewing' })
  await store.archiveTask(archivedCard.id, { version: archivedCard.version })

  const archivedProject = await store.createProject({ name: 'Old board' })
  await store.createTask({
    projectId: archivedProject.id,
    title: 'hidden',
    status: 'reviewing',
    assigneeId: 'builder',
  }, actors.get('office'))
  await store.archiveProject(archivedProject.id)

  const queue = await board.listReviewQueue('reviewer')

  assert.deepEqual(queue.map((task) => task.id), [live.id])
})

test('claimReview leases without changing the reviewing status', async () => {
  const { store, actors, leases, board } = setup()
  const card = await seedTask({ store, actors }, { status: 'reviewing' })

  const claimed = await board.claimReview(card.id, REVIEWER, 60)

  assert.equal(claimed.status, 'reviewing')
  assert.equal(claimed.version, card.version)
  assert.deepEqual(leases.calls[0], { op: 'claim', taskId: card.id, actor: REVIEWER, leaseSeconds: 60 })
  assert.equal(leases.getActive(card.id).actorId, REVIEWER.id)
  assert.equal(leases.getActive(card.id).leaseSeconds, 60)

  const stored = store.getTaskDetail(card.id).task
  assert.equal(stored.status, 'reviewing')
  assert.equal(stored.version, card.version)
})

for (const status of ['done', 'canceled', 'in_progress', 'todo']) {
  test(`claimReview rejects a ${status} card without taking a lease`, async () => {
    const { store, actors, leases, board } = setup()
    const card = await seedTask({ store, actors }, { status })

    await assert.rejects(
      () => board.claimReview(card.id, REVIEWER, 60),
      (error) =>
        error.code === 'TASK_NOT_REVIEWABLE' &&
        error.details.taskId === card.id &&
        error.details.status === status,
    )

    assert.equal(leases.getActive(card.id), null)
    assert.deepEqual(leases.calls, [])
  })
}

test('claimReview rejects an archived card without taking a lease', async () => {
  const { store, actors, leases, board } = setup()
  const card = await seedTask({ store, actors }, { status: 'reviewing' })
  await store.archiveTask(card.id, { version: card.version })

  await assert.rejects(
    () => board.claimReview(card.id, REVIEWER, 60),
    (error) =>
      error.code === 'TASK_NOT_REVIEWABLE' &&
      error.details.taskId === card.id &&
      error.details.status === 'reviewing',
  )

  assert.equal(leases.getActive(card.id), null)
  assert.deepEqual(leases.calls, [])
})

test('claimReview rejects a card in an archived project without taking a lease', async () => {
  const { store, actors, leases, board } = setup()
  const project = await store.createProject({ name: 'Old board' })
  const card = await store.createTask({
    projectId: project.id,
    title: 'card',
    status: 'reviewing',
    assigneeId: 'builder',
  }, actors.get('office'))
  await store.archiveProject(project.id)

  await assert.rejects(
    () => board.claimReview(card.id, REVIEWER, 60),
    (error) =>
      error.code === 'TASK_NOT_REVIEWABLE' &&
      error.details.taskId === card.id &&
      error.details.status === 'reviewing',
  )

  assert.equal(leases.getActive(card.id), null)
  assert.deepEqual(leases.calls, [])
})

test('submitForReview writes the reviewing status with the actor', async () => {
  const { store, actors, board } = setup()
  const card = await seedTask({ store, actors }, { status: 'in_progress' })
  const builder = actors.get('builder')

  const updated = await board.submitForReview(card.id, card.version, builder)

  assert.equal(updated.status, 'reviewing')
  assert.equal(updated.version, card.version + 1)
  const detail = store.getTaskDetail(card.id)
  assert.equal(detail.task.status, 'reviewing')
  const activity = detail.activity.at(-1)
  assert.equal(activity.actor.id, 'builder')
  assert.deepEqual(activity.changes, [{ field: 'status', before: 'in_progress', after: 'reviewing' }])
})

test('submitForReview propagates a version conflict', async () => {
  const { store, actors, board } = setup()
  const card = await seedTask({ store, actors }, { status: 'in_progress' })
  const builder = actors.get('builder')
  await board.submitForReview(card.id, card.version, builder)

  await assert.rejects(
    () => board.submitForReview(card.id, card.version, builder),
    (error) => error.code === 'TASK_VERSION_CONFLICT',
  )

  assert.equal((await board.getTask(card.id)).status, 'reviewing')
})
