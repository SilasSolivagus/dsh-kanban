import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { createActorRegistry } from '../actors.js'
import { AGENTS } from './actor-fixture.js'
import { MemoryTable } from './memory-table.js'

function setup() {
  const tables = {
    projects: new MemoryTable(),
    tasks: new MemoryTable(),
    comments: new MemoryTable(),
    attachments: new MemoryTable(),
    activity: new MemoryTable(),
  }
  const actors = createActorRegistry({ agents: AGENTS })
  const store = new KanbanStore({
    tables,
    actors,
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
  return { store, tables, actors }
}

test('createTask records assigned agent and actor activity', async () => {
  const { store, tables, actors } = setup()
  const project = await store.createProject({ name: 'DSH Kanban' })
  const shopkeeper = actors.get('office')
  const task = await store.createTask({
    projectId: project.id,
    title: 'M1 test',
    assigneeId: 'builder',
  }, shopkeeper)
  assert.equal(task.assignee.id, 'builder')
  const activity = [...tables.activity.entries()].map(([, event]) => event)
  assert.equal(activity[0].actor.id, 'office')
})

test('updateTask uses caller as activity actor and can reassign', async () => {
  const { store, tables, actors } = setup()
  const project = await store.createProject({ name: 'DSH Kanban' })
  const shopkeeper = actors.get('office')
  const banzi = actors.get('builder')
  const task = await store.createTask({ projectId: project.id, title: 'M1 test', assigneeId: 'builder' }, shopkeeper)
  const next = await store.updateTask(task.id, {
    version: task.version,
    status: 'in_progress',
    assigneeId: 'office',
  }, banzi)
  assert.equal(next.assignee.id, 'office')
  const events = [...tables.activity.entries()].map(([, event]) => event)
  const last = events.at(-1)
  assert.equal(last.actor.id, 'builder')
  assert.ok(last.changes.some((change) => change.field === 'assignee'))
})

test('addComment records the agent author', async () => {
  const { store, actors } = setup()
  const project = await store.createProject({ name: 'DSH Kanban' })
  const shopkeeper = actors.get('office')
  const banzi = actors.get('builder')
  const task = await store.createTask({ projectId: project.id, title: 'M1 test', assigneeId: 'builder' }, shopkeeper)
  const comment = await store.addComment(task.id, '收到', banzi)
  assert.equal(comment.author.id, 'builder')
})

test('unknown assigneeId is rejected', async () => {
  const { store, actors } = setup()
  const project = await store.createProject({ name: 'DSH Kanban' })
  await assert.rejects(
    store.createTask({ projectId: project.id, title: 'bad', assigneeId: 'ghost' }, actors.get('office')),
    (error) => error.code === 'INVALID_ASSIGNEE',
  )
})
