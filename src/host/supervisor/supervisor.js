/**
 * The supervisor cycle.
 *
 * One supervisor process owns the board writes. A cycle asks each configured
 * worker for its ready cards, leases one card at a time, wakes the worker's
 * persistent DSH session, and turns the worker's JSON result into either a Done
 * card or a blocked card that stays in progress for a human.
 *
 * Durability rules:
 * - The lease is claimed before any session/prompt work and persisted by the
 *   lease store. A restart mid-card therefore sees an active lease and skips
 *   the card instead of prompting twice.
 * - The session ids are persisted by DshWorkerSession.ensure before the prompt.
 * - The lease is released on every terminal path (done, blocked, error),
 *   including when a comment or status write fails. The only exception is a
 *   release failure after the card is already done; the card cannot be picked
 *   up again because Done is terminal, and the stale lease expires on its own.
 *
 * Failure rules:
 * - A done result requires evidence (parseWorkerResult enforces it).
 * - A turn that stops with reason "error" is blocked even when its text looks
 *   like a valid done result.
 * - If the evidence comment or the Done status write fails, the card is left in
 *   progress and a best-effort blocked comment is added. A card is never marked
 *   done without both writes succeeding.
 */

import {
  DEFAULT_LEASE_TTL_SECONDS,
  assertLeasableStatus,
  isTerminalStatus,
} from './lease.js'
import { buildWorkerPrompt, parseWorkerResult } from './prompt.js'

export const SUPERVISOR_ERROR = 'SUPERVISOR_ERROR'

const ASSIGNMENT_STATUSES = Object.freeze(['todo', 'backlog', 'in_progress'])
const BOARD_METHODS = Object.freeze([
  'listAssigned',
  'getTask',
  'claim',
  'updateStatus',
  'comment',
  'block',
  'release',
])

