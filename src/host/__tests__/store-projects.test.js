import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'
import { projectSchema } from '../schema.js'

function makeStore() {
  return new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

test('create, rename, archive, restore, delete empty project', async () => {
  const store = makeStore()
  const created = await store.createProject({ name: 'dsh-kanban' })
  assert.equal(created.id, 'dsh-kanban')
  assert.equal(created.taskPrefix, 'DSH')

  const renamed = await store.renameProject(created.id, 'DSH Kanban')
  assert.equal(renamed.name, 'DSH Kanban')

  const archived = await store.archiveProject(created.id)
  assert.equal(archived.archivedAt, '2026-10-21T00:00:00.000Z')

  const restored = await store.restoreProject(created.id)
  assert.equal(restored.archivedAt, null)

  await store.deleteProject(created.id)
  assert.equal(store.bootstrap().projects.length, 0)
})

test('delete rejects a non-empty project', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  await store.createTask({ projectId: project.id, title: 'task' })
  await assert.rejects(
    () => store.deleteProject(project.id),
    (error) => error.code === 'PROJECT_NOT_EMPTY',
  )
})

test('createProject validates name and workspacePath at the write boundary', async () => {
  const store = makeStore()
  const cases = [
    [{}, 'name'],
    [{ name: null }, 'name'],
    [{ name: '   ' }, 'name'],
    [{ name: 42 }, 'name'],
    [{ name: 'x'.repeat(5000) }, 'name'],
    [{ name: 'ok', workspacePath: 42 }, 'workspacePath'],
    [{ name: 'ok', workspacePath: 'p'.repeat(4097) }, 'workspacePath'],
  ]

  for (const [input, field] of cases) {
    await assert.rejects(
      () => store.createProject(input),
      (error) => error.code === 'INVALID_FIELD' && error.details.field === field,
      `expected INVALID_FIELD for ${field}`,
    )
  }

  await assert.rejects(
    () => store.createProject(null),
    (error) => error.code === 'INVALID_FIELD' && error.details.field === 'input',
  )

  const projects = store.bootstrap().projects
  assert.equal(projects.length, 0)
  assert.equal(projects.some((project) => project.name === 'undefined' || project.name === 'null'), false)
})

test('createProject accepts name and workspacePath boundaries', async () => {
  const store = makeStore()
  const project = await store.createProject({
    name: `  ${'n'.repeat(120)}  `,
    workspacePath: 'p'.repeat(4096),
  })

  assert.equal(project.name, 'n'.repeat(120))
  assert.equal(project.workspacePath.length, 4096)
  assert.ok(project.id.length <= 64)
  assert.doesNotThrow(() => projectSchema.parse(project))
})

test('createProject keeps every generated id and prefix inside the domain schema', async () => {
  const store = makeStore()
  const created = []
  for (const name of ['A', '1', 'x'.repeat(120), 'DSH 看板', 'A']) {
    created.push(await store.createProject({ name }))
  }

  for (const project of created) {
    assert.ok(project.id.length >= 1 && project.id.length <= 64, project.id)
    assert.match(project.taskPrefix, /^[A-Z0-9]{2,6}$/)
    assert.doesNotThrow(() => projectSchema.parse(project))
  }
  assert.equal(new Set(created.map((project) => project.id)).size, created.length)
  assert.equal(new Set(created.map((project) => project.taskPrefix)).size, created.length)
})

test('renameProject validates name and leaves the project unchanged', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'dsh-kanban' })

  for (const name of [undefined, null, 42, '   ', 'x'.repeat(5000)]) {
    await assert.rejects(
      () => store.renameProject(project.id, name),
      (error) => error.code === 'INVALID_FIELD' && error.details.field === 'name',
    )
  }
  assert.equal(store.bootstrap().projects[0].name, 'dsh-kanban')

  const renamed = await store.renameProject(project.id, '  DSH Kanban  ')
  assert.equal(renamed.name, 'DSH Kanban')
})
