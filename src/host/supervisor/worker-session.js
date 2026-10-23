/**
 * DshWorkerSession owns one persistent DSH child session per worker.
 *
 * The supervisor never talks to a model itself. It creates a hidden root Agent
 * (the parent), starts one continuable child under it (the worker), and from
 * then on wakes that same child for every card. The parent and child ids are
 * persisted so a supervisor restart resumes the worker instead of creating
 * another session.
 *
 * This module follows the proven P1.0b spike path:
 *   agentLoop.createAgent / resume  -> hidden parent
 *   subagents.startActivation       -> create the child
 *   subagents.prompt                -> wake the child
 *   sessionQuery.observeSession     -> read the child's completed turn
 *   subagents.interruptByParent     -> stop a timed-out child
 *
 * State file default: ~/.dsh/kanban-worker-sessions.json
 * It stores ids, provider, and label only. No prompt text, result text, tokens,
 * or credentials are ever written. Writes are atomic (temp file + rename) and
 * the file mode is 0600.
 *
 * Error codes:
 *   WORKER_SESSION_ERROR        invalid input, corrupt/unwritable state, broken protocol
 *   WORKER_TIMEOUT              prompt produced no completed turn before the deadline
 *   WORKER_SERVICE_UNAVAILABLE  a required Host service or capability is missing
 *
 * A timeout always attempts to interrupt the child before throwing
 * WORKER_TIMEOUT. A child turn that ends with reason "error" is returned with
 * `stopReason: "error"` so the supervisor records blocked, never done.
 */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

export const WORKER_SESSION_ERROR = 'WORKER_SESSION_ERROR'
export const WORKER_TIMEOUT = 'WORKER_TIMEOUT'
export const WORKER_SERVICE_UNAVAILABLE = 'WORKER_SERVICE_UNAVAILABLE'

export const DEFAULT_STATE_FILE = join(homedir(), '.dsh', 'kanban-worker-sessions.json')
export const STATE_VERSION = 1

const DEFAULT_PROMPT_TIMEOUT_MS = 900_000
const ACCEPT_TIMEOUT_MS = 30_000
const BOOTSTRAP_TIMEOUT_MS = 120_000
const OBSERVE_TIMEOUT_MS = 15_000
const DEFAULT_POLL_MS = 250
const MIN_POLL_MS = 10
const MAX_LABEL_CHARS = 200

// One short initialization turn materializes the continuable child. It carries
// no card, workspace secret, or worker prompt.
const BOOTSTRAP_PROMPT = [
  'This is the session initialization turn for a persistent worker session.',
  'Reply with exactly READY and do not start any work yet.',
].join(' ')

let temporaryCounter = 0

export function defaultStateFile() {
  return DEFAULT_STATE_FILE
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

function workerError(code, message, details = {}, cause) {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause })
  error.name = 'WorkerSessionError'
  error.code = code
  error.details = { ...details }
  return error
}

function sessionError(message, details = {}, cause) {
  return workerError(WORKER_SESSION_ERROR, message, details, cause)
}

function serviceUnavailable(target, details = {}, cause) {
  return workerError(
    WORKER_SERVICE_UNAVAILABLE,
    `worker session requires Host service "${target}"`,
    { service: target, ...details },
    cause,
  )
}

function timeoutError(message, details = {}) {
  return workerError(WORKER_TIMEOUT, message, details)
}

function asSessionError(error, message, details = {}) {
  if (
    error?.code === WORKER_SESSION_ERROR
    || error?.code === WORKER_TIMEOUT
    || error?.code === WORKER_SERVICE_UNAVAILABLE
  ) {
    return error
  }
  const cause = toError(error)
  return sessionError(`${message}: ${cause.message}`, { ...details, cause: cause.message }, cause)
}

function capture(operation) {
  try {
    return { ok: true, value: operation() }
  } catch (error) {
    return { ok: false, error }
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, ms, message, details = {}) {
  const guarded = Promise.resolve(promise)
  // The loser of the race may settle later; never let that become unhandled.
  guarded.catch(() => undefined)
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(sessionError(message, { ...details, timeoutMs: ms })), ms)
  })
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer))
}