function supervisorError(message, details = {}) {
  return Object.assign(new Error(message), { code: SUPERVISOR_ERROR, details })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function requireObject(value, name) {
  if (!isPlainObject(value)) throw new TypeError(`Supervisor requires a ${name} object`)
  return value
}

function requireMethod(target, name, method) {
  if (typeof target[method] !== 'function') {
    throw new TypeError(`Supervisor requires ${name}.${method}()`)
  }
}

function workerName(worker) {
  return isNonEmptyString(worker.name) ? worker.name : worker.id
}

function actorFor(worker) {
  // Attribution must be complete: the store falls back to the local user when
  // any field is missing, which would erase the worker as the author.
  return {
    type: 'agent',
    id: worker.id,
    name: workerName(worker),
    avatarUrl: null,
  }
}

function timeoutMsFor(worker) {
  const seconds = Number(worker.timeoutSeconds)
  if (!Number.isInteger(seconds) || seconds <= 0) return undefined
  return seconds * 1000
}

function leaseSecondsFor(worker) {
  const seconds = Number(worker.timeoutSeconds)
  if (!Number.isInteger(seconds) || seconds <= 0) return DEFAULT_LEASE_TTL_SECONDS
  // The prompt timeout must expire before the lease. Otherwise a slow worker
  // can be reclaimed while it is still running, causing a duplicate prompt.
  return seconds + 60
}

function reasonFor(error) {
  if (error === undefined || error === null) return 'unknown error'
  const message = error instanceof Error ? error.message : String(error)
  return error.code ? `${message} (${error.code})` : message
}

function contextualError(prefix, error) {
  const wrapped = new Error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`)
  if (error?.code) wrapped.code = error.code
  return wrapped
}

function renderDoneComment(worker, result) {
  const lines = [
    `Supervisor: worker ${workerName(worker)} (${worker.id}) reported done.`,
    '',
    `Summary: ${result.summary}`,
    '',
    'Evidence:',
    ...result.evidence.map((entry) => `- ${entry}`),
  ]
  if (isNonEmptyString(result.notes)) lines.push('', `Notes: ${result.notes.trim()}`)
  return lines.join('\n')
}

function renderBlockedComment(worker, { result, error } = {}) {
  const lines = [`Supervisor: worker ${workerName(worker)} (${worker.id}) did not finish the card.`]

  if (result !== undefined) {
    lines.push('', `Worker summary: ${result.summary}`)
    if (isNonEmptyString(result.notes)) lines.push('', `Notes: ${result.notes.trim()}`)
    if (result.evidence.length > 0) {
      lines.push('', 'Evidence reported before blocking:', ...result.evidence.map((entry) => `- ${entry}`))
    }
  }

  if (error !== undefined) lines.push('', `Reason: ${reasonFor(error)}`)

  lines.push('', 'The card stays in progress for a human to review. No Done status was written.')
  return lines.join('\n')
}

/**
 * Runs supervisor cycles against injected board, lease, and worker-session
 * dependencies. No model call happens in this module; it only drives the
 * session adapter.
 */
export class Supervisor {
  #dsh
  #board
  #workers
  #leases
  #sessions
  #readRolePrompt
  #clock
  #logger

  /**
   * @param {object} options
   * @param {object} [options.dsh] Host/runtime handle reserved for Task 7 wiring.
   * @param {object} options.board BoardPort-compatible adapter.
   * @param {Array<object>} options.workers Worker registry entries.
   * @param {object} options.leases Lease facade; only getActive() is read here.
   * @param {object} options.sessions DshWorkerSession-compatible adapter.
   * @param {(worker: object) => string|Promise<string>} options.readRolePrompt
   *   Reads the role rules for a worker (usually from worker.promptFile).
   * @param {() => Date|number|string} [options.clock]
   * @param {object} [options.logger] Optional console-like logger.
   */
  constructor({
    dsh,
    board,
    workers,
    leases,
    sessions,
    readRolePrompt,
    clock = () => new Date(),
    logger = console,
  } = {}) {
    requireObject(board, 'board')
    for (const method of BOARD_METHODS) requireMethod(board, 'board', method)

    if (!Array.isArray(workers)) throw new TypeError('Supervisor requires a workers array')
    workers.forEach((worker, index) => {
      if (!isPlainObject(worker) || !isNonEmptyString(worker.id)) {
        throw new TypeError(`Supervisor workers[${index}] must be an object with a non-empty id`)
      }
    })

    requireObject(leases, 'leases')
    requireMethod(leases, 'leases', 'getActive')

    requireObject(sessions, 'sessions')
    requireMethod(sessions, 'sessions', 'ensure')
    requireMethod(sessions, 'sessions', 'prompt')

    if (typeof readRolePrompt !== 'function') {
      throw new TypeError('Supervisor requires a readRolePrompt(worker) function')
    }
    if (typeof clock !== 'function') {
      throw new TypeError('Supervisor requires clock to be a function')
    }

    this.#dsh = dsh ?? null
    this.#board = board
    this.#workers = workers.slice()
    this.#leases = leases
    this.#sessions = sessions
    this.#readRolePrompt = readRolePrompt
    this.#clock = clock
    this.#logger = logger
  }

  /** The runtime handle supplied at wiring time (Task 7 uses it for services). */
  get dsh() {
    return this.#dsh
  }

  /**
   * Run one full cycle for every configured worker.
   *
   * Cards are processed sequentially per worker and across workers; a failure
   * on one card never aborts the rest of the cycle. The returned array reports
   * one entry per considered card.
   *
   * @returns {Promise<Array<{workerId: string, taskId: string|null, outcome: string, at: string}>>}
   */
  async runOnce() {
    const results = []
    const seen = new Set()

    for (const worker of this.#workers) {
      let assigned
      try {
        assigned = await this.#board.listAssigned(worker.id, [...ASSIGNMENT_STATUSES])
      } catch (error) {
        this.#log('warn', `cannot list assigned cards for worker ${worker.id}: ${reasonFor(error)}`)
        results.push(this.#report(worker, null, 'error', { reason: reasonFor(error) }))
        continue
      }

      for (const listed of Array.isArray(assigned) ? assigned : []) {
        const taskId = listed?.id
        // The board is the source of truth, but a stale or duplicated
        // assignment list must not produce two prompts for one card.
        if (!isNonEmptyString(taskId) || seen.has(taskId)) continue
        seen.add(taskId)
        results.push(await this.#runCard(worker, taskId))
      }
    }

    return results
  }

  async #runCard(worker, taskId) {
    let task
    try {
      task = await this.#board.getTask(taskId)
    } catch (error) {
      return this.#report(worker, taskId, 'error', { reason: reasonFor(error) })
    }

    if (task === undefined || task === null) {
      return this.#report(worker, taskId, 'skipped', { reason: 'missing' })
    }
    if (isTerminalStatus(task.status)) {
      return this.#report(worker, taskId, 'skipped', { reason: 'terminal' })
    }
    if (task.blockedReason || task.pendingQuestion) {
      return this.#report(worker, taskId, 'skipped', { reason: 'attention' })
    }

    let activeLease
    try {
      activeLease = this.#leases.getActive(task.id)
    } catch (error) {
      return this.#report(worker, taskId, 'error', { reason: reasonFor(error) })
    }
    if (activeLease !== null && activeLease !== undefined) {
      return this.#report(worker, taskId, 'skipped', { reason: 'leased' })
    }

    try {
      assertLeasableStatus(task.status, { taskId: task.id })
    } catch {
      return this.#report(worker, taskId, 'skipped', { reason: 'terminal' })
    }

    const actor = actorFor(worker)
    let claimed
    try {
      claimed = await this.#board.claim(task.id, actor, leaseSecondsFor(worker))
    } catch (error) {
      if (error?.code === 'LEASE_HELD') {
        return this.#report(worker, taskId, 'skipped', { reason: 'leased' })
      }
      return this.#report(worker, taskId, 'error', { reason: reasonFor(error) })
    }

    // LocalBoardAdapter returns the updated card. Fall back to a read only for
    // adapters that return nothing, so the Done write can use a real version.
    let current = claimed !== null && claimed !== undefined && Number.isInteger(claimed.version)
      ? claimed
      : null
    if (current === null) {
      try {
        current = await this.#board.getTask(task.id)
      } catch (error) {
        await this.#release(task.id, actor)
        return this.#report(worker, taskId, 'error', { reason: reasonFor(error) })
      }
    }
    if (current === null) {
      await this.#release(task.id, actor)
      return this.#report(worker, taskId, 'error', { reason: 'card disappeared after claim' })
    }

    // The lease is held from here on. Every path below must release it.
    let result
    try {
      await this.#sessions.ensure(worker)
      const rolePrompt = await this.#readRolePrompt(worker)
      const prompt = buildWorkerPrompt({ worker, task: current, rolePrompt })
      const timeoutMs = timeoutMsFor(worker)
      const response = await this.#sessions.prompt(
        worker,
        prompt,
        timeoutMs === undefined ? undefined : { timeoutMs },
      )

      if (response?.stopReason === 'error') {
        throw supervisorError('worker stopped with reason "error"', {
          workerId: worker.id,
          taskId: current.id,
          stopReason: 'error',
        })
      }

      result = parseWorkerResult(response?.text)
    } catch (error) {
      return this.#blocked(worker, current, actor, { error })
    }

    if (result.outcome === 'blocked') {
      return this.#blocked(worker, current, actor, { result })
    }

    try {
      await this.#board.comment(current.id, renderDoneComment(worker, result), actor)
    } catch (error) {
      return this.#blocked(worker, current, actor, {
        error: contextualError('cannot record evidence', error),
      })
    }

    try {
      await this.#board.updateStatus(current.id, current.version, 'done', actor)
    } catch (error) {
      return this.#blocked(worker, current, actor, {
        error: contextualError('cannot mark card done', error),
      })
    }

    // The card is done. A release failure cannot cause a duplicate prompt
    // because Done cards are never listed as assigned work again.
    const releaseError = await this.#release(current.id, actor)
    return this.#report(worker, current.id, 'done', releaseError === null
      ? {}
      : { releaseError: reasonFor(releaseError) })
  }

  async #blocked(worker, task, actor, { result, error } = {}) {
    const reason = result?.summary ?? reasonFor(error) ?? 'worker blocked without a reason'
    let blockError = null
    try {
      await this.#board.block(task.id, task.version, reason, actor)
    } catch (failure) {
      blockError = failure
      this.#log('warn', `cannot mark card ${task.id} blocked: ${reasonFor(failure)}`)
    }
    const commentError = await this.#comment(task.id, renderBlockedComment(worker, { result, error }), actor)
    const releaseError = await this.#release(task.id, actor)

    const details = {}
    if (result !== undefined) details.summary = result.summary
    if (error !== undefined) details.reason = reasonFor(error)
    if (blockError !== null) details.blockError = reasonFor(blockError)
    if (commentError !== null) details.commentError = reasonFor(commentError)
    if (releaseError !== null) details.releaseError = reasonFor(releaseError)
    return this.#report(worker, task.id, 'blocked', details)
  }

  async #comment(taskId, body, actor) {
    try {
      await this.#board.comment(taskId, body, actor)
      return null
    } catch (error) {
      this.#log('warn', `cannot comment on card ${taskId}: ${reasonFor(error)}`)
      return error
    }
  }

  async #release(taskId, actor) {
    try {
      await this.#board.release(taskId, actor)
      return null
    } catch (error) {
      this.#log('warn', `cannot release card ${taskId}: ${reasonFor(error)}`)
      return error
    }
  }

  #report(worker, taskId, outcome, details = {}) {
    return {
      workerId: worker.id,
      taskId: taskId ?? null,
      outcome,
      at: this.#isoNow(),
      ...details,
    }
  }

  #isoNow() {
    try {
      const value = this.#clock()
      const date = value instanceof Date ? value : new Date(value)
      if (!Number.isNaN(date.getTime())) return date.toISOString()
    } catch {
      // Timestamps are diagnostic only; never fail a cycle over the clock.
    }
    return new Date().toISOString()
  }

  #log(level, message) {
    const logger = this.#logger
    const write = logger?.[level] ?? logger?.log
    if (typeof write !== 'function') return
    try {
      write.call(logger, `[kanban-supervisor] ${message}`)
    } catch {
      // Logging must never change cycle behavior.
    }
  }
}
