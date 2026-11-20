import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'

import { VIEWER } from '../shared/share'
import { keyHashOf, type SealedValue } from '../shared/secret-seal'
import { SECRET_NAME, placesValid, type SecretEntry } from '../shared/secrets'

export { SECRET_NAME, placesValid } from '../shared/secrets'
import { BrokerRefusal, type BrokerOps, type RunChunk, type RunRequest, type SecretKind, type SecretLifetime, type SecretMetadata } from './broker'

export const SECRET_KINDS: readonly SecretKind[] = ['website', 'http', 'command', 'ssh']
const LINK_LIFE = 15 * 60_000
const POLL = 3_000

export interface SecretAsk {
  readonly name: string
  readonly kind: SecretKind
  readonly places: readonly string[]
  readonly field?: string
  readonly note?: string
  readonly user?: string
  readonly taskId: string
  readonly taskTitle?: string
  readonly replace?: boolean
}

export interface SecretsHost {
  readonly broker: () => BrokerOps & { run(request: RunRequest, onChunk: (chunk: RunChunk) => void): Promise<{ exit: number }> }
  readonly notify: (taskId: string, title: string, body: string) => void
  readonly relay?: (body: object) => Promise<{ status: number; json: Record<string, unknown> }>
  readonly computer?: () => string
  readonly now?: () => number
}

const token = (): string => randomBytes(16).toString('base64url')
const relayUrl = (): string => `${process.env['GECKIT_SIGNAL_URL'] ?? VIEWER}/api/secret`

async function postRelay(body: object): Promise<{ status: number; json: Record<string, unknown> }> {
  const answer = await fetch(relayUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: answer.status, json: await answer.json().catch(() => ({})) as Record<string, unknown> }
}

export const lifetimeSaid = (one: Pick<SecretMetadata, 'lifetime' | 'expiresAt'>, at = Date.now()): string => {
  if (one.lifetime === 'task') return 'until this task is done'
  if (one.lifetime === 'once') return 'after one use'
  if (one.lifetime === 'keep') return 'kept'
  if (one.expiresAt === undefined) return 'timed'
  const left = Math.max(0, Math.round((one.expiresAt - at) / 60_000))
  return left >= 120 ? `expires in ${Math.round(left / 60)} h` : `expires in ${left} min`
}


/** Requests, collects and manages secrets for conversations; values only ever pass between the page and the broker, sealed. */
let running: Secrets | undefined
/** The service's Secrets, for the Settings section; undefined until the broker is supervised. */
export const runningSecrets = (): Secrets | undefined => running
export const setRunningSecrets = (secrets: Secrets | undefined): void => { running = secrets }

export class Secrets {
  private readonly waiting = new Map<string, NodeJS.Timeout>()
  private readonly asked = new Map<string, { readonly ask: SecretAsk; readonly expiresAt: number }>()
  constructor(private readonly host: SecretsHost) {}

  private now(): number { return this.host.now?.() ?? Date.now() }

  async request(ask: SecretAsk, onSaved?: () => void): Promise<{ readonly link?: string; readonly expiresAt?: number; readonly existing?: SecretMetadata }> {
    if (!SECRET_NAME.test(ask.name)) throw new BrokerRefusal('name', 'Name the secret with lowercase letters, digits and hyphens, such as openai-key.')
    const wrong = placesValid(ask.kind, ask.places)
    if (wrong !== undefined) throw new BrokerRefusal('place', wrong)
    const broker = this.host.broker()
    const existing = (await broker.list()).secrets.find((one) => one.name === ask.name)
    if (existing !== undefined && ask.replace !== true) return { existing }
    const signIn = ask.kind === 'website' ? [...this.asked.values()].find((one) => one.expiresAt >= this.now() && one.ask.kind === 'website' && one.ask.taskId === ask.taskId && one.ask.name !== ask.name && one.ask.places.some((place) => ask.places.includes(place))) : undefined
    if (signIn !== undefined) throw new BrokerRefusal('sign-in', `${signIn.ask.name} already asks for this sign-in: its one link takes the username or email and the password. Send that link, not a second one.`)
    const id = token()
    const linkKey = token()
    const owner = token()
    const { brokerKey } = await broker.prepare({ requestId: id, name: ask.name, kind: ask.kind, places: ask.places, ...(ask.field === undefined ? {} : { field: ask.field }), ...(ask.note === undefined ? {} : { note: ask.note }), ...(ask.user === undefined || ask.user === '' || ask.kind !== 'website' ? {} : { user: ask.user }), taskId: ask.taskId })
    const card = { name: ask.name, kind: ask.kind, places: ask.places, note: ask.note ?? '', field: ask.field ?? '', user: ask.kind === 'website' ? ask.user ?? '' : '', computer: this.host.computer?.() ?? hostname().replace(/\.local$/, ''), task: (ask.taskTitle ?? '').slice(0, 80), brokerKey }
    const opened = await (this.host.relay ?? postRelay)({ action: 'open', id, linkKey, owner, card })
    if (opened.status !== 200) throw new BrokerRefusal('relay', `The secret link could not be made (${String(opened.json['error'] ?? opened.status)}).`)
    const expiresAt = Number(opened.json['expiresAt'] ?? this.now() + LINK_LIFE)
    this.asked.set(id, { ask, expiresAt })
    this.watch(id, owner, ask, expiresAt, onSaved)
    return { link: `${process.env['GECKIT_SIGNAL_URL'] ?? VIEWER}/s/#${id}.${linkKey}.${await keyHashOf(brokerKey)}`, expiresAt }
  }

