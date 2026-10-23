import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFICE_BRIEF_PROMPT, openOffice } from '../office-entry.js'

test('the office brief names the four card fields', () => {
  assert.match(OFFICE_BRIEF_PROMPT, /掌柜/)
  assert.match(OFFICE_BRIEF_PROMPT, /目标/)
  assert.match(OFFICE_BRIEF_PROMPT, /资料/)
  assert.match(OFFICE_BRIEF_PROMPT, /验收/)
  assert.match(OFFICE_BRIEF_PROMPT, /边界/)
  assert.match(OFFICE_BRIEF_PROMPT, /assignee=builder/)
})

test('openOffice starts a standard session with a prefilled brief', () => {
  const calls = []
  const workspace = {
    startSession: (workspaceId, options) => calls.push({ workspaceId, options }),
  }
  assert.equal(openOffice(workspace), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].workspaceId, undefined)
  assert.equal(calls[0].options.agentPreset, 'standard')
  assert.equal(calls[0].options.prompt, OFFICE_BRIEF_PROMPT)
})

test('openOffice is a no-op without the workspace service', () => {
  assert.equal(openOffice(undefined), false)
  assert.equal(openOffice({}), false)
})
