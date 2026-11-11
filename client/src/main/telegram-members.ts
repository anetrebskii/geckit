import { randomBytes } from 'node:crypto'
import type { Json } from '../shared/elicitation'
import type { TelegramAccount } from '../shared/telegram'
import type { TelegramUpdate } from './telegram-bot'

export interface TelegramMember {
  readonly id: string
  readonly account: TelegramAccount
  readonly approve: boolean
  readonly projects?: readonly string[]
  readonly active: boolean
  readonly state?: Json
  readonly detail?: string
}
export interface TelegramInvite {
  readonly id: string
  readonly code: string
  readonly expiresAt: number
  readonly candidate?: TelegramAccount
}
export interface TelegramMembers {
  readonly version: 2
  readonly enabled: boolean
  readonly projects: readonly string[]
  readonly people: readonly TelegramMember[]
  readonly invites: readonly TelegramInvite[]
  readonly incoming: readonly { readonly route: string; readonly update: TelegramUpdate; readonly receivedAt?: number }[]
}
export const memberId = (): string => randomBytes(18).toString('base64url')
export const emptyMembers = (): TelegramMembers => ({ version: 2, enabled: false, projects: [], people: [], invites: [], incoming: [] })
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value)
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every((one) => typeof one === 'string' && one.length > 0 && one.length <= 4096)
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const account = (value: unknown): value is TelegramAccount => object(value) && positive(value['id']) && value['chatId'] === value['id'] && typeof value['name'] === 'string' && value['team'] === undefined

/** Saved authority is validated before any route can be activated. Unsupported versions fail closed. */
export function membersOf(value: unknown): TelegramMembers {
  if (value === undefined) return emptyMembers()
  if (!object(value) || value['version'] !== 2 || typeof value['enabled'] !== 'boolean' || !strings(value['projects']) || !Array.isArray(value['people']) || value['people'].length > 1024 || !Array.isArray(value['invites']) || value['invites'].length > 16 || !Array.isArray(value['incoming']) || value['incoming'].length > 512) throw new Error('Unsupported Telegram member registry')
  const people = value['people']
  if (!people.every((one) => object(one) && id(one['id']) && account(one['account']) && typeof one['approve'] === 'boolean' && typeof one['active'] === 'boolean' && (one['projects'] === undefined || strings(one['projects'])))) throw new Error('Invalid Telegram member')
  if (new Set(people.map((one) => one['id'])).size !== people.length || new Set(people.filter((one) => one['active'] === true).map((one) => (one['account'] as TelegramAccount).id)).size !== people.filter((one) => one['active'] === true).length || people.filter((one) => one['active'] === true).length > 33) throw new Error('Duplicate Telegram authority')
  for (const person of people) {
    const state = person['state']
    if (state === undefined) continue
    if (!object(state) || ['token', 'credentials', 'members', 'bot'].some((key) => state[key] !== undefined)) throw new Error('Invalid saved member state')
    for (const [key, limit] of [['callbacks', 256], ['questions', 128], ['replies', 128], ['audit', 512], ['uncertainUploads', 512], ['pendingInputs', 32]] as const) if (state[key] !== undefined && (!Array.isArray(state[key]) || state[key].length > limit)) throw new Error('Invalid saved member resource bounds')
  }
  if (!value['invites'].every((one) => object(one) && id(one['id']) && id(one['code']) && positive(one['expiresAt']) && (one['candidate'] === undefined || account(one['candidate'])))) throw new Error('Invalid Telegram invitation')
  if (!value['incoming'].every((one) => object(one) && typeof one['route'] === 'string' && (one['route'] === 'topic' || people.some((person) => person['id'] === one['route'])) && (one['receivedAt'] === undefined || positive(one['receivedAt'])) && object(one['update']) && Number.isSafeInteger(one['update']['id']) && (one['update']['id'] as number) >= 0)) throw new Error('Invalid Telegram handoff')
  if (Buffer.byteLength(JSON.stringify(value['incoming'])) > 16 * 1024 * 1024) throw new Error('Telegram handoff too large')
  if (new Set(value['incoming'].map((one) => (one as { update: TelegramUpdate }).update.id)).size !== value['incoming'].length || new Set(value['invites'].map((one) => (one as TelegramInvite).code)).size !== value['invites'].length) throw new Error('Duplicate Telegram handoff or invitation')
  return value as unknown as TelegramMembers
}

export function memberAccount(member: TelegramMember, generation: string, projects: readonly string[]): TelegramAccount {
  return { ...member.account, team: { topicId: 0, title: member.account.name, generation, approvers: member.approve ? [member.account.id] : [], allMembers: false, member: { route: member.id, projects: member.projects === undefined ? projects : projects.filter((one) => member.projects!.includes(one)), approve: member.approve } } }
}

/** Bounded preparation of independent routes. The durable journal remains the source of truth. */
export class TelegramPreparation {
  readonly #busy = new Set<string>()
  #stopped = false
  #last: string | undefined
  constructor(private readonly entries: () => readonly { readonly route: string; readonly update: TelegramUpdate; readonly receivedAt?: number }[], private readonly run: (route: string, update: TelegramUpdate, receivedAt?: number) => Promise<void>, private readonly failure: (error: unknown) => void) {}
  stop(): void { this.#stopped = true }
  drain(): void {
    if (this.#stopped) return
    const routes = [...new Set(this.entries().map((one) => one.route))]
    const last = this.#last === undefined ? -1 : routes.indexOf(this.#last)
    const ordered = [...routes.slice(last + 1), ...routes.slice(0, last + 1)]
    for (const route of ordered) {
      if (this.#busy.size >= 4) break
      if (this.#busy.has(route)) continue
      const entry = this.entries().find((one) => one.route === route)
      if (entry === undefined) continue
      this.#busy.add(route); this.#last = route
      void this.run(route, entry.update, entry.receivedAt).catch((error: unknown) => { this.#stopped = true; this.failure(error) }).finally(() => { this.#busy.delete(route); this.drain() })
    }
  }
}
