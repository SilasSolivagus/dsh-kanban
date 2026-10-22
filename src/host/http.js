import { LOCAL_USER, createActorRegistry } from './actors.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const NO_STORE_HEADERS = { 'cache-control': 'no-store' }

const STATUS_BY_CODE = {
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  PROJECT_ARCHIVED: 403,
  TASK_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  PROJECT_EXISTS: 409,
  PROJECT_NOT_EMPTY: 409,
  TASK_VERSION_CONFLICT: 409,
  TASK_ARCHIVED: 409,
  TASK_NOT_ARCHIVED: 409,
  TASK_NOT_IN_REVIEW: 409,
  TASK_NEEDS_ATTENTION: 409,
  QUESTION_ALREADY_PENDING: 409,
  QUESTION_NOT_PENDING: 409,
  ATTACHMENT_TOO_LARGE: 413,
  ATTACHMENT_LIMIT_REACHED: 413,
}

function ok(body, status = 200) {
  return { status, headers: JSON_HEADERS, body }
}

function noContent() {
  return { status: 204, headers: NO_STORE_HEADERS, body: null }
}

function fail(status, code, message, details = {}) {
  return { status, headers: JSON_HEADERS, body: { error: { code, message, details } } }
}

function toError(error) {
  const code = error?.code
  if (typeof code === 'string' && Object.hasOwn(STATUS_BY_CODE, code)) {
    return fail(STATUS_BY_CODE[code], code, error.message, error.details)
  }
  if (typeof code === 'string' && code.startsWith('INVALID_')) {
    return fail(400, code, error.message, error.details)
  }
  return fail(500, 'INTERNAL_ERROR', 'Internal server error')
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw Object.assign(new Error('Malformed URL encoding'), { code: 'INVALID_PATH' })
  }
}

function isAgent(actor) {
  return actor?.type === 'agent'
}

function assertRead(store, actors, actor, id) {
  const detail = store.getTaskDetail(id)
  actors.assertCan(actor, 'board:read', detail.task)
  return detail
}

function filteredBootstrap(store, actors, actor) {
  const data = store.bootstrap()
  if (!isAgent(actor)) return data
  const visibleProjects = data.projects.filter((project) => {
    try {
      actors.assertCan(actor, 'board:read', { projectId: project.id })
      return true
    } catch {
      return false
    }
  })
  const visibleIds = new Set(visibleProjects.map((project) => project.id))
  return {
    projects: visibleProjects,
    tasks: data.tasks.filter((task) => visibleIds.has(task.projectId)),
  }
}

export async function handleRequest(store, request, actors = createActorRegistry()) {
  const { method, pathname, body, searchParams = new URLSearchParams() } = request
  const actor = request.actor ?? LOCAL_USER
  const payload = body ?? {}
  try {
    if (method === 'GET' && pathname === '/kanban-api/bootstrap') return ok(filteredBootstrap(store, actors, actor))
    if (method === 'POST' && pathname === '/kanban-api/projects') {
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot create projects')
      return ok(await store.createProject(payload), 201)
    }

    const projectAction = /^\/kanban-api\/projects\/([^/]+)\/(archive|restore)$/.exec(pathname)
    if (projectAction && method === 'POST') {
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot manage projects')
      const id = decodePathSegment(projectAction[1])
      return ok(await (projectAction[2] === 'archive' ? store.archiveProject(id) : store.restoreProject(id)))
    }

    const projectMatch = /^\/kanban-api\/projects\/([^/]+)$/.exec(pathname)
    if (projectMatch) {
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot manage projects')
      const id = decodePathSegment(projectMatch[1])
      if (method === 'PATCH') return ok(await store.renameProject(id, payload.name))
      if (method === 'DELETE') {
        await store.deleteProject(id)
        return noContent()
      }
    }

    if (method === 'POST' && pathname === '/kanban-api/tasks') {
      if (isAgent(actor)) {
        actors.assertCan(actor, 'board:create', { projectId: payload.projectId })
        return ok(await store.createTask(payload, actor), 201)
      }
      return ok(await store.createTask(payload), 201)
    }

    if (method === 'GET' && pathname === '/kanban-api/archived-tasks') {
      const tasks = store.listArchivedTasks(searchParams.get('projectId') ?? undefined)
      if (!isAgent(actor)) return ok({ tasks })
      return ok({ tasks: tasks.filter((task) => {
        try { actors.assertCan(actor, 'board:read', task); return true } catch { return false }
      }) })
    }

    const taskMatch = /^\/kanban-api\/tasks\/([^/]+)$/.exec(pathname)
    if (taskMatch) {
      const id = decodePathSegment(taskMatch[1])
      if (method === 'GET') {
        if (isAgent(actor)) return ok(assertRead(store, actors, actor, id))
        return ok(store.getTaskDetail(id))
      }
      if (method === 'PATCH') {
        if (isAgent(actor)) {
          const detail = store.getTaskDetail(id)
          actors.assertCan(actor, 'board:update', detail.task)
          return ok(await store.updateTask(id, payload, actor))
        }
        return ok(await store.updateTask(id, payload))
      }
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot delete tasks')
      if (method === 'DELETE') {
        await store.deleteTask(id, payload)
        return noContent()
      }
    }

    const taskAction = /^\/kanban-api\/tasks\/([^/]+)\/(archive|restore|question|answer)$/.exec(pathname)
    if (taskAction && method === 'POST') {
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot manage task lifecycle')
      const id = decodePathSegment(taskAction[1])
      if (taskAction[2] === 'archive') return ok(await store.archiveTask(id, payload))
      if (taskAction[2] === 'restore') return ok(await store.restoreTask(id, payload))
      if (taskAction[2] === 'question') return ok(await store.askQuestion(id, payload))
      if (taskAction[2] === 'answer') return ok(await store.answerQuestion(id, payload))
    }

    const activityMatch = /^\/kanban-api\/tasks\/([^/]+)\/activity$/.exec(pathname)
    if (activityMatch && method === 'GET') {
      const id = decodePathSegment(activityMatch[1])
      if (isAgent(actor)) return ok(assertRead(store, actors, actor, id).activity)
      return ok(store.getTaskDetail(id).activity)
    }

    const commentMatch = /^\/kanban-api\/tasks\/([^/]+)\/comments$/.exec(pathname)
    if (commentMatch) {
      const id = decodePathSegment(commentMatch[1])
      if (method === 'GET') {
        if (isAgent(actor)) return ok(assertRead(store, actors, actor, id).comments)
        return ok(store.getTaskDetail(id).comments)
      }
      if (method === 'POST') {
        if (isAgent(actor)) {
          const detail = assertRead(store, actors, actor, id)
          actors.assertCan(actor, 'board:comment', detail.task)
          return ok(await store.addComment(id, payload.body, actor), 201)
        }
        return ok(await store.addComment(id, payload.body), 201)
      }
    }

    const commentDelete = /^\/kanban-api\/tasks\/([^/]+)\/comments\/([^/]+)$/.exec(pathname)
    if (commentDelete && method === 'DELETE') {
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot delete comments')
      await store.deleteComment(decodePathSegment(commentDelete[1]), decodePathSegment(commentDelete[2]))
      return noContent()
    }

    const attachmentMatch = /^\/kanban-api\/tasks\/([^/]+)\/attachments$/.exec(pathname)
    if (attachmentMatch) {
      const id = decodePathSegment(attachmentMatch[1])
      if (method === 'GET') {
        if (isAgent(actor)) return ok(assertRead(store, actors, actor, id).attachments)
        return ok(store.getTaskDetail(id).attachments)
      }
      if (method === 'POST') {
        if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot add attachments')
        return ok(await store.addAttachment(id, payload), 201)
      }
    }

    const attachmentDelete = /^\/kanban-api\/tasks\/([^/]+)\/attachments\/([^/]+)$/.exec(pathname)
    if (attachmentDelete && method === 'DELETE') {
      if (isAgent(actor)) return fail(403, 'FORBIDDEN', 'Agents cannot delete attachments')
      await store.deleteAttachment(decodePathSegment(attachmentDelete[1]), decodePathSegment(attachmentDelete[2]))
      return noContent()
    }

    return fail(404, 'NOT_FOUND', 'Not found')
  } catch (error) {
    return toError(error)
  }
}

