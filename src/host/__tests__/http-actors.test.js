import test from 'node:test'
import assert from 'node:assert/strict'
import { createHttpHandler, handleRequest } from '../http.js'
import { KanbanStore } from '../store.js'
import { createActorRegistry } from '../actors.js'
import { MemoryTable } from './memory-table.js'

const tokens = { 'dsh.shopkeeper': 'shop-token', 'gb.banzi': 'banzi-token' }

function setup() {
  const tables = {
    projects: new MemoryTable(),
    tasks: new MemoryTable(),
    comments: new MemoryTable(),
    attachments: new MemoryTable(),
    activity: new MemoryTable(),
  }
  const actors = createActorRegistry({ tokens })
  const store = new KanbanStore({
    tables,
    actors,
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now: () => '2026-10-21T00:00:00.000Z',
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
  return { store, actors }
}

function req(method, pathname, body, actor) {
  return { method, pathname, body, actor }
}

test('shopkeeper creates an assigned card; banzi updates own card', async () => {
  const { store, actors } = setup()
  const project = await store.createProject({ name: 'Dsh Kanban' })
  const created = await handleRequest(store, req('POST', '/kanban-api/tasks', {
    projectId: project.id,
    title: 'M1 card',
    assigneeId: 'gb.banzi',
  }, actors.get('dsh.shopkeeper')), actors)
  assert.equal(created.status, 201)
  assert.equal(created.body.assignee.id, 'gb.banzi')

  const updated = await handleRequest(store, req('PATCH', `/kanban-api/tasks/${created.body.id}`, {
    version: created.body.version,
    status: 'in_progress',
  }, actors.get('gb.banzi')), actors)
  assert.equal(updated.status, 200)
  assert.equal(updated.body.status, 'in_progress')

  const detail = store.getTaskDetail(created.body.id)
  assert.equal(detail.activity.at(-1).actor.id, 'gb.banzi')
})

test('banzi cannot create, update another actor card, or read another project', async () => {
  const { store, actors } = setup()
  const project = await store.createProject({ name: 'Dsh Kanban' })
  const other = await store.createProject({ name: 'Other' })
  const shopkeeper = actors.get('dsh.shopkeeper')
  const banzi = actors.get('gb.banzi')
  const card = await store.createTask({ projectId: project.id, title: 'Shop card', assigneeId: 'dsh.shopkeeper' }, shopkeeper)
  const otherCard = await store.createTask({ projectId: other.id, title: 'Other card', assigneeId: 'gb.banzi' }, shopkeeper)

  const create = await handleRequest(store, req('POST', '/kanban-api/tasks', {
    projectId: project.id,
    title: 'Nope',
  }, banzi), actors)
  assert.equal(create.status, 403)

  const update = await handleRequest(store, req('PATCH', `/kanban-api/tasks/${card.id}`, {
    version: card.version,
    status: 'in_progress',
  }, banzi), actors)
  assert.equal(update.status, 403)

  const read = await handleRequest(store, req('GET', `/kanban-api/tasks/${otherCard.id}`, null, banzi), actors)
  assert.equal(read.status, 403)
})

test('banzi can comment in-project and bootstrap is filtered', async () => {
  const { store, actors } = setup()
  const project = await store.createProject({ name: 'Dsh Kanban' })
  await store.createProject({ name: 'Other' })
  const shopkeeper = actors.get('dsh.shopkeeper')
  const banzi = actors.get('gb.banzi')
  const card = await store.createTask({ projectId: project.id, title: 'Commentable', assigneeId: 'gb.banzi' }, shopkeeper)

  const comment = await handleRequest(store, req('POST', `/kanban-api/tasks/${card.id}/comments`, {
    body: '收到',
  }, banzi), actors)
  assert.equal(comment.status, 201)
  assert.equal(comment.body.author.id, 'gb.banzi')

  const boot = await handleRequest(store, req('GET', '/kanban-api/bootstrap', null, banzi), actors)
  assert.equal(boot.status, 200)
  assert.deepEqual(boot.body.projects.map((p) => p.id), ['dsh-kanban'])
  assert.equal(boot.body.tasks.every((task) => task.projectId === 'dsh-kanban'), true)
})


test('handler rejects an invalid bearer token with 401', async () => {
  const { store, actors } = setup()
  const handler = createHttpHandler(store, { actors })
  let status = 0
  let body = ''
  await handler(
    { method: 'GET', url: '/kanban-api/bootstrap', headers: { authorization: 'Bearer nope' } },
    { writeHead(value) { status = value }, end(value) { body = value } },
  )
  assert.equal(status, 401)
  assert.equal(JSON.parse(body).error.code, 'UNAUTHORIZED')
})
