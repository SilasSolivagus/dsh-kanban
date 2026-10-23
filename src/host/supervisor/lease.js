/**
 * Supervisor leases make card ownership survive a supervisor restart.
 *
 * One lease per card, stored in a single JSON state file so a restarted
 * supervisor can see which cards are already being worked on. The lease is a
 * cooperative lock, not a hard mutex: it protects against duplicate work by
 * this supervisor, while the board's card status stays the source of truth.
 *
 * State file default: ~/.dsh/kanban-supervisor-state.json
 * Override: DSH_KANBAN_SUPERVISOR_STATE
 *
 * The BoardPort contract is `claim(taskId, actor, leaseSeconds)` and
 * `release(taskId, actor)`. Terminal-status guarding therefore lives in the
 * exported `assertLeasableStatus` helper, and `claim` also accepts an optional
 * fourth `{ status }` argument for callers that already read the card.
 */

import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const STATE_FILE_ENV = 'DSH_KANBAN_SUPERVISOR_STATE'
export const DEFAULT_STATE_FILE = join(homedir(), '.dsh', 'kanban-supervisor-state.json')
export const DEFAULT_LEASE_TTL_SECONDS = 900
export const STATE_VERSION = 1
export const TERMINAL_STATUSES = Object.freeze(['done', 'canceled'])

let temporaryCounter = 0

function leaseError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details })
}

function stateError(file, message) {
  return leaseError('LEASE_STATE_ERROR', `corrupt supervisor lease state in ${file}: ${message}`, { file })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false
  const time = Date.parse(value)
  return !Number.isNaN(time) && new Date(time).toISOString() === value
}

export function defaultStateFile() {
  return process.env[STATE_FILE_ENV] || DEFAULT_STATE_FILE
}

export function isTerminalStatus(status) {
  return typeof status === 'string' && TERMINAL_STATUSES.includes(status)
}

export function isLeasableStatus(status) {
  return !isTerminalStatus(status)
}

/**
 * Reject a card status that must never hold a lease.
 *
 * `claim` enforces this when a status is passed, but the BoardPort contract
 * only carries the task id, so supervisor code that reads the card first should
 * call this helper before claiming.
 */
export function assertLeasableStatus(status, { taskId } = {}) {
  if (status === undefined || status === null) return status
  if (typeof status !== 'string') {
    throw leaseError('LEASE_INVALID_ARGUMENT', 'status must be a string', { status })
  }
  if (isTerminalStatus(status)) {
    throw leaseError(
      'LEASE_TERMINAL_STATUS',
      taskId
        ? `cannot lease task ${taskId} in terminal status ${status}`
        : `cannot lease a task in terminal status ${status}`,
      taskId ? { taskId, status } : { status },
    )
  }
  return status
}

function requireTaskId(taskId) {
  if (!isNonEmptyString(taskId)) {
    throw leaseError('LEASE_INVALID_ARGUMENT', 'taskId must be a non-empty string', { taskId })
  }
  return taskId
}

function requireActorId(actor) {
  if (!isPlainObject(actor) || !isNonEmptyString(actor.id)) {
    throw leaseError('LEASE_INVALID_ARGUMENT', 'actor must be an object with a non-empty id')
  }
  return actor.id
}

function requireLeaseSeconds(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw leaseError('LEASE_INVALID_ARGUMENT', `${field} must be a positive integer number of seconds`, {
      field,
      value,
    })
  }
  return value
}

function requireClaimOptions(options) {
  if (options === undefined || options === null) return {}
  if (!isPlainObject(options)) {
    throw leaseError('LEASE_INVALID_ARGUMENT', 'claim options must be an object')
  }
  return options
}

function emptyState() {
  return { version: STATE_VERSION, leases: {}, activity: [] }
}