function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function textFromMessage(message) {
  return textFromBlocks(message?.content)
}

function disposeObservation(observation) {
  try {
    if (typeof observation?.[Symbol.dispose] === 'function') observation[Symbol.dispose]()
    else observation?.dispose?.()
  } catch {
    // Observation release is best-effort; the query service owns final cleanup.
  }
}

/**
 * A completed turn is one `turn/end` after the baseline. A matching
 * `assistant/message` supplies the text; an error or aborted turn may have no
 * assistant message and is still returned so the supervisor can record it.
 */
function completionFrom(events, baselineSeq) {
  if (!Array.isArray(events)) return null

  let turnEnd
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'turn/end' && Number.isInteger(event.seq) && event.seq > baselineSeq) {
      turnEnd = event
      break
    }
  }
  if (turnEnd === undefined) return null

  let assistant
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (
      event?.type === 'assistant/message'
      && Number.isInteger(event.seq)
      && event.seq > baselineSeq
      && event.seq < turnEnd.seq
    ) {
      assistant = event
      break
    }
  }

  return {
    text: assistant === undefined ? '' : textFromMessage(assistant.data?.message),
    stopReason: turnEnd.data?.reason?.kind ?? null,
  }
}

function emptyState() {
  return { version: STATE_VERSION, workers: {} }
}

function normalizeState(value, file) {
  if (!isPlainObject(value)) {
    throw sessionError(`corrupt worker session state in ${file}: expected a JSON object`, { file })
  }
  const rawWorkers = value.workers
  if (rawWorkers === undefined) return emptyState()
  if (!isPlainObject(rawWorkers)) {
    throw sessionError(`corrupt worker session state in ${file}: workers must be an object`, { file })
  }

  const workers = {}
  for (const [workerId, entry] of Object.entries(rawWorkers)) {
    if (!isNonEmptyString(workerId) || !isPlainObject(entry)) {
      throw sessionError(`corrupt worker session state in ${file}: invalid entry for ${workerId}`, { file })
    }
    if (!isNonEmptyString(entry.parentId)) {
      throw sessionError(`corrupt worker session state in ${file}: ${workerId} has no parentId`, { file })
    }
    workers[workerId] = {
      parentId: entry.parentId,
      childId: isNonEmptyString(entry.childId) ? entry.childId : null,
      provider: isNonEmptyString(entry.provider) ? entry.provider : null,
      label: isNonEmptyString(entry.label) ? entry.label : null,
      createdAt: isNonEmptyString(entry.createdAt) ? entry.createdAt : null,
      updatedAt: isNonEmptyString(entry.updatedAt) ? entry.updatedAt : null,
    }
  }
  return { version: STATE_VERSION, workers }
}

function requireWorker(worker) {
  if (!isPlainObject(worker) || !isNonEmptyString(worker.id)) {
    throw sessionError('worker must be an object with a non-empty id')
  }
  return worker.id.trim()
}

function resolveTimeout(timeoutMs, worker) {
  if (timeoutMs === undefined || timeoutMs === null) {
    const seconds = Number(worker?.timeoutSeconds)
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)
    return DEFAULT_PROMPT_TIMEOUT_MS
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw sessionError('prompt timeoutMs must be a positive integer', { timeoutMs })
  }
  return timeoutMs
}

/**
 * Persistent worker sessions for the Kanban supervisor.
 */
export class DshWorkerSession {
  #getService
  #ctx
  #stateFile
  #now
  #sleep
  #statePromise = null
  #writeQueue = Promise.resolve()
  #sessions = new Map()
  #ensuring = new Map()
  #handles = []
  #closed = false

