import test from 'node:test'
import assert from 'node:assert/strict'
import { projectSchema, taskSchema } from '../schema.js'

const project = {
  id: 'dsh-kanban',
  name: 'DSH 看板',
  workspacePath: null,
  taskPrefix: 'DSH',
  labels: [],
  nextTaskNumber: 1,
  archivedAt: null,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
}

const task = {
  id: 't1',
  identifier: 'DSH-1',
  projectId: project.id,
  title: 'task',
  description: '',
  status: 'backlog',
  priority: 'none',
  labels: [],
  assignee: { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null },
  sortOrder: 1000,
  statusSince: '2026-10-21T00:00:00.000Z',
  blockedReason: null,
  blockedSince: null,
  pendingQuestion: null,
  questionResolution: null,
  links: [],
  archivedAt: null,
  version: 1,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
}

test('valid project and task parse', () => {
  assert.equal(projectSchema.safeParse(project).success, true)
  assert.equal(taskSchema.safeParse(task).success, true)
})

test('blocked is not a stored status', () => {
  assert.equal(taskSchema.safeParse({ ...task, status: 'blocked' }).success, false)
})

test('invalid priority is rejected', () => {
  assert.equal(taskSchema.safeParse({ ...task, priority: 'P0' }).success, false)
})