function validateState(parsed, file) {
  if (!isPlainObject(parsed)) {
    throw stateError(file, 'expected a JSON object')
  }
  if (parsed.version !== STATE_VERSION) {
    throw stateError(file, `unsupported version ${JSON.stringify(parsed.version)}`)
  }
  if (!isPlainObject(parsed.leases)) {
    throw stateError(file, 'leases must be an object')
  }
  if (!Array.isArray(parsed.activity)) {
    throw stateError(file, 'activity must be an array')
  }

  for (const [taskId, lease] of Object.entries(parsed.leases)) {
    if (!isNonEmptyString(taskId)) {
      throw stateError(file, 'lease task id must be a non-empty string')
    }
    if (!isPlainObject(lease)) {
      throw stateError(file, `lease ${taskId} must be an object`)
    }
    if (lease.taskId !== taskId) {
      throw stateError(file, `lease ${taskId} has a mismatched taskId`)
    }
    if (!isNonEmptyString(lease.actorId)) {
      throw stateError(file, `lease ${taskId} must record an actorId`)
    }
    if (!Number.isInteger(lease.leaseSeconds) || lease.leaseSeconds <= 0) {
      throw stateError(file, `lease ${taskId}.leaseSeconds must be a positive integer`)
    }
    for (const field of ['claimedAt', 'heartbeatAt', 'expiresAt']) {
      if (!isIsoTimestamp(lease[field])) {
        throw stateError(file, `lease ${taskId}.${field} must be an ISO timestamp`)
      }
    }
    if (Date.parse(lease.expiresAt) < Date.parse(lease.claimedAt)) {
      throw stateError(file, `lease ${taskId} expires before it was claimed`)
    }
  }

  parsed.activity.forEach((event, index) => {
    if (!isPlainObject(event)) {
      throw stateError(file, `activity[${index}] must be an object`)
    }
    if (!isNonEmptyString(event.taskId)) {
      throw stateError(file, `activity[${index}].taskId must be a non-empty string`)
    }
    if (!isNonEmptyString(event.type)) {
      throw stateError(file, `activity[${index}].type must be a non-empty string`)
    }
    if (!isIsoTimestamp(event.at)) {
      throw stateError(file, `activity[${index}].at must be an ISO timestamp`)
    }
  })

  return parsed
}

function readStateFile(file) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState()
    throw leaseError('LEASE_STATE_ERROR', `cannot read supervisor lease state ${file}: ${error.message}`, {
      file,
    })
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw stateError(file, `invalid JSON (${error.message})`)
  }
  return validateState(parsed, file)
}

/**
 * Persist to a sibling temp file, fsync, then rename into place. A crash can
 * leave the previous complete state or the new complete state, never a
 * half-written file. Temp files are removed when a write fails.
 */
