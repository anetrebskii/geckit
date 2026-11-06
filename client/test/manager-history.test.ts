import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

import { corePlatform, configureCorePlatform } from '../src/core/platform'
import { createHistoryPreview } from '../src/main/manager-history-preview'
import type { ManagerHistoryRequest, ManagerView } from '../src/shared/manager'
import type { SessionItems } from '../src/shared/api'
import type { Json } from '../src/shared/elicitation'

const previous = corePlatform()
const fixtures: Awaited<ReturnType<typeof createHistoryPreview>>[] = []
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.dispose(); configureCorePlatform(previous) })
const setup = async () => { const f = await createHistoryPreview(); fixtures.push(f); return f }
const viewOf = (value: Json): ManagerView => JSON.parse(JSON.stringify(value)) as ManagerView
const requestOf = (view: ManagerView, id: string, action: ManagerHistoryRequest['action']): ManagerHistoryRequest => {
  const thread = view.threads?.find((one) => one.id === id)
  return { id, action, ...(thread?.session === undefined ? {} : { session: thread.session }), ...(thread?.historyRevision === undefined ? {} : { historyRevision: thread.historyRevision }) }
}

it('clears selected Manager disk history and queue, starts fresh native context, survives restart, keeps siblings/project', async () => {
  const f = await setup()
  const before = viewOf(await f.call('view'))
  const target = before.threads?.find((one) => one.place === 'Telegram')
  expect(target?.session).toBeDefined()
  const request = requestOf(before, target?.id ?? '', 'clear')
  const next = viewOf(await f.call('history', [JSON.parse(JSON.stringify(request)) as Json]))
  const cleared = next.threads?.find((one) => one.id === target?.id)
  expect(cleared?.session).not.toBe(target?.session)
  expect(cleared?.historyRevision).toBeDefined()
  expect(next.requests?.some((one) => one.session === target?.session)).toBe(false)
  expect(next.threads?.filter((one) => one.id !== target?.id).map((one) => one.session)).toEqual(before.threads?.filter((one) => one.id !== target?.id).map((one) => one.session))
  const disk = await readFile(join(f.directory, 'manager.json'), 'utf8')
  expect(disk).not.toContain(`Private old ${target?.id} history`)
  expect(disk).not.toContain(`Queued old ${target?.id} follow-up`)
  const notes = await readFile(join(f.directory, 'sessions.json'), 'utf8')
  expect(notes).not.toContain(`Private old ${target?.id} history`)
  const ledger = JSON.stringify(await f.call('ledger'))
  expect(ledger).toContain('Keep project files')
  expect(ledger).not.toContain(`${target?.session}.json`)
  const reopened = viewOf(await f.call('restart'))
  const retained = reopened.threads?.find((one) => one.id === target?.id)
  expect(retained?.session).toBe(cleared?.session)
  const snapshot = await f.call('inspect', [retained?.session ?? '']) as Json
  expect(JSON.stringify(snapshot)).not.toContain('Private old')
  await expect(f.call('history', [JSON.parse(JSON.stringify(request)) as Json])).rejects.toThrow('changed')
})

it('deletes external incarnation, fences old session and keeps default and unrelated thread', async () => {
  const f = await setup()
  const before = viewOf(await f.call('view'))
  const target = before.threads?.find((one) => one.place === 'Slack')
  const next = viewOf(await f.call('history', [JSON.parse(JSON.stringify(requestOf(before, target?.id ?? '', 'delete'))) as Json]))
  expect(next.threads?.some((one) => one.id === target?.id)).toBe(false)
  expect(next.session?.id).toBe(before.session?.id)
  expect(viewOf(await f.call('restart')).threads?.some((one) => one.id === target?.id)).toBe(false)
  await expect(f.call('inspect', [target?.session ?? ''])).rejects.toThrow('changed')
})

it('persists failed purge fenced across restart and deliberately retries original action', async () => {
  const f = await setup()
  const before = viewOf(await f.call('view'))
  const target = before.threads?.find((one) => one.id === 'main')
  const request = requestOf(before, 'main', 'clear')
  await f.call('failure', [true])
  await expect(f.call('history', [JSON.parse(JSON.stringify(request)) as Json])).rejects.toThrow('not confirmed')
  const failed = viewOf(await f.call('restart'))
  expect(failed.historyPending).toEqual(request)
  expect(failed.session).toBeUndefined()
  await expect(f.call('send', [{ id: 'stale-request', text: 'must not start', session: target?.session ?? '' }])).rejects.toThrow()
  await f.call('failure', [false])
  const next = viewOf(await f.call('history', [JSON.parse(JSON.stringify(request)) as Json]))
  expect(next.historyPending).toBeUndefined()
  expect(next.session?.id).not.toBe(target?.session)
  const fresh = JSON.parse(JSON.stringify(await f.call('inspect', [next.session?.id ?? '']))) as SessionItems
  expect(fresh.items).toEqual([])
})
