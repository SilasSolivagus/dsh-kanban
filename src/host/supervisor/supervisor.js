/**
 * The supervisor cycle.
 *
 * One supervisor process owns the board writes. A cycle runs a builder pass
 * first: each configured builder asks for its ready cards, leases one card at
 * a time, wakes the worker's persistent DSH session, and turns the worker's
 * JSON result into either a Done card, a blocked card that stays in progress
 * for a human, or — when a reviewer is configured — a card submitted for review.
 * A reviewer pass follows: each reviewer claims one reviewing card at a time,
 * reads the builder's evidence comments, and either passes the card to Done or
 * rejects it into Needs you.
 *
 * Durability rules:
 * - The lease is claimed before any session/prompt work and persisted by the
 *   lease store. A restart mid-card therefore sees an active lease and skips
 *   the card instead of prompting twice.
 * - The session ids are persisted by DshWorkerSession.ensure before the prompt.
 * - The lease is released on every terminal path (done, reviewing, blocked,
 *   error), including when a comment or status write fails. The only exception
 *   is a release failure after the card is already done; the card cannot be
 *   picked up again because Done is terminal, and the stale lease expires on
 *   its own.
 *
 * Failure rules:
 * - A done result requires evidence (parseWorkerResult enforces it).
 * - A turn that stops with reason "error" is blocked even when its text looks
 *   like a valid done result. The same rule applies to the reviewer pass.
 * - If the evidence comment or the status write fails, the card is left in
 *   progress and a best-effort blocked comment is added. A card is never marked
 *   done or submitted for review without both writes succeeding.
 * - A reviewer never reviews its own card and never prompts for it.
 * - A reviewer reject sets blockedReason to the verdict summary and leaves the
 *   status at reviewing, so the card is visible in Needs you.
 */

import {
  DEFAULT_LEASE_TTL_SECONDS,
  assertLeasableStatus,
  isTerminalStatus,
} from './lease.js'
import {
  buildReviewPrompt,
  buildWorkerPrompt,
  parseReviewResult,
  parseWorkerResult,
} from './prompt.js'

export const SUPERVISOR_ERROR = 'SUPERVISOR_ERROR'

