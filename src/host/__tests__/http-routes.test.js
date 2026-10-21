import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'
import { createHttpHandler, handleRequest } from '../http.js'

const NOW = '2026-10-21T00:00:00.000Z'

function makeStore() {
  let sequence = 0
  const admitted = []
  const store = new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: {
      admitEncodedFile: async ({ data, name }) => {
        const attachmentId = `stored-${++sequence}`
        admitted.push({ data, name })
        return { attachmentId, name, bytes: Buffer.from(data, 'base64').length }
      },
      readFileStream: () => Readable.from([Buffer.from('abc')]),
    },
    now: () => NOW,
    newId: () => `id-${++sequence}`,
  })
  return { store, admitted }
}

function request(method, pathname, body = null, search = '') {
  return { method, pathname, searchParams: new URLSearchParams(search), body }
}

function failingStore(error) {
  const fail = async () => {
    throw error
  }
  return {
    updateTask: fail,
    deleteTask: fail,
    getTaskDetail: () => {
      throw error
    },
    archiveTask: fail,
    restoreTask: fail,
    askQuestion: fail,
    answerQuestion: fail,
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

test('task create, patch, detail and delete routes dispatch store methods', async () => {
  const calls = []
  const detail = { task: { id: 't one' }, comments: [], attachments: [], activity: [] }
  const store = {
    createTask: async (body) => {
      calls.push(['createTask', body])
      return { id: 't1', ...body }
    },
    updateTask: async (id, body) => {
      calls.push(['updateTask', id, body])
      return { id, version: body.version + 1 }
    },
    getTaskDetail: (id) => {
      calls.push(['getTaskDetail', id])
      return detail
    },
    deleteTask: async (id, body) => {
      calls.push(['deleteTask', id, body])
    },
  }

  const created = await handleRequest(store, request('POST', '/kanban-api/tasks', { projectId: 'p1', title: 'task' }))
  assert.equal(created.status, 201)
  assert.equal(created.body.id, 't1')

  const patched = await handleRequest(
    store,
    request('PATCH', '/kanban-api/tasks/t%20one', { version: 1, status: 'in_progress' }),
  )
  assert.equal(patched.status, 200)
  assert.deepEqual(patched.body, { id: 't one', version: 2 })

  const fetched = await handleRequest(store, request('GET', '/kanban-api/tasks/t%20one'))
  assert.equal(fetched.status, 200)
  assert.deepEqual(fetched.body, detail)

  const deleted = await handleRequest(store, request('DELETE', '/kanban-api/tasks/t%20one', { version: 2 }))
  assert.equal(deleted.status, 204)
  assert.equal(deleted.body, null)
  assert.equal(deleted.headers['cache-control'], 'no-store')

  assert.deepEqual(calls, [
    ['createTask', { projectId: 'p1', title: 'task' }],
    ['updateTask', 't one', { version: 1, status: 'in_progress' }],
    ['getTaskDetail', 't one'],
    ['deleteTask', 't one', { version: 2 }],
  ])
})

test('task archive, restore, question and answer routes dispatch store methods', async () => {
  const calls = []
  const store = {
    archiveTask: async (id, body) => {
      calls.push(['archiveTask', id, body])
      return { id, archivedAt: NOW }
    },
    restoreTask: async (id, body) => {
      calls.push(['restoreTask', id, body])
      return { id, archivedAt: null }
    },
    askQuestion: async (id, body) => {
      calls.push(['askQuestion', id, body])
      return { id, pendingQuestion: body.prompt }
    },
    answerQuestion: async (id, body) => {
      calls.push(['answerQuestion', id, body])
      return { id, decision: body.decision }
    },
  }

  const archiveBody = { version: 1 }
  const archived = await handleRequest(store, request('POST', '/kanban-api/tasks/t1/archive', archiveBody))
  assert.equal(archived.status, 200)
  assert.deepEqual(archived.body, { id: 't1', archivedAt: NOW })

  const restored = await handleRequest(store, request('POST', '/kanban-api/tasks/t1/restore', { version: 2 }))
  assert.equal(restored.status, 200)

  const questionBody = { version: 3, prompt: 'Which name?' }
  const asked = await handleRequest(store, request('POST', '/kanban-api/tasks/t1/question', questionBody))
  assert.equal(asked.status, 200)
  assert.equal(asked.body.pendingQuestion, 'Which name?')

  const answerBody = { version: 4, decision: 'approve' }
  const answered = await handleRequest(store, request('POST', '/kanban-api/tasks/t1/answer', answerBody))
  assert.equal(answered.status, 200)
  assert.equal(answered.body.decision, 'approve')

  assert.deepEqual(calls, [
    ['archiveTask', 't1', archiveBody],
    ['restoreTask', 't1', { version: 2 }],
    ['askQuestion', 't1', questionBody],
    ['answerQuestion', 't1', answerBody],
  ])
})

test('archived task list forwards the projectId search parameter', async () => {
  const calls = []
  const store = {
    listArchivedTasks: (projectId) => {
      calls.push(projectId)
      return [{ id: 't1', archivedAt: NOW }]
    },
  }

  const filtered = await handleRequest(store, request('GET', '/kanban-api/archived-tasks', null, 'projectId=p%20one'))
  assert.equal(filtered.status, 200)
  assert.deepEqual(filtered.body, { tasks: [{ id: 't1', archivedAt: NOW }] })
  assert.deepEqual(calls, ['p one'])

  const all = await handleRequest(store, request('GET', '/kanban-api/archived-tasks'))
  assert.equal(all.status, 200)
  assert.deepEqual(calls, ['p one', undefined])
})

test('comment routes dispatch and return arrays for reads', async () => {
  const calls = []
  const comments = [{ id: 'c1', body: 'hello' }]
  const store = {
    getTaskDetail: (id) => {
      calls.push(['getTaskDetail', id])
      return { task: { id }, comments, attachments: [], activity: [] }
    },
    addComment: async (id, body) => {
      calls.push(['addComment', id, body])
      return { id: 'c2', taskId: id, body }
    },
    deleteComment: async (taskId, commentId) => {
      calls.push(['deleteComment', taskId, commentId])
    },
  }

  const listed = await handleRequest(store, request('GET', '/kanban-api/tasks/t1/comments'))
  assert.equal(listed.status, 200)
  assert.deepEqual(listed.body, comments)

  const created = await handleRequest(store, request('POST', '/kanban-api/tasks/t1/comments', { body: 'hello' }))
  assert.equal(created.status, 201)
  assert.deepEqual(created.body, { id: 'c2', taskId: 't1', body: 'hello' })

  const deleted = await handleRequest(store, request('DELETE', '/kanban-api/tasks/t%20one/comments/c%2F1', {}))
  assert.equal(deleted.status, 204)
  assert.equal(deleted.body, null)

  assert.deepEqual(calls, [
    ['getTaskDetail', 't1'],
    ['addComment', 't1', 'hello'],
    ['deleteComment', 't one', 'c/1'],
  ])
})

test('attachment routes dispatch and return arrays for reads', async () => {
  const calls = []
  const attachments = [{ id: 'a1', filename: 'f.txt' }]
  const store = {
    getTaskDetail: (id) => {
      calls.push(['getTaskDetail', id])
      return { task: { id }, comments: [], attachments, activity: [] }
    },
    addAttachment: async (id, body) => {
      calls.push(['addAttachment', id, body])
      return { id: 'a2', taskId: id, ...body }
    },
    deleteAttachment: async (taskId, attachmentId) => {
      calls.push(['deleteAttachment', taskId, attachmentId])
    },
  }

  const listed = await handleRequest(store, request('GET', '/kanban-api/tasks/t1/attachments'))
  assert.equal(listed.status, 200)
  assert.deepEqual(listed.body, attachments)

  const upload = { filename: 'f.txt', contentType: 'text/plain', data: 'YWJj' }
  const created = await handleRequest(store, request('POST', '/kanban-api/tasks/t1/attachments', upload))
  assert.equal(created.status, 201)
  assert.deepEqual(created.body, { id: 'a2', taskId: 't1', ...upload })

  const deleted = await handleRequest(store, request('DELETE', '/kanban-api/tasks/t1/attachments/a%2F1', {}))
  assert.equal(deleted.status, 204)

  assert.deepEqual(calls, [
    ['getTaskDetail', 't1'],
    ['addAttachment', 't1', upload],
    ['deleteAttachment', 't1', 'a/1'],
  ])
})

test('activity route returns the activity list from the task detail', async () => {
  const activity = [{ id: 'e1', taskId: 't1', changes: [] }]
  const store = {
    getTaskDetail: (id) => ({ task: { id }, comments: [], attachments: [], activity }),
  }

  const response = await handleRequest(store, request('GET', '/kanban-api/tasks/t1/activity'))
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, activity)
})

test('unknown methods on known task paths return 404', async () => {
  const store = {
    getTaskDetail: () => ({ task: {}, comments: [], attachments: [], activity: [] }),
  }
  for (const item of [
    request('PUT', '/kanban-api/tasks/t1'),
    request('GET', '/kanban-api/tasks/t1/archive'),
    request('DELETE', '/kanban-api/tasks/t1/comments'),
    request('POST', '/kanban-api/archived-tasks'),
  ]) {
    const response = await handleRequest(store, item)
    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'NOT_FOUND')
  }
})

