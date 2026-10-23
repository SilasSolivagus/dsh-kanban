import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_STATE_FILE,
  DshWorkerSession,
  WORKER_SERVICE_UNAVAILABLE,
  WORKER_SESSION_ERROR,
  WORKER_TIMEOUT,
} from '../supervisor/worker-session.js'

const WORKER = Object.freeze({
  id: 'builder',
  name: '扳子',
  role: 'builder',
  cwd: '/tmp/builder-worktree',
  timeoutSeconds: 900,
})

const BOOTSTRAP = 'session initialization'

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

/**
 * Fake Host services for the proven spike path:
 * agentLoop.createAgent/resume -> hidden parent,
 * subagents.startActivation -> child, subagents.prompt -> wake,
 * sessionQuery.observeSession -> result, interruptByParent -> stop.
 *
 * No model call happens here; every activation/result is synthetic.
 */
function makeWorld(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-kanban-session-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const stateFile = overrides.stateFile ?? join(dir, 'sessions.json')
  const calls = []
  const events = new Map()
  const pending = new Map()
  const liveParents = new Set(overrides.liveParentIds ?? [])
  const parents = new Map()
  const clock = { ms: Date.parse('2026-10-23T00:00:00.000Z') }

  let seq = 0
  let parentCounter = 0

  function nextSeq() {
    seq += 1
    return seq
  }

  function eventsFor(childId) {
    if (!events.has(childId)) events.set(childId, [])
    return events.get(childId)
  }

  function pushBootstrapTurn(childId) {
    const list = eventsFor(childId)
    list.push({
      seq: nextSeq(),
      type: 'assistant/message',
      data: { message: { role: 'assistant', content: [{ type: 'text', text: 'READY' }] } },
    })
    list.push({ seq: nextSeq(), type: 'turn/end', data: { reason: { kind: 'completed' } } })
  }

  const providerNames = overrides.providerNames ?? ['spawn', 'fork']
  const continuable = overrides.continuableProviders ?? providerNames

  const subagents = {
    list: () => [...providerNames],
    getProvider: (name) => {
      if (!providerNames.includes(name)) return undefined
      return continuable.includes(name)
        ? { name, prepareContinuable: async () => ({}) }
        : { name, start: async () => undefined }
    },
    startActivation: async (spec) => {
      calls.push({ type: 'startActivation', spec })
      pushBootstrapTurn(spec.childId)
      return {
        childId: spec.childId,
        messageId: `message-${spec.childId}`,
        result: Promise.resolve({ output: [{ type: 'text', text: 'READY' }], stopReason: 'completed' }),
        dispose: async () => calls.push({ type: 'dispose-activation', childId: spec.childId }),
      }
    },
    prompt: async (request) => {
      calls.push({ type: 'prompt', request })
      if (overrides.dropReplies !== true) {
        const text = textOf(request.content)
        const reply = {
          text: text.includes('second') ? 'second result' : text.includes('first') ? 'first result' : `result: ${text}`,
          reason: overrides.replyReason ?? 'completed',
        }
        pending.set(request.childSessionId, reply)
      }
      return { messageId: `message-${request.requestId}` }
    },
    interruptByParent: (childId, parentId, mode) => {
      calls.push({ type: 'interruptByParent', childId, parentId, mode })
      return { accepted: true }
    },
    interrupt: (childId, options) => {
      calls.push({ type: 'interrupt', childId, options })
    },
  }

  const agents = {
    get: (id) => (liveParents.has(id) ? parents.get(id) ?? { id } : undefined),
    currentInitiator: () => undefined,
    list: () => [...parents.values()],
  }

  const agentLoop = {
    createAgent: async (ownerCtx, options) => {
      calls.push({ type: 'createAgent', ownerCtx, options })
      parentCounter += 1
      const parent = { id: options?.sessionId ?? `parent-${parentCounter}` }
      parents.set(parent.id, parent)
      liveParents.add(parent.id)
      return {
        agent: parent,
        dispose: async () => calls.push({ type: 'dispose-parent', id: parent.id }),
      }
    },
    resume: async (ownerCtx, options) => {
      calls.push({ type: 'resume', ownerCtx, options })
      if (overrides.resumeError) throw overrides.resumeError
      const parent = parents.get(options.resumeSessionId) ?? { id: options.resumeSessionId }
      parents.set(parent.id, parent)
      liveParents.add(parent.id)
      return {
        agent: parent,
        dispose: async () => calls.push({ type: 'dispose-parent', id: parent.id }),
      }
    },
  }

  const sessionQuery = {
    observeSession: async (childId, options) => {
      calls.push({ type: 'observeSession', childId, options })
      const reply = pending.get(childId)
      if (reply !== undefined) {
        pending.delete(childId)
        const list = eventsFor(childId)
        list.push({
          seq: nextSeq(),
          type: 'assistant/message',
          data: { message: { role: 'assistant', content: [{ type: 'text', text: reply.text }] } },
        })
        list.push({ seq: nextSeq(), type: 'turn/end', data: { reason: { kind: reply.reason } } })
      }
      return {
        events: structuredClone(eventsFor(childId)),
        [Symbol.dispose]() {},
      }
    },
  }

  const services = {
    subagents,
    agentLoop,
    agents,
    sessionQuery,
    sessionPersistence: { name: 'fake-persistence' },
    agentDefaultModel: { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) },
    workingDirectory: { defaultDirectory: '/tmp/builder-worktree' },
  }

  for (const name of overrides.omitServices ?? []) delete services[name]
  Object.assign(services, overrides.services ?? {})

  const ctx = overrides.ctx ?? { id: 'plugin-owner-ctx' }

  function makeSession(sessionOverrides = {}) {
    return new DshWorkerSession({
      getService: (name) => services[name],
      stateFile,
      ctx,
      now: () => clock.ms,
      sleep: async (ms) => {
        clock.ms += ms
      },
      ...sessionOverrides,
    })
  }

  return { dir, stateFile, calls, clock, services, ctx, makeSession, liveParents, parents }
}

