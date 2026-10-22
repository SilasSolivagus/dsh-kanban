import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LOCAL_USER = { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null }

const AGENT_TOKEN_ENV = 'DSH_KANBAN_AGENT_TOKENS_FILE'

function digest(value) {
  return createHash('sha256').update(value).digest()
}

function forbidden() {
  return Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
}

function sanitize(agent) {
  const { token, ...actor } = agent
  return {
    ...actor,
    type: 'agent',
    avatarUrl: actor.avatarUrl ?? null,
  }
}

function validAgent(agent) {
  return Boolean(
    agent &&
    typeof agent === 'object' &&
    typeof agent.id === 'string' &&
    agent.id.length > 0 &&
    typeof agent.name === 'string' &&
    agent.name.length > 0 &&
    Array.isArray(agent.projects) &&
    Array.isArray(agent.scopes),
  )
}

export function loadAgents(file = process.env[AGENT_TOKEN_ENV] || join(homedir(), '.dsh', 'kanban-agents.json')) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const agents = Array.isArray(parsed) ? parsed : parsed?.agents
    if (!Array.isArray(agents)) return []
    return agents.filter(validAgent)
  } catch {
    return []
  }
}

export function createActorRegistry({ agents = loadAgents() } = {}) {
  const definitions = agents.filter(validAgent)
  const byId = new Map(definitions.map((agent) => [agent.id, sanitize(agent)]))
  const tokenById = new Map(
    definitions
      .filter((agent) => typeof agent.token === 'string' && agent.token.length > 0)
      .map((agent) => [agent.id, agent.token]),
  )

  function resolve(headers = {}) {
    const auth = headers.authorization
    if (!auth) return LOCAL_USER
    const match = /^Bearer\s+(.+)$/i.exec(auth)
    if (!match) return null
    const tokenDigest = digest(match[1])
    for (const [id, expected] of tokenById) {
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

  return {
    resolve,
    get: (id) => byId.get(id),
    list: () => [LOCAL_USER, ...byId.values()],
    assertCan,
  }
}
