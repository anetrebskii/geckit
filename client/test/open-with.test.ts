import { describe, expect, it } from 'vitest'

import { appName, ruleFor, withRule } from '../src/shared/api'

/** Which application a file pressed in a conversation goes to. */

const CODE = '/Applications/Visual Studio Code.app'
const PREVIEW = '/System/Applications/Preview.app'
const TEXT = '/System/Applications/TextEdit.app'

describe('the rule a file is opened by', () => {
  const rules = [
    { kinds: 'ts tsx, .json', app: CODE },
    { kinds: '*.png *.PDF', app: PREVIEW },
    { kinds: '*', app: TEXT },
  ]

  it('is the one that names its extension, however the extension was written', () => {
    expect(ruleFor(rules, 'client/src/main/index.ts')?.app).toBe(CODE)
    expect(ruleFor(rules, '/abs/package.json')?.app).toBe(CODE)
    expect(ruleFor(rules, 'docs/shot.PNG')?.app).toBe(PREVIEW)
    expect(ruleFor(rules, 'docs/spec.pdf')?.app).toBe(PREVIEW)
  })

  it('falls to * for anything no rule names, a file with no extension included', () => {
    expect(ruleFor(rules, 'README.md')?.app).toBe(TEXT)
    expect(ruleFor(rules, 'Makefile')?.app).toBe(TEXT)
    expect(ruleFor(rules, '.gitignore')?.app).toBe(TEXT)
  })

  it('is nothing where no rule fits and none says *, so the system decides', () => {
    expect(ruleFor(rules.slice(0, 2), 'README.md')).toBeUndefined()
  })

  it('skips a rule whose application was never chosen', () => {
    expect(ruleFor([{ kinds: 'ts', app: '' }, { kinds: '*', app: TEXT }], 'a.ts')?.app).toBe(TEXT)
  })

  it('names an application the way the Dock does', () => {
    expect(appName(CODE)).toBe('Visual Studio Code')
  })
})

describe('giving a kind of file to an application', () => {
  it('takes the extension out of the rule that had it, and adds its own', () => {
    const rules = [
      { kinds: 'ts tsx, .json', app: CODE },
      { kinds: 'md', app: TEXT },
      { kinds: '*', app: TEXT },
    ]
    const after = withRule(rules, 'md', PREVIEW)
    expect(after).toEqual([
      { kinds: 'ts tsx, .json', app: CODE },
      { kinds: '*', app: TEXT },
      { kinds: 'md', app: PREVIEW },
    ])
    expect(ruleFor(after, 'README.md')?.app).toBe(PREVIEW)
    expect(ruleFor(withRule(rules, 'tsx', PREVIEW), 'a.ts')?.app).toBe(CODE)
    expect(withRule(rules, 'tsx', PREVIEW)[0]).toEqual({ kinds: 'ts json', app: CODE })
  })
})