function activationCalls(world) {
  return world.calls.filter((call) => call.type === 'startActivation')
}

function promptCalls(world) {
  return world.calls.filter((call) => call.type === 'prompt')
}

test('default state file lives under ~/.dsh and writes ids with mode 0600', async (t) => {
  assert.equal(DEFAULT_STATE_FILE, join(homedir(), '.dsh', 'kanban-worker-sessions.json'))

  const world = makeWorld(t)
  const session = world.makeSession()
  const ids = await session.ensure(WORKER)

  const stat = statSync(world.stateFile)
  assert.equal(stat.mode & 0o777, 0o600)

  const persisted = JSON.parse(readFileSync(world.stateFile, 'utf8'))
  assert.equal(persisted.version, 1)
  assert.equal(persisted.workers.builder.parentId, ids.parentId)
  assert.equal(persisted.workers.builder.childId, ids.childId)
  assert.equal(typeof persisted.workers.builder.updatedAt, 'string')

  // Atomic write leaves no temporary file behind and stores no prompt text.
  assert.deepEqual(readdirSync(world.dir).filter((name) => name.endsWith('.tmp')), [])
  const raw = readFileSync(world.stateFile, 'utf8')
  assert.ok(!raw.includes(BOOTSTRAP), 'bootstrap prompt must not be persisted')
  assert.ok(!raw.includes('READY'), 'worker output must not be persisted')
})

test('ensure creates one hidden parent and one child, and returns both ids', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()
  const ids = await session.ensure(WORKER)

  assert.deepEqual(Object.keys(ids).sort(), ['childId', 'parentId'])
  assert.equal(typeof ids.parentId, 'string')
  assert.equal(typeof ids.childId, 'string')

  const create = world.calls.find((call) => call.type === 'createAgent')
  assert.ok(create, 'expected agentLoop.createAgent for a hidden root')
  assert.equal(create.ownerCtx, world.ctx)
  assert.equal(create.options.meta.cwd, WORKER.cwd)
  assert.equal(create.options.agentOptions.provider, 'fake')

  const [activation] = activationCalls(world)
  assert.ok(activation, 'expected subagents.startActivation for the child')
  assert.equal(activation.spec.provider, 'spawn')
  assert.equal(activation.spec.childId, ids.childId)
  assert.match(activation.spec.label, /builder/)
  assert.equal(activation.spec.delivery, 'caller')
  assert.equal(activation.spec.request.parent.id, ids.parentId)
  assert.equal(activation.spec.request.cwd, WORKER.cwd)
  assert.ok(textOf(activation.spec.request.prompt).length > 0, 'bootstrap prompt must not be empty')
})

test('repeated ensure calls reuse the same parent and child', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()

  const first = await session.ensure(WORKER)
  const second = await session.ensure(WORKER)

  assert.deepEqual(second, first)
  assert.equal(world.calls.filter((call) => call.type === 'createAgent').length, 1)
  assert.equal(activationCalls(world).length, 1)
})

