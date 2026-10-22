import test from 'node:test'
import assert from 'node:assert/strict'
import { kanbanDomainSpec } from '../domain.js'

test('domain spec is a plain five-table declaration', () => {
  assert.equal(kanbanDomainSpec.name, 'dsh-kanban')
  assert.equal(kanbanDomainSpec.version, 1)
  assert.equal(kanbanDomainSpec.invalidRecords, 'backup-and-skip')
  assert.deepEqual(Object.keys(kanbanDomainSpec.tables).sort(), [
    'attachments',
    'comments',
    'projects',
    'task_activity',
    'tasks',
  ])
  for (const table of Object.values(kanbanDomainSpec.tables)) {
    assert.equal(typeof table.valueSchema?.parse, 'function')
  }
})