test('malformed percent-encoding returns 400 without leaking internal errors', async () => {
  const store = {
    getTaskDetail: () => ({ task: {}, comments: [], attachments: [], activity: [] }),
    deleteTask: async () => {},
    deleteComment: async () => {},
    deleteAttachment: async () => {},
  }

  for (const item of [
    request('GET', '/kanban-api/tasks/%E0%A4%A'),
    request('DELETE', '/kanban-api/tasks/%E0%A4%A', { version: 1 }),
    request('DELETE', '/kanban-api/tasks/t1/comments/%E0%A4%A', {}),
    request('DELETE', '/kanban-api/tasks/t1/attachments/%E0%A4%A', {}),
    request('PATCH', '/kanban-api/projects/%E0%A4%A', { name: 'x' }),
  ]) {
    const response = await handleRequest(store, item)
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_PATH')
    assert.notEqual(response.body.error.message, 'Internal server error')
    assert.deepEqual(response.body.error.details, {})
  }
})

test('task route errors map to their HTTP status codes', async () => {
  const cases = [
    [{ code: 'TASK_VERSION_CONFLICT', message: 'Task changed elsewhere' }, 409],
    [{ code: 'TASK_ARCHIVED', message: 'Task is archived' }, 409],
    [{ code: 'TASK_NOT_ARCHIVED', message: 'Task is not archived' }, 409],
    [{ code: 'TASK_NOT_IN_REVIEW', message: 'Task is not awaiting review' }, 409],
    [{ code: 'TASK_NEEDS_ATTENTION', message: 'Resolve attention before Done' }, 409],
    [{ code: 'QUESTION_ALREADY_PENDING', message: 'Question already pending' }, 409],
    [{ code: 'TASK_NOT_FOUND', message: 'Task not found' }, 404],
    [{ code: 'INVALID_FIELD', message: 'version: invalid', details: { field: 'version' } }, 400],
  ]

  for (const [error, status] of cases) {
    const response = await handleRequest(
      failingStore(Object.assign(new Error(error.message), error)),
      request('PATCH', '/kanban-api/tasks/t1', { version: 1 }),
    )
    assert.equal(response.status, status)
    assert.equal(response.body.error.code, error.code)
    assert.equal(response.body.error.message, error.message)
    assert.deepEqual(response.body.error.details, error.details ?? {})
  }
})

