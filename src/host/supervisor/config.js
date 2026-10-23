import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Worker config lives outside the repo so paths and local setup stay local.
// The committed example only documents the shape.
export const WORKERS_FILE_ENV = 'DSH_KANBAN_WORKERS_FILE'
export const DEFAULT_WORKERS_FILE = join(homedir(), '.dsh', 'kanban-workers.json')
const PROMPT_DIR_CANDIDATES = [
  // Source layout: src/host/supervisor/config.js -> repo/docs/agents
  fileURLToPath(new URL('../../../docs/agents', import.meta.url)),
  // Bundled layout: index.js at package root -> repo/docs/agents
  fileURLToPath(new URL('./docs/agents', import.meta.url)),
]
export const DEFAULT_PROMPT_DIR = PROMPT_DIR_CANDIDATES.find((candidate) => existsSync(candidate)) ?? PROMPT_DIR_CANDIDATES[0]

// P1 has one human-facing role and one worker role. A role is only usable
// when its prompt file exists under docs/agents/.
export const WORKER_ROLES = Object.freeze(['office', 'builder'])

function configError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_CONFIG_ERROR' })
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function requireString(value, field, index) {
  if (!isNonEmptyString(value)) {
    throw configError(`workers[${index}].${field} must be a non-empty string`)
  }
  return value
}

function requirePositiveInteger(value, field, index) {
  if (!Number.isInteger(value) || value < 1) {
    throw configError(`workers[${index}].${field} must be a positive integer`)
  }
  return value
}

function promptFileFor(role, promptDir) {
  return join(promptDir, `${role}.md`)
}

function requirePromptFile(role, promptDir) {
  const file = promptFileFor(role, promptDir)
  try {
    if (statSync(file).isFile()) return file
  } catch {
    // Fall through to the config error below.
  }
  throw configError(`missing role prompt file for ${role}: ${file}`)
}

export function defaultWorkersFile() {
  return process.env[WORKERS_FILE_ENV] || DEFAULT_WORKERS_FILE
}

/**
 * Load and validate a worker registry.
 *
 * @param {string} [file] Path to the workers JSON file. Defaults to
 *   DSH_KANBAN_WORKERS_FILE, then ~/.dsh/kanban-workers.json.
 * @param {{ promptDir?: string }} [options] Role prompt directory, for tests.
 * @returns {{ workers: Array<object> }}
 */
export function loadWorkers(file = defaultWorkersFile(), { promptDir = DEFAULT_PROMPT_DIR } = {}) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw configError(`invalid worker config JSON in ${file}: ${error.message}`)
    }
    throw configError(`cannot read workers file ${file}: ${error.message}`)
  }

  const entries = parsed?.workers
  if (!Array.isArray(entries)) {
    throw configError(`workers must be an array in ${file}`)
  }

  const ids = new Set()
  const roles = new Set()
  const workers = entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw configError(`workers[${index}] must be an object`)
    }

    const id = requireString(entry.id, 'id', index)
    const name = requireString(entry.name, 'name', index)
    const role = requireString(entry.role, 'role', index)
    const cwd = requireString(entry.cwd, 'cwd', index)
    const maxConcurrent = requirePositiveInteger(entry.maxConcurrent, 'maxConcurrent', index)
    const timeoutSeconds = requirePositiveInteger(entry.timeoutSeconds, 'timeoutSeconds', index)
    const agentPreset = entry.agentPreset === undefined ? 'standard' : requireString(entry.agentPreset, 'agentPreset', index)

    if (!isAbsolute(cwd)) {
      throw configError(`workers[${index}].cwd must be an absolute path`)
    }
    if (!WORKER_ROLES.includes(role)) {
      throw configError(`unknown worker role: ${role}`)
    }
    if (ids.has(id)) {
      throw configError(`duplicate worker id: ${id}`)
    }
    if (roles.has(role)) {
      throw configError(`duplicate worker role: ${role}`)
    }

    const promptFile = requirePromptFile(role, promptDir)

    ids.add(id)
    roles.add(role)
    return { id, name, role, cwd, maxConcurrent, timeoutSeconds, agentPreset, promptFile }
  })

  return { workers }
}

/**
 * Find the single worker for a role. Returns null when no queued work applies.
 */
export function workerByRole(workers, role) {
  if (!Array.isArray(workers)) return null
  return workers.find((worker) => worker.role === role) ?? null
}
