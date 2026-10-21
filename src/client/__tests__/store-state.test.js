import test from 'node:test'
import assert from 'node:assert/strict'
import { groupTasks, applyTaskPatch } from '../store-state.js'

test('groupTasks maps tasks into four columns', () => {
  const tasks = [
    { id: 'a', column: 'backlog' },
    { id: 'b', column: 'running' },
    { id: 'c', column: 'needs' },
    { id: 'd', column: 'done' },
  ]
  const grouped = groupTasks(tasks)
  assert.deepEqual(grouped.backlog.map((task) => task.id), ['a'])
  assert.deepEqual(grouped.needs.map((task) => task.id), ['c'])
})

test('applyTaskPatch replaces one task by id', () => {
  const next = applyTaskPatch([{ id: 'a', title: 'old' }], 'a', { title: 'new' })
  assert.equal(next[0].title, 'new')
})
