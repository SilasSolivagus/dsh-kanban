const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const STATUS_BY_CODE = {
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
  return { status: 204, headers: {}, body: null }
}

function fail(status, code, message, details = {}) {
  return { status, headers: JSON_HEADERS, body: { error: { code, message, details } } }
}

function toError(error) {
  const status = STATUS_BY_CODE[error.code] ?? 400
  return fail(status, error.code ?? 'INTERNAL_ERROR', error.message, error.details)
}

export async function handleRequest(store, request) {
  const { method, pathname, body } = request
  try {
    if (method === 'GET' && pathname === '/kanban-api/bootstrap') return ok(store.bootstrap())
    if (method === 'POST' && pathname === '/kanban-api/projects') {
      return ok(await store.createProject(body), 201)
    }

    const projectAction = /^\/kanban-api\/projects\/([^/]+)\/(archive|restore)$/.exec(pathname)
    if (projectAction && method === 'POST') {
      const id = decodeURIComponent(projectAction[1])
      return ok(await (projectAction[2] === 'archive' ? store.archiveProject(id) : store.restoreProject(id)))
    }

    const projectMatch = /^\/kanban-api\/projects\/([^/]+)$/.exec(pathname)
    if (projectMatch) {
      const id = decodeURIComponent(projectMatch[1])
      if (method === 'PATCH') return ok(await store.renameProject(id, body?.name))
      if (method === 'DELETE') {
        await store.deleteProject(id)
        return noContent()
      }
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

async function streamDownload(store, response, attachmentId) {
  let stream
  try {
    const result = store.readAttachment(decodeURIComponent(attachmentId))
    const attachment = result.attachment
    response.writeHead(200, {
      'content-type': attachment.contentType,
      'content-disposition': `attachment; filename="${attachment.filename.replace(/"/g, '')}"`,
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

export function createHttpHandler(store) {
  return async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      const download = DOWNLOAD_PATH.exec(url.pathname)
      if (download && request.method === 'GET') {
        await streamDownload(store, response, download[1])
        return
      }

      let body = null
      if (request.method !== 'GET' && request.method !== 'DELETE') {
        const read = await readJsonBody(request, response)
        if (read.done) return
        body = read.body
      }

      const result = await handleRequest(store, {
        method: request.method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body,
      })
      response.writeHead(result.status, result.headers)
      response.end(result.body === null ? undefined : JSON.stringify(result.body))
    } catch (error) {
      if (response.headersSent) {
        response.destroy?.()
        return
      }
      sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: String(error), details: {} } })
    }
  }
}