function writeStateFile(file, state) {
  const directory = dirname(file)
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  } catch (error) {
    throw leaseError('LEASE_STATE_ERROR', `cannot create supervisor state directory ${directory}: ${error.message}`, {
      file,
    })
  }

  const temporary = `${file}.${process.pid}.${++temporaryCounter}.tmp`
  try {
    const descriptor = openSync(temporary, 'w', 0o600)
    try {
      writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`)
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, file)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // The temp file may not exist; the original write error is what matters.
    }
    throw leaseError('LEASE_STATE_ERROR', `cannot write supervisor lease state ${file}: ${error.message}`, {
      file,
    })
  }
}

function appendActivity(state, limit, event) {
  state.activity.push(event)
  const overflow = state.activity.length - limit
  if (overflow > 0) state.activity.splice(0, overflow)
}

function isExpired(lease, nowMs) {
  return Date.parse(lease.expiresAt) <= nowMs
}

function copyLease(lease) {
  return { ...lease }
}

/**
 * Durable, file-backed lease store.
 *
 * Reads are performed per operation so two instances (or a restarted
 * supervisor) see the same state. Writes are serialized within one process by
 * synchronous file I/O plus an atomic rename; there is no cross-process lock.
 *
 * Methods are async to match the lease facade BoardPort currently awaits.
 */
export class LeaseStore {
  #file
  #now
  #ttlSeconds
  #activityLimit

  /**
   * @param {object} [options]
   * @param {string} [options.file] State path; defaults to DSH_KANBAN_SUPERVISOR_STATE
   *   or ~/.dsh/kanban-supervisor-state.json.
   * @param {() => Date|string|number} [options.now] Clock injection for tests.
   * @param {number} [options.ttlSeconds] Default lease TTL in seconds (900).
   * @param {number} [options.activityLimit] Maximum retained activity events.
   */
  constructor({
    file = defaultStateFile(),
    now = () => new Date(),
    ttlSeconds = DEFAULT_LEASE_TTL_SECONDS,
    activityLimit = 200,
  } = {}) {
    if (!isNonEmptyString(file)) {
      throw leaseError('LEASE_INVALID_ARGUMENT', 'file must be a non-empty path')
    }
    if (typeof now !== 'function') {
      throw leaseError('LEASE_INVALID_ARGUMENT', 'now must be a function')
    }
    if (!Number.isInteger(activityLimit) || activityLimit < 1) {
      throw leaseError('LEASE_INVALID_ARGUMENT', 'activityLimit must be a positive integer')
    }

    this.#file = file
    this.#now = now
    this.#ttlSeconds = requireLeaseSeconds(ttlSeconds, 'ttlSeconds')
    this.#activityLimit = activityLimit

    // Fail at wiring time, not after cards have been claimed.
    readStateFile(file)
  }

  /**
   * Claim a card. Rejects with LEASE_HELD while another lease is unexpired,
   * even when the caller is the current owner (heartbeat is the renewal path).
   * An expired lease is reclaimed and both owners are recorded in activity.
   *
   * @returns {Promise<object>} the new lease
   */
  async claim(taskId, actor, leaseSeconds = this.#ttlSeconds, options = {}) {
    const id = requireTaskId(taskId)
    const actorId = requireActorId(actor)
    const ttl = requireLeaseSeconds(leaseSeconds, 'leaseSeconds')
    const { status } = requireClaimOptions(options)
    assertLeasableStatus(status, { taskId: id })

    const now = this.#nowDate()
    const nowMs = now.getTime()
    const at = now.toISOString()
    const state = readStateFile(this.#file)
    const existing = state.leases[id] ?? null

    if (existing && !isExpired(existing, nowMs)) {
      throw leaseError('LEASE_HELD', `task ${id} is already leased by ${existing.actorId}`, {
        taskId: id,
        owner: existing.actorId,
        expiresAt: existing.expiresAt,
      })
    }

    const lease = {
      taskId: id,
      actorId,
      leaseSeconds: ttl,
      claimedAt: at,
      heartbeatAt: at,
      expiresAt: new Date(nowMs + ttl * 1000).toISOString(),
    }

    if (existing) {
      appendActivity(state, this.#activityLimit, {
        at,
        type: 'reclaim',
        taskId: id,
        actorId,
        previousActorId: existing.actorId,
        previousExpiresAt: existing.expiresAt,
        leaseSeconds: ttl,
        expiresAt: lease.expiresAt,
      })
    } else {
      appendActivity(state, this.#activityLimit, {
        at,
        type: 'claim',
        taskId: id,
        actorId,
        leaseSeconds: ttl,
        expiresAt: lease.expiresAt,
      })
    }

    state.leases[id] = lease
    writeStateFile(this.#file, state)
    return copyLease(lease)
  }

  /**
   * Extend a lease to expire `leaseSeconds` from now. Only the owner may
   * heartbeat; an expired or missing lease is not resurrected.
   */
  async heartbeat(taskId, actor, leaseSeconds) {
    const id = requireTaskId(taskId)
    const actorId = requireActorId(actor)
    const state = readStateFile(this.#file)
    const existing = state.leases[id] ?? null

    if (!existing) {
      throw leaseError('LEASE_NOT_FOUND', `task ${id} has no lease to heartbeat`, { taskId: id })
    }
    if (existing.actorId !== actorId) {
      throw leaseError(
        'LEASE_NOT_OWNER',
        `task ${id} is leased by ${existing.actorId}, not ${actorId}`,
        { taskId: id, owner: existing.actorId, actorId },
      )
    }

    const now = this.#nowDate()
    const nowMs = now.getTime()
    if (isExpired(existing, nowMs)) {
      throw leaseError('LEASE_EXPIRED', `task ${id} lease expired at ${existing.expiresAt}`, {
        taskId: id,
        expiresAt: existing.expiresAt,
      })
    }

    const ttl =
      leaseSeconds === undefined || leaseSeconds === null
        ? existing.leaseSeconds
        : requireLeaseSeconds(leaseSeconds, 'leaseSeconds')
    const at = now.toISOString()
    const updated = {
      ...existing,
      leaseSeconds: ttl,
      heartbeatAt: at,
      expiresAt: new Date(nowMs + ttl * 1000).toISOString(),
    }

    state.leases[id] = updated
    appendActivity(state, this.#activityLimit, {
      at,
      type: 'heartbeat',
      taskId: id,
      actorId,
      leaseSeconds: ttl,
      expiresAt: updated.expiresAt,
    })
    writeStateFile(this.#file, state)
    return copyLease(updated)
  }

  /**
   * Release a lease. Returns the released lease, or null when the task holds no
   * lease. A non-owner release is refused with LEASE_NOT_OWNER.
   */
  async release(taskId, actor) {
    const id = requireTaskId(taskId)
    const actorId = requireActorId(actor)
    const state = readStateFile(this.#file)
    const existing = state.leases[id] ?? null

    if (!existing) return null
    if (existing.actorId !== actorId) {
      throw leaseError(
        'LEASE_NOT_OWNER',
        `task ${id} is leased by ${existing.actorId}, not ${actorId}`,
        { taskId: id, owner: existing.actorId, actorId },
      )
    }

    const now = this.#nowDate()
    delete state.leases[id]
    appendActivity(state, this.#activityLimit, {
      at: now.toISOString(),
      type: 'release',
      taskId: id,
      actorId,
      expiresAt: existing.expiresAt,
      expired: isExpired(existing, now.getTime()),
    })
    writeStateFile(this.#file, state)
    return copyLease(existing)
  }

  /** Stored lease for a task, including an expired one; null when absent. */
  get(taskId) {
    const id = requireTaskId(taskId)
    const state = readStateFile(this.#file)
    const lease = state.leases[id]
    return lease ? copyLease(lease) : null
  }

  /** Unexpired lease for a task, or null. */
  getActive(taskId) {
    const lease = this.get(taskId)
    if (!lease) return null
    return isExpired(lease, this.#nowDate().getTime()) ? null : lease
  }

  /** Whether the task currently holds an unexpired lease. */
  isLeased(taskId) {
    return this.getActive(taskId) !== null
  }

  /** All unexpired leases. */
  listActive() {
    const state = readStateFile(this.#file)
    const nowMs = this.#nowDate().getTime()
    return Object.values(state.leases)
      .filter((lease) => !isExpired(lease, nowMs))
      .map(copyLease)
  }

  /** Lease activity in append order, optionally filtered to one task. */
  getActivity(taskId) {
    if (taskId !== undefined) requireTaskId(taskId)
    const state = readStateFile(this.#file)
    const events = taskId === undefined ? state.activity : state.activity.filter((event) => event.taskId === taskId)
    return events.map((event) => ({ ...event }))
  }

  #nowDate() {
    const value = this.#now()
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw leaseError('LEASE_INVALID_ARGUMENT', 'now() must return a valid Date')
    }
    return date
  }
}
