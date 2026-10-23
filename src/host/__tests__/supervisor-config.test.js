import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_PROMPT_DIR,
  WORKERS_FILE_ENV,
  loadWorkers,
  workerByRole,
} from '../supervisor/config.js'

const EXAMPLE_FILE = fileURLToPath(new URL('../../../config/workers.example.json', import.meta.url))
const CONFIG_ERROR = 'WORKER_CONFIG_ERROR'

function builder(overrides = {}) {
  return {
    id: 'builder',
    name: 'Builder',
    role: 'builder',
    cwd: join(tmpdir(), 'builder-worktree'),
    maxConcurrent: 1,
    timeoutSeconds: 900,
    ...overrides,
  }
}

function withConfigFile(contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-kanban-workers-'))
  try {
    const file = join(dir, 'kanban-workers.json')
    writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
    return fn(file, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function withWorkers(workers, fn) {
  return withConfigFile({ workers }, fn)
}

function assertConfigError(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, CONFIG_ERROR)
    assert.match(error.message, pattern)
    return true
  })
}

function withEnv(value, fn) {
  const previous = process.env[WORKERS_FILE_ENV]
  process.env[WORKERS_FILE_ENV] = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env[WORKERS_FILE_ENV]
    else process.env[WORKERS_FILE_ENV] = previous
  }
}

test('loads and normalizes a valid worker config', () => {
  withWorkers([builder()], (file) => {
    const { workers } = loadWorkers(file)
    assert.equal(workers.length, 1)
    assert.deepEqual(workers[0], {
      id: 'builder',
      name: 'Builder',
      role: 'builder',
      cwd: join(tmpdir(), 'builder-worktree'),
      maxConcurrent: 1,
      timeoutSeconds: 900,
      agentPreset: 'standard',
      promptFile: join(DEFAULT_PROMPT_DIR, 'builder.md'),
    })
  })
})

test('accepts the office role', () => {
  withWorkers([builder({ id: 'office', name: 'Office', role: 'office' })], (file) => {
    const { workers } = loadWorkers(file)
    assert.equal(workers[0].role, 'office')
    assert.equal(workers[0].promptFile, join(DEFAULT_PROMPT_DIR, 'office.md'))
  })
})

test('accepts an empty worker list', () => {
  withWorkers([], (file) => {
    assert.deepEqual(loadWorkers(file).workers, [])
  })
})

test('the committed example config is valid', () => {
  const { workers } = loadWorkers(EXAMPLE_FILE)
  assert.equal(workers.length, 1)
  assert.equal(workers[0].id, 'builder')
  assert.equal(workers[0].name, 'Builder')
  assert.equal(workers[0].role, 'builder')
})

for (const field of ['id', 'name', 'role', 'cwd', 'maxConcurrent', 'timeoutSeconds']) {
  test(`rejects a worker without ${field}`, () => {
    withWorkers([builder({ [field]: undefined })], (file) => {
      assertConfigError(() => loadWorkers(file), new RegExp(`workers\\[0\\]\\.${field}`))
    })
  })
}

test('rejects a duplicate worker id', () => {
  withWorkers(
    [builder(), builder({ id: 'builder', name: 'Office', role: 'office' })],
    (file) => {
      assertConfigError(() => loadWorkers(file), /duplicate worker id: builder/)
    },
  )
})

test('rejects a duplicate worker role', () => {
  withWorkers(
    [builder(), builder({ id: 'builder-2', name: 'Builder 2' })],
    (file) => {
      assertConfigError(() => loadWorkers(file), /duplicate worker role: builder/)
    },
  )
})

test('rejects an unknown worker role', () => {
  withWorkers([builder({ role: 'designer' })], (file) => {
    assertConfigError(() => loadWorkers(file), /unknown worker role: designer/)
  })
})

test('rejects a relative cwd', () => {
  withWorkers([builder({ cwd: 'worktrees/builder' })], (file) => {
    assertConfigError(() => loadWorkers(file), /workers\[0\]\.cwd must be an absolute path/)
  })
})

for (const value of [0, -1, 1.5, '1']) {
  test(`rejects maxConcurrent ${JSON.stringify(value)}`, () => {
    withWorkers([builder({ maxConcurrent: value })], (file) => {
      assertConfigError(
        () => loadWorkers(file),
        /workers\[0\]\.maxConcurrent must be a positive integer/,
      )
    })
  })
}

for (const value of [0, -1, 900.5, '900']) {
  test(`rejects timeoutSeconds ${JSON.stringify(value)}`, () => {
    withWorkers([builder({ timeoutSeconds: value })], (file) => {
      assertConfigError(
        () => loadWorkers(file),
        /workers\[0\]\.timeoutSeconds must be a positive integer/,
      )
    })
  })
}

test('rejects a worker whose role prompt file is missing', () => {
  withWorkers([builder()], (file, dir) => {
    assertConfigError(
      () => loadWorkers(file, { promptDir: join(dir, 'missing-agents') }),
      /missing role prompt file for builder/,
    )
  })
})

test('reports a missing workers file', () => {
  withWorkers([], (file) => {
    rmSync(file)
    assertConfigError(() => loadWorkers(file), /cannot read workers file/)
  })
})

test('reports invalid JSON', () => {
  withConfigFile('{ not json', (file) => {
    assertConfigError(() => loadWorkers(file), /invalid worker config JSON/)
  })
})

test('rejects a config without a workers array', () => {
  withConfigFile({ agents: [] }, (file) => {
    assertConfigError(() => loadWorkers(file), /workers must be an array/)
  })
})

test('loadWorkers prefers DSH_KANBAN_WORKERS_FILE', () => {
  withWorkers([builder()], (file) => {
    withEnv(file, () => {
      assert.equal(loadWorkers().workers[0].id, 'builder')
    })
  })
})

test('an explicit path wins over DSH_KANBAN_WORKERS_FILE', () => {
  withWorkers([builder()], (file) => {
    withEnv(join(tmpdir(), 'does-not-exist-kanban-workers.json'), () => {
      assert.equal(loadWorkers(file).workers[0].id, 'builder')
    })
  })
})

test('workerByRole finds a worker by role', () => {
  withWorkers([builder()], (file) => {
    const { workers } = loadWorkers(file)
    assert.equal(workerByRole(workers, 'builder').id, 'builder')
  })
})

test('workerByRole returns null when no worker has the role', () => {
  withWorkers([builder()], (file) => {
    const { workers } = loadWorkers(file)
    assert.equal(workerByRole(workers, 'office'), null)
  })
})

test('the example config documents the expected shape', () => {
  const example = JSON.parse(readFileSync(EXAMPLE_FILE, 'utf8'))
  assert.deepEqual(Object.keys(example), ['workers'])
  assert.deepEqual(
    Object.keys(example.workers[0]).sort(),
    ['agentPreset', 'cwd', 'id', 'maxConcurrent', 'name', 'role', 'timeoutSeconds'],
  )
})
