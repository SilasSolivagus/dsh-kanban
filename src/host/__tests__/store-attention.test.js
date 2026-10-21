import test from 'node:test'
import assert from 'node:assert/strict'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

function makeStore(now = () => '2026-10-21T00:00:00.000Z') {
  return new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: { admitEncodedFile: async () => ({ attachmentId: 'a1', name: 'f', bytes: 1 }) },
    now,
    newId: (() => { let n = 0; return () => `id-${++n}` })(),
  })
}

async function setup() {
  const store = makeStore()
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  return { store, project, task }
}

function questionInput(overrides = {}) {
  return {
    version: 1,
    prompt: 'Which name?',
    note: '',
    options: [
      { id: 'a', label: 'A', detail: '' },
      { id: 'b', label: 'B', detail: '' },
    ],
    ...overrides,
  }
}

test('blocking sets blockedSince and clearing removes it', async () => {
  const { store, task } = await setup()
  const blocked = await store.updateTask(task.id, { version: 1, blockedReason: 'waiting' })
  assert.equal(blocked.blockedSince, '2026-10-21T00:00:00.000Z')
  const cleared = await store.updateTask(task.id, { version: 2, blockedReason: null })
  assert.equal(cleared.blockedSince, null)
})

test('question enters Needs you; approve finishes and reject returns to backlog', async () => {
  const { store, task } = await setup()
  const asked = await store.askQuestion(task.id, {
    version: 1,
    prompt: 'Which name?',
    note: '',
    options: [
      { id: 'a', label: 'A', detail: '' },
      { id: 'b', label: 'B', detail: '' },
    ],
  })
  assert.equal(asked.attentionReason, 'question')
  const approved = await store.answerQuestion(task.id, {
    version: 2,
    decision: 'approve',
    selected: 'a',
    note: '',
  })
  assert.equal(approved.status, 'done')
  assert.equal(approved.attentionReason, null)
})

test('done is rejected while attention is unresolved', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, blockedReason: 'waiting' })
  await assert.rejects(
    () => store.updateTask(task.id, { version: 2, status: 'done' }),
    (error) => error.code === 'TASK_NEEDS_ATTENTION',
  )
})

test('askQuestion records the question without changing the workflow status', async () => {
  const { store, task } = await setup()
  const started = await store.updateTask(task.id, { version: 1, status: 'in_progress' })
  const asked = await store.askQuestion(task.id, questionInput({ version: started.version }))

  assert.equal(asked.status, 'in_progress')
  assert.equal(asked.statusSince, started.statusSince)
  assert.equal(asked.version, 3)
  assert.equal(asked.updatedAt, '2026-10-21T00:00:00.000Z')
  assert.equal(asked.attentionReason, 'question')
  assert.equal(asked.column, 'needs')
  assert.equal(asked.questionResolution, null)
  assert.deepEqual(asked.pendingQuestion, {
    prompt: 'Which name?',
    note: '',
    options: [
      { id: 'a', label: 'A', detail: '' },
      { id: 'b', label: 'B', detail: '' },
    ],
    selected: null,
    createdAt: '2026-10-21T00:00:00.000Z',
  })
})

test('askQuestion keeps questions exclusive and defaults option detail', async () => {
  const { store, task } = await setup()
  const asked = await store.askQuestion(task.id, {
    version: 1,
    prompt: 'Pick one',
    options: [
      { id: 'a', label: 'A', extra: 'ignored' },
      { id: 'b', label: 'B', detail: 'the second' },
    ],
  })
  assert.deepEqual(asked.pendingQuestion.options, [
    { id: 'a', label: 'A', detail: '' },
    { id: 'b', label: 'B', detail: 'the second' },
  ])
  await assert.rejects(
    () => store.askQuestion(task.id, questionInput({ version: 2 })),
    (error) => error.code === 'QUESTION_ALREADY_PENDING',
  )
})

test('answerQuestion approve records the resolution and keeps the question for history', async () => {
  const { store, task } = await setup()
  await store.askQuestion(task.id, questionInput())
  const approved = await store.answerQuestion(task.id, {
    version: 2,
    decision: 'approve',
    selected: 'b',
    note: 'go with B',
  })

  assert.equal(approved.status, 'done')
  assert.equal(approved.statusSince, '2026-10-21T00:00:00.000Z')
  assert.equal(approved.version, 3)
  assert.equal(approved.attentionReason, null)
  assert.equal(approved.column, 'done')
  assert.equal(approved.pendingQuestion.prompt, 'Which name?')
  assert.equal(approved.pendingQuestion.selected, null)
  assert.deepEqual(approved.questionResolution, {
    decision: 'approve',
    optionId: 'b',
    optionLabel: 'B',
    note: 'go with B',
    at: '2026-10-21T00:00:00.000Z',
  })
})

