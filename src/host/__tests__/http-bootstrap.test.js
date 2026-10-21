import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'
import { createHttpHandler, handleRequest } from '../http.js'

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
    newId: () => 'id-1',
  })
}

function request(method, pathname, body = null) {
  return { method, pathname, searchParams: new URLSearchParams(), body }
}

function failingStore(error) {
  return {
    renameProject: async () => { throw error },
    archiveProject: async () => { throw error },
  }
}

function makeResponse() {
  return {
    status: null,
    headers: null,
    chunks: [],
    ended: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    write(chunk) {
      this.chunks.push(Buffer.from(chunk))
    },
    end(chunk) {
      if (chunk !== undefined) this.chunks.push(Buffer.from(chunk))
      this.ended = true
    },
    body() {
      return Buffer.concat(this.chunks).toString('utf8')
    },
  }
}

function jsonRequest(method, url, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  return req
}

test('bootstrap returns projects and tasks', async () => {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  await store.createTask({ projectId: project.id, title: 'task' })
  const response = await handleRequest(store, {
    method: 'GET',
    pathname: '/kanban-api/bootstrap',
    searchParams: new URLSearchParams(),
    body: null,
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.projects.length, 1)
  assert.equal(response.body.tasks.length, 1)
})

test('bootstrap responses are never cached', async () => {
  const response = await handleRequest(makeStore(), request('GET', '/kanban-api/bootstrap'))
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
})

test('project create route returns 201 with the created project', async () => {
  const calls = []
  const store = {
    createProject: async (body) => {
      calls.push(body)
      return { id: 'p1', name: body.name }
    },
  }
  const response = await handleRequest(store, request('POST', '/kanban-api/projects', { name: 'DSH 看板' }))
  assert.equal(response.status, 201)
  assert.deepEqual(response.body, { id: 'p1', name: 'DSH 看板' })
  assert.deepEqual(calls, [{ name: 'DSH 看板' }])
})

test('project rename, archive, restore and delete routes dispatch with decoded ids', async () => {
  const calls = []
  const store = {
    renameProject: async (id, name) => {
      calls.push(['renameProject', id, name])
      return { id, name }
    },
    archiveProject: async (id) => {
      calls.push(['archiveProject', id])
      return { id, archivedAt: 'now' }
    },
    restoreProject: async (id) => {
      calls.push(['restoreProject', id])
      return { id, archivedAt: null }
    },
    deleteProject: async (id) => {
      calls.push(['deleteProject', id])
    },
  }

  const renamed = await handleRequest(store, request('PATCH', '/kanban-api/projects/p%20one', { name: 'Renamed' }))
  assert.equal(renamed.status, 200)
  assert.deepEqual(renamed.body, { id: 'p one', name: 'Renamed' })

  const archived = await handleRequest(store, request('POST', '/kanban-api/projects/p1/archive', {}))
  assert.equal(archived.status, 200)
  assert.deepEqual(archived.body, { id: 'p1', archivedAt: 'now' })

  const restored = await handleRequest(store, request('POST', '/kanban-api/projects/p1/restore', {}))
  assert.equal(restored.status, 200)
  assert.deepEqual(restored.body, { id: 'p1', archivedAt: null })

  const deleted = await handleRequest(store, request('DELETE', '/kanban-api/projects/p1'))
  assert.deepEqual(deleted, { status: 204, headers: { 'cache-control': 'no-store' }, body: null })

  assert.deepEqual(calls, [
    ['renameProject', 'p one', 'Renamed'],
    ['archiveProject', 'p1'],
    ['restoreProject', 'p1'],
    ['deleteProject', 'p1'],
  ])
})

test('store errors map to HTTP status codes', async () => {
  const cases = [
    [{ code: 'PROJECT_ARCHIVED', message: 'Project is archived' }, 403],
    [{ code: 'PROJECT_NOT_FOUND', message: 'Project not found' }, 404],
    [{ code: 'PROJECT_NOT_EMPTY', message: 'Project still contains tasks', details: { taskCount: 2 } }, 409],
    [{ code: 'INVALID_FIELD', message: 'name: invalid', details: { field: 'name' } }, 400],
  ]

  for (const [error, status] of cases) {
    const response = await handleRequest(failingStore(Object.assign(new Error(error.message), error)), request('PATCH', '/kanban-api/projects/p1', { name: 'x' }))
    assert.equal(response.status, status)
    assert.equal(response.body.error.code, error.code)
    assert.equal(response.body.error.message, error.message)
    assert.deepEqual(response.body.error.details, error.details ?? {})
    assert.equal(response.headers['cache-control'], 'no-store')
  }
})

test('unknown store errors map to 500 INTERNAL_ERROR', async () => {
  const coded = await handleRequest(
    failingStore(Object.assign(new Error('boom'), { code: 'SOMETHING_ELSE' })),
    request('PATCH', '/kanban-api/projects/p1', { name: 'x' }),
  )
  assert.equal(coded.status, 500)
  assert.equal(coded.body.error.code, 'INTERNAL_ERROR')
  assert.equal(coded.body.error.message, 'Internal server error')
  assert.deepEqual(coded.body.error.details, {})

  const uncoded = await handleRequest(failingStore(new TypeError('boom')), request('PATCH', '/kanban-api/projects/p1', { name: 'x' }))
  assert.equal(uncoded.status, 500)
  assert.equal(uncoded.body.error.code, 'INTERNAL_ERROR')
})

test('invalid project input through the HTTP route returns 400 and creates nothing', async () => {
  const store = makeStore()
  const bodies = [{}, { name: null }, { name: '   ' }, { name: 'x'.repeat(5000) }, { name: 'ok', workspacePath: 42 }]

  for (const body of bodies) {
    const response = await handleRequest(store, request('POST', '/kanban-api/projects', body))
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_FIELD')
    assert.ok(['name', 'workspacePath'].includes(response.body.error.details.field))
  }
  assert.equal(store.bootstrap().projects.length, 0)
})

test('unknown routes and unsupported methods return 404', async () => {
  const store = makeStore()
  const paths = [
    request('GET', '/kanban-api/nope'),
    request('GET', '/kanban-api/projects'),
    request('POST', '/kanban-api/bootstrap'),
    request('DELETE', '/kanban-api/bootstrap'),
  ]
  for (const item of paths) {
    const response = await handleRequest(store, item)
    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'NOT_FOUND')
  }
})

