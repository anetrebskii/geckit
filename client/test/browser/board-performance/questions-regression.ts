import type { ChatSession } from '../../../src/shared/api'
import { fixture, snapshot, source } from './electron'

const settle = async (): Promise<void> => { await new Promise<void>((done) => setTimeout(done, 50)) }
const row = (title: string): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>('.questions-list .row')].find((one) => one.title === title)
  if (found === undefined) throw new Error(`Missing question: ${title}`)
  return found
}
const navigate = async (name: string): Promise<void> => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.app-nav .nav-item')].find((one) => one.querySelector('.nav-name')?.textContent === name)
  if (button === undefined) throw new Error(`Missing place: ${name}`)
  button.click()
  await settle()
}

export async function runQuestionsRegression(): Promise<readonly { readonly name: string; readonly passed: boolean }[]> {
  const checks: { readonly name: string; readonly passed: boolean }[] = []
  const check = (name: string, passed: boolean): void => { checks.push({ name, passed }) }
  const first: ChatSession = { ...source, id: 'question-opening-first', title: 'First question', question: true, at: Date.now(), queued: [] }
  const second: ChatSession = { ...first, id: 'question-opening-second', title: 'Second question' }
  fixture.destinations = [...fixture.destinations.filter((one) => one.question !== true), first, second]
  snapshot()
  await window.geckit.settings.set({ chatPlace: 'questions' })
  await settle()

  const originalList = window.geckit.chat.list
  const originalItems = window.geckit.chat.items
  let listRequests = 0
  let releaseList = (): void => {}
  let releaseItems = (): void => {}
  let holdItems = true
  const listReady = new Promise<void>((done) => { releaseList = done })
  const itemsReady = new Promise<void>((done) => { releaseItems = done })
  window.geckit.chat.list = async (root) => { listRequests++; await listReady; return originalList(root) }
  window.geckit.chat.items = async (id) => { if (holdItems) await itemsReady; return [{ kind: 'mine', id: `${id}-message`, text: `History of ${id}` }] }
  try {
    row(first.title).click()
    await settle()
    check('Click opens the pane while the full listing is pending', document.querySelector('.talk.raised') !== null)
    check('Loaded question does not request a full conversation listing', listRequests === 0)
    check('Selected question shows the existing loading state', row(first.title).classList.contains('on') && document.querySelector('.talk.raised [aria-label="Reading the conversation"]') !== null)

    await navigate('Tasks')
    check('Leaving a loading question opens Tasks without a conversation popup', document.querySelector('.talk:not([hidden])') === null)
    await navigate('Quick chats')
    check('Returning to Questions shows its empty pane', document.querySelector('.talk.raised') === null && document.querySelector('.questions-list .row.on') === null)
    row(first.title).click()
    await settle()

    row(second.title).focus()
    row(second.title).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    check('Enter switches to another loaded question without a listing', row(second.title).classList.contains('on') && listRequests === 0)
    releaseItems()
    holdItems = false
    await settle()
    const transcript = document.querySelector('.talk.raised .transcript')?.textContent ?? ''
    check('Only the latest selected question history appears', transcript.includes(second.id) && !transcript.includes(first.id))

    fixture.destinations = fixture.destinations.map((one) => one.id === first.id ? { ...one, title: 'Updated first question', mode: 'auto' } : one)
    snapshot()
    await settle()
    row('Updated first question').click()
    await settle()
    check('A pushed question update remains immediately navigable', row('Updated first question').classList.contains('on') && (document.querySelector('.talk.raised')?.textContent ?? '').includes('Updated first question') && listRequests === 0)

    await navigate('Shortcuts')
    await navigate('Tasks')
    check('A question stays closed after navigating through another place', document.querySelector('.talk:not([hidden])') === null)
    for (const listener of fixture.subscriptions.get('chat:show') ?? []) listener(new Event('chat:show'), source.id)
    await settle()
    await navigate('Quick chats')
    await navigate('Tasks')
    check('A conversation opened from Tasks is preserved across places', (document.querySelector('.talk')?.textContent ?? '').includes(source.title))

    for (const listener of fixture.subscriptions.get('chat:show') ?? []) listener(new Event('chat:show'), 'unknown-question-link')
    await settle()
    check('Unknown conversation links still request a listing', listRequests === 1)
    releaseList()
    await settle()
    check('Unknown conversation opens after the fallback resolves', (document.querySelector('.talk .transcript')?.textContent ?? '').includes('unknown-question-link'))
    check('Navigation starts no provider work', fixture.providerCreates === 0 && fixture.providerSends === 0)
    return checks
  } finally {
    releaseList()
    releaseItems()
    window.geckit.chat.list = originalList
    window.geckit.chat.items = originalItems
  }
}
