/**
 * BoardPort is the supervisor-facing boundary to the task board.
 *
 * P1 runs against the local KanbanStore, but the supervisor only depends on
 * this interface so a hosted/remote board can replace it later without
 * touching the supervisor cycle. Every write carries the worker `actor`
 * (M1 attribution), and every mutating call passes a card `version` where
 * the board supports optimistic concurrency.
 */

const NOT_IMPLEMENTED = 'BOARD_NOT_IMPLEMENTED'

function notImplemented(method) {
  return Object.assign(new Error(`BoardPort.${method} is not implemented`), {
    code: NOT_IMPLEMENTED,
    details: { method },
  })
}

export class BoardPort {
  listAssigned(actorId, statuses) {
    throw notImplemented('listAssigned')
  }

  getTask(id) {
    throw notImplemented('getTask')
  }

  claim(id, actor, leaseSeconds) {
    throw notImplemented('claim')
  }

  updateStatus(id, version, status, actor) {
    throw notImplemented('updateStatus')
  }

  comment(id, body, actor) {
    throw notImplemented('comment')
  }

  release(id, actor) {
    throw notImplemented('release')
  }
}

/**
 * LocalBoardAdapter connects BoardPort to the existing KanbanStore.
 *
 * The lease facade is injected because lease persistence belongs to Task 3.
 * It must provide:
 *   claim(taskId, actor, leaseSeconds) -> lease
 *   release(taskId, actor) -> lease | null
 *
 * `claim` is the only cross-cutting operation: it claims the lease first, then
 * moves the card to in_progress. If the card write fails, the lease is
 * released so a retry is not blocked by a stale claim.
 */
export class LocalBoardAdapter extends BoardPort {
  #store
  #leases

  constructor({ store, leases } = {}) {
    super()
    if (
      !store ||
      typeof store.bootstrap !== 'function' ||
      typeof store.getTaskDetail !== 'function' ||
      typeof store.updateTask !== 'function' ||
      typeof store.addComment !== 'function'
    ) {
      throw new TypeError('LocalBoardAdapter requires a KanbanStore-compatible store')
    }
    if (!leases || typeof leases.claim !== 'function' || typeof leases.release !== 'function') {
      throw new TypeError('LocalBoardAdapter requires a leases facade with claim and release')
    }
    this.#store = store
    this.#leases = leases
  }

  listAssigned(actorId, statuses) {
    const allowed = new Set(Array.isArray(statuses) ? statuses : [])
    const { projects, tasks } = this.#store.bootstrap()
    const archivedProjects = new Set(projects.filter((project) => project.archivedAt).map((project) => project.id))
    return tasks.filter(
      (task) =>
        !task.archivedAt &&
        !archivedProjects.has(task.projectId) &&
        task.assignee?.id === actorId &&
        allowed.has(task.status),
    )
  }

  getTask(id) {
    return this.#store.getTaskDetail(id).task
  }

  async claim(id, actor, leaseSeconds) {
    // Read first so a missing card never creates a lease, and so the status
    // write can carry the current optimistic-concurrency version.
    const task = this.getTask(id)
    await this.#leases.claim(id, actor, leaseSeconds)
    try {
      return await this.#store.updateTask(id, { version: task.version, status: 'in_progress' }, actor)
    } catch (error) {
      try {
        await this.#leases.release(id, actor)
      } catch {
        // Keep the original write failure; the abandoned lease will expire.
      }
      throw error
    }
  }

  async updateStatus(id, version, status, actor) {
    return this.#store.updateTask(id, { version, status }, actor)
  }

  async comment(id, body, actor) {
    return this.#store.addComment(id, body, actor)
  }

  async release(id, actor) {
    return this.#leases.release(id, actor)
  }
}