test('real store routes cover the task lifecycle end to end', async () => {
  const { store, admitted } = makeStore()

  const project = await handleRequest(store, request('POST', '/kanban-api/projects', { name: 'DSH Kanban' }))
  assert.equal(project.status, 201)

  const created = await handleRequest(
    store,
    request('POST', '/kanban-api/tasks', { projectId: project.body.id, title: 'task' }),
  )
  assert.equal(created.status, 201)
  const task = created.body
  assert.equal(task.version, 1)

  const detail = await handleRequest(store, request('GET', `/kanban-api/tasks/${task.id}`))
  assert.equal(detail.status, 200)
  assert.equal(detail.body.task.id, task.id)
  assert.deepEqual(detail.body.comments, [])
  assert.deepEqual(detail.body.attachments, [])

  const patched = await handleRequest(
    store,
    request('PATCH', `/kanban-api/tasks/${task.id}`, { version: task.version, title: 'renamed' }),
  )
  assert.equal(patched.status, 200)
  assert.equal(patched.body.title, 'renamed')
  assert.equal(patched.body.version, 2)

  const comment = await handleRequest(
    store,
    request('POST', `/kanban-api/tasks/${task.id}/comments`, { body: 'first comment' }),
  )
  assert.equal(comment.status, 201)
  const comments = await handleRequest(store, request('GET', `/kanban-api/tasks/${task.id}/comments`))
  assert.equal(comments.body.length, 1)
  assert.equal(comments.body[0].body, 'first comment')

  const upload = await handleRequest(
    store,
    request('POST', `/kanban-api/tasks/${task.id}/attachments`, {
      filename: 'f.txt',
      contentType: 'text/plain',
      data: 'YWJj',
    }),
  )
  assert.equal(upload.status, 201)
  assert.deepEqual(admitted, [{ data: 'YWJj', name: 'f.txt' }])
  const attachments = await handleRequest(store, request('GET', `/kanban-api/tasks/${task.id}/attachments`))
  assert.equal(attachments.body.length, 1)
  assert.equal(attachments.body[0].filename, 'f.txt')

  const activity = await handleRequest(store, request('GET', `/kanban-api/tasks/${task.id}/activity`))
  assert.equal(activity.status, 200)
  assert.ok(activity.body.length >= 3)
  assert.ok(activity.body.some((event) => event.changes.some((change) => change.field === 'attachment')))

  const archived = await handleRequest(
    store,
    request('POST', `/kanban-api/tasks/${task.id}/archive`, { version: 2 }),
  )
  assert.equal(archived.status, 200)
  assert.equal(archived.body.archivedAt, NOW)

  const listed = await handleRequest(
    store,
    request('GET', '/kanban-api/archived-tasks', null, `projectId=${encodeURIComponent(project.body.id)}`),
  )
  assert.equal(listed.status, 200)
  assert.deepEqual(listed.body.tasks.map((item) => item.id), [task.id])

  const restored = await handleRequest(
    store,
    request('POST', `/kanban-api/tasks/${task.id}/restore`, { version: archived.body.version }),
  )
  assert.equal(restored.status, 200)
  assert.equal(restored.body.archivedAt, null)

  const rearchived = await handleRequest(
    store,
    request('POST', `/kanban-api/tasks/${task.id}/archive`, { version: restored.body.version }),
  )
  assert.equal(rearchived.status, 200)

  const deleted = await handleRequest(
    store,
    request('DELETE', `/kanban-api/tasks/${task.id}`, { version: rearchived.body.version }),
  )
  assert.equal(deleted.status, 204)

  const missing = await handleRequest(store, request('GET', `/kanban-api/tasks/${task.id}`))
  assert.equal(missing.status, 404)
  assert.equal(missing.body.error.code, 'TASK_NOT_FOUND')

  const remaining = await handleRequest(store, request('GET', '/kanban-api/archived-tasks'))
  assert.deepEqual(remaining.body.tasks, [])
})

