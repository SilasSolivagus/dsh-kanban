import test from 'node:test'
import assert from 'node:assert/strict'
import { Supervisor } from '../supervisor/supervisor.js'
import { createSupervisor } from '../supervisor/index.js'

const ACTOR = Object.freeze({
  type: 'agent',
  id: 'builder',
  name: '扳子',
  avatarUrl: null,
})

const WORKER = Object.freeze({
  id: 'builder',
  name: '扳子',
  role: 'builder',
  cwd: '/tmp/builder-worktree',
  maxConcurrent: 1,
  timeoutSeconds: 900,
  promptFile: '/tmp/builder.md',
})

const REVIEWER = Object.freeze({
  ...WORKER,
  id: 'reviewer',
  name: 'Reviewer',
  role: 'reviewer',
})

const ROLE_PROMPT = 'Builder role rules:\n- Work only on the assigned card.'

function clone(value) {
  return structuredClone(value)
}

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

function doneReply({ summary = 'Implemented the card', evidence = ['pnpm test -> 12 passed'], notes = '' } = {}) {
  return {
    text: JSON.stringify({ outcome: 'done', summary, evidence, notes }),
    stopReason: 'completed',
    childId: 'child-1',
  }
}

function blockedReply({ summary = 'Need board access', evidence = [], notes = 'Office must grant access.' } = {}) {
  return {
    text: JSON.stringify({ outcome: 'blocked', summary, evidence, notes }),
    stopReason: 'completed',
    childId: 'child-1',
  }
}

/**
 * One in-memory world behind every supervisor dependency. The lease map is
 * shared by the board fake and the lease fake, so a second Supervisor instance
 * sees the same "durable" lease state. That is how the restart test simulates a
 * supervisor process that died mid-card.
 */
