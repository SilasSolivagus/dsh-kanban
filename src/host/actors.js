import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LOCAL_USER = { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null }

const AGENTS = [
  {
    type: 'agent', id: 'dsh.shopkeeper', name: '掌柜', role: 'office',
    avatarUrl: null, projects: ['*'],
    scopes: ['board:read', 'board:create', 'board:assign', 'board:update:any', 'board:comment'],
  },
  {
    type: 'agent', id: 'gb.banzi', name: '扳子', role: 'builder',
    avatarUrl: null, projects: ['dsh-kanban'],
    scopes: ['board:read', 'board:update:own', 'board:comment'],
  },
]

function digest(value) {
  return createHash('sha256').update(value).digest()
}

function forbidden() {
  // Keep FORBIDDEN in the error's string form as well as its `code`, so both
  // `assert.throws(..., /FORBIDDEN/)` and HTTP error mapping can use it.
  return Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', name: 'FORBIDDEN' })
}

export function createActorRegistry({ tokens, tokenFile } = {}) {
  const tokenMap = tokens ?? loadTokens(tokenFile)
  const byId = new Map(AGENTS.map((agent) => [agent.id, agent]))

  function resolve(headers = {}) {
    const auth = headers.authorization
    if (!auth) return LOCAL_USER
    const match = /^Bearer\s+(.+)$/i.exec(auth)
    if (!match) return null
    const tokenDigest = digest(match[1])
    for (const [id, expected] of Object.entries(tokenMap)) {
      if (typeof expected !== 'string' || expected.length === 0) continue
      if (digest(expected).length !== tokenDigest.length) continue
      if (timingSafeEqual(digest(expected), tokenDigest)) return byId.get(id) ?? null
    }
    return null
  }

  function assertCan(actor, action, resource = {}) {
    if (!actor) throw forbidden()
    if (actor.type === 'user') return
    const scopes = actor.scopes ?? []
    const projects = actor.projects ?? []
    const projectAllowed = projects.includes('*') || projects.includes(resource.projectId)
    const owns = resource.assignee?.id === actor.id
    const allowed = projectAllowed && (
      scopes.includes(action) ||
      (action === 'board:update' && (scopes.includes('board:update:any') || (scopes.includes('board:update:own') && owns))) ||
      (action === 'board:create' && scopes.includes('board:create'))
    )
    if (!allowed) throw forbidden()
  }

  return { resolve, get: (id) => byId.get(id), list: () => [LOCAL_USER, ...AGENTS], assertCan }
}

export function loadTokens(file = process.env.DSH_KANBAN_AGENT_TOKENS_FILE || join(homedir(), '.dsh', 'kanban-agents.json')) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}