const MAX_BODY_BYTES = 30 * 1024 * 1024
const DOWNLOAD_PATH = /^\/kanban-api\/attachments\/([^/]+)$/

function sendJson(response, status, body) {
  response.writeHead(status, JSON_HEADERS)
  response.end(JSON.stringify(body))
}

const RFC5987_ESCAPES = /['()*]/g

function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(
    RFC5987_ESCAPES,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function contentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`
}

async function streamDownload(store, response, attachmentId, actor, actors) {
  let id
  try {
    id = decodePathSegment(attachmentId)
  } catch (error) {
    const failure = toError(error)
    sendJson(response, failure.status, failure.body)
    return
  }
  let stream
  try {
    const result = store.readAttachment(id)
    const attachment = result.attachment
    if (actor?.type === 'agent') {
      const detail = store.getTaskDetail(attachment.taskId)
      actors.assertCan(actor, 'board:read', detail.task)
    }
    response.writeHead(200, {
      'content-type': attachment.contentType,
      'content-disposition': contentDisposition(attachment.filename),
      'content-length': String(attachment.size),
      'cache-control': 'no-store',
    })
    stream = result.stream
  } catch (error) {
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Attachment not found', details: {} } })
    return
  }
  try {
    for await (const chunk of stream) response.write(chunk)
    response.end()
  } catch (error) {
    response.destroy?.()
  }
}

async function readJsonBody(request, response) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      sendJson(response, 413, {
        error: { code: 'ATTACHMENT_TOO_LARGE', message: 'Request body is too large', details: {} },
      })
      request.destroy?.()
      return { done: true }
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return { done: false, body: text ? JSON.parse(text) : {} }
  } catch (error) {
    sendJson(response, 400, { error: { code: 'INVALID_BODY', message: 'Request body is not valid JSON', details: {} } })
    return { done: true }
  }
}

export function createHttpHandler(store, { actors = createActorRegistry() } = {}) {
  return async (request, response) => {
    try {
      const actor = actors.resolve(request.headers ?? {})
      if (!actor) {
        sendJson(response, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid agent token', details: {} } })
        return
      }
      const url = new URL(request.url, 'http://localhost')
      const download = DOWNLOAD_PATH.exec(url.pathname)
      if (download && request.method === 'GET') {
        await streamDownload(store, response, download[1], actor, actors)
        return
      }

      let body = null
      if (request.method !== 'GET') {
        const read = await readJsonBody(request, response)
        if (read.done) return
        body = read.body
      }

      const result = await handleRequest(store, {
        method: request.method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body,
        actor,
      }, actors)
      response.writeHead(result.status, result.headers)
      response.end(result.body === null ? undefined : JSON.stringify(result.body))
    } catch (error) {
      if (response.headersSent) {
        response.destroy?.()
        return
      }
      sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} } })
    }
  }
}