test('answerQuestion reject returns to backlog and records the resolution', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, status: 'in_progress' })
  await store.askQuestion(task.id, questionInput({ version: 2 }))
  const rejected = await store.answerQuestion(task.id, {
    version: 3,
    decision: 'reject',
    selected: 'a',
    note: 'not that one',
  })

  assert.equal(rejected.status, 'backlog')
  assert.equal(rejected.attentionReason, null)
  assert.equal(rejected.column, 'backlog')
  assert.equal(rejected.questionResolution.decision, 'reject')
  assert.equal(rejected.questionResolution.optionId, 'a')
  assert.equal(rejected.questionResolution.optionLabel, 'A')
})

test('answerQuestion resolves a plain review without a pending question', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, status: 'in_review' })
  const approved = await store.answerQuestion(task.id, {
    version: 2,
    decision: 'approve',
    note: 'looks good',
  })

  assert.equal(approved.status, 'done')
  assert.equal(approved.attentionReason, null)
  assert.equal(approved.pendingQuestion, null)
  assert.deepEqual(approved.questionResolution, {
    decision: 'approve',
    optionId: null,
    optionLabel: null,
    note: 'looks good',
    at: '2026-10-21T00:00:00.000Z',
  })
})

test('answerQuestion requires a current version and a reviewable task', async () => {
  const { store, task } = await setup()
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 1, decision: 'approve' }),
    (error) => error.code === 'TASK_NOT_IN_REVIEW',
  )
  await store.askQuestion(task.id, questionInput())
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 1, decision: 'approve', selected: 'a' }),
    (error) => error.code === 'TASK_VERSION_CONFLICT',
  )
})

test('a resolved question cannot be answered again', async () => {
  const { store, task } = await setup()
  await store.askQuestion(task.id, questionInput())
  await store.answerQuestion(task.id, { version: 2, decision: 'approve', selected: 'a' })
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 3, decision: 'reject', selected: 'b' }),
    (error) => error.code === 'TASK_NOT_IN_REVIEW',
  )
  const detail = store.getTaskDetail(task.id).task
  assert.equal(detail.status, 'done')
  assert.equal(detail.version, 3)
  assert.equal(detail.questionResolution.optionId, 'a')
})

test('answerQuestion requires a selected option while a question is pending', async () => {
  const { store, task } = await setup()
  await store.askQuestion(task.id, questionInput())
  for (const selected of [undefined, null, '', 'missing', 5]) {
    await assert.rejects(
      () => store.answerQuestion(task.id, { version: 2, decision: 'approve', selected }),
      (error) => error.code === 'INVALID_FIELD',
    )
  }
  assert.equal(store.getTaskDetail(task.id).task.version, 2)
  assert.equal(store.getTaskDetail(task.id).task.attentionReason, 'question')
})

test('approve is rejected while a blocker is active and works after clearing it', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, blockedReason: 'waiting' })
  await store.askQuestion(task.id, questionInput({ version: 2 }))
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 3, decision: 'approve', selected: 'a' }),
    (error) => error.code === 'TASK_NEEDS_ATTENTION',
  )
  let detail = store.getTaskDetail(task.id).task
  assert.equal(detail.version, 3)
  assert.equal(detail.status, 'backlog')
  assert.equal(detail.questionResolution, null)
  assert.equal(detail.blockedReason, 'waiting')
  assert.equal(detail.attentionReason, 'question')

  await store.updateTask(task.id, { version: 3, blockedReason: null })
  const approved = await store.answerQuestion(task.id, {
    version: 4,
    decision: 'approve',
    selected: 'a',
  })
  assert.equal(approved.status, 'done')
  assert.equal(approved.attentionReason, null)
  assert.equal(approved.column, 'done')
})

test('approve is rejected for a blocked review without a pending question', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, status: 'in_review' })
  await store.updateTask(task.id, { version: 2, blockedReason: 'waiting' })
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 3, decision: 'approve' }),
    (error) => error.code === 'TASK_NEEDS_ATTENTION',
  )
  const detail = store.getTaskDetail(task.id).task
  assert.equal(detail.version, 3)
  assert.equal(detail.status, 'in_review')
  assert.equal(detail.questionResolution, null)
  assert.equal(detail.blockedReason, 'waiting')
})

test('done is rejected while a question is unresolved and allowed after the blocker clears', async () => {
  const { store, task } = await setup()
  await store.askQuestion(task.id, questionInput())
  await assert.rejects(
    () => store.updateTask(task.id, { version: 2, status: 'done' }),
    (error) => error.code === 'TASK_NEEDS_ATTENTION',
  )
  await store.answerQuestion(task.id, { version: 2, decision: 'reject', selected: 'a' })
  const done = await store.updateTask(task.id, { version: 3, status: 'done' })
  assert.equal(done.status, 'done')
  assert.equal(store.getTaskDetail(task.id).task.attentionReason, null)

  const { store: other, task: blockedTask } = await setup()
  await other.updateTask(blockedTask.id, { version: 1, blockedReason: 'waiting' })
  const moved = await other.updateTask(blockedTask.id, { version: 2, status: 'in_progress' })
  assert.equal(moved.status, 'in_progress')
  assert.equal(moved.blockedSince, '2026-10-21T00:00:00.000Z')
  await other.updateTask(blockedTask.id, { version: 3, blockedReason: null })
  const finished = await other.updateTask(blockedTask.id, { version: 4, status: 'done' })
  assert.equal(finished.status, 'done')
  assert.equal(other.getTaskDetail(blockedTask.id).task.attentionReason, null)
})

