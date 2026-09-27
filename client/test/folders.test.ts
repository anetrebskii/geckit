import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { foldersIn } from '../src/main/folders'

describe('the Mac folders the phone browses', () => {
  const made: string[] = []
  afterEach(() => {
    for (const one of made.splice(0)) rmSync(one, { recursive: true, force: true })
  })

  it('lists the folders under one, git ones marked, hidden ones left out', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-folders-'))
    made.push(root)
    mkdirSync(join(root, 'b-app', '.git'), { recursive: true })
    mkdirSync(join(root, 'a-notes'))
    mkdirSync(join(root, '.cache'))
    const read = foldersIn(root)
    expect(read.git).toBe(false)
    expect(read.folders).toEqual([
      { name: 'a-notes', path: join(root, 'a-notes'), git: false },
      { name: 'b-app', path: join(root, 'b-app'), git: true },
    ])
  })

  it('has nothing above the top and nothing under what cannot be read', () => {
    expect(foldersIn('/').up).toBeUndefined()
    expect(foldersIn('/no/such/folder').folders).toEqual([])
  })
})
