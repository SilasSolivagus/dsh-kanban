import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

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