function makeWorld(t, options = {}) {
  const tasks = new Map()
  const comments = []
  const activeLeases = new Map()
  const events = []
  const logs = []
  const calls = {
    listAssigned: [],
    getTask: [],
    claim: [],
    updateStatus: [],
    submitForReview: [],
    comment: [],
    block: [],
    release: [],
    ensure: [],
    prompt: [],
    interrupt: [],
    readRolePrompt: [],
  }
  const failures = options.failures ?? {}
  let counter = 0
  let nowMs = Date.parse('2026-10-23T00:00:00.000Z')

  function failIf(operation, context = {}) {
    const failureSpec = failures[operation]
    if (failureSpec === undefined) return
    const error = typeof failureSpec === 'function' ? failureSpec(context) : failureSpec
    if (error) throw error
  }

  function seed(overrides = {}) {
    counter += 1
    const { assigneeId = 'builder', ...rest } = overrides
    const task = {
      id: `task-${counter}`,
      identifier: `DSH-${counter}`,
      projectId: 'project-1',
      title: `Card ${counter}`,
      description: 'Do the card.',
      acceptance: 'Tests pass.',
      status: 'todo',
      version: 1,
      assignee: { type: 'agent', id: assigneeId, name: assigneeId, avatarUrl: null },
      blockedReason: null,
      archivedAt: null,
      ...rest,
    }
    tasks.set(task.id, task)
    return clone(task)
  }

  const board = {
    async listAssigned(actorId, statuses) {
      calls.listAssigned.push({ actorId, statuses: [...statuses] })
      failIf('listAssigned', { actorId })
      let assigned = [...tasks.values()].filter((task) => {
        if (task.archivedAt || task.assignee?.id !== actorId) return false
        return options.listAllAssigned ? true : statuses.includes(task.status)
      })
      if (options.duplicateList) assigned = assigned.flatMap((task) => [task, task])
      return assigned.map(clone)
    },

    async getTask(id) {
      calls.getTask.push({ id })
      failIf('getTask', { id })
      const task = tasks.get(id)
      return task ? clone(task) : null
    },

    async claim(id, actor, leaseSeconds) {
      calls.claim.push({ id, actor: clone(actor), leaseSeconds })
      events.push({ type: 'claim', id })
      failIf('claim', { id, actor })
      if (activeLeases.has(id)) throw failure('LEASE_HELD', `task ${id} is already leased`)
      const task = tasks.get(id)
      if (!task) throw failure('TASK_NOT_FOUND', `task ${id} not found`)
      activeLeases.set(id, {
        taskId: id,
        actorId: actor.id,
        leaseSeconds,
        expiresAt: '2026-10-23T00:15:00.000Z',
      })
      task.status = 'in_progress'
      task.version += 1
      return clone(task)
    },

    async updateStatus(id, version, status, actor) {
      calls.updateStatus.push({ id, version, status, actor: clone(actor) })
      events.push({ type: 'updateStatus', id, status })
      failIf('updateStatus', { id, version, status })
      const task = tasks.get(id)
      if (!task) throw failure('TASK_NOT_FOUND', `task ${id} not found`)
      if (task.version !== version) throw failure('TASK_VERSION_CONFLICT', 'task changed elsewhere')
      task.status = status
      task.version += 1
      return clone(task)
    },

    async submitForReview(id, version, actor) {
      calls.submitForReview.push({ id, version, status: 'reviewing', actor: clone(actor) })
      events.push({ type: 'submitForReview', id })
      failIf('submitForReview', { id, version, actor })
      const task = tasks.get(id)
      if (!task) throw failure('TASK_NOT_FOUND', `task ${id} not found`)
      if (task.version !== version) throw failure('TASK_VERSION_CONFLICT', 'task changed elsewhere')
      task.status = 'reviewing'
      task.version += 1
      return clone(task)
    },

    async comment(id, body, actor) {
      calls.comment.push({ id, body, actor: clone(actor) })
      events.push({ type: 'comment', id })
      failIf('comment', { id, body })
      const comment = {
        id: `comment-${comments.length + 1}`,
        taskId: id,
        body,
        author: clone(actor),
      }
      comments.push(comment)
      return clone(comment)
    },

    async block(id, version, reason, actor) {
      calls.block.push({ id, version, reason, actor: clone(actor) })
      events.push({ type: 'block', id })
      failIf('block', { id, version, reason })
      const task = tasks.get(id)
      if (!task) throw failure('TASK_NOT_FOUND', `task ${id} not found`)
      if (task.version !== version) throw failure('TASK_VERSION_CONFLICT', 'task changed elsewhere')
      task.blockedReason = reason
      task.version += 1
      return clone(task)
    },

    async release(id, actor) {
      calls.release.push({ id, actor: clone(actor) })
      events.push({ type: 'release', id })
      failIf('release', { id })
      const lease = activeLeases.get(id) ?? null
      activeLeases.delete(id)
      return lease ? clone(lease) : null
    },
  }

  const leases = {
    active: activeLeases,
    getActive(id) {
      return activeLeases.get(id) ?? null
    },
    seedLease(id, actor = ACTOR, leaseSeconds = 900) {
      activeLeases.set(id, {
        taskId: id,
        actorId: actor.id,
        leaseSeconds,
        expiresAt: '2026-10-23T00:15:00.000Z',
      })
    },
  }

  const sessions = {
    async ensure(worker) {
      calls.ensure.push({ worker: clone(worker) })
      events.push({ type: 'ensure' })
      failIf('ensure', { worker })
      return { parentId: 'parent-1', childId: 'child-1' }
    },

    async prompt(worker, text, promptOptions) {
      calls.prompt.push({ worker: clone(worker), text, options: promptOptions })
      events.push({ type: 'prompt' })
      failIf('prompt', { worker, text })
      const reply = options.reply ?? (() => doneReply())
      return typeof reply === 'function'
        ? reply({ worker, text, index: calls.prompt.length - 1 })
        : clone(reply)
    },

    async interrupt(worker) {
      calls.interrupt.push({ worker: clone(worker) })
      events.push({ type: 'interrupt' })
    },
  }

  async function readRolePrompt(worker) {
    calls.readRolePrompt.push({ worker: clone(worker) })
    events.push({ type: 'readRolePrompt' })
    failIf('readRolePrompt', { worker })
    return options.rolePrompt ?? ROLE_PROMPT
  }

  const logger = {
    info: (...args) => logs.push({ level: 'info', args }),
    warn: (...args) => logs.push({ level: 'warn', args }),
    error: (...args) => logs.push({ level: 'error', args }),
  }

  const clock = {
    now: () => new Date(nowMs),
    iso: () => new Date(nowMs).toISOString(),
    advance(seconds) {
      nowMs += seconds * 1000
    },
  }

  function makeSupervisor(overrides = {}) {
    return new Supervisor({
      dsh: { name: 'fake-dsh' },
      board,
      workers: options.workers ?? [WORKER],
      leases,
      sessions,
      readRolePrompt,
      clock: clock.now,
      logger,
      ...overrides,
    })
  }

  return {
    tasks,
    comments,
    leases,
    events,
    logs,
    calls,
    clock,
    board,
    sessions,
    readRolePrompt,
    seed,
    makeSupervisor,
  }
}

