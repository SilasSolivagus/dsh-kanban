import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_LEASE_TTL_SECONDS,
  LeaseStore,
  STATE_FILE_ENV,
  assertLeasableStatus,
  defaultStateFile,
  isLeasableStatus,
  isTerminalStatus,
} from '../supervisor/lease.js'

const BASE_TIME = '2026-10-23T00:00:00.000Z'
const BUILDER = Object.freeze({ id: 'builder', type: 'agent', name: '扳子' })
const OFFICE = Object.freeze({ id: 'office', type: 'human', name: '掌柜' })

// Each test gets its own temp directory, a controllable clock, and a store.
// Nothing touches the real ~/.dsh.
function makeHarness(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-kanban-lease-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  let currentMs = Date.parse(BASE_TIME)
  const clock = {
    now: () => new Date(currentMs),
    advance(seconds) {
      currentMs += seconds * 1000
    },
    iso: () => new Date(currentMs).toISOString(),
  }

  const stateFile = join(dir, 'state.json')
  const makeStore = () => new LeaseStore({ file: stateFile, now: clock.now })
  return { dir, stateFile, clock, makeStore, store: makeStore() }
}

test('default state path honours DSH_KANBAN_SUPERVISOR_STATE', () => {
  assert.equal(STATE_FILE_ENV, 'DSH_KANBAN_SUPERVISOR_STATE')
  assert.equal(DEFAULT_LEASE_TTL_SECONDS, 900)

  const previous = process.env[STATE_FILE_ENV]
  try {
    delete process.env[STATE_FILE_ENV]
    assert.equal(defaultStateFile(), join(homedir(), '.dsh', 'kanban-supervisor-state.json'))

    process.env[STATE_FILE_ENV] = '/tmp/custom-supervisor-state.json'
    assert.equal(defaultStateFile(), '/tmp/custom-supervisor-state.json')
  } finally {
    if (previous === undefined) delete process.env[STATE_FILE_ENV]
    else process.env[STATE_FILE_ENV] = previous
  }
})

test('claim creates one persisted lease with the default 900s TTL', async (t) => {
  const { store, stateFile, clock } = makeHarness(t)

  const lease = await store.claim('task-1', BUILDER)

  assert.equal(lease.taskId, 'task-1')
  assert.equal(lease.actorId, 'builder')
  assert.equal(lease.leaseSeconds, 900)
  assert.equal(lease.claimedAt, BASE_TIME)
  assert.equal(lease.heartbeatAt, BASE_TIME)
  assert.equal(lease.expiresAt, '2026-10-23T00:15:00.000Z')
  assert.equal(clock.iso(), BASE_TIME)

  assert.equal(store.isLeased('task-1'), true)
  assert.deepEqual(store.getActive('task-1'), lease)

  const persisted = JSON.parse(readFileSync(stateFile, 'utf8'))
  assert.deepEqual(persisted.leases['task-1'], lease)
  assert.equal(persisted.version, 1)
})

test('claim rejects a second claim while the lease is unexpired', async (t) => {
  const { store, stateFile } = makeHarness(t)
  await store.claim('task-1', BUILDER)
  const before = readFileSync(stateFile, 'utf8')

  await assert.rejects(
    () => store.claim('task-1', OFFICE),
    (error) => error.code === 'LEASE_HELD' && error.details.owner === 'builder',
  )
  await assert.rejects(
    () => store.claim('task-1', BUILDER),
    (error) => error.code === 'LEASE_HELD',
  )

  assert.equal(store.get('task-1').actorId, 'builder')
  assert.equal(readFileSync(stateFile, 'utf8'), before)
})

test('an expired lease can be reclaimed and activity records both owners', async (t) => {
  const { store, clock } = makeHarness(t)
  const first = await store.claim('task-1', BUILDER)

  clock.advance(901)
  assert.equal(store.isLeased('task-1'), false)
  assert.deepEqual(store.getActive('task-1'), null)
  assert.equal(store.get('task-1').actorId, 'builder')

  const second = await store.claim('task-1', OFFICE)

  assert.equal(second.actorId, 'office')
  assert.equal(second.claimedAt, clock.iso())
  assert.equal(store.getActive('task-1').actorId, 'office')

  const reclaim = store.getActivity('task-1').at(-1)
  assert.equal(reclaim.type, 'reclaim')
  assert.equal(reclaim.taskId, 'task-1')
  assert.equal(reclaim.previousActorId, 'builder')
  assert.equal(reclaim.previousExpiresAt, first.expiresAt)
  assert.equal(reclaim.actorId, 'office')
})

