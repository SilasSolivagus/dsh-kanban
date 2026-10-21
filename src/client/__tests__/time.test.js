import test from 'node:test'
import assert from 'node:assert/strict'
import { elapsedParts, formatElapsed } from '../time.js'

const now = Date.parse('2026-10-21T12:00:00.000Z')

test('elapsedParts breaks elapsed time into days, hours and minutes', () => {
  assert.deepEqual(elapsedParts('2026-10-21T11:59:30.000Z', now), { days: 0, hours: 0, minutes: 0 })
  assert.deepEqual(elapsedParts('2026-10-21T11:55:00.000Z', now), { days: 0, hours: 0, minutes: 5 })
  assert.deepEqual(elapsedParts('2026-10-21T09:30:00.000Z', now), { days: 0, hours: 2, minutes: 30 })
  assert.deepEqual(elapsedParts('2026-10-19T10:00:00.000Z', now), { days: 2, hours: 2, minutes: 0 })
})

test('elapsedParts tolerates invalid or future timestamps', () => {
  assert.equal(elapsedParts(null, now), null)
  assert.equal(elapsedParts('nonsense', now), null)
  assert.deepEqual(elapsedParts('2026-10-21T12:05:00.000Z', now), { days: 0, hours: 0, minutes: 0 })
})

test('formatElapsed renders localized short units', () => {
  const t = (key, params) => params?.count === undefined ? key : `${key}:${params.count}`
  assert.equal(formatElapsed(null, now, t), '')
  assert.equal(formatElapsed('2026-10-21T11:59:40.000Z', now, t), 'elapsedUnderMinute')
  assert.equal(formatElapsed('2026-10-21T11:55:00.000Z', now, t), 'elapsedMinutes:5')
  assert.equal(formatElapsed('2026-10-21T10:00:00.000Z', now, t), 'elapsedHours:2')
  assert.equal(
    formatElapsed('2026-10-21T09:30:00.000Z', now, t),
    'elapsedHours:2 elapsedMinutes:30',
  )
  assert.equal(
    formatElapsed('2026-10-19T09:00:00.000Z', now, t),
    'elapsedDays:2 elapsedHours:3',
  )
})
