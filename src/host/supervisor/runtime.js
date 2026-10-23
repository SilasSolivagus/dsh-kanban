import { readFileSync } from 'node:fs'
import { defaultWorkersFile, loadWorkers } from './config.js'
import { LeaseStore } from './lease.js'
import { LocalBoardAdapter } from './board-port.js'
import { DshWorkerSession } from './worker-session.js'
import { createSupervisor } from './index.js'

const DEFAULT_INTERVAL_MS = 5000

/**
 * Start the P1 supervisor when a worker config exists.
 *
 * Missing config is not an error: the plugin stays a plain Kanban board. A
 * corrupt config or corrupt lease/session state is surfaced as a startup
 * failure in the log, never silently reset.
 */
export function startSupervisor(ctx, store, {
  env = process.env,
  logger = console,
} = {}) {
  const workersFile = env.DSH_KANBAN_WORKERS_FILE || defaultWorkersFile()
  let workers
  try {
    workers = loadWorkers(workersFile).workers
  } catch (error) {
    if (error?.code === 'WORKER_CONFIG_ERROR' && /not found|ENOENT/i.test(error.message)) {
      logger.info?.('dsh-kanban: no worker config; supervisor disabled')
      return null
    }
    logger.error?.(`dsh-kanban: supervisor config failed: ${error?.message ?? error}`)
    return null
  }
  if (workers.length === 0) {
    logger.info?.('dsh-kanban: no workers configured; supervisor disabled')
    return null
  }

  let leases
  let sessions
  try {
    leases = new LeaseStore({ file: env.DSH_KANBAN_SUPERVISOR_STATE })
    sessions = new DshWorkerSession({
      getService: (name) => ctx.get(name),
      ctx,
      stateFile: env.DSH_KANBAN_WORKER_SESSIONS,
    })
  } catch (error) {
    logger.error?.(`dsh-kanban: supervisor state failed: ${error?.message ?? error}`)
    return null
  }

  const board = new LocalBoardAdapter({ store, leases })
  const supervisor = createSupervisor({
    dsh: null,
    board,
    workers,
    leases,
    sessions,
    readRolePrompt: (worker) => readFileSync(worker.promptFile, 'utf8'),
  })

  const intervalMs = Math.max(1000, Number(env.DSH_KANBAN_SUPERVISOR_INTERVAL_MS) || DEFAULT_INTERVAL_MS)
  let stopped = false
  let running = false

  async function tick() {
    if (stopped || running) return
    running = true
    try {
      await supervisor.runOnce()
    } catch (error) {
      logger.error?.(`dsh-kanban: supervisor cycle failed: ${error?.message ?? error}`)
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  tick()

  return {
    supervisor,
    intervalMs,
    tick,
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
