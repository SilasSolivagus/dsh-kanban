import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createActorRegistry, loadTokens, LOCAL_USER } from '../actors.js'

const tokens = {
  'dsh.shopkeeper': 'shop-token',
  'gb.banzi': 'banzi-token',
}

function withTokenFile(contents, fn) {
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
  const registry = createActorRegistry({ tokens })
  assert.equal(registry.resolve({}).id, LOCAL_USER.id)
})

test('valid bearer resolves agent', () => {
  const registry = createActorRegistry({ tokens })
  const actor = registry.resolve({ authorization: 'Bearer banzi-token' })
  assert.equal(actor.id, 'gb.banzi')
  assert.equal(actor.name, '扳子')
})

test('invalid bearer resolves null', () => {
  const registry = createActorRegistry({ tokens })
  assert.equal(registry.resolve({ authorization: 'Bearer nope' }), null)
})

test('non-bearer authorization resolves null', () => {
  const registry = createActorRegistry({ tokens })
  assert.equal(registry.resolve({ authorization: 'Basic banzi-token' }), null)
})

test('token whose actor is unknown resolves null', () => {
  const registry = createActorRegistry({ tokens: { 'ghost.actor': 'ghost-token' } })
  assert.equal(registry.resolve({ authorization: 'Bearer ghost-token' }), null)
})

test('banzi can update own card only', () => {
  const registry = createActorRegistry({ tokens })
  const banzi = registry.get('gb.banzi')
  assert.doesNotThrow(() => registry.assertCan(banzi, 'board:update', {
    projectId: 'dsh-kanban',
    assignee: { id: 'gb.banzi' },
  }))
  assert.throws(() => registry.assertCan(banzi, 'board:update', {
    projectId: 'dsh-kanban',
    assignee: { id: 'dsh.shopkeeper' },
  }), /FORBIDDEN/)
})

test('banzi cannot update a card in another project', () => {
  const registry = createActorRegistry({ tokens })
  const banzi = registry.get('gb.banzi')
  assert.throws(() => registry.assertCan(banzi, 'board:update', {
    projectId: 'other-project',
    assignee: { id: 'gb.banzi' },
  }), /FORBIDDEN/)
})

test('shopkeeper can update any card in any project', () => {
  const registry = createActorRegistry({ tokens })
  const shopkeeper = registry.get('dsh.shopkeeper')
  assert.doesNotThrow(() => registry.assertCan(shopkeeper, 'board:update', {
    projectId: 'other-project',
    assignee: { id: 'gb.banzi' },
  }))
})

test('local user is never restricted', () => {
  const registry = createActorRegistry({ tokens })
  assert.doesNotThrow(() => registry.assertCan(registry.resolve({}), 'board:update', {
    projectId: 'other-project',
    assignee: { id: 'gb.banzi' },
  }))
})

test('tokenFile supplies tokens when tokens are not passed', () => {
  withTokenFile({ 'gb.banzi': 'from-file' }, (file) => {
    const registry = createActorRegistry({ tokenFile: file })
    assert.equal(registry.resolve({ authorization: 'Bearer from-file' }).id, 'gb.banzi')
  })
})

test('loadTokens prefers DSH_KANBAN_AGENT_TOKENS_FILE', () => {
  withTokenFile({ 'gb.banzi': 'env-token' }, (file) => {
    const previous = process.env.DSH_KANBAN_AGENT_TOKENS_FILE
    process.env.DSH_KANBAN_AGENT_TOKENS_FILE = file
    try {
      assert.deepEqual(loadTokens(), { 'gb.banzi': 'env-token' })
    } finally {
      if (previous === undefined) delete process.env.DSH_KANBAN_AGENT_TOKENS_FILE
      else process.env.DSH_KANBAN_AGENT_TOKENS_FILE = previous
    }
  })
})

test('loadTokens returns an empty map for a missing file', () => {
  assert.deepEqual(loadTokens('/nonexistent/dsh-kanban-agents.json'), {})
})
