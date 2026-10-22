import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createActorRegistry, loadAgents, LOCAL_USER } from '../actors.js'
import { AGENTS } from './actor-fixture.js'

function withConfigFile(contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-kanban-agents-'))
  try {
    const file = join(dir, 'kanban-agents.json')
    writeFileSync(file, JSON.stringify(contents))
    return fn(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('no bearer resolves to local human', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  assert.equal(registry.resolve({}).id, LOCAL_USER.id)
})

test('valid bearer resolves the configured agent, without leaking its token', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  const actor = registry.resolve({ authorization: 'Bearer builder-token' })
  assert.equal(actor.id, 'builder')
  assert.equal(actor.name, 'Builder')
  assert.equal('token' in actor, false)
  assert.equal('token' in registry.list()[1], false)
})

test('invalid bearer resolves null', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  assert.equal(registry.resolve({ authorization: 'Bearer nope' }), null)
})

test('non-bearer authorization resolves null', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  assert.equal(registry.resolve({ authorization: 'Basic builder-token' }), null)
})

test('builder can update own card only', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  const builder = registry.get('builder')
  assert.doesNotThrow(() => registry.assertCan(builder, 'board:update', {
    projectId: 'dsh-kanban',
    assignee: { id: 'builder' },
  }))
  assert.throws(() => registry.assertCan(builder, 'board:update', {
    projectId: 'dsh-kanban',
    assignee: { id: 'office' },
  }), (error) => error.code === 'FORBIDDEN')
})

test('builder cannot update a card in another project', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  const builder = registry.get('builder')
  assert.throws(() => registry.assertCan(builder, 'board:update', {
    projectId: 'other-project',
    assignee: { id: 'builder' },
  }), (error) => error.code === 'FORBIDDEN')
})

test('office can update any card in any project', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  const office = registry.get('office')
  assert.doesNotThrow(() => registry.assertCan(office, 'board:update', {
    projectId: 'other-project',
    assignee: { id: 'builder' },
  }))
})

test('local user is never restricted', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  assert.doesNotThrow(() => registry.assertCan(registry.resolve({}), 'board:update', {
    projectId: 'other-project',
    assignee: { id: 'builder' },
  }))
})

test('office can create a card in any project', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  const office = registry.get('office')
  assert.doesNotThrow(() => registry.assertCan(office, 'board:create', { projectId: 'dsh-kanban' }))
  assert.doesNotThrow(() => registry.assertCan(office, 'board:create', { projectId: 'other-project' }))
})

test('builder cannot create and can comment only inside its project', () => {
  const registry = createActorRegistry({ agents: AGENTS })
  const builder = registry.get('builder')
  assert.throws(() => registry.assertCan(builder, 'board:create', { projectId: 'dsh-kanban' }), (error) => error.code === 'FORBIDDEN')
  assert.doesNotThrow(() => registry.assertCan(builder, 'board:comment', {
    projectId: 'dsh-kanban',
    assignee: { id: 'office' },
  }))
  assert.throws(() => registry.assertCan(builder, 'board:comment', {
    projectId: 'other-project',
    assignee: { id: 'office' },
  }), (error) => error.code === 'FORBIDDEN')
})

test('agents can be loaded from a config file', () => {
  withConfigFile({ agents: AGENTS }, (file) => {
    const registry = createActorRegistry({ agents: loadAgents(file) })
    assert.equal(registry.resolve({ authorization: 'Bearer builder-token' }).id, 'builder')
  })
})

test('loadAgents prefers DSH_KANBAN_AGENT_TOKENS_FILE', () => {
  withConfigFile({ agents: AGENTS }, (file) => {
    const previous = process.env.DSH_KANBAN_AGENT_TOKENS_FILE
    process.env.DSH_KANBAN_AGENT_TOKENS_FILE = file
    try {
      assert.equal(loadAgents()[1].id, 'builder')
    } finally {
      if (previous === undefined) delete process.env.DSH_KANBAN_AGENT_TOKENS_FILE
      else process.env.DSH_KANBAN_AGENT_TOKENS_FILE = previous
    }
  })
})

test('loadAgents returns an empty list for a missing or invalid file', () => {
  assert.deepEqual(loadAgents('/nonexistent/dsh-kanban-agents.json'), [])
})