  /**
   * @param {object} options
   * @param {(name: string) => any} options.getService Lazy Host service lookup,
   *   normally `(name) => ctx.get(name)`.
   * @param {string} [options.stateFile] Durable id file.
   * @param {object} [options.ctx] Plugin owner context for
   *   `agentLoop.createAgent(ctx, options)` / `resume(ctx, options)`.
   * @param {() => number|Date} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ getService, stateFile, ctx, now = () => Date.now(), sleep = defaultSleep } = {}) {
    if (typeof getService !== 'function') {
      throw new TypeError('DshWorkerSession requires a getService(name) function')
    }
    if (!isNonEmptyString(stateFile ?? DEFAULT_STATE_FILE)) {
      throw new TypeError('DshWorkerSession requires a non-empty stateFile path')
    }
    this.#getService = getService
    this.#ctx = ctx
    this.#stateFile = stateFile ?? DEFAULT_STATE_FILE
    this.#now = now
    this.#sleep = sleep
  }

  /**
   * Create or resume the hidden parent and the persistent child for a worker.
   *
   * A persisted child id is always reused. When the parent is no longer live,
   * it is resumed; if that fails this method throws instead of silently
   * creating a second child.
   *
   * @returns {Promise<{parentId: string, childId: string}>}
   */
  async ensure(worker) {
    const workerId = requireWorker(worker)
    if (this.#closed) throw sessionError('worker session is closed')

    const cached = this.#sessions.get(workerId)
    if (cached !== undefined) return { parentId: cached.parentId, childId: cached.childId }

    const pending = this.#ensuring.get(workerId)
    if (pending !== undefined) return pending

    const task = this.#ensureWorker(worker, workerId)
      .finally(() => this.#ensuring.delete(workerId))
    this.#ensuring.set(workerId, task)
    return task
  }

  /**
   * Wake the worker's persistent child with one prompt and wait for its turn.
   *
   * The same child is used across calls. A timeout interrupts that child and
   * throws WORKER_TIMEOUT. A turn that ends with reason "error" is returned
   * with `stopReason: "error"`; the supervisor must treat it as blocked.
   *
   * @returns {Promise<{text: string, stopReason: string|null, childId: string}>}
   */
  async prompt(worker, text, { timeoutMs } = {}) {
    const workerId = requireWorker(worker)
    if (this.#closed) throw sessionError('worker session is closed')
    if (!isNonEmptyString(text)) {
      throw sessionError('prompt text must be a non-empty string', { workerId })
    }
    const resolvedTimeoutMs = resolveTimeout(timeoutMs, worker)

    const session = await this.ensure(worker)
    const { parentId, childId } = session
    const current = this.#sessions.get(workerId)
    if (current === undefined || current.parent === undefined) {
      throw sessionError('worker session has no live hidden parent', { parentId, childId })
    }

    const subagents = this.#requireService('subagents', ['prompt'])
    const query = this.#requireService('sessionQuery', ['observeSession'])

    let baselineSeq
    try {
      baselineSeq = await this.#readBaseline(query, childId)
    } catch (error) {
      throw asSessionError(error, `cannot read worker ${workerId} before prompting`, { childId, parentId })
    }

    try {
      await withTimeout(
        Promise.resolve(subagents.prompt({
          requestId: randomUUID(),
          parentSessionId: parentId,
          childSessionId: childId,
          mode: 'continuable',
          delivery: 'queue',
          content: [{ type: 'text', text }],
        }, AbortSignal.timeout(ACCEPT_TIMEOUT_MS))),
        ACCEPT_TIMEOUT_MS,
        'worker prompt acceptance',
        { childId, parentId },
      )
    } catch (error) {
      throw asSessionError(error, `cannot prompt worker ${workerId}`, { childId, parentId })
    }

    let turn
    try {
      turn = await this.#waitForTurn({ query, childId, parentId, baselineSeq, timeoutMs: resolvedTimeoutMs })
    } catch (error) {
      if (error?.code === WORKER_TIMEOUT) {
        try {
          await this.interrupt(worker)
        } catch (interruptError) {
          error.details.interruptError = toError(interruptError).message
        }
      }
      throw error
    }

    return { text: turn.text, stopReason: turn.stopReason, childId }
  }

  /**
   * Stop the worker's current turn. Safe to call when the child is idle.
   *
   * @returns {Promise<{accepted: boolean, childId: string}>}
   */
  async interrupt(worker) {
    const workerId = requireWorker(worker)
    if (this.#closed) throw sessionError('worker session is closed')

    let session = this.#sessions.get(workerId)
    if (session === undefined) {
      // Do not create a worker just to interrupt it. Interrupt only an
      // already-persisted session; the supervisor always ensures before
      // prompting.
      const state = await this.#loadState()
      const entry = state.workers[workerId]
      if (entry === undefined || entry.childId === null) {
        throw sessionError('worker session was not created', { workerId })
      }
      const agents = this.#optionalService('agents')
      session = {
        parentId: entry.parentId,
        childId: entry.childId,
        provider: entry.provider,
        parent: capture(() => agents?.get?.(entry.parentId)).value,
      }
    }

    const subagents = this.#optionalService('subagents')
    const { childId, parentId } = session

    try {
      if (typeof subagents?.interruptByParent === 'function') {
        const receipt = await subagents.interruptByParent(childId, parentId, 'continuable')
        return { accepted: receipt?.accepted === true, childId }
      }
      if (typeof subagents?.interrupt === 'function') {
        if (session.parent === undefined || session.parent === null) {
          await this.ensure(worker)
          session = this.#sessions.get(workerId)
        }
        await subagents.interrupt(childId, { kind: 'ancestor', agent: session.parent })
        return { accepted: true, childId }
      }
    } catch (error) {
      throw asSessionError(error, `cannot interrupt worker ${workerId}`, { childId, parentId })
    }

    throw serviceUnavailable('subagents.interruptByParent', { childId })
  }

  /**
   * Release parent handles owned by this instance. Child sessions stay
   * persisted on disk and are resumed by the next supervisor process.
   */
  async close() {
    if (this.#closed) return
    this.#closed = true

    const handles = this.#handles.splice(0, this.#handles.length)
    for (const handle of handles) {
      try {
        await handle?.dispose?.()
      } catch {
        // Parent teardown is best-effort; ids stay persisted for a restart.
      }
    }
    this.#sessions.clear()
    this.#ensuring.clear()
  }

  async #ensureWorker(worker, workerId) {
    const state = await this.#loadState()
    const entry = state.workers[workerId] ?? null

    // If a child still has to be created, fail on missing capabilities before
    // creating a hidden parent that would then be left behind.
    if (entry === null || entry.childId === null) {
      this.#requireService('subagents', ['startActivation', 'list'])
      this.#requireService('sessionPersistence')
    }

    let parentInfo = entry === null ? null : await this.#resolveParent(entry)
    if (parentInfo === null) {
      parentInfo = await this.#createParent(worker)
      const timestamp = this.#iso()
      await this.#persist((current) => {
        current.workers[workerId] = {
          parentId: parentInfo.parent.id,
          childId: null,
          provider: null,
          label: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        return current
      })
    }

    this.#titleWorkerSession(parentInfo.parent, worker)

    const freshState = await this.#loadState()
    const freshEntry = freshState.workers[workerId] ?? null
    if (freshEntry === null || freshEntry.parentId !== parentInfo.parent.id) {
      throw sessionError('worker session state changed while creating the hidden parent', {
        workerId,
        parentId: parentInfo.parent.id,
      })
    }

    if (freshEntry.childId !== null) {
      this.#sessions.set(workerId, {
        parentId: freshEntry.parentId,
        childId: freshEntry.childId,
        provider: freshEntry.provider,
        parent: parentInfo.parent,
      })
      return { parentId: freshEntry.parentId, childId: freshEntry.childId }
    }

    const child = await this.#createChild(worker, parentInfo.parent)
    this.#sessions.set(workerId, {
      parentId: parentInfo.parent.id,
      childId: child.childId,
      provider: child.provider,
      parent: parentInfo.parent,
    })
    return { parentId: parentInfo.parent.id, childId: child.childId }
  }

  async #resolveParent(entry) {
    const parentId = entry.parentId
    const agents = this.#optionalService('agents')
    const live = capture(() => agents?.get?.(parentId)).value
    if (live?.id === parentId) return { parent: live }

    const agentLoop = this.#optionalService('agentLoop')
    if (typeof agentLoop?.resume !== 'function') {
      throw sessionError(
        `persisted hidden parent ${parentId} is not live and agentLoop.resume is unavailable`,
        { parentId, childId: entry.childId },
      )
    }

    const ctx = this.#ownerContext()
    let handle
    try {
      handle = await withTimeout(
        Promise.resolve(agentLoop.resume(ctx, {
          resumeSessionId: parentId,
          signal: AbortSignal.timeout(ACCEPT_TIMEOUT_MS),
        })),
        ACCEPT_TIMEOUT_MS,
        'hidden parent resume',
        { parentId },
      )
    } catch (error) {
      throw asSessionError(error, `cannot resume hidden parent ${parentId}`, {
        parentId,
        childId: entry.childId,
      })
    }

    const agent = handle?.agent
    if (!agent?.id) {
      throw sessionError(`agentLoop.resume returned no Agent for parent ${parentId}`, {
        parentId,
        childId: entry.childId,
      })
    }
    if (agent.id !== parentId) {
      throw sessionError(
        `agentLoop.resume returned parent ${agent.id} instead of ${parentId}`,
        { parentId, childId: entry.childId },
      )
    }
    this.#trackHandle(handle)
    return { parent: agent }
  }

  #titleWorkerSession(agent, worker) {
    const sessionTitle = this.#optionalService('sessionTitle')
    if (typeof sessionTitle?.rename !== 'function' || !agent?.session) return
    try {
      sessionTitle.rename(agent.session, `Kanban · ${worker.name}`)
    } catch {
      // Naming is cosmetic; a title failure must not block the worker.
    }
  }

  #agentPreset(worker) {
    return typeof worker.agentPreset === 'string' && worker.agentPreset.trim() ? worker.agentPreset : 'standard'
  }

  async #createParent(worker) {
    const agentLoop = this.#requireService('agentLoop', ['createAgent'])
    const ctx = this.#ownerContext()
    const agentOptions = this.#defaultAgentOptions()

    let handle
    try {
      handle = await withTimeout(
        Promise.resolve(agentLoop.createAgent(ctx, {
          sessionId: randomUUID(),
          meta: { cwd: this.#resolveCwd(worker), isSeeded: false, agentPreset: this.#agentPreset(worker) },
          ...(agentOptions === undefined ? {} : { agentOptions }),
          signal: AbortSignal.timeout(ACCEPT_TIMEOUT_MS),
        })),
        ACCEPT_TIMEOUT_MS,
        'hidden parent creation',
      )
    } catch (error) {
      throw asSessionError(error, 'cannot create the hidden worker parent')
    }

    if (!handle?.agent?.id) {
      throw sessionError('agentLoop.createAgent returned no Agent')
    }
    this.#trackHandle(handle)
    return { parent: handle.agent }
  }

  async #createChild(worker, parent) {
    const subagents = this.#requireService('subagents', ['startActivation', 'list'])
    // A continuable child needs persistence; never fake a resumable session.
    this.#requireService('sessionPersistence')

    const provider = this.#selectProvider(subagents)
    const childId = randomUUID()
    const label = `kanban-worker:${worker.id}`.slice(0, MAX_LABEL_CHARS)

    let activation
    try {
      activation = await withTimeout(
        Promise.resolve(subagents.startActivation({
          provider,
          label,
          childId,
          request: {
            parent,
            prompt: [{ type: 'text', text: BOOTSTRAP_PROMPT }],
            cwd: this.#resolveCwd(worker),
            agentPreset: this.#agentPreset(worker),
          },
          signal: AbortSignal.timeout(ACCEPT_TIMEOUT_MS),
          delivery: 'caller',
        })),
        ACCEPT_TIMEOUT_MS,
        'worker child activation',
        { childId, provider },
      )
    } catch (error) {
      throw asSessionError(error, `cannot create worker child for ${worker.id}`, { childId, provider })
    }

    if (typeof activation?.result?.then !== 'function') {
      throw sessionError('worker child activation returned no result promise', { childId, provider })
    }

    // Persist the accepted ids immediately. A crash after this point resumes
    // this child instead of starting another one.
    const timestamp = this.#iso()
    await this.#persist((current) => {
      const entry = current.workers[worker.id] ?? {
        parentId: parent.id,
        childId: null,
        provider: null,
        label: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      entry.parentId = parent.id
      entry.childId = childId
      entry.provider = provider
      entry.label = label
      entry.createdAt = entry.createdAt ?? timestamp
      entry.updatedAt = timestamp
      current.workers[worker.id] = entry
      return current
    })

    let result
    try {
      result = await withTimeout(
        Promise.resolve(activation.result),
        BOOTSTRAP_TIMEOUT_MS,
        'worker bootstrap turn',
        { childId },
      )
    } catch (error) {
      throw asSessionError(error, `worker ${worker.id} bootstrap turn failed`, { childId })
    }

    if (result?.stopReason === 'error') {
      throw sessionError(`worker ${worker.id} bootstrap turn stopped with reason "error"`, {
        childId,
        stopReason: 'error',
      })
    }

    return { childId, provider }
  }

  #selectProvider(subagents) {
    const names = capture(() => subagents.list()).value
    if (!Array.isArray(names) || names.length === 0) {
      throw serviceUnavailable('subagents provider', { providerNames: names ?? null })
    }

    if (typeof subagents.getProvider !== 'function') {
      return names.includes('spawn') ? 'spawn' : names[0]
    }

    const continuable = names.filter((name) => {
      const provider = capture(() => subagents.getProvider(name)).value
      return typeof provider?.prepareContinuable === 'function'
    })
    if (continuable.includes('spawn')) return 'spawn'
    if (continuable.length > 0) return continuable[0]
    throw serviceUnavailable('continuable subagent provider', { providerNames: names })
  }

  async #waitForTurn({ query, childId, parentId, baselineSeq, timeoutMs }) {
    const deadline = this.#nowMs() + timeoutMs
    const pollMs = Math.max(MIN_POLL_MS, Math.min(DEFAULT_POLL_MS, Math.floor(timeoutMs / 10)))
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / pollMs))
    let attempts = 0
    let lastError

    while (attempts < maxAttempts && this.#nowMs() < deadline) {
      attempts += 1
      const remaining = Math.max(1, deadline - this.#nowMs())
      let observation
      try {
        observation = await this.#observeSession(
          query,
          childId,
          Math.max(1, Math.min(OBSERVE_TIMEOUT_MS, remaining)),
        )
        const completion = completionFrom(observation?.events, baselineSeq)
        if (completion !== null) return completion
      } catch (error) {
        lastError = error
      } finally {
        disposeObservation(observation)
      }

      if (this.#nowMs() >= deadline) break
      try {
        await this.#sleep(pollMs)
      } catch (error) {
        lastError = error
        break
      }
    }

    throw timeoutError(
      `worker prompt produced no completed turn within ${timeoutMs}ms`,
      {
        childId,
        parentId,
        timeoutMs,
        attempts,
        ...(lastError === undefined ? {} : { lastError: toError(lastError).message }),
      },
    )
  }

  async #observeSession(query, childId, timeoutMs) {
    const pending = Promise.resolve(query.observeSession(childId, { projectionMode: 'none' }))
    pending.catch(() => undefined)
    try {
      return await withTimeout(
        pending,
        timeoutMs,
        'session observation',
        { childId },
      )
    } catch (error) {
      pending.then(disposeObservation).catch(() => undefined)
      throw error
    }
  }

  async #readBaseline(query, childId) {
    const observation = await this.#observeSession(query, childId, OBSERVE_TIMEOUT_MS)
    try {
      const events = Array.isArray(observation?.events) ? observation.events : []
      const last = events[events.length - 1]
      return Number.isInteger(last?.seq) ? last.seq : -1
    } finally {
      disposeObservation(observation)
    }
  }

  #resolveCwd(worker) {
    if (isNonEmptyString(worker.cwd) && isAbsolute(worker.cwd)) return worker.cwd
    const workingDirectory = capture(() => this.#getService('workingDirectory')?.defaultDirectory).value
    if (isNonEmptyString(workingDirectory) && isAbsolute(workingDirectory)) return workingDirectory
    try {
      return process.cwd()
    } catch {
      return '/'
    }
  }

  #defaultAgentOptions() {
    const service = this.#optionalService('agentDefaultModel')
    const selection = capture(() => service?.currentSelection?.()).value
    if (!isPlainObject(selection)) return undefined
    if (!isNonEmptyString(selection.provider) || !isNonEmptyString(selection.model)) return undefined
    return {
      provider: selection.provider,
      model: selection.model,
      ...(isNonEmptyString(selection.reasoningEffort) ? { reasoningEffort: selection.reasoningEffort } : {}),
    }
  }

  #ownerContext() {
    if (this.#ctx !== undefined && this.#ctx !== null) return this.#ctx
    const fromService = capture(() => this.#getService('ctx')).value
    if (fromService !== undefined && fromService !== null) return fromService
    throw workerError(
      WORKER_SERVICE_UNAVAILABLE,
      'worker session requires the plugin owner context (constructor ctx) to create a hidden parent',
      { service: 'ctx' },
    )
  }

  #optionalService(name) {
    const result = capture(() => this.#getService(name))
    return result.ok ? result.value : undefined
  }

  #requireService(name, methods = []) {
    const result = capture(() => this.#getService(name))
    if (!result.ok) throw serviceUnavailable(name, {}, result.error)
    const service = result.value
    if (service === undefined || service === null) throw serviceUnavailable(name)
    for (const method of methods) {
      if (typeof service[method] !== 'function') {
        throw serviceUnavailable(`${name}.${method}`, { service: name, method })
      }
    }
    return service
  }

  #trackHandle(handle) {
    if (handle === undefined || handle === null) return
    if (typeof handle.dispose !== 'function') return
    if (!this.#handles.includes(handle)) this.#handles.push(handle)
  }

  #nowMs() {
    const value = this.#now()
    const ms = value instanceof Date ? value.getTime() : Number(value)
    if (!Number.isFinite(ms)) throw sessionError('now() must return a valid time')
    return ms
  }

  #iso() {
    return new Date(this.#nowMs()).toISOString()
  }

  #loadState() {
    if (this.#statePromise === null) this.#statePromise = this.#readState()
    return this.#statePromise
  }

  async #readState() {
    let text
    try {
      text = await readFile(this.#stateFile, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyState()
      throw sessionError(
        `cannot read worker session state ${this.#stateFile}: ${toError(error).message}`,
        { file: this.#stateFile },
        error,
      )
    }
    if (text.trim() === '') return emptyState()

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw sessionError(
        `corrupt worker session state in ${this.#stateFile}: ${toError(error).message}`,
        { file: this.#stateFile },
        error,
      )
    }
    return normalizeState(parsed, this.#stateFile)
  }

  /** Serialize read-modify-write so concurrent workers never lose an entry. */
  #persist(update) {
    const task = this.#writeQueue.then(async () => {
      const current = await this.#loadState()
      const next = update(structuredClone(current))
      await this.#writeFile(next)
      this.#statePromise = Promise.resolve(next)
      return next
    })
    this.#writeQueue = task.catch(() => undefined)
    return task
  }

  async #writeFile(state) {
    const directory = dirname(this.#stateFile)
    const temporary = `${this.#stateFile}.${process.pid}.${Date.now()}.${temporaryCounter += 1}.tmp`
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      })
      await rename(temporary, this.#stateFile)
      // Reassert the mode even if the destination previously existed with a
      // wider mode on a platform where rename does not carry the temp mode.
      await chmod(this.#stateFile, 0o600).catch(() => undefined)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw sessionError(
        `cannot write worker session state ${this.#stateFile}: ${toError(error).message}`,
        { file: this.#stateFile },
        error,
      )
    }
  }
}
