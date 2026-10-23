/**
 * Supervisor barrel and factory.
 *
 * Task 6 only exports the building blocks. Task 7 wires the real KanbanStore,
 * LeaseStore, DshWorkerSession, and role-prompt reader into createSupervisor()
 * from entry.js. Keeping the factory dependency-explicit means the cycle tests
 * need no Host services and the wiring has one obvious seam.
 */

import { Supervisor } from './supervisor.js'

export { Supervisor, SUPERVISOR_ERROR } from './supervisor.js'
export { BoardPort, LocalBoardAdapter } from './board-port.js'
export {
  DEFAULT_LEASE_TTL_SECONDS,
  DEFAULT_STATE_FILE as DEFAULT_LEASE_STATE_FILE,
  LeaseStore,
  STATE_FILE_ENV as LEASE_STATE_FILE_ENV,
  TERMINAL_STATUSES,
  assertLeasableStatus,
  defaultStateFile as defaultLeaseStateFile,
  isLeasableStatus,
  isTerminalStatus,
} from './lease.js'
export {
  DEFAULT_PROMPT_DIR,
  DEFAULT_WORKERS_FILE,
  WORKER_ROLES,
  WORKERS_FILE_ENV,
  defaultWorkersFile,
  loadWorkers,
  workerByRole,
} from './config.js'
export { PROMPT_ERROR, RESULT_ERROR, buildWorkerPrompt, parseWorkerResult } from './prompt.js'
export {
  DEFAULT_STATE_FILE as DEFAULT_SESSION_STATE_FILE,
  DshWorkerSession,
  STATE_VERSION as SESSION_STATE_VERSION,
  WORKER_SERVICE_UNAVAILABLE,
  WORKER_SESSION_ERROR,
  WORKER_TIMEOUT,
} from './worker-session.js'

/**
 * Build a Supervisor from explicit dependencies.
 *
 * @param {ConstructorParameters<typeof Supervisor>[0]} options
 * @returns {Supervisor}
 */
export function createSupervisor(options) {
  return new Supervisor(options)
}
