import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TelegramAttachments } from '../src/main/telegram-attachments'
import { describe, expect, it, vi } from 'vitest'
import { emptyMembers, memberAccount, memberId, membersOf, TelegramPreparation } from '../src/main/telegram-members'
import type { TelegramUpdate } from '../src/main/telegram-bot'

const person = (index = 0) => ({ id: memberId(), account: { id: index + 1, chatId: index + 1, name: 'Participant' }, approve: false, active: true })
describe('team member registry and preparation', () => {
  it('fails closed for incompatible authority, duplicate IDs and every registry count boundary', () => {
    expect(membersOf(undefined)).toEqual(emptyMembers())
    expect(() => membersOf({ ...emptyMembers(), version: 3 })).toThrow()
    const people = Array.from({ length: 33 }, (_, index) => person(index))
    expect(membersOf({ ...emptyMembers(), people }).people).toHaveLength(33)
    expect(() => membersOf({ ...emptyMembers(), people: [...people, person(33)] })).toThrow()
    expect(() => membersOf({ ...emptyMembers(), people: [people[0], people[0]] })).toThrow()
    const archived = Array.from({ length: 1024 }, (_, index) => ({ ...person(index), active: false }))
    expect(membersOf({ ...emptyMembers(), people: archived }).people).toHaveLength(1024)
    expect(() => membersOf({ ...emptyMembers(), people: [...archived, { ...person(2000), active: false }] })).toThrow()
    const invites = Array.from({ length: 16 }, () => ({ id: memberId(), code: memberId(), expiresAt: 1 }))
    expect(membersOf({ ...emptyMembers(), invites }).invites).toHaveLength(16)
    expect(() => membersOf({ ...emptyMembers(), invites: [...invites, { id: memberId(), code: memberId(), expiresAt: 1 }] })).toThrow()
    const incoming = Array.from({ length: 512 }, (_, id) => ({ route: 'topic', update: { id } }))
    expect(membersOf({ ...emptyMembers(), incoming }).incoming).toHaveLength(512)
    expect(() => membersOf({ ...emptyMembers(), incoming: [{ route: 'topic', receivedAt: -1, update: { id: 1 } }] })).toThrow()
    expect(() => membersOf({ ...emptyMembers(), incoming: [...incoming, { route: 'topic', update: { id: 513 } }] })).toThrow()
    expect(() => membersOf({ ...emptyMembers(), incoming: [{ route: 'other', update: { id: 1 } }] })).toThrow()
    expect(() => membersOf({ ...emptyMembers(), incoming: [{ route: 'topic', update: { id: 1, text: 'x'.repeat(16 * 1024 * 1024) } }] })).toThrow()
  })
  it('narrows project authority and gives readmitted members fresh route identities', () => {
    const member = { ...person(), projects: ['allowed', 'removed'] }
    expect(memberAccount(member, memberId(), ['allowed', 'other']).team?.member?.projects).toEqual(['allowed'])
    expect(memberId()).not.toBe(member.id)
  })
  it('prepares four different routes concurrently and rotates before another portion of the same route', async () => {
    let entries = Array.from({ length: 10 }, (_, id) => ({ route: String(id % 5), update: { id } }))
    const started: number[] = []; const release = new Map<number, () => void>()
    const failed = vi.fn()
    const queue = new TelegramPreparation(() => entries, async (_route: string, update: TelegramUpdate) => {
      started.push(update.id)
      await new Promise<void>((resolve) => release.set(update.id, resolve))
      entries = entries.filter((one) => one.update.id !== update.id)
    }, failed)
    queue.drain(); expect(started).toEqual([0, 1, 2, 3])
    release.get(0)?.(); await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]))
    release.get(1)?.(); await vi.waitFor(() => expect(started.at(-1)).toBe(5))
    queue.stop(); for (const done of release.values()) done()
    await Promise.resolve(); expect(failed).not.toHaveBeenCalled()
  })
  it('keeps the persisted entry after failure and halts new preparation', async () => {
    const failed = vi.fn(); const entries = [{ route: 'topic', update: { id: 1 } }]
    const run = vi.fn(async () => { throw new Error('Disk failed') })
    const queue = new TelegramPreparation(() => entries, run, failed)
    queue.drain(); await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce())
    queue.drain(); expect(run).toHaveBeenCalledOnce(); expect(entries).toHaveLength(1)
  })
})


it('team files enforce route count and byte quotas and reject a foreign read', () => {
  const directory = mkdtempSync(join(tmpdir(), 'team-route-files-'))
  try {
    const files = new TelegramAttachments(directory)
    for (let index = 0; index < 32; index++) files.put(Buffer.from(`File ${index}`), 'input.txt', 'text/plain', 'telegram:team:dm:a')
    expect(() => files.put(Buffer.from('33rd'), 'input.txt', 'text/plain', 'telegram:team:dm:a')).toThrow(/32|full/)
    const other = files.put(Buffer.from('Other bytes'), 'other.txt', 'text/plain', 'telegram:team:dm:b')
    expect(files.read(other.id, 'telegram:team:dm:b').bytes.toString()).toBe('Other bytes')
    expect(() => files.read(other.id, 'telegram:team:dm:a')).toThrow(/another|expired/)
    const bytes = Buffer.alloc(20 * 1024 * 1024, 1)
    files.put(bytes, 'large.bin', 'application/octet-stream', 'telegram:team:dm:bytes')
    files.put(bytes, 'large.bin', 'application/octet-stream', 'telegram:team:dm:bytes')
    expect(() => files.put(Buffer.from('one'), 'overflow.bin', 'application/octet-stream', 'telegram:team:dm:bytes')).toThrow(/40|full/)
    expect(() => files.put(Buffer.alloc(20 * 1024 * 1024 + 1), 'too-big', 'application/octet-stream', 'telegram:team:dm:b')).toThrow(/20/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
