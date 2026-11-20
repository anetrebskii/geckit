import { randomBytes } from 'node:crypto'
import { askTest, openTest, profiles, stopTest } from './browser'
import { TEST_PREFIX, validTestName } from './testing'
import type { ViewFrame, ViewInput } from '../shared/api'
import { TAB_HANDOFF_TTL } from '../shared/live-view'

export const SIGNIN_TTL = TAB_HANDOFF_TTL
export interface LiveServer { readonly id: string; readonly name: string }
interface Link { readonly name: string; readonly expires: number; used: boolean }
export type TabHandoffTarget = Pick<Link, 'name'> & { readonly tab: number; readonly conversation: string }
type TabHandoffLink = ReturnType<typeof signInLink>

let server: () => LiveServer | undefined = () => undefined
let handoff: ((target: TabHandoffTarget) => Promise<TabHandoffLink>) | undefined
const links = new Map<string, Link>()

/** Which GeckIt a sign-in link names, set by the service once remote access has an identity. */
export const setLiveServer = (one: () => LiveServer | undefined): void => { server = one }
export const setTabHandoff = (start: typeof handoff): void => { handoff = start }

export function tabHandoffLink(target: TabHandoffTarget): Promise<TabHandoffLink> {
  if (handoff === undefined) throw new Error('Open-tab sign-in links are unavailable on this computer.')
  if (!validTestName(target.name) || !Number.isSafeInteger(target.tab) || target.tab <= 0 || typeof target.conversation !== 'string' || target.conversation === '') throw new Error('Give the tab ID from geckit browser pages in the conversation that opened it.')
  return handoff(target)
}

export function signInLink(name: string, now = Date.now()): { readonly link: string; readonly expires: number } {
  if (!validTestName(name)) throw new Error('Name the profile with lowercase letters, digits and hyphens, such as github-work.')
  const named = server()
  if (named === undefined) throw new Error(`No device is paired with this computer, so a link has nothing to open in. On a computer with a screen, run geckit browser start ${TEST_PREFIX}${name} and sign in in its window; otherwise pair a device with geckit pair first.`)
  for (const [token, one] of links) if (one.expires <= now) links.delete(token)
  const token = randomBytes(24).toString('base64url')
  const expires = now + SIGNIN_TTL
  links.set(token, { name, expires, used: false })
  return { link: `geckit://signin?computer=${encodeURIComponent(named.id)}&name=${encodeURIComponent(named.name)}&profile=${name}&t=${token}`, expires }
}

/** A link opens the view once, before it expires and before the sign-in ends. */
export function claimSignIn(name: string, token: string, now = Date.now()): void {
  const link = links.get(token)
  if (link === undefined || link.name !== name) throw new Error('This sign-in link is not known here. Ask for a new one.')
  if (link.used) throw new Error('This sign-in link was already opened. Ask for a new one.')
  if (link.expires <= now) { links.delete(token); throw new Error('This sign-in link expired. Ask for a new one.') }
  link.used = true
}

const reply = async <T>(name: string, request: object): Promise<T> => {
  const answer = await askTest(name, request)
  if (!answer.ok) throw new Error(answer.error ?? 'The test browser refused.')
  return answer.result as T
}

export async function viewStart(name: string, url?: string, token?: string): Promise<{ readonly width: number; readonly height: number }> {
  if (!validTestName(name)) throw new Error('Name the profile with lowercase letters, digits and hyphens.')
  if (token !== undefined) claimSignIn(name, token)
  if (!profiles().some((one) => one.label === `${TEST_PREFIX}${name}`)) {
    const opened = await openTest(name)
    if (!opened.ok) throw new Error(opened.said)
    if (!profiles().some((one) => one.label === `${TEST_PREFIX}${name}`)) throw new Error(opened.said)
  }
  return reply(name, { cmd: 'view-open', ...(url === undefined || url === '' ? {} : { url }) })
}

export const viewFrame = (name: string): Promise<ViewFrame> => reply(name, { cmd: 'view-frame' })
export const viewInput = (name: string, input: ViewInput): Promise<void> => reply(name, { cmd: 'view-input', input })

/** Done: the sign-in tab closes, any unused link for the profile stops working, and the browser closes unless a conversation still has it. */
export async function viewEnd(name: string): Promise<void> {
  for (const [token, one] of links) if (one.name === name) links.delete(token)
  if (!profiles().some((one) => one.label === `${TEST_PREFIX}${name}`)) return
  await askTest(name, { cmd: 'view-close' })
  await stopTest(name)
}
