import { describe, expect, it } from 'vitest'

import { readGit, repoOf } from '../src/main/git'

describe('where a checkout stands', () => {
  it('reads the branch, what is changed, and what is not pushed or pulled', () => {
    const status = [
      '# branch.oid d013e22f6c1b4f1e2a3b4c5d6e7f8a9b0c1d2e3f',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 aaa bbb CLAUDE.md',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\told.ts',
      '? client/src/main/git.ts',
      '',
    ].join('\n')
    expect(readGit(status)).toEqual({
      branch: 'main',
      changed: 3,
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      outgoing: [],
      incoming: [],
    })
  })

  it('knows a branch that has nowhere to push to yet', () => {
    const status = ['# branch.oid d013e22f6c1b4f1e2a3b4c5d6e7f8a9b0c1d2e3f', '# branch.head feature/bar', ''].join('\n')
    expect(readGit(status)).toEqual({ branch: 'feature/bar', changed: 0, ahead: 0, behind: 0, outgoing: [], incoming: [] })
  })

  it('names the commit where no branch is checked out', () => {
    const status = ['# branch.oid d013e22f6c1b4f1e2a3b4c5d6e7f8a9b0c1d2e3f', '# branch.head (detached)', ''].join('\n')
    expect(readGit(status).branch).toBe('d013e22')
  })
})

describe('the repository a project pushes to', () => {
  it('reads it out of the remote, however the address is written', () => {
    expect(repoOf('git@github.com:twins-ai/Twins-AI.git\n')).toBe('twins-ai/Twins-AI')
    expect(repoOf('https://github.com/anetrebskii/geckit.git')).toBe('anetrebskii/geckit')
    expect(repoOf('https://github.com/anetrebskii/geckit/')).toBe('anetrebskii/geckit')
    expect(repoOf('ssh://git@github.com/formula-ga/formula')).toBe('formula-ga/formula')
  })

  it('says nothing where the remote is somewhere else, or there is none', () => {
    expect(repoOf('git@gitlab.com:team/thing.git')).toBeUndefined()
    expect(repoOf('')).toBeUndefined()
  })
})