test('createHttpHandler reads DELETE bodies for permanent task deletes', async () => {
  const calls = []
  const store = {
    deleteTask: async (id, body) => {
      calls.push([id, body])
    },
  }
  const handler = createHttpHandler(store)
  const response = makeResponse()
  const req = Readable.from([Buffer.from(JSON.stringify({ version: 3 }))])
  req.method = 'DELETE'
  req.url = '/kanban-api/tasks/t1'

  await handler(req, response)

  assert.equal(response.status, 204)
  assert.equal(response.ended, true)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(calls, [['t1', { version: 3 }]])
})

test('createHttpHandler treats an empty DELETE body as an empty object', async () => {
  const calls = []
  const store = {
    deleteTask: async (id, body) => {
      calls.push(['deleteTask', id, body])
    },
    deleteComment: async (taskId, commentId) => {
      calls.push(['deleteComment', taskId, commentId])
    },
    deleteProject: async (id) => {
      calls.push(['deleteProject', id])
    },
  }
  const handler = createHttpHandler(store)

  for (const url of ['/kanban-api/tasks/t1', '/kanban-api/tasks/t1/comments/c1', '/kanban-api/projects/p1']) {
    const response = makeResponse()
    const req = Readable.from([])
    req.method = 'DELETE'
    req.url = url
    await handler(req, response)
    assert.equal(response.status, 204)
  }

  assert.deepEqual(calls, [
    ['deleteTask', 't1', {}],
    ['deleteComment', 't1', 'c1'],
    ['deleteProject', 'p1'],
  ])
})

test('createHttpHandler rejects malformed attachment download ids with 400 INVALID_PATH', async () => {
  const handler = createHttpHandler({
    readAttachment() {
      throw new Error('should not be called')
    },
  })
  const response = makeResponse()

  await handler({ method: 'GET', url: '/kanban-api/attachments/%E0%A4%A' }, response)

  assert.equal(response.status, 400)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(JSON.parse(response.body()).error.code, 'INVALID_PATH')
  assert.ok(!response.body().includes('URIError'))
  assert.ok(!response.body().includes('decodeURIComponent'))
})

test('createHttpHandler passes searchParams and JSON error envelopes through', async () => {
  const calls = []
  const handler = createHttpHandler({
    listArchivedTasks: (projectId) => {
      calls.push(projectId)
      return []
    },
  })

  const listed = makeResponse()
  await handler({ method: 'GET', url: '/kanban-api/archived-tasks?projectId=p%20one' }, listed)
  assert.equal(listed.status, 200)
  assert.deepEqual(JSON.parse(listed.body()), { tasks: [] })
  assert.deepEqual(calls, ['p one'])

  const malformed = makeResponse()
  await handler({ method: 'GET', url: '/kanban-api/tasks/%E0%A4%A' }, malformed)
  assert.equal(malformed.status, 400)
  assert.equal(JSON.parse(malformed.body()).error.code, 'INVALID_PATH')
  assert.ok(!malformed.body().includes('URIError'))
  assert.ok(!malformed.body().includes('decodeURIComponent'))
})
