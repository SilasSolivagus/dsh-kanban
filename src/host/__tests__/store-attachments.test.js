import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { KanbanStore } from '../store.js'
import { MemoryTable } from './memory-table.js'

const NOW = '2026-10-21T00:00:00.000Z'
const MIB = 1024 * 1024

function makeStore({ attachments, newId } = {}) {
  const admitted = []
  const store = new KanbanStore({
    tables: {
      projects: new MemoryTable(),
      tasks: new MemoryTable(),
      comments: new MemoryTable(),
      attachments: new MemoryTable(),
      activity: new MemoryTable(),
    },
    attachments: {
      admitEncodedFile: async ({ data, name }) => {
        admitted.push({ data, name })
        return { attachmentId: 'a1', name, bytes: Buffer.from(data, 'base64').length }
      },
      ...attachments,
    },
    now: () => NOW,
    newId: newId ?? (() => {
      let n = 0
      return () => `id-${++n}`
    })(),
  })
  return { store, admitted }
}

async function seedTask(store) {
  const project = await store.createProject({ name: 'DSH 看板' })
  return store.createTask({ projectId: project.id, title: 'task' })
}

const VALID = { filename: 'f.txt', contentType: 'text/plain', data: 'YWJj' }

test('attachment metadata is stored after byte admission', async () => {
  const { store, admitted } = makeStore()
  const task = await seedTask(store)

  const attachment = await store.addAttachment(task.id, VALID)

  assert.equal(attachment.filename, 'f.txt')
  assert.equal(attachment.contentType, 'text/plain')
  assert.equal(attachment.taskId, task.id)
  assert.equal(attachment.size, 3)
  assert.deepEqual(attachment.storageRef, { attachmentId: 'a1', name: 'f.txt', bytes: 3 })
  assert.equal(attachment.createdAt, NOW)
  assert.deepEqual(admitted, [{ data: 'YWJj', name: 'f.txt' }])
  assert.equal(store.getTaskDetail(task.id).attachments.length, 1)

  const activity = store.getTaskDetail(task.id).activity
  assert.deepEqual(activity.at(-1).changes, [{ field: 'attachment', before: null, after: 'f.txt' }])
})

test('attachment filename and content type boundaries are accepted', async () => {
  const { store } = makeStore()
  const task = await seedTask(store)

  const attachment = await store.addAttachment(task.id, {
    filename: 'f'.repeat(255),
    contentType: 't'.repeat(200),
    data: '',
  })

  assert.equal(attachment.filename.length, 255)
  assert.equal(attachment.contentType.length, 200)
  assert.equal(attachment.size, 0)
})

test('invalid attachment fields throw INVALID_FIELD', async () => {
  const { store, admitted } = makeStore()
  const task = await seedTask(store)

  const cases = [
    [{ ...VALID, filename: '' }, 'filename'],
    [{ ...VALID, filename: '   ' }, 'filename'],
    [{ ...VALID, filename: 'f'.repeat(256) }, 'filename'],
    [{ ...VALID, filename: 42 }, 'filename'],
    [{ ...VALID, contentType: '' }, 'contentType'],
    [{ ...VALID, contentType: 't'.repeat(201) }, 'contentType'],
    [{ ...VALID, contentType: null }, 'contentType'],
    [{ ...VALID, data: 42 }, 'data'],
    [{ ...VALID, data: 'not base64!' }, 'data'],
    [{ ...VALID, data: 'YWJ' }, 'data'],
  ]

  for (const [input, field] of cases) {
    await assert.rejects(
      () => store.addAttachment(task.id, input),
      (error) => error.code === 'INVALID_FIELD' && error.details.field === field,
      `expected INVALID_FIELD for ${field}`,
    )
  }
  assert.equal(admitted.length, 0)
  assert.equal(store.getTaskDetail(task.id).attachments.length, 0)
})