test('a lease expires exactly at its TTL boundary', async (t) => {
  const { store, clock } = makeHarness(t)
  await store.claim('task-1', BUILDER, 60)

  clock.advance(59)
  assert.equal(store.isLeased('task-1'), true)

  clock.advance(1)
  assert.equal(store.isLeased('task-1'), false)
})

test('heartbeat extends the lease only for its owner', async (t) => {
  const { store, clock } = makeHarness(t)
  await store.claim('task-1', BUILDER)
  clock.advance(300)

  const beat = await store.heartbeat('task-1', BUILDER)

  assert.equal(beat.heartbeatAt, '2026-10-23T00:05:00.000Z')
  assert.equal(beat.expiresAt, '2026-10-23T00:20:00.000Z')
  assert.equal(store.getActive('task-1').expiresAt, beat.expiresAt)
  assert.equal(store.getActivity('task-1').at(-1).type, 'heartbeat')

  await assert.rejects(
    () => store.heartbeat('task-1', OFFICE),
    (error) => error.code === 'LEASE_NOT_OWNER' && error.details.owner === 'builder',
  )
  assert.equal(store.getActive('task-1').expiresAt, beat.expiresAt)
})

test('heartbeat fails when the lease is missing or already expired', async (t) => {
  const { store, clock } = makeHarness(t)

  await assert.rejects(
    () => store.heartbeat('missing', BUILDER),
    (error) => error.code === 'LEASE_NOT_FOUND',
  )

  await store.claim('task-1', BUILDER)
  clock.advance(901)

  await assert.rejects(
    () => store.heartbeat('task-1', BUILDER),
    (error) => error.code === 'LEASE_EXPIRED',
  )
  assert.equal(store.get('task-1').expiresAt, '2026-10-23T00:15:00.000Z')
})

test('release requires the owner and returns the cleared lease', async (t) => {
  const { store } = makeHarness(t)
  await store.claim('task-1', BUILDER)

  await assert.rejects(
    () => store.release('task-1', OFFICE),
    (error) => error.code === 'LEASE_NOT_OWNER' && error.details.owner === 'builder',
  )
  assert.equal(store.isLeased('task-1'), true)

  const released = await store.release('task-1', BUILDER)
  assert.equal(released.taskId, 'task-1')
  assert.equal(released.actorId, 'builder')
  assert.equal(store.get('task-1'), null)
  assert.equal(store.getActivity('task-1').at(-1).type, 'release')

  assert.equal(await store.release('task-1', BUILDER), null)
})

test('restart restores the lease from disk and blocks a duplicate claim', async (t) => {
  const { store, makeStore, clock } = makeHarness(t)
  const claimed = await store.claim('task-1', BUILDER)

  const restarted = makeStore()

  assert.deepEqual(restarted.getActive('task-1'), claimed)
  assert.equal(restarted.isLeased('task-1'), true)
  await assert.rejects(
    () => restarted.claim('task-1', OFFICE),
    (error) => error.code === 'LEASE_HELD',
  )
  assert.equal(restarted.getActive('task-1').actorId, 'builder')

  // The owner can keep heartbeating after a restart.
  clock.advance(60)
  const beat = await restarted.heartbeat('task-1', BUILDER)
  assert.equal(beat.expiresAt, '2026-10-23T00:16:00.000Z')
})

