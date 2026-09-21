import { describe, expect, it } from 'vitest'

import { mentionAt, pathIn, pathOfLink, pathsFor, pathsIn } from '../src/shared/paths'

describe('paths written without a link', () => {
  it('takes a path out of inline code, without its line numbers', () => {
    expect(pathIn('client/src/renderer/src/pictures.ts')).toBe('client/src/renderer/src/pictures.ts')
    expect(pathIn('/Users/alex/.claude/plans/add-a-one-line-comment-curious-pearl.md')).toBe(
      '/Users/alex/.claude/plans/add-a-one-line-comment-curious-pearl.md',
    )
    expect(pathIn('client/package.json:14-17')).toBe('client/package.json')
    expect(pathIn('CLAUDE.md')).toBe('CLAUDE.md')
    expect(pathIn('~/.claude/settings.json')).toBe('~/.claude/settings.json')
  })

  it('leaves code that is not a path alone', () => {
    expect(pathIn('author')).toBeUndefined()
    expect(pathIn('?? client/src/renderer/src/pictures.ts')).toBeUndefined()
    expect(pathIn('npm run test')).toBeUndefined()
    expect(pathIn('https://github.com/a/b')).toBeUndefined()
    expect(pathIn('const a = b')).toBeUndefined()
  })

  it('takes the file out of a link to one, and leaves web links alone', () => {
    expect(pathOfLink('client/package.json')).toBe('client/package.json')
    expect(pathOfLink('src/shared/paths.ts#L12')).toBe('src/shared/paths.ts')
    expect(pathOfLink('src/shared/paths.ts:12')).toBe('src/shared/paths.ts')
    expect(pathOfLink('file:///Users/alex/a%20b.md')).toBe('/Users/alex/a b.md')
    expect(pathOfLink('https://github.com/a/b')).toBeUndefined()
    expect(pathOfLink('mailto:a@b.c')).toBeUndefined()
    expect(pathOfLink('#heading')).toBeUndefined()
  })

  it('finds paths inside a sentence, leaving the full stop after one out', () => {
    expect(pathsIn('The plan is at ~/.claude/plans/pearl.md. Open it.')).toEqual([
      { text: 'The plan is at ', path: false },
      { text: '~/.claude/plans/pearl.md', path: true },
      { text: '. Open it.', path: false },
    ])
    expect(pathsIn('see /Users/alex/a.md and client/src/b.ts')).toEqual([
      { text: 'see ', path: false },
      { text: '/Users/alex/a.md', path: true },
      { text: ' and ', path: false },
      { text: 'client/src/b.ts', path: true },
    ])
    expect(pathsIn('Nothing here.')).toEqual([{ text: 'Nothing here.', path: false }])
  })

  it('knows the @ being typed at the caret', () => {
    expect(mentionAt('look at @src/ma', 15)).toEqual({ from: 8, asked: 'src/ma' })
    expect(mentionAt('@', 1)).toEqual({ from: 0, asked: '' })
    expect(mentionAt('mail me at a@b.c', 16)).toBeUndefined()
    expect(mentionAt('@src/a.ts and more', 18)).toBeUndefined()
  })

  it('offers the paths that fit what was typed after @, best first', () => {
    const paths = ['client/', 'client/src/', 'client/src/main.ts', 'client/src/renderer/', 'client/src/renderer/main.tsx', 'README.md', 'site/domain.ts']
    expect(pathsFor(paths, '')).toEqual(['client/', 'README.md'])
    expect(pathsFor(paths, 'main')).toEqual(['client/src/main.ts', 'client/src/renderer/main.tsx', 'site/domain.ts'])
    expect(pathsFor(paths, 'client/src/')).toEqual(['client/src/renderer/', 'client/src/main.ts'])
    expect(pathsFor(paths, 'READ')).toEqual(['README.md'])
  })
})
