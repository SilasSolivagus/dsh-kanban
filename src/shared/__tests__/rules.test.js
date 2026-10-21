import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attentionReason,
  columnForTask,
  canDrop,
  elapsedStart,
  nextIdentifier,
} from '../rules.js'

const base = {
  id: 't1',
  projectId: 'dsh-kanban',
  identifier: 'DSH-1',
  title: 'task',
  status: 'in_progress',
  archivedAt: null,
  blockedReason: null,
  blockedSince: null,
  pendingQuestion: null,
  questionResolution: null,
  statusSince: '2026-10-21T00:00:00.000Z',
}

test('question outranks blocker and review', () => {
  const task = {
    ...base,
    status: 'in_review',
    blockedReason: 'waiting',
    pendingQuestion: { createdAt: '2026-10-21T01:00:00.000Z' },
  }
  assert.equal(attentionReason(task), 'question')
  assert.equal(columnForTask(task), 'needs')
  assert.equal(elapsedStart(task), '2026-10-21T01:00:00.000Z')
})

test('blocker outranks review and uses blockedSince', () => {
  const task = {
    ...base,
    status: 'in_review',
    blockedReason: 'waiting',
    blockedSince: '2026-10-21T02:00:00.000Z',
  }
  assert.equal(attentionReason(task), 'blocked')
  assert.equal(elapsedStart(task), '2026-10-21T02:00:00.000Z')
})

test('review is attention and uses statusSince', () => {
  const task = { ...base, status: 'in_review' }
  assert.equal(attentionReason(task), 'review')
  assert.equal(elapsedStart(task), base.statusSince)
})

test('normal columns map to backlog, running and done', () => {
  assert.equal(columnForTask({ ...base, status: 'backlog' }), 'backlog')
  assert.equal(columnForTask({ ...base, status: 'todo' }), 'backlog')
  assert.equal(columnForTask(base), 'running')
  assert.equal(columnForTask({ ...base, status: 'done' }), 'done')
  assert.equal(columnForTask({ ...base, status: 'canceled' }), null)
})

test('attention tasks cannot leave Needs you and Needs you cannot be a target', () => {
  const attention = { ...base, status: 'in_review' }
  assert.equal(canDrop(attention, 'done').ok, false)
  assert.equal(canDrop(base, 'needs').ok, false)
  assert.equal(canDrop(base, 'done').ok, true)
})

test('identifier uses the higher of nextTaskNumber and existing max', () => {
  const project = { id: 'dsh-kanban', name: 'DSH 看板', taskPrefix: 'DSH', nextTaskNumber: 2 }
  const tasks = [{ identifier: 'DSH-7' }, { identifier: 'DSH-3' }]
  assert.equal(nextIdentifier(project, tasks), 'DSH-8')
})
