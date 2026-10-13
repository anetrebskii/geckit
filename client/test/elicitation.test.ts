import { describe, expect, it } from 'vitest'

import { elicitationAnswer, elicitationForm, elicitationSummary, elicitationUrl } from '../src/shared/elicitation'
import type { Elicitation, Json } from '../src/shared/elicitation'

const request = (schema: Json): Elicitation => ({ serverName: 'computer', message: 'Allow access?', ...elicitationForm(schema) })
const schema: Json = {
  type: 'object', required: ['name', 'count', 'enabled', 'choice', 'features'], properties: {
    name: { type: 'string', title: 'Name', minLength: 2, maxLength: 10, default: 'Alex' },
    count: { type: 'integer', minimum: 1, maximum: 3 },
    enabled: { type: 'boolean', default: false },
    choice: { type: 'string', oneOf: [{ const: 'one', title: 'First' }, { const: 'two', title: 'Second' }] },
    features: { type: 'array', minItems: 1, maxItems: 2, items: { anyOf: [{ const: 'view', title: 'View' }, { const: 'control', title: 'Control' }] } },
    optional: { type: 'string' },
  },
}
const content = { name: 'Alex', count: 2, enabled: false, choice: 'two', features: ['view'] }

describe('MCP elicitation forms', () => {
  it('reads labels, defaults and constraints without exposing raw schema', () => {
    expect(elicitationForm(schema).fields).toMatchObject([
      { name: 'name', label: 'Name', type: 'string', required: true, minLength: 2, maxLength: 10, default: 'Alex' },
      { name: 'count', type: 'integer', minimum: 1, maximum: 3 },
      { name: 'enabled', type: 'boolean', default: false },
      { name: 'choice', options: [{ value: 'one', label: 'First' }, { value: 'two', label: 'Second' }] },
      { name: 'features', minItems: 1, maxItems: 2, options: [{ value: 'view', label: 'View' }, { value: 'control', label: 'Control' }] },
      { name: 'optional', required: false },
    ])
  })

  it('accepts typed content and uses null content for distinct decline and cancel', () => {
    const form = request(schema)
    expect(elicitationAnswer(JSON.stringify({ action: 'accept', content }), form)).toEqual({ action: 'accept', content, _meta: null })
    for (const action of ['decline', 'cancel'] as const) expect(elicitationAnswer(JSON.stringify({ action, content }), form)).toEqual({ action, content: null, _meta: null })
    expect(elicitationSummary(JSON.stringify({ action: 'accept', content }))).toBe('Accepted')
  })

  it.each([
    { ...content, name: 'A' }, { ...content, name: 'Longer than allowed' }, { ...content, count: 0 }, { ...content, count: 4 }, { ...content, count: 1.5 },
    { ...content, enabled: 'yes' }, { ...content, choice: 'other' }, { ...content, features: [] }, { ...content, features: ['view', 'control', 'other'] },
    { ...content, features: ['view', 'view'] }, { ...content, unexpected: true }, {},
  ])('rejects invalid or incomplete content %j', (invalid) => {
    expect(elicitationAnswer(JSON.stringify({ action: 'accept', content: invalid }), request(schema))).toBeUndefined()
  })

  it('keeps optional prototype-named fields absent and confirms empty forms explicitly', () => {
    const form = request({ type: 'object', properties: { toString: { type: 'string' } } })
    expect(elicitationAnswer('{"action":"accept","content":{}}', form)?.content).toEqual({})
    expect(elicitationAnswer('{"action":"accept","content":{}}', request({ type: 'object', properties: {} }))?.content).toEqual({})
  })

  it('counts Unicode characters and distinguishes required presence from string length', () => {
    const form = request({ type: 'object', required: ['value'], properties: { value: { type: 'string', maxLength: 1 } } })
    for (const value of ['', '🦎']) expect(elicitationAnswer(JSON.stringify({ action: 'accept', content: { value } }), form)?.action).toBe('accept')
    expect(elicitationAnswer('{"action":"accept","content":{}}', form)).toBeUndefined()
    expect(elicitationAnswer('{"action":"accept","content":{"value":"🦎🦎"}}', form)).toBeUndefined()
  })

  it('preserves an empty default for a required string when no minimum length forbids it', () => {
    const form = request({ type: 'object', required: ['note'], properties: { note: { type: 'string', default: '' } } })
    expect(form.fields[0]?.default).toBe('')
    expect(elicitationAnswer('{"action":"accept","content":{"note":""}}', form)?.content).toEqual({ note: '' })
  })

  it('preserves empty enum values and integer bounds between integers', () => {
    const form = request({ type: 'object', required: ['choice', 'count'], properties: { choice: { type: 'string', oneOf: [{ const: '', title: 'None' }, { const: 'one', title: 'One' }], default: '' }, count: { type: 'integer', minimum: 0.5, maximum: 1.5, default: 1 } } })
    expect(form.fields[0]?.options?.[0]).toEqual({ value: '', label: 'None' })
    expect(elicitationAnswer('{"action":"accept","content":{"choice":"","count":1}}', form)?.content).toEqual({ choice: '', count: 1 })
  })

  it.each([
    { type: 'object', properties: { secret: { type: 'string', hidden: true, default: 'private' } } },
    { type: 'object', properties: { data: { type: 'object', properties: {} } } },
    { type: 'object', properties: { choice: { type: 'string', when: [{ property: 'other' }] } } },
    { type: 'object', properties: { text: { type: 'string', pattern: '^safe' } } },
    { type: 'object', properties: { amount: { type: 'number', multipleOf: 5 } } },
    { type: 'object', properties: { enabled: { type: 'boolean', default: 'yes' } } },
    { type: 'object', properties: { count: { type: 'number', minimum: 3, maximum: 1 } } },
    { type: 'object', properties: {}, required: ['missing'] },
  ])('leaves unsupported schema safe and does not leak values %j', (unsupported) => {
    const form = request(unsupported)
    expect(form.fields).toEqual([])
    expect(form.error).toBe('This form is not supported yet.')
    expect(JSON.stringify(form)).not.toContain('private')
    expect(elicitationAnswer('{"action":"accept","content":{}}', form)).toBeUndefined()
    expect(elicitationAnswer('{"action":"cancel"}', form)?.action).toBe('cancel')
  })

  it.each([['email', 'alex@example.com', 'bad'], ['uri', 'https://example.com/approve', 'bad'], ['date', '2026-10-12', '2026-02-31'], ['date-time', '2026-10-12T10:00:00Z', '2026-10-12']])('enforces %s formats', (format, valid, invalid) => {
    const form = request({ type: 'object', required: ['value'], properties: { value: { type: 'string', format } } })
    expect(elicitationAnswer(JSON.stringify({ action: 'accept', content: { value: valid } }), form)?.action).toBe('accept')
    expect(elicitationAnswer(JSON.stringify({ action: 'accept', content: { value: invalid } }), form)).toBeUndefined()
  })

  it('accepts URL completion without form data and allows only explicit http(s) navigation', () => {
    const url: Elicitation = { serverName: 'account', message: 'Sign in', fields: [], url: 'https://example.com/approve' }
    expect(elicitationAnswer('{"action":"accept","content":{"secret":"value"}}', url)).toEqual({ action: 'accept', content: null, _meta: null })
    for (const value of ['https://example.com', 'http://localhost:5198']) expect(elicitationUrl(value)).toBe(true)
    for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'not a URL']) expect(elicitationUrl(value)).toBe(false)
  })
})