test('attachment larger than 20 MiB throws ATTACHMENT_TOO_LARGE', async () => {
  const { store, admitted } = makeStore()
  const task = await seedTask(store)

  const oversized = Buffer.alloc(20 * MIB + 1).toString('base64')
  await assert.rejects(
    () => store.addAttachment(task.id, { ...VALID, data: oversized }),
    (error) => error.code === 'ATTACHMENT_TOO_LARGE',
  )
  assert.equal(admitted.length, 0)
  assert.equal(store.getTaskDetail(task.id).attachments.length, 0)
})

test('a task accepts at most 50 attachments', async () => {
  const { store } = makeStore()
  const task = await seedTask(store)

  for (let index = 0; index < 50; index += 1) {
    await store.addAttachment(task.id, VALID)
  }

  await assert.rejects(
    () => store.addAttachment(task.id, VALID),
    (error) => error.code === 'ATTACHMENT_LIMIT_REACHED',
  )
  assert.equal(store.getTaskDetail(task.id).attachments.length, 50)
})

test('addAttachment rejects archived tasks and projects', async () => {
  const { store } = makeStore()
  const task = await seedTask(store)
  await store.archiveTask(task.id, { version: task.version })

  await assert.rejects(
    () => store.addAttachment(task.id, VALID),
    (error) => error.code === 'TASK_ARCHIVED',
  )

  const project = await store.createProject({ name: 'archived project' })
  const other = await store.createTask({ projectId: project.id, title: 'task' })
  await store.archiveProject(project.id)

  await assert.rejects(
    () => store.addAttachment(other.id, VALID),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
})

test('deleteAttachment removes metadata and rejects archived tasks and projects', async () => {
  const { store } = makeStore()
  const task = await seedTask(store)

  const attachment = await store.addAttachment(task.id, VALID)
  await store.deleteAttachment(task.id, attachment.id)
  assert.equal(store.getTaskDetail(task.id).attachments.length, 0)

  await assert.rejects(
    () => store.deleteAttachment(task.id, attachment.id),
    (error) => error.code === 'NOT_FOUND',
  )

  const kept = await store.addAttachment(task.id, VALID)
  const other = await store.createTask({ projectId: task.projectId, title: 'other' })
  await assert.rejects(
    () => store.deleteAttachment(other.id, kept.id),
    (error) => error.code === 'NOT_FOUND',
  )

  await store.archiveTask(task.id, { version: store.getTaskDetail(task.id).task.version })
  await assert.rejects(
    () => store.deleteAttachment(task.id, kept.id),
    (error) => error.code === 'TASK_ARCHIVED',
  )

  const project = await store.createProject({ name: 'archived project' })
  const archivedTask = await store.createTask({ projectId: project.id, title: 'task' })
  const archivedAttachment = await store.addAttachment(archivedTask.id, VALID)
  await store.archiveProject(project.id)

  await assert.rejects(
    () => store.deleteAttachment(archivedTask.id, archivedAttachment.id),
    (error) => error.code === 'PROJECT_ARCHIVED',
  )
})

test('readAttachment returns metadata with a readable byte stream', async () => {
  const refs = []
  const { store } = makeStore({
    attachments: {
      readFileStream: (storageRef) => {
        refs.push(storageRef)
        return Readable.from([Buffer.from('abc')])
      },
    },
  })
  const project = await store.createProject({ name: 'DSH 看板' })
  const task = await store.createTask({ projectId: project.id, title: 'task' })
  const attachment = await store.addAttachment(task.id, VALID)

  const result = store.readAttachment(attachment.id)
  assert.deepEqual(result.attachment, attachment)
  assert.deepEqual(refs, [attachment.storageRef])

  const chunks = []
  for await (const chunk of result.stream) chunks.push(chunk)
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'abc')

  await store.archiveProject(project.id)
  assert.equal(store.readAttachment(attachment.id).attachment.id, attachment.id)
})

test('readAttachment rejects unknown attachments', () => {
  const { store } = makeStore()
  assert.throws(
    () => store.readAttachment('missing'),
    (error) => error.code === 'NOT_FOUND',
  )
})