test('one card is claimed, prompted, and completed with evidence', async (t) => {
  const world = makeWorld(t)
  const card = world.seed({ title: 'Add supervisor cycle' })

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results.length, 1)
  assert.equal(results[0].workerId, 'builder')
  assert.equal(results[0].taskId, card.id)
  assert.equal(results[0].outcome, 'done')

  // Assignment is queried with the card's ready statuses.
  assert.deepEqual(world.calls.listAssigned[0], {
    actorId: 'builder',
    statuses: ['todo', 'backlog', 'in_progress'],
  })

  // Claim carries the full agent actor and a lease that outlives the prompt.
  assert.equal(world.calls.claim.length, 1)
  assert.equal(world.calls.claim[0].id, card.id)
  assert.equal(world.calls.claim[0].leaseSeconds, 960)
  assert.deepEqual(world.calls.claim[0].actor, ACTOR)

  // Session + role prompt + card prompt happen after the claim.
  assert.equal(world.calls.ensure.length, 1)
  assert.deepEqual(world.calls.readRolePrompt[0].worker, WORKER)
  assert.equal(world.calls.prompt.length, 1)
  assert.equal(world.calls.prompt[0].options.timeoutMs, 900_000)
  assert.match(world.calls.prompt[0].text, /Add supervisor cycle/)
  assert.match(world.calls.prompt[0].text, /Builder role rules/)

  assert.deepEqual(
    world.events.map((event) => event.type),
    ['claim', 'ensure', 'readRolePrompt', 'prompt', 'comment', 'updateStatus', 'release'],
  )

  // The card is done, evidence was commented, and the lease was released.
  assert.equal(world.tasks.get(card.id).status, 'done')
  assert.equal(world.calls.comment.length, 1)
  assert.match(world.calls.comment[0].body, /pnpm test -> 12 passed/)
  assert.equal(world.calls.updateStatus.length, 1)
  assert.equal(world.calls.updateStatus[0].status, 'done')
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
})

test('a builder done result is handed to reviewing when a reviewer exists', async (t) => {
  const world = makeWorld(t, { workers: [WORKER, REVIEWER] })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results.length, 1)
  assert.equal(results[0].outcome, 'review')
  assert.equal(world.tasks.get(card.id).status, 'reviewing')

  // The handoff uses the dedicated review operation, not a done status write.
  assert.equal(world.calls.submitForReview.length, 1)
  assert.equal(world.calls.submitForReview[0].id, card.id)
  assert.equal(world.calls.submitForReview[0].version, 2)
  assert.deepEqual(world.calls.submitForReview[0].actor, ACTOR)
  assert.equal(world.calls.updateStatus.some((call) => call.status === 'done'), false)

  // Evidence is still commented before the handoff, and the lease is released.
  assert.equal(world.calls.comment.length, 1)
  assert.match(world.calls.comment[0].body, /pnpm test -> 12 passed/)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
  assert.deepEqual(
    world.events.map((event) => event.type),
    ['claim', 'ensure', 'readRolePrompt', 'prompt', 'comment', 'submitForReview', 'release'],
  )
})

test('a builder can still go straight to done when no reviewer is configured', async (t) => {
  const world = makeWorld(t)
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'done')
  assert.equal(world.tasks.get(card.id).status, 'done')
  assert.equal(world.calls.submitForReview.length, 0)
  assert.deepEqual(
    world.events.map((event) => event.type),
    ['claim', 'ensure', 'readRolePrompt', 'prompt', 'comment', 'updateStatus', 'release'],
  )
})

test('a failed review handoff blocks the card and releases the lease', async (t) => {
  const writeFailure = failure('TASK_WRITE_FAILED', 'board write failed')
  const world = makeWorld(t, {
    workers: [WORKER, REVIEWER],
    failures: { submitForReview: writeFailure },
  })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.submitForReview.length, 1)
  assert.equal(world.calls.updateStatus.length, 0)
  assert.equal(world.calls.comment.length, 2)
  assert.match(world.calls.comment[1].body, /TASK_WRITE_FAILED/)
  assert.match(world.calls.comment[1].body, /board write failed/)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
})

test('a duplicated assignment produces one claim and one prompt', async (t) => {
  const world = makeWorld(t, { duplicateList: true })
  world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results.length, 1)
  assert.equal(world.calls.claim.length, 1)
  assert.equal(world.calls.prompt.length, 1)
  assert.equal(world.calls.updateStatus.length, 1)
})

