import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentHref,
  formatActivityValue,
  formatBytes,
  isHttpUrl,
  sortActivityDesc,
} from '../drawer-state.js'

// Minimal locale stub: returns the key, replacing {param} placeholders.
function t(key, params = {}) {
  let value = key
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}

test('isHttpUrl accepts only http and https URLs', () => {
  assert.equal(isHttpUrl('https://example.com/a'), true)
  assert.equal(isHttpUrl('http://example.com'), true)
  assert.equal(isHttpUrl('ftp://example.com'), false)
  assert.equal(isHttpUrl('javascript:alert(1)'), false)
  assert.equal(isHttpUrl('not a url'), false)
  assert.equal(isHttpUrl(''), false)
})

test('attachmentHref builds the download path and encodes the id', () => {
  assert.equal(attachmentHref('a1'), '/kanban-api/attachments/a1')
  assert.equal(attachmentHref('a b/c'), '/kanban-api/attachments/a%20b%2Fc')
})

test('formatBytes renders human readable sizes', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1024), '1.0 KiB')
  assert.equal(formatBytes(2048), '2.0 KiB')
  assert.equal(formatBytes(12 * 1024 * 1024), '12 MiB')
  assert.equal(formatBytes(MAX_ATTACHMENT_BYTES), '20 MiB')
  assert.equal(formatBytes(-1), '')
  assert.equal(formatBytes('nope'), '')
})

test('sortActivityDesc orders newest first with a stable tie-breaker', () => {
  const events = [
    { id: 'a', createdAt: '2026-10-21T10:00:00.000Z' },
    { id: 'c', createdAt: '2026-10-21T12:00:00.000Z' },
    { id: 'b', createdAt: '2026-10-21T11:00:00.000Z' },
    { id: 'd', createdAt: '2026-10-21T12:00:00.000Z' },
  ]
  assert.deepEqual(sortActivityDesc(events).map((event) => event.id), ['d', 'c', 'b', 'a'])
  assert.equal(events[0].id, 'a', 'does not mutate the input')
  assert.deepEqual(sortActivityDesc(undefined), [])
})

test('formatActivityValue localizes status, priority and archive changes', () => {
  assert.equal(formatActivityValue('status', 'in_progress', t), 'status_in_progress')
  assert.equal(formatActivityValue('priority', 'urgent', t), 'priority_urgent')
  assert.equal(formatActivityValue('archivedAt', '2026-10-21T10:00:00.000Z', t), 'activityArchived')
  assert.equal(formatActivityValue('archivedAt', null, t), 'activityNone')
})

test('formatActivityValue renders collections, questions and objects', () => {
  assert.equal(formatActivityValue('labels', ['ui', 'api'], t), 'ui, api')
  assert.equal(formatActivityValue('labels', [], t), 'activityNone')
  assert.equal(formatActivityValue('links', [{ label: 'Spec' }, { url: 'https://example.com' }], t), 'Spec, https://example.com')
  assert.equal(formatActivityValue('pendingQuestion', { prompt: 'Ship it?' }, t), 'Ship it?')
  assert.equal(
    formatActivityValue('questionResolution', { decision: 'approve', optionLabel: 'Yes' }, t),
    'approve · Yes',
  )
  assert.equal(formatActivityValue('blockedReason', 'Waiting', t), 'Waiting')
  assert.equal(formatActivityValue('mystery', { value: 1 }, t), '{"value":1}')
})
