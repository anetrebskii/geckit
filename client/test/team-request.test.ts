import { afterEach, describe, expect, it } from 'vitest'

import { memoryNotes, Sessions } from '../src/main/sessions'
import type { SessionItem, SessionItems, SessionNotice } from '../src/shared/api'

const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })

function fixture() {
  const told: SessionItems[] = []
  const notices: SessionNotice[] = []
  const sessions = new Sessions({
    notes: memoryNotes(), changed: () => undefined, items: (items) => { told.push(items) }, account: () => undefined, notify: (notice) => { notices.push(notice) },
    disk: { list: async () => [], has: async () => false, read: async () => undefined },
    claudeAccount: async () => ({ here: true, signedIn: true }), claudeProgram: async () => undefined,
    claudeModels: async () => undefined, usage: async () => ({ windows: new Map<string, number | undefined>() }),
    claude: () => ({ send: () => undefined, answer: () => undefined, stop: () => undefined, end: async () => undefined }),
  })
  cleanup.push(() => sessions.dispose())
  const last = (): Extract<SessionItem, { kind: 'team-request' }> => {
    const item = told.flatMap((one) => one.items).findLast((one) => one.kind === 'team-request')
    if (item?.kind !== 'team-request') throw new Error('No team request was shown')
    return item
  }
  return { sessions, told, notices, last }
}

describe('a change to the team asked for in a conversation', () => {
  it('shows a card, notifies, and resolves with the person\'s Allow', async () => {
    const f = fixture()
    const id = await f.sessions.send({ root: '/project', mode: 'auto', text: 'Set up the realtor' })
    const waiting = f.sessions.teamRequest(id, ['Add employee "Realtor"'], new AbortController().signal)
    const card = f.last()
    expect(card).toMatchObject({ lines: ['Add employee "Realtor"'] })
    expect(card.answer).toBeUndefined()
    expect(f.notices.at(-1)).toMatchObject({ session: id, title: 'Wants to change the team', body: 'Add employee "Realtor"', asks: true })
    f.sessions.answerTeamRequest(card.id, { allow: true, where: 'phone' })
    expect(await waiting).toEqual({ how: 'allowed', where: 'phone' })
    expect(f.last().answer).toEqual({ how: 'allowed', where: 'phone' })
  })

  it('passes a decline with its note, and withdraws the card when the command stops waiting', async () => {
    const f = fixture()
    const id = await f.sessions.send({ root: '/project', mode: 'auto', text: 'Set up the realtor' })
    const declined = f.sessions.teamRequest(id, ['Archive Realtor'], new AbortController().signal)
    f.sessions.answerTeamRequest(f.last().id, { allow: false, note: ' Not now ', where: 'mac' })
    expect(await declined).toEqual({ how: 'declined', where: 'mac', note: 'Not now' })
    const gone = new AbortController()
    const withdrawn = f.sessions.teamRequest(id, ['Restore Realtor'], gone.signal)
    gone.abort()
    expect(await withdrawn).toBeUndefined()
    expect(f.last().answer).toEqual({ how: 'withdrawn' })
    f.sessions.answerTeamRequest(f.last().id, { allow: true, where: 'mac' })
    expect(f.last().answer).toEqual({ how: 'withdrawn' })
  })

  it('refuses a conversation GeckIt does not show', async () => {
    const f = fixture()
    await expect(f.sessions.teamRequest('unknown', ['Archive Realtor'], new AbortController().signal)).rejects.toThrow('Run the command in a terminal')
  })
})