test('a timeout comments the reason and leaves the card in progress', async (t) => {
  const timeout = failure('WORKER_TIMEOUT', 'worker prompt produced no completed turn within 900000ms')
  const world = makeWorld(t, { reply: () => { throw timeout } })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.updateStatus.length, 0)
  assert.equal(world.calls.comment.length, 1)
  assert.match(world.calls.comment[0].body, /WORKER_TIMEOUT/)
  assert.match(world.calls.comment[0].body, /no completed turn/)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
})

test('a failure before the prompt blocks the card and releases the lease', async (t) => {
  const world = makeWorld(t, {
    failures: {
      readRolePrompt: failure('WORKER_CONFIG_ERROR', 'missing role prompt file'),
    },
  })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.calls.prompt.length, 0)
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.updateStatus.length, 0)
  assert.match(world.calls.comment[0].body, /missing role prompt file/)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
})

test('a done result without evidence is treated as blocked', async (t) => {
  const world = makeWorld(t, { reply: () => doneReply({ evidence: [] }) })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.updateStatus.length, 0)
  assert.equal(world.calls.comment.length, 1)
  assert.match(world.calls.comment[0].body, /evidence/i)
  assert.equal(world.leases.active.size, 0)
})

test('an expired in_progress card is reclaimed and prompted', async (t) => {
  const world = makeWorld(t)
  const card = world.seed({ status: 'in_progress' })

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'done')
  assert.equal(world.calls.claim.length, 1)
  assert.equal(world.calls.prompt.length, 1)
  assert.equal(world.tasks.get(card.id).status, 'done')
})

test('a blocked in_progress card is never re-prompted', async (t) => {
  const world = makeWorld(t)
  const card = world.seed({ status: 'in_progress', blockedReason: 'Need input' })

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'skipped')
  assert.equal(results[0].reason, 'attention')
  assert.equal(world.calls.claim.length, 0)
  assert.equal(world.calls.prompt.length, 0)
  assert.equal(world.tasks.get(card.id).blockedReason, 'Need input')
})

test('an active lease is skipped after a restart, with no duplicate prompt', async (t) => {
  const world = makeWorld(t)
  const card = world.seed()
  world.leases.seedLease(card.id)

  // A second Supervisor instance stands in for the restarted process.
  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'skipped')
  assert.equal(results[0].reason, 'leased')
  assert.equal(world.calls.claim.length, 0)
  assert.equal(world.calls.ensure.length, 0)
  assert.equal(world.calls.prompt.length, 0)
  assert.equal(world.leases.active.size, 1)
})

test('a second cycle never re-prompts a completed card', async (t) => {
  // listAllAssigned keeps returning the card even after it is done, proving the
  // supervisor re-reads and skips terminal cards instead of trusting the list.
  const world = makeWorld(t, { listAllAssigned: true })
  const card = world.seed()
  const supervisor = world.makeSupervisor()

  await supervisor.runOnce()
  await supervisor.runOnce()

  assert.equal(world.calls.prompt.length, 1)
  assert.equal(world.calls.claim.length, 1)
  assert.equal(world.tasks.get(card.id).status, 'done')
  assert.equal(world.calls.listAssigned.length, 2)
})

test('all card writes use the full builder actor', async (t) => {
  const world = makeWorld(t)
  world.seed()
  world.seed()

  await world.makeSupervisor().runOnce()

  const writes = [
    ...world.calls.claim,
    ...world.calls.comment,
    ...world.calls.updateStatus,
    ...world.calls.release,
  ]
  assert.ok(writes.length > 0)
  for (const write of writes) {
    assert.deepEqual(write.actor, ACTOR, `write ${JSON.stringify(write)} must carry the full actor`)
  }
})

test('a blocked result comments the summary and leaves the card in progress', async (t) => {
  const world = makeWorld(t, {
    reply: () => blockedReply({ summary: 'Need credentials for the deploy API' }),
  })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.tasks.get(card.id).blockedReason, 'Need credentials for the deploy API')
  assert.equal(world.calls.updateStatus.length, 0)
  assert.equal(world.calls.block.length, 1)
  assert.equal(world.calls.comment.length, 1)
  assert.match(world.calls.comment[0].body, /Need credentials for the deploy API/)
  assert.match(world.calls.comment[0].body, /Office must grant access/)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
})

test('a worker turn that stopped with reason "error" is blocked, never done', async (t) => {
  const world = makeWorld(t, {
    reply: () => ({ ...doneReply(), stopReason: 'error' }),
  })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.updateStatus.length, 0)
  assert.match(world.calls.comment[0].body, /stopped with reason "error"/)
  assert.equal(world.leases.active.size, 0)
})