test('corrupt state fails loudly and is never silently reset', async (t) => {
  const { dir, stateFile, clock } = makeHarness(t)
  const corruptCases = [
    ['invalid JSON', '{not json'],
    [
      'missing activity array',
      JSON.stringify({ version: 1, leases: {}, activity: 'nope' }),
    ],
    [
      'invalid lease timestamp',
      JSON.stringify({
        version: 1,
        leases: {
          'task-1': {
            taskId: 'task-1',
            actorId: 'builder',
            leaseSeconds: 900,
            claimedAt: 'nope',
            heartbeatAt: 'nope',
            expiresAt: 'nope',
          },
        },
        activity: [],
      }),
    ],
    ['unsupported version', JSON.stringify({ version: 99, leases: {}, activity: [] })],
  ]

  for (const [name, contents] of corruptCases) {
    writeFileSync(stateFile, contents)
    assert.throws(
      () => new LeaseStore({ file: stateFile, now: clock.now }),
      (error) => error.code === 'LEASE_STATE_ERROR' && error.details.file === stateFile,
      `${name} must fail loudly`,
    )
    assert.equal(readFileSync(stateFile, 'utf8'), contents, `${name} must not be rewritten`)
  }

  // Corruption that appears after construction must also fail, without a reset.
  writeFileSync(stateFile, '{"version":1,"leases":{},"activity":[]}')
  const live = new LeaseStore({ file: stateFile, now: clock.now })
  writeFileSync(stateFile, '{broken later')
  await assert.rejects(
    () => live.claim('task-1', BUILDER),
    (error) => error.code === 'LEASE_STATE_ERROR',
  )
  assert.equal(readFileSync(stateFile, 'utf8'), '{broken later')
  assert.deepEqual(readdirSync(dir), ['state.json'])
})

test('terminal statuses are rejected before a lease is created', async (t) => {
  const { store, stateFile } = makeHarness(t)

  assert.equal(isTerminalStatus('done'), true)
  assert.equal(isTerminalStatus('canceled'), true)
  assert.equal(isTerminalStatus('in_progress'), false)
  assert.equal(isLeasableStatus('done'), false)
  assert.equal(isLeasableStatus('todo'), true)
  assert.throws(
    () => assertLeasableStatus('done', { taskId: 'task-1' }),
    (error) => error.code === 'LEASE_TERMINAL_STATUS' && error.details.status === 'done',
  )
  assert.doesNotThrow(() => assertLeasableStatus('todo'))

  for (const status of ['done', 'canceled']) {
    await assert.rejects(
      () => store.claim(`task-${status}`, BUILDER, 900, { status }),
      (error) => error.code === 'LEASE_TERMINAL_STATUS' && error.details.status === status,
    )
  }

  assert.equal(existsSync(stateFile), false)

  const allowed = await store.claim('task-todo', BUILDER, 900, { status: 'todo' })
  assert.equal(allowed.actorId, 'builder')
  assert.equal(store.isLeased('task-todo'), true)
})

test('leases on different tasks are independent', async (t) => {
  const { store } = makeHarness(t)
  await store.claim('task-a', BUILDER)
  await store.claim('task-b', OFFICE)

  assert.deepEqual(store.listActive().map((lease) => lease.taskId).sort(), ['task-a', 'task-b'])

  await store.release('task-a', BUILDER)
  assert.equal(store.isLeased('task-a'), false)
  assert.equal(store.isLeased('task-b'), true)
  assert.equal(store.listActive().length, 1)
})

test('custom TTLs are honoured and invalid arguments are rejected', async (t) => {
  const { dir, store } = makeHarness(t)

  const lease = await store.claim('task-1', BUILDER, 60)
  assert.equal(lease.expiresAt, '2026-10-23T00:01:00.000Z')

  for (const ttl of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(
      () => store.claim('task-invalid', BUILDER, ttl),
      (error) => error.code === 'LEASE_INVALID_ARGUMENT',
    )
  }
  await assert.rejects(
    () => store.claim('', BUILDER),
    (error) => error.code === 'LEASE_INVALID_ARGUMENT',
  )
  await assert.rejects(
    () => store.claim('task-2', {}),
    (error) => error.code === 'LEASE_INVALID_ARGUMENT',
  )
  assert.equal(store.get('task-invalid'), null)
  assert.deepEqual(readdirSync(dir), ['state.json'])
})

test('state file is written atomically with owner-only permissions and no secrets', async (t) => {
  const { dir, stateFile, store } = makeHarness(t)
  const actorWithSecrets = {
    id: 'builder',
    type: 'agent',
    name: '扳子',
    token: 'super-secret-token',
    apiKey: 'secret-key',
  }

  await store.claim('task-1', actorWithSecrets)
  await store.heartbeat('task-1', actorWithSecrets)

  const raw = readFileSync(stateFile, 'utf8')
  assert.equal(raw.includes('super-secret-token'), false)
  assert.equal(raw.includes('secret-key'), false)
  assert.equal(JSON.parse(raw).leases['task-1'].actorId, 'builder')
  assert.deepEqual(readdirSync(dir), ['state.json'])
  assert.equal(statSync(stateFile).mode & 0o777, 0o600)
})