test('done with attention is rejected even when the patch does not change status', async () => {
  const { store, task } = await setup()
  await store.updateTask(task.id, { version: 1, status: 'done' })
  await assert.rejects(
    () => store.updateTask(task.id, { version: 2, blockedReason: 'late blocker' }),
    (error) => error.code === 'TASK_NEEDS_ATTENTION',
  )
  const detail = store.getTaskDetail(task.id).task
  assert.equal(detail.version, 2)
  assert.equal(detail.status, 'done')
  assert.equal(detail.blockedReason, null)
  assert.equal(detail.blockedSince, null)
})

test('askQuestion on a Done task reopens it to in_review', async () => {
  let clock = '2026-10-21T00:00:00.000Z'
  const store = makeStore(() => clock)
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  await store.updateTask(task.id, { version: 1, status: 'done' })
  clock = '2026-10-21T01:00:00.000Z'
  const asked = await store.askQuestion(task.id, questionInput({ version: 2 }))

  assert.equal(asked.status, 'in_review')
  assert.equal(asked.statusSince, '2026-10-21T01:00:00.000Z')
  assert.equal(asked.attentionReason, 'question')
  assert.equal(asked.column, 'needs')
  assert.equal(asked.questionResolution, null)
})

test('askQuestion validates its input with INVALID_FIELD', async () => {
  const { store, task } = await setup()
  const invalid = [
    { prompt: '' },
    { prompt: 5 },
    { prompt: 'x'.repeat(2001) },
    { note: 'x'.repeat(2001) },
    { note: 5 },
    { options: undefined },
    { options: 'a,b' },
    { options: [{ id: 'a', label: 'A', detail: '' }] },
    {
      options: Array.from({ length: 6 }, (_, index) => ({ id: `o-${index}`, label: `O${index}`, detail: '' })),
    },
    { options: [null, { id: 'b', label: 'B', detail: '' }] },
    { options: [{ id: '', label: 'A', detail: '' }, { id: 'b', label: 'B', detail: '' }] },
    { options: [{ id: 'a', label: '', detail: '' }, { id: 'b', label: 'B', detail: '' }] },
    { options: [{ id: 'a', label: 'x'.repeat(201), detail: '' }, { id: 'b', label: 'B', detail: '' }] },
    { options: [{ id: 'a', label: 'A', detail: 5 }, { id: 'b', label: 'B', detail: '' }] },
    { options: [{ id: 'a', label: 'A', detail: 'x'.repeat(1001) }, { id: 'b', label: 'B', detail: '' }] },
  ]
  for (const overrides of invalid) {
    await assert.rejects(
      () => store.askQuestion(task.id, questionInput(overrides)),
      (error) => error.code === 'INVALID_FIELD',
    )
  }
  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.task.version, 1)
  assert.equal(detail.task.pendingQuestion, null)
})

test('answerQuestion validates its input with INVALID_FIELD', async () => {
  const { store, task } = await setup()
  await store.askQuestion(task.id, questionInput())
  const invalid = [
    {},
    { decision: 'maybe' },
    { decision: 'approve', note: 5 },
    { decision: 'approve', note: 'x'.repeat(2001) },
  ]
  for (const overrides of invalid) {
    await assert.rejects(
      () => store.answerQuestion(task.id, { version: 2, selected: 'a', ...overrides }),
      (error) => error.code === 'INVALID_FIELD',
    )
  }
  const detail = store.getTaskDetail(task.id)
  assert.equal(detail.task.version, 2)
  assert.equal(detail.task.status, 'backlog')
  assert.equal(detail.task.questionResolution, null)
})

test('archived projects reject questions and answers', async () => {
  const { store, project, task } = await setup()
  await store.archiveProject(project.id)
  await assert.rejects(
    () => store.askQuestion(task.id, questionInput()),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 1, decision: 'approve' }),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
})

test('archived tasks reject questions and answers', async () => {
  const { store, task } = await setup()
  const asked = await store.askQuestion(task.id, questionInput())
  await store.archiveTask(task.id, { version: asked.version })
  await assert.rejects(
    () => store.askQuestion(task.id, questionInput({ version: 3 })),
    (error) => error.code === 'TASK_ARCHIVED',
  )
  await assert.rejects(
    () => store.answerQuestion(task.id, { version: 3, decision: 'approve', selected: 'a' }),
    (error) => error.code === 'TASK_ARCHIVED',
  )
})
