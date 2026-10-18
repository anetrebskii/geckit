import { describe, expect, it } from 'vitest'

import { commandAt, commandsFor } from '../src/shared/commands'

describe('commands picked with /', () => {
  it('finds a command only while its name is typed at the start of the message', () => {
    expect(commandAt('/', 1)).toEqual({ from: 0, asked: '' })
    expect(commandAt('/code', 5)).toEqual({ from: 0, asked: 'code' })
    expect(commandAt('/figma:figma-use', 16)).toEqual({ from: 0, asked: 'figma:figma-use' })
    expect(commandAt('/commit now', 11)).toBeUndefined()
    expect(commandAt('look at /tmp', 12)).toBeUndefined()
    expect(commandAt('/Users/alex', 11)).toBeUndefined()
    expect(commandAt(' /code', 6)).toBeUndefined()
  })

  it('offers names that start with what was typed, then those that hold it, in the order listed', () => {
    const names = ['code_review', 'commit', 'commit_and_mr', 'code-review', 'compact', 'security-review']
    expect(commandsFor(names, '')).toEqual(names)
    expect(commandsFor(names, 'comm')).toEqual(['commit', 'commit_and_mr'])
    expect(commandsFor(names, 'review')).toEqual(['code_review', 'code-review', 'security-review'])
    expect(commandsFor(names, 'CODE')).toEqual(['code_review', 'code-review'])
    expect(commandsFor(names, 'zzz')).toEqual([])
  })
})
