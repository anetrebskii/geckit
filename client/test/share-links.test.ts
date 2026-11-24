import { describe, expect, it } from 'vitest'

import { linkLocal } from '../src/main/channels/share-links'

const shares = { open: (target: string) => Promise.resolve(target.includes('gone') ? { why: 'gone' } : { id: 'i', key: 'k'.repeat(43), title: 't', expiresAt: 36, again: false }) }
const slack = (words: string, url: string): string => `<${url}|${words}>`

describe('linking what a channel message names', () => {
  it('links files inside the projects and localhost, and leaves the rest as written', async () => {
    const text = 'Report: `/srv/app/out/report.md`, site http://localhost:5173/, key /etc/hosts and /srv/app/gone.txt'
    const out = await linkLocal(text, shares, slack, ['/srv/app'])
    expect(out).toBe(`Report: <https://geckit-signal.web.app/#${'k'.repeat(43)}.10|/srv/app/out/report.md>, site <https://geckit-signal.web.app/#${'k'.repeat(43)}.10|http://localhost:5173/>, key /etc/hosts and /srv/app/gone.txt`)
  })

  it('does not take a folder that only starts with a project name for that project', async () => {
    expect(await linkLocal('see /srv/app-other/x.md', shares, slack, ['/srv/app'])).toBe('see /srv/app-other/x.md')
  })

  it('leaves text alone without shares', async () => {
    expect(await linkLocal('/srv/app/x.md', undefined, slack)).toBe('/srv/app/x.md')
  })
})
