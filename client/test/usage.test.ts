import { describe, expect, it } from 'vitest'

import { controlResponse } from '../src/main/sessions/usage'

describe('what a `claude` given no message answers a control request with', () => {
  it('reads a successful answer, which id it is for and what it said', () => {
    const line = JSON.stringify({
      type: 'control_response',
      response: { request_id: 'usage', subtype: 'success', response: { fiveHour: { part: 0.4 } } },
    })
    expect(controlResponse(line)).toEqual({ id: 'usage', ok: true, answer: { fiveHour: { part: 0.4 } } })
  })

  it('reads a failed answer as not ok, still with its id', () => {
    const line = JSON.stringify({ type: 'control_response', response: { request_id: 'model:0', subtype: 'error' } })
    expect(controlResponse(line)).toEqual({ id: 'model:0', ok: false, answer: {} })
  })

  it('is nothing for a line that is not a control response at all, or not JSON', () => {
    expect(controlResponse(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeUndefined()
    expect(controlResponse('not json')).toBeUndefined()
    expect(controlResponse('')).toBeUndefined()
  })
})