test('prompt returns each turn from the same persisted child', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()
  const ids = await session.ensure(WORKER)

  const first = await session.prompt(WORKER, 'first card', { timeoutMs: 1_000 })
  const second = await session.prompt(WORKER, 'second card', { timeoutMs: 1_000 })

  assert.deepEqual(first, { text: 'first result', stopReason: 'completed', childId: ids.childId })
  assert.deepEqual(second, { text: 'second result', stopReason: 'completed', childId: ids.childId })

  const requests = promptCalls(world).map((call) => call.request)
  assert.equal(requests.length, 2)
  for (const request of requests) {
    assert.equal(request.childSessionId, ids.childId)
    assert.equal(request.parentSessionId, ids.parentId)
    assert.equal(request.mode, 'continuable')
    assert.equal(request.delivery, 'queue')
  }
  assert.equal(activationCalls(world).length, 1, 'prompt must never create a second child')

  const raw = readFileSync(world.stateFile, 'utf8')
  assert.ok(!raw.includes('first card'))
  assert.ok(!raw.includes('first result'))
})

test('a restarted instance resumes the persisted child instead of creating a second one', async (t) => {
  const world = makeWorld(t)
  const first = world.makeSession()
  const ids = await first.ensure(WORKER)

  const restarted = world.makeSession()
  const resumed = await restarted.ensure(WORKER)

  assert.deepEqual(resumed, ids)
  assert.equal(world.calls.filter((call) => call.type === 'createAgent').length, 1)
  assert.equal(world.calls.filter((call) => call.type === 'resume').length, 0, 'a live parent is reused')
  assert.equal(activationCalls(world).length, 1)

  const turn = await restarted.prompt(WORKER, 'after restart', { timeoutMs: 1_000 })
  assert.equal(turn.childId, ids.childId)
  assert.equal(promptCalls(world)[0].request.childSessionId, ids.childId)
  assert.equal(promptCalls(world)[0].request.parentSessionId, ids.parentId)
})

test('ensure resumes the hidden parent when it is no longer live', async (t) => {
  const world = makeWorld(t)
  const first = world.makeSession()
  const ids = await first.ensure(WORKER)

  world.liveParents.delete(ids.parentId)

  const restarted = world.makeSession()
  const resumed = await restarted.ensure(WORKER)

  assert.deepEqual(resumed, ids)
  const resume = world.calls.find((call) => call.type === 'resume')
  assert.ok(resume, 'expected agentLoop.resume for a cold hidden parent')
  assert.equal(resume.ownerCtx, world.ctx)
  assert.equal(resume.options.resumeSessionId, ids.parentId)
  assert.equal(activationCalls(world).length, 1, 'the persisted child must not be replaced')
})

test('ensure refuses to create a second child when the persisted parent cannot be resumed', async (t) => {
  const world = makeWorld(t)
  const first = world.makeSession()
  const ids = await first.ensure(WORKER)
  world.liveParents.delete(ids.parentId)
  world.services.agentLoop.resume = async () => {
    throw new Error('session is gone')
  }

  const restarted = world.makeSession()
  await assert.rejects(restarted.ensure(WORKER), (error) => {
    assert.equal(error.code, WORKER_SESSION_ERROR)
    assert.equal(error.details.parentId, ids.parentId)
    assert.equal(error.details.childId, ids.childId)
    return true
  })
  assert.equal(activationCalls(world).length, 1, 'a missing parent must not silently create a new child')
})

test('prompt times out, interrupts the same child, then throws WORKER_TIMEOUT', async (t) => {
  const world = makeWorld(t, { dropReplies: true })
  const session = world.makeSession()
  const ids = await session.ensure(WORKER)

  await assert.rejects(session.prompt(WORKER, 'never answers', { timeoutMs: 100 }), (error) => {
    assert.equal(error.code, WORKER_TIMEOUT)
    assert.equal(error.details.childId, ids.childId)
    assert.equal(error.details.parentId, ids.parentId)
    assert.equal(error.details.timeoutMs, 100)
    return true
  })

  const interrupt = world.calls.find((call) => call.type === 'interruptByParent')
  assert.ok(interrupt, 'timeout must interrupt the running child')
  assert.equal(interrupt.childId, ids.childId)
  assert.equal(interrupt.parentId, ids.parentId)
  assert.equal(interrupt.mode, 'continuable')
})

test('interrupt stops the persisted child through its parent', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()
  const ids = await session.ensure(WORKER)

  const result = await session.interrupt(WORKER)

  assert.equal(result.accepted, true)
  assert.equal(result.childId, ids.childId)
  const interrupt = world.calls.find((call) => call.type === 'interruptByParent')
  assert.deepEqual(
    { childId: interrupt.childId, parentId: interrupt.parentId, mode: interrupt.mode },
    { childId: ids.childId, parentId: ids.parentId, mode: 'continuable' },
  )
})

test('interrupt refuses to create a session that does not exist', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()

  await assert.rejects(session.interrupt(WORKER), (error) => {
    assert.equal(error.code, WORKER_SESSION_ERROR)
    return true
  })
  assert.equal(world.calls.filter((call) => call.type === 'createAgent').length, 0)
  assert.equal(activationCalls(world).length, 0)
})