test('createHttpHandler serves JSON routes with no-store headers', async () => {
  const store = {
    bootstrap: () => ({ projects: [], tasks: [] }),
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()

  await handler({ method: 'GET', url: '/kanban-api/bootstrap' }, response)

  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.ended, true)
  assert.deepEqual(JSON.parse(response.body()), { projects: [], tasks: [] })
})

test('createHttpHandler parses JSON bodies for mutations', async () => {
  const calls = []
  const store = {
    createProject: async (body) => {
      calls.push(body)
      return { id: 'p1', ...body }
    },
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()

  await handler(jsonRequest('POST', '/kanban-api/projects', { name: 'DSH 看板' }), response)

  assert.equal(response.status, 201)
  assert.deepEqual(calls, [{ name: 'DSH 看板' }])
  assert.deepEqual(JSON.parse(response.body()), { id: 'p1', name: 'DSH 看板' })
})

test('createHttpHandler streams attachment downloads', async () => {
  const attachment = {
    id: 'att-1',
    filename: 'a"b.txt',
    contentType: 'text/plain',
    size: 3,
    storageRef: { attachmentId: 'a1', name: 'f.txt', bytes: 3 },
  }
  const store = {
    readFileStream: () => Readable.from([Buffer.from('abc')]),
    readAttachment(id) {
      assert.equal(id, 'att-1')
      return { attachment, stream: this.readFileStream(attachment.storageRef) }
    },
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()

  await handler({ method: 'GET', url: '/kanban-api/attachments/att-1' }, response)

  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'text/plain')
  assert.equal(
    response.headers['content-disposition'],
    'attachment; filename="a_b.txt"; filename*=UTF-8\'\'a%22b.txt',
  )
  assert.equal(response.headers['content-length'], '3')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.body(), 'abc')
})

test('createHttpHandler sends an ASCII fallback and RFC 5987 name for Unicode filenames', async () => {
  const attachment = {
    id: 'att-2',
    filename: '看板.txt',
    contentType: 'text/plain',
    size: 3,
    storageRef: { attachmentId: 'a2', name: 'f.txt', bytes: 3 },
  }
  const store = {
    readFileStream: () => Readable.from([Buffer.from('abc')]),
    readAttachment() {
      return { attachment, stream: this.readFileStream(attachment.storageRef) }
    },
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()

  await handler({ method: 'GET', url: '/kanban-api/attachments/att-2' }, response)

  assert.equal(response.status, 200)
  assert.equal(
    response.headers['content-disposition'],
    'attachment; filename="__.txt"; filename*=UTF-8\'\'%E7%9C%8B%E6%9D%BF.txt',
  )
  assert.equal(response.body(), 'abc')
})

test('createHttpHandler returns a JSON 404 for unknown attachments', async () => {
  const store = {
    readFileStream: () => { throw new Error('should not be called') },
    readAttachment() {
      throw Object.assign(new Error('Attachment not found'), { code: 'NOT_FOUND' })
    },
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()

  await handler({ method: 'GET', url: '/kanban-api/attachments/missing' }, response)

  assert.equal(response.status, 404)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(JSON.parse(response.body()).error.code, 'NOT_FOUND')
})

test('createHttpHandler rejects oversized request bodies with 413 and destroys the request', async () => {
  const store = {
    createProject: async () => ({ id: 'p1' }),
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()
  let destroyed = false
  const req = {
    method: 'POST',
    url: '/kanban-api/projects',
    async *[Symbol.asyncIterator]() {
      yield Buffer.alloc(30 * 1024 * 1024 + 1)
    },
    destroy() {
      destroyed = true
    },
  }

  await handler(req, response)

  assert.equal(response.status, 413)
  assert.equal(JSON.parse(response.body()).error.code, 'ATTACHMENT_TOO_LARGE')
  assert.equal(destroyed, true)
})

test('createHttpHandler rejects invalid JSON with 400', async () => {
  const store = { createProject: async () => ({ id: 'p1' }) }
  const handler = createHttpHandler(store)
  const response = makeResponse()
  const req = Readable.from([Buffer.from('{not json')])
  req.method = 'POST'
  req.url = '/kanban-api/projects'

  await handler(req, response)

  assert.equal(response.status, 400)
  assert.equal(JSON.parse(response.body()).error.code, 'INVALID_BODY')
})