test('terminal cards returned by a stale assignment list are skipped', async (t) => {
  const world = makeWorld(t, { listAllAssigned: true })
  const card = world.seed({ status: 'done' })

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'skipped')
  assert.equal(results[0].reason, 'terminal')
  assert.equal(world.calls.claim.length, 0)
  assert.equal(world.calls.prompt.length, 0)
  assert.equal(world.tasks.get(card.id).status, 'done')
})

test('a failed done-status write blocks the card, comments, and releases the lease', async (t) => {
  const writeFailure = failure('TASK_WRITE_FAILED', 'board write failed')
  const world = makeWorld(t, { failures: { updateStatus: writeFailure } })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.updateStatus.length, 1)
  assert.equal(world.calls.comment.length, 2)
  assert.match(world.calls.comment[1].body, /TASK_WRITE_FAILED/)
  assert.match(world.calls.comment[1].body, /board write failed/)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
})

test('a failed evidence comment blocks the card and still releases the lease', async (t) => {
  const commentFailure = failure('TASK_WRITE_FAILED', 'comment write failed')
  const world = makeWorld(t, { failures: { comment: commentFailure } })
  const card = world.seed()

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'blocked')
  assert.equal(world.tasks.get(card.id).status, 'in_progress')
  assert.equal(world.calls.updateStatus.length, 0)
  assert.equal(world.calls.release.length, 1)
  assert.equal(world.leases.active.size, 0)
  assert.ok(world.logs.some((entry) => entry.level === 'warn'))
})

test('no worker session is created when the worker has no eligible cards', async (t) => {
  const world = makeWorld(t)

  const results = await world.makeSupervisor().runOnce()

  assert.deepEqual(results, [])
  assert.equal(world.calls.listAssigned.length, 1)
  assert.equal(world.calls.ensure.length, 0)
  assert.equal(world.calls.prompt.length, 0)
})

test('a queued backlog card is processed like a todo card', async (t) => {
  const world = makeWorld(t)
  const card = world.seed({ status: 'backlog' })

  const results = await world.makeSupervisor().runOnce()

  assert.equal(results[0].outcome, 'done')
  assert.equal(world.tasks.get(card.id).status, 'done')
})

test('two cards are processed one at a time in assignment order', async (t) => {
  const world = makeWorld(t)
  const first = world.seed({ title: 'First card' })
  const second = world.seed({ title: 'Second card' })

  const results = await world.makeSupervisor().runOnce()

  assert.deepEqual(results.map((result) => result.taskId), [first.id, second.id])
  assert.equal(world.calls.prompt.length, 2)
  assert.equal(world.tasks.get(first.id).status, 'done')
  assert.equal(world.tasks.get(second.id).status, 'done')
  assert.equal(world.leases.active.size, 0)

  const sequence = world.events.map((event) => event.type)
  assert.deepEqual(sequence, [
    'claim', 'ensure', 'readRolePrompt', 'prompt', 'comment', 'updateStatus', 'release',
    'claim', 'ensure', 'readRolePrompt', 'prompt', 'comment', 'updateStatus', 'release',
  ])
})

test('the supervisor rejects missing dependencies at construction time', () => {
  assert.throws(() => new Supervisor(), TypeError)
  assert.throws(
    () => new Supervisor({ board: {}, workers: [], leases: {}, sessions: {}, readRolePrompt: () => '' }),
    /board/i,
  )
  assert.throws(
    () => new Supervisor({ board: completeBoard(), workers: 'builder', leases: {}, sessions: {}, readRolePrompt: () => '' }),
    /workers/i,
  )
})

test('the index factory builds a Supervisor from explicit dependencies', async (t) => {
  const world = makeWorld(t)
  world.seed()

  const supervisor = createSupervisor({
    dsh: { name: 'fake-dsh' },
    board: world.board,
    workers: [WORKER],
    leases: world.leases,
    sessions: world.sessions,
    readRolePrompt: world.readRolePrompt,
    clock: world.clock.now,
  })

  assert.ok(supervisor instanceof Supervisor)
  const results = await supervisor.runOnce()
  assert.equal(results[0].outcome, 'done')
})

function completeBoard() {
  return {
    listAssigned() {
      return []
    },
    getTask() {
      return null
    },
    claim() {},
    updateStatus() {},
    submitForReview() {},
    comment() {},
    block() {},
    release() {},
  }
}