const ASSIGNMENT_STATUSES = Object.freeze(['todo', 'backlog', 'in_progress'])
const MAX_BUILDER_EVIDENCE = 10
const BOARD_METHODS = Object.freeze([
  'listAssigned',
  'listReviewQueue',
  'getTask',
  'claim',
  'claimReview',
  'updateStatus',
  'submitForReview',
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

function renderReviewComment(result) {
  const lines = [
    `Supervisor: reviewer returned verdict "${result.verdict}".`,
    '',
    `Summary: ${result.summary}`,
  ]
  if (result.evidence.length > 0) {
    lines.push('', 'Evidence:', ...result.evidence.map((entry) => `- ${entry}`))
  }
  if (isNonEmptyString(result.notes)) lines.push('', `Notes: ${result.notes.trim()}`)
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
   * Run one full cycle: a builder pass first, then one reviewer pass per
   * reviewer.
   *
   * Cards are processed sequentially per worker and across workers; a failure
   * on one card never aborts the rest of the cycle. The returned array reports
   * one entry per considered card.
   *
   * A card handed to review by this cycle's builder pass is reviewed on the
   * next cycle, so the reviewer always judges the persisted card rather than
   * racing the handoff that created it.
   *
   * @returns {Promise<Array<{workerId: string, taskId: string|null, outcome: string, at: string}>>}
   */
  async runOnce() {
    const results = []
    const seen = new Set()
    const submitted = new Set()

    for (const worker of this.#workers.filter((candidate) => candidate.role === 'builder')) {
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
        const result = await this.#runCard(worker, taskId)
        if (result.outcome === 'review') submitted.add(taskId)
        results.push(result)
      }
    }

    for (const reviewer of this.#workers.filter((candidate) => candidate.role === 'reviewer')) {
      results.push(...(await this.#runReviewer(reviewer, submitted)))
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

    const reviewers = this.#workers.filter((worker) => worker.role === 'reviewer')
    const handoff = reviewers.length > 0

    try {
      if (handoff) {
        await this.#board.submitForReview(current.id, current.version, actor)
      } else {
        await this.#board.updateStatus(current.id, current.version, 'done', actor)
      }
    } catch (error) {
      return this.#blocked(worker, current, actor, {
        error: contextualError(
          handoff ? 'cannot submit card for review' : 'cannot mark card done',
          error,
        ),
      })
    }

    // The card is done (or handed to review). A release failure cannot cause a
    // duplicate prompt: Done cards are never listed as assigned work again, and
    // the builder no longer owns a reviewing card.
    const releaseError = await this.#release(current.id, actor)
    return this.#report(worker, current.id, handoff ? 'review' : 'done', releaseError === null
      ? {}
      : { releaseError: reasonFor(releaseError) })
  }

  async #runReviewer(reviewer, submitted) {
    let queue
    try {
      queue = await this.#board.listReviewQueue(reviewer.id)
    } catch (error) {
      this.#log('warn', `cannot list review queue for reviewer ${reviewer.id}: ${reasonFor(error)}`)
      return [this.#report(reviewer, null, 'error', { reason: reasonFor(error) })]
    }

    const results = []
    const seen = new Set()
    for (const listed of Array.isArray(queue) ? queue : []) {
      const taskId = listed?.id
      // A card submitted earlier in this same cycle is deliberately left for
      // the next cycle, and a stale/duplicated queue entry must not double
      // prompt a reviewer.
      if (!isNonEmptyString(taskId) || submitted.has(taskId) || seen.has(taskId)) continue
      seen.add(taskId)
      if (isTerminalStatus(listed.status)) continue
      // A rejected or self-review-blocked card stays reviewing with a
      // blockedReason. It is waiting for a human, so never prompt again.
      if (listed.blockedReason || listed.pendingQuestion) {
        results.push(this.#report(reviewer, taskId, 'skipped', { reason: 'attention' }))
        continue
      }
      results.push(await this.#reviewCard(reviewer, listed))
    }
    return results
  }

  async #reviewCard(reviewer, task) {
    const actor = actorFor(reviewer)

    // Never prompt the builder to review its own work: block before the lease
    // is taken so no reviewer session is woken and no lease is orphaned.
    if (task.assignee?.id === reviewer.id) {
      const details = { reason: 'self-review' }
      const blockError = await this.#blockForReview(
        task.id,
        task.version,
        'Reviewer cannot review their own work',
        actor,
      )
      if (blockError !== null) details.blockError = blockError
      return this.#report(reviewer, task.id, 'blocked', details)
    }

    let claimed
    try {
      claimed = await this.#board.claimReview(task.id, actor, leaseSecondsFor(reviewer))
    } catch (error) {
      if (error?.code === 'LEASE_HELD') return this.#report(reviewer, task.id, 'skipped', { reason: 'leased' })
      if (error?.code === 'TASK_NOT_REVIEWABLE') {
        return this.#report(reviewer, task.id, 'skipped', { reason: 'not-reviewable' })
      }
      return this.#report(reviewer, task.id, 'error', { reason: reasonFor(error) })
    }

    // LocalBoardAdapter returns the card; an adapter that returns nothing
    // leaves no version, which is a protocol error rather than a Done write.
    if (claimed === null || claimed === undefined || !Number.isInteger(claimed.version)) {
      await this.#release(task.id, actor)
      return this.#report(reviewer, task.id, 'error', { reason: 'card disappeared after review claim' })
    }

    let result
    try {
      await this.#sessions.ensure(reviewer)
      const rolePrompt = await this.#readRolePrompt(reviewer)
      const builderEvidence = await this.#builderEvidence(claimed.id)
      const prompt = buildReviewPrompt({
        worker: reviewer,
        task: claimed,
        rolePrompt,
        builderEvidence,
      })
      const timeoutMs = timeoutMsFor(reviewer)
      const response = await this.#sessions.prompt(
        reviewer,
        prompt,
        timeoutMs === undefined ? undefined : { timeoutMs },
      )

      if (response?.stopReason === 'error') {
        throw supervisorError('reviewer stopped with reason "error"', {
          workerId: reviewer.id,
          taskId: claimed.id,
          stopReason: 'error',
        })
      }

      result = parseReviewResult(response?.text)
    } catch (error) {
      // A reviewer error or an invalid result is never a pass.
      return this.#finishReview(
        reviewer,
        claimed,
        actor,
        await this.#reviewFailure(claimed, actor, error),
      )
    }

    const comment = renderReviewComment(result)

    if (result.verdict === 'pass') {
      try {
        await this.#board.comment(claimed.id, comment, actor)
      } catch (error) {
        return this.#finishReview(
          reviewer,
          claimed,
          actor,
          await this.#reviewFailure(claimed, actor, contextualError('cannot record review verdict', error)),
        )
      }

      try {
        await this.#board.updateStatus(claimed.id, claimed.version, 'done', actor)
      } catch (error) {
        return this.#finishReview(
          reviewer,
          claimed,
          actor,
          await this.#reviewFailure(claimed, actor, contextualError('cannot mark card done', error)),
        )
      }

      return this.#finishReview(reviewer, claimed, actor, { outcome: 'done', details: {} })
    }

    // Reject: write the verdict comment, then set blockedReason to the
    // summary. The status stays reviewing, so the card surfaces in Needs you.
    const details = { summary: result.summary }
    try {
      await this.#board.comment(claimed.id, comment, actor)
    } catch (error) {
      details.commentError = reasonFor(error)
    }
    const blockError = await this.#blockForReview(claimed.id, claimed.version, result.summary, actor)
    if (blockError !== null) details.blockError = blockError
    return this.#finishReview(reviewer, claimed, actor, { outcome: 'blocked', details })
  }

  async #finishReview(reviewer, claimed, actor, { outcome, details }) {
    const releaseError = await this.#release(claimed.id, actor)
    if (releaseError !== null) details.releaseError = reasonFor(releaseError)
    return this.#report(reviewer, claimed.id, outcome, details)
  }

  async #reviewFailure(claimed, actor, error) {
    const reason = reasonFor(error)
    const blockError = await this.#blockForReview(claimed.id, claimed.version, reason, actor)
    return {
      outcome: 'blocked',
      details: blockError === null ? { reason } : { reason, blockError },
    }
  }

  async #blockForReview(taskId, version, reason, actor) {
    try {
      await this.#board.block(taskId, version, reason, actor)
      return null
    } catch (error) {
      this.#log('warn', `cannot mark card ${taskId} blocked for review: ${reasonFor(error)}`)
      return reasonFor(error)
    }
  }

  /**
   * Read the comments the card's builder authored, newest first, capped at 10.
   *
   * Only non-empty string bodies reach the prompt: blank comments are not
   * evidence, and the prompt contract rejects a non-string entry. A detail read
   * failure is logged and treated as "no evidence" so a comment-store hiccup
   * cannot mark work done.
   */
  async #builderEvidence(taskId) {
    let detail
    try {
      detail = await this.#taskDetail(taskId)
    } catch (error) {
      this.#log('warn', `cannot read builder evidence for card ${taskId}: ${reasonFor(error)}`)
      return []
    }

    const builderId = detail?.task?.assignee?.id
    if (!isNonEmptyString(builderId)) return []

    const entries = []
    for (const comment of Array.isArray(detail?.comments) ? detail.comments : []) {
      if (comment?.author?.id !== builderId) continue
      if (!isNonEmptyString(comment.body)) continue
      entries.push(comment.body.trim())
    }

    return entries.slice(-MAX_BUILDER_EVIDENCE).reverse()
  }

  /**
   * The board contract has no comment read yet (board-port.js is frozen for
   * this task), so use a detail read when the adapter exposes one and fall back
   * to comments carried on the task object.
   */
  async #taskDetail(taskId) {
    if (typeof this.#board.getTaskDetail === 'function') {
      return await this.#board.getTaskDetail(taskId)
    }
    const task = await this.#board.getTask(taskId)
    return { task, comments: Array.isArray(task?.comments) ? task.comments : [] }
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