  private watch(id: string, owner: string, ask: SecretAsk, expiresAt: number, onSaved: (() => void) | undefined): void {
    const tick = async (): Promise<void> => {
      this.waiting.delete(id)
      let answer: { status: number; json: Record<string, unknown> }
      try { answer = await (this.host.relay ?? postRelay)({ action: 'collect', id, owner }) } catch { answer = { status: 0, json: {} } }
      const state = answer.json['state']
      if (state === 'saved') {
        this.asked.delete(id)
        try {
          const typed = ask.kind === 'website' && (ask.user ?? '') === '' && typeof answer.json['user'] === 'string' ? answer.json['user'].trim().slice(0, 200) : ''
          const kept = await this.host.broker().accept({ requestId: id, ciphertext: answer.json['ciphertext'] as SealedValue, lifetime: answer.json['lifetime'] as SecretLifetime, ...(typed === '' ? {} : { user: typed }) })
          const device = String(answer.json['device'] ?? '').slice(0, 80)
          const until = kept.expiresAt === undefined ? lifetimeSaid({ lifetime: answer.json['lifetime'] as SecretLifetime }) : `expires ${new Date(kept.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          this.host.notify(ask.taskId, `${ask.name} was entered`, `${ask.name} is ready (${ask.kind}, ${ask.places.join(', ')}${(ask.user ?? '') !== '' ? ` as ${ask.user ?? ''}` : typed === '' ? '' : ` as ${typed}`}), ${until}.${device === '' ? '' : ` Entered from ${device}.`}`)
        } catch (error) {
          this.host.notify(ask.taskId, `${ask.name} was not saved`, error instanceof Error ? error.message : String(error))
          return
        }
        onSaved?.()
        return
      }
      if (state === 'expired' || state === 'collected' || answer.status === 404 || this.now() > expiresAt + 60_000) { this.asked.delete(id); return }
      this.waiting.set(id, setTimeout(() => { void tick() }, POLL))
    }
    this.waiting.set(id, setTimeout(() => { void tick() }, POLL))
  }

  private async entryChecked(entry: SecretEntry): Promise<SecretMetadata | undefined> {
    if (!SECRET_NAME.test(entry.name)) throw new BrokerRefusal('name', 'Name the secret with lowercase letters, digits and hyphens, such as openai-key.')
    if (!SECRET_KINDS.includes(entry.kind)) throw new BrokerRefusal('kind', 'Choose what the secret is used for.')
    const existing = (await this.host.broker().list()).secrets.find((one) => one.name === entry.name)
    if (!entry.editing && existing !== undefined) throw new BrokerRefusal('name', `A secret named ${entry.name} already exists. Edit it instead.`)
    if (entry.editing && existing === undefined) throw new BrokerRefusal('unknown', `There is no secret ${entry.name}.`)
    if (existing !== undefined && existing.kind !== entry.kind) throw new BrokerRefusal('kind', `${entry.name} is used for ${existing.kind}; remove it and add it again to change that.`)
    if (entry.lifetime === 'task' && existing?.lifetime !== 'task') throw new BrokerRefusal('task', 'A secret added in Settings belongs to no conversation, so it cannot be kept until a task is done.')
    const wrong = placesValid(entry.kind, entry.places)
    if (wrong !== undefined) throw new BrokerRefusal('place', wrong)
    return existing
  }

  /** Readies the broker for a value Settings seals itself; the value never passes through here. */
  async prepareEntry(entry: SecretEntry): Promise<{ readonly requestId: string; readonly brokerKey: string }> {
    const existing = await this.entryChecked(entry)
    const requestId = token()
    const { brokerKey } = await this.host.broker().prepare({ requestId, name: entry.name, kind: entry.kind, places: entry.places, ...(existing?.field === undefined ? {} : { field: existing.field }), ...(entry.note === '' ? {} : { note: entry.note }), ...(entry.user === '' || entry.kind !== 'website' ? {} : { user: entry.user }), taskId: existing?.taskId ?? '' })
    return { requestId, brokerKey }
  }

  saveEntry(requestId: string, ciphertext: SealedValue, lifetime: SecretLifetime): Promise<{ name: string; expiresAt?: number }> {
    return this.host.broker().accept({ requestId, ciphertext, lifetime })
  }

  /** Changes where and how long a secret is kept, keeping its value. */
  async updateEntry(entry: SecretEntry): Promise<{ name: string; expiresAt?: number }> {
    await this.entryChecked({ ...entry, editing: true })
    return this.host.broker().update({ name: entry.name, places: entry.places, note: entry.note, user: entry.kind === 'website' ? entry.user : '', lifetime: entry.lifetime })
  }

  list(): Promise<{ secrets: SecretMetadata[] }> { return this.host.broker().list() }
  history(name?: string, limit = 20): ReturnType<BrokerOps['history']> { return this.host.broker().history({ ...(name === undefined ? {} : { name }), limit }) }
  revoke(name: string | undefined): ReturnType<BrokerOps['revoke']> { return this.host.broker().revoke(name === undefined ? { all: true } : { name }) }
  status(): ReturnType<BrokerOps['status']> { return this.host.broker().status() }
  taskEnded(taskId: string): Promise<{ removed: number }> { return this.host.broker().taskEnded({ taskId }) }
  fill(request: Parameters<BrokerOps['fill']>[0]): ReturnType<BrokerOps['fill']> { return this.host.broker().fill(request) }
  clean(text: string): Promise<string> { return this.host.broker().clean({ text }).then((one) => one.text) }
  run(request: RunRequest, onChunk: (chunk: RunChunk) => void): Promise<{ exit: number }> { return this.host.broker().run(request, onChunk) }

  dispose(): void { for (const timer of this.waiting.values()) clearTimeout(timer); this.waiting.clear(); this.asked.clear() }
}