test('a failed child turn is reported as stopReason error, not success', async (t) => {
  const world = makeWorld(t, { replyReason: 'error' })
  const session = world.makeSession()

  const result = await session.prompt(WORKER, 'bad card', { timeoutMs: 1_000 })

  assert.equal(result.stopReason, 'error')
  assert.equal(result.text, 'result: bad card')
})

test('prefers spawn among continuable providers and rejects a non-continuable registry', async (t) => {
  const world = makeWorld(t, { providerNames: ['external-once', 'spawn'], continuableProviders: ['spawn'] })
  const session = world.makeSession()
  await session.ensure(WORKER)

  assert.equal(activationCalls(world)[0].spec.provider, 'spawn')

  const badWorld = makeWorld(t, { providerNames: ['external-once'], continuableProviders: [] })
  const badSession = badWorld.makeSession()
  await assert.rejects(badSession.ensure(WORKER), (error) => {
    assert.equal(error.code, WORKER_SERVICE_UNAVAILABLE)
    return true
  })
  assert.equal(activationCalls(badWorld).length, 0, 'a non-continuable provider must not start a child')
})

test('missing Host services raise WORKER_SERVICE_UNAVAILABLE', async (t) => {
  for (const name of ['subagents', 'agentLoop', 'sessionPersistence']) {
    const world = makeWorld(t, { omitServices: [name] })
    const session = world.makeSession()
    await assert.rejects(session.ensure(WORKER), (error) => {
      assert.equal(error.code, WORKER_SERVICE_UNAVAILABLE, `missing ${name}`)
      return true
    })
  }

  const world = makeWorld(t, { omitServices: ['sessionQuery'] })
  const session = world.makeSession()
  await assert.rejects(session.prompt(WORKER, 'card', { timeoutMs: 100 }), (error) => {
    assert.equal(error.code, WORKER_SERVICE_UNAVAILABLE)
    return true
  })
})

test('a corrupt state file is rejected and never overwritten', async (t) => {
  const world = makeWorld(t)
  writeFileSync(world.stateFile, '{not json', { mode: 0o600 })

  const session = world.makeSession()
  await assert.rejects(session.ensure(WORKER), (error) => {
    assert.equal(error.code, WORKER_SESSION_ERROR)
    assert.match(error.message, /state/i)
    return true
  })

  assert.equal(readFileSync(world.stateFile, 'utf8'), '{not json')
  assert.equal(world.calls.filter((call) => call.type === 'createAgent').length, 0)
})

test('a state write failure raises WORKER_SESSION_ERROR', async (t) => {
  const world = makeWorld(t)
  const blocker = join(world.dir, 'blocker')
  writeFileSync(blocker, 'not a directory')
  const session = world.makeSession({ stateFile: join(blocker, 'sessions.json') })

  await assert.rejects(session.ensure(WORKER), (error) => {
    assert.equal(error.code, WORKER_SESSION_ERROR)
    return true
  })
})

test('invalid worker, prompt, and timeout arguments raise WORKER_SESSION_ERROR', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()

  await assert.rejects(session.ensure({}), (error) => error.code === WORKER_SESSION_ERROR)
  await assert.rejects(session.prompt(WORKER, '   ', { timeoutMs: 100 }), (error) => error.code === WORKER_SESSION_ERROR)
  await assert.rejects(session.prompt(WORKER, 'card', { timeoutMs: 0 }), (error) => error.code === WORKER_SESSION_ERROR)
})

test('close disposes the hidden parent handle once and is idempotent', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()
  await session.ensure(WORKER)

  await session.close()
  await session.close()

  assert.equal(world.calls.filter((call) => call.type === 'dispose-parent').length, 1)
  await assert.rejects(session.ensure(WORKER), (error) => error.code === WORKER_SESSION_ERROR)
})

test('state persists one entry per worker without secrets', async (t) => {
  const world = makeWorld(t)
  const session = world.makeSession()
  const builder = await session.ensure(WORKER)

  const other = { ...WORKER, id: 'reviewer', cwd: '/tmp/reviewer-worktree' }
  const reviewer = await session.ensure(other)

  const persisted = JSON.parse(readFileSync(world.stateFile, 'utf8'))
  assert.deepEqual(Object.keys(persisted.workers).sort(), ['builder', 'reviewer'])
  assert.equal(persisted.workers.builder.childId, builder.childId)
  assert.equal(persisted.workers.reviewer.childId, reviewer.childId)
  assert.notEqual(builder.childId, reviewer.childId)

  for (const entry of Object.values(persisted.workers)) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ['childId', 'createdAt', 'label', 'parentId', 'provider', 'updatedAt'],
    )
    assert.ok(!('prompt' in entry))
    assert.ok(!('result' in entry))
  }
})
