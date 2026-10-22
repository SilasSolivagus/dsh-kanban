#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const configFile = process.env.DSH_KANBAN_AGENT_CONFIG || join(homedir(), '.dsh', 'kanban-agents.json')
const base = (process.env.DSH_KANBAN_URL || 'http://127.0.0.1:61849/kanban-api').replace(/\/$/, '')
const projectId = process.env.DSH_KANBAN_PROJECT || 'dsh-kanban'

const config = JSON.parse(readFileSync(configFile, 'utf8'))
const agents = Array.isArray(config) ? config : config.agents
assert.ok(Array.isArray(agents), `${configFile} must contain { "agents": [...] }`)

const probe = await fetch(`${base}/bootstrap`, {
  headers: { authorization: 'Bearer definitely-not-a-valid-token' },
})
if (probe.status !== 401) {
  throw new Error(
    `Current live plugin is not M1 (invalid bearer returned ${probe.status}, expected 401). ` +
    'The GUI is still loading the main branch. Point the profile link to the M1 worktree and restart DSH before running this acceptance.'
  )
}

const office = agents.find((agent) => agent.role === 'office')
const builder = agents.find((agent) => agent.role === 'builder')
assert.ok(office?.token, 'config needs an office agent with a token')
assert.ok(builder?.token, 'config needs a builder agent with a token')

async function request(method, path, { token, body, expect = 200 } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (response.status !== expect) {
    throw new Error(`${method} ${path}: expected ${expect}, got ${response.status}: ${text.slice(0, 300)}`)
  }
  return parsed
}

console.log(`config: ${configFile}`)
console.log(`base:   ${base}`)
console.log(`office: ${office.id} (${office.name})`)
console.log(`builder:${builder.id} (${builder.name})`)

const boot = await request('GET', '/bootstrap')
let project = boot.projects.find((entry) => entry.id === projectId)
if (!project) {
  project = await request('POST', '/projects', { body: { name: 'DSH Kanban' }, expect: 201 })
  console.log(`created project: ${project.id}`)
} else {
  console.log(`using project: ${project.id}`)
}

const card = await request('POST', '/tasks', {
  token: office.token,
  expect: 201,
  body: {
    projectId: project.id,
    title: `M1 live acceptance ${new Date().toISOString()}`,
    description: '## 验收\nSilas → office → card → builder update/comment',
    assigneeId: builder.id,
  },
})
assert.equal(card.assignee.id, builder.id, 'card must be assigned to builder')
console.log(`created card: ${card.identifier} (${card.id})`)

const updated = await request('PATCH', `/tasks/${card.id}`, {
  token: builder.token,
  body: { version: card.version, status: 'in_progress' },
})
assert.equal(updated.status, 'in_progress')

const comment = await request('POST', `/tasks/${card.id}/comments`, {
  token: builder.token,
  expect: 201,
  body: { body: 'M1 live acceptance: 收到' },
})
assert.equal(comment.author.id, builder.id)

const detail = await request('GET', `/tasks/${card.id}`, { token: builder.token })
assert.equal(detail.task.assignee.id, builder.id)
assert.equal(detail.comments.at(-1).author.id, builder.id)
const actors = detail.activity.map((event) => event.actor.id)
assert.ok(actors.includes(office.id), `activity missing office: ${actors}`)
assert.ok(actors.includes(builder.id), `activity missing builder: ${actors}`)
console.log(`activity actors: ${actors.join(', ')}`)

await request('POST', '/tasks', {
  token: builder.token,
  expect: 403,
  body: { projectId: project.id, title: 'builder must not create' },
})
console.log('negative: builder create = 403')

const officeCard = await request('POST', '/tasks', {
  token: office.token,
  expect: 201,
  body: { projectId: project.id, title: 'M1 office-only card', assigneeId: office.id },
})
await request('PATCH', `/tasks/${officeCard.id}`, {
  token: builder.token,
  expect: 403,
  body: { version: officeCard.version, status: 'in_progress' },
})
console.log('negative: builder update office card = 403')

await request('PATCH', `/tasks/${card.id}`, {
  token: builder.token,
  expect: 403,
  body: { version: updated.version, assigneeId: office.id },
})
console.log('negative: builder reassign = 403')

console.log('\nPASS')
console.log(`Open the board and check: ${project.name} → ${card.identifier}`)
console.log(`Assignee should be ${builder.name}; activity should show ${office.name} and ${builder.name}.`)
console.log('Cleanup: archive the two acceptance cards from the UI.')
