import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { computersFolder, noteComputers } from '../../cli/computer'
import { join } from 'node:path'
import type { ServiceSecurity } from '../application'
import { newKey } from '../../shared/pairing'
import { identity, sign, transcript, trustProof, verify } from '../../shared/remote/identity'
import { readInvitation, REMOTE_PROTOCOL } from '../../shared/remote/protocol'
import { parseRemote, stringifyRemote } from '../../shared/remote/codec'
import type { RemoteCall, RemoteChannel, RemoteIdentity, RemoteRequest, RemoteResponse, RemoteResult, RemoteSignal, RemoteTrust } from '../../shared/remote/protocol'
import type { ProductAuthority } from '../../shared/product-cli'
import type { CoreMethods } from '../../core/application'
import { nodeDial } from './transport'

interface ComputersRecord { readonly identity: RemoteIdentity; readonly computers: readonly RemoteTrust[] }
interface Link { readonly channel: RemoteChannel; readonly call: <K extends keyof CoreMethods>(method: K, ...args: Parameters<CoreMethods[K]>) => Promise<Awaited<ReturnType<CoreMethods[K]>>>; idle: ReturnType<typeof setTimeout> | undefined }


/** Picks the computer a name means: its id, or its name, ignoring case. */
export function computerNamed<T extends { readonly server: Pick<RemoteTrust['server'], 'id' | 'name'> }>(computers: readonly T[], named: string): T | string {
  const exact = computers.find((one) => one.server.id === named)
  if (exact !== undefined) return exact
  const found = computers.filter((one) => one.server.name.toLowerCase() === named.toLowerCase())
  if (found.length === 1 && found[0] !== undefined) return found[0]
  const known = computers.map((one) => one.server.name).join(', ')
  return found.length > 1 ? `More than one computer is called ${named}. Use its id from geckit computers.` : `No paired computer is called ${named}.${known === '' ? ' Pair one with geckit computers add <code>.' : ` Paired: ${known}.`}`
}

/** This GeckIt as a device of other GeckIts: the computers it is paired with and the commands it carries to them. */
export function remoteComputers(directory: string, security: ServiceSecurity) {
  const path = join(directory, 'computers.sealed')
  let record: ComputersRecord | undefined
  if (existsSync(path)) {
    try { record = JSON.parse(security.vault.decrypt(readFileSync(path))) as ComputersRecord }
    catch { console.warn('Paired computers are locked; they were kept as they are.') }
  }
  const links = new Map<string, Promise<Link>>()
  const save = (next: ComputersRecord): void => {
    writeFileSync(`${path}.new`, security.vault.encrypt(JSON.stringify(next)), { mode: 0o600 })
    renameSync(`${path}.new`, path)
    record = next
    noteComputers(next.computers.map((one) => ({ id: one.server.id, name: one.server.name })))
  }
  const own = async (): Promise<RemoteIdentity> => {
    if (record !== undefined) return record.identity
    if (existsSync(path)) throw new Error('Paired computers could not be unlocked. They were not overwritten.')
    if (!security.vault.available()) throw new Error('Secure storage is unavailable.')
    const made = await identity()
    save({ identity: made, computers: [] })
    return made
  }
  const open = async (pairing: RemoteSignal, saved?: RemoteTrust): Promise<{ readonly trust: RemoteTrust; readonly link: Link }> => {
    const keys = await own()
    const channel = await nodeDial(pairing)
    let next = 0
    const pending = new Map<number, { readonly resolve: (value: RemoteResult) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }>()
    const send = (message: RemoteRequest): void => channel.send(stringifyRemote(message))
    return new Promise((resolve, reject) => {
      let proofText = ''
      let serverKey = ''
      let serverId = ''
      let trusted: RemoteTrust | undefined
      const fail = (error: Error): void => { channel.close(); reject(error) }
      const timer = setTimeout(() => fail(new Error('The computer did not confirm this one in time.')), 30_000)
      channel.onClose(() => {
        clearTimeout(timer)
        for (const one of pending.values()) { clearTimeout(one.timer); one.reject(new Error('Delivery is uncertain: the connection closed after dispatch. Read target state before retrying.')) }
        pending.clear()
        if (trusted === undefined) reject(new Error('The computer closed the connection.'))
        if (trusted !== undefined) links.delete(trusted.server.id)
      })
      channel.onMessage((raw) => {
        void (async () => {
          const parsed: unknown = parseRemote(raw)
          if (parsed === null || typeof parsed !== 'object' || !('type' in parsed)) throw new Error('The computer answered something unreadable.')
          const response = parsed as RemoteResponse
          if (response.type === 'error') throw new Error(response.message)
          if (response.type === 'challenge') {
            if (response.protocol !== REMOTE_PROTOCOL) throw new Error('GeckIt on that computer is another version. Update both.')
            if (saved !== undefined && (saved.server.id !== response.server.id || saved.server.publicKey !== response.server.publicKey)) throw new Error('That computer is no longer the one this was paired with.')
            serverKey = response.server.publicKey; serverId = response.server.id
            const nonce = newKey()
            proofText = transcript(serverId, response.nonce, keys.publicKey, nonce, await channel.binding)
            send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey: keys.publicKey, name: `${hostname()} (GeckIt)`.slice(0, 80), nonce, proof: await sign(keys, proofText) })
            return
          }
          if (response.type === 'pending') throw new Error('That code needs confirming on the computer. Run geckit pair there for a new code.')
          if (response.type === 'trusted') {
            const received = response.trust
            if (serverKey === '' || received.server.id !== serverId || received.server.publicKey !== serverKey || !await verify(serverKey, trustProof(proofText, received), response.proof)) throw new Error('The computer could not prove who it is.')
            if (!received.full) throw new Error('That code gives no control. Run geckit pair on the computer for a new one.')
            trusted = received
            clearTimeout(timer)
            const link: Link = {
              channel,
              idle: undefined,
              call: (method, ...args) => new Promise((done, refuse) => {
                const id = ++next
                const waiting = setTimeout(() => { pending.delete(id); refuse(new Error('Delivery is uncertain: the computer timed out after dispatch. Read target state before retrying.')) }, 120_000)
                pending.set(id, { resolve: (value) => done(value as never), reject: refuse, timer: waiting })
                try { send({ type: 'core-call', id, call: { method, args } as RemoteCall }) }
                catch { pending.delete(id); clearTimeout(waiting); refuse(new Error('Delivery is uncertain: sending to the computer failed. Read target state before retrying.')) }
              }),
            }
            resolve({ trust: received, link })
            return
          }
          if (response.type === 'core-result' || response.type === 'core-failure') {
            const one = pending.get(response.id)
            if (one === undefined) return
            pending.delete(response.id); clearTimeout(one.timer)
            if (response.type === 'core-result') one.resolve(response.value)
            else one.reject(new Error(response.message))
          }
        })().catch((error: Error) => fail(error))
      })
    })
  }
  const linkTo = (trust: RemoteTrust): Promise<Link> => {
    let held = links.get(trust.server.id)
    if (held === undefined) {
      held = open(trust, trust).then(({ link }) => link)
      links.set(trust.server.id, held)
      held.catch(() => links.delete(trust.server.id))
    }
    return held.then((link) => {
      if (link.idle !== undefined) clearTimeout(link.idle)
      link.idle = setTimeout(() => { links.delete(trust.server.id); link.channel.close() }, 5 * 60_000)
      link.idle.unref()
      return link
    })
  }
  const named = (name: string): RemoteTrust => {
    const found = computerNamed(record?.computers ?? [], name)
    if (typeof found === 'string') throw new Error(found)
    return found
  }
  const run = async (name: string, args: readonly string[]): Promise<{ readonly ok: boolean; readonly said: string }> => {
    try { return await (await linkTo(named(name))).call('cli:run', args) }
    catch (error) { return { ok: false, said: `${name}: ${error instanceof Error ? error.message : String(error)}` } }
  }
  const serve = (folder = computersFolder()): (() => void) => {
    mkdirSync(folder, { recursive: true })
    noteComputers((record?.computers ?? []).map((one) => ({ id: one.server.id, name: one.server.name })), folder)
    const taken = new Set<string>()
    const pick = (): void => {
      let files: string[]
      try { files = readdirSync(folder).filter((one) => one.endsWith('.ask')) } catch { return }
      for (const file of files) {
        if (taken.has(file)) continue
        taken.add(file)
        const source = join(folder, file)
        let asked: { computer: string; args: string[] }
        try { asked = JSON.parse(readFileSync(source, 'utf8')) as typeof asked; rmSync(source, { force: true }) } catch { taken.delete(file); continue }
        void (typeof asked.computer === 'string' && Array.isArray(asked.args) ? run(asked.computer, asked.args) : Promise.resolve({ ok: false, said: 'That was not a request.' })).then((reply) => {
          const told = join(folder, `${file.slice(0, -4)}.told`)
          writeFileSync(`${told}.part`, JSON.stringify(reply))
          renameSync(`${told}.part`, told)
          taken.delete(file)
        })
      }
    }
    let watcher: ReturnType<typeof watch> | undefined
    try { watcher = watch(folder, pick) } catch { watcher = undefined }
    const timer = setInterval(pick, 1000)
    pick()
    return () => { watcher?.close(); clearInterval(timer) }
  }
  return {
    add: async (code: string): Promise<{ readonly id: string; readonly name: string }> => {
      const pairing = readInvitation(code)
      if (pairing === undefined) throw new Error('That is not a connection code. Copy the whole code geckit pair printed on the computer.')
      const { trust, link } = await open(pairing)
      const current = record ?? { identity: await own(), computers: [] }
      save({ ...current, computers: [...current.computers.filter((one) => one.server.id !== trust.server.id), trust] })
      links.set(trust.server.id, Promise.resolve(link))
      return { id: trust.server.id, name: trust.server.name }
    },
    list: () => (record?.computers ?? []).map((one) => ({ id: one.server.id, name: one.server.name })),
    forget: (name: string) => {
      const trust = named(name)
      if (record !== undefined) save({ ...record, computers: record.computers.filter((one) => one.server.id !== trust.server.id) })
      void links.get(trust.server.id)?.then((link) => link.channel.close(), () => undefined)
      links.delete(trust.server.id)
      return { forgotten: trust.server.name }
    },
    product: async (name: string, args: readonly string[], authorized: () => boolean = () => true, authority: ProductAuthority = 'operator'): Promise<string> => {
      const trust = named(name)
      const link = await linkTo(trust)
      if (!authorized()) throw new Error('The originating Manager session is no longer authorized. Nothing was dispatched.')
      if (named(trust.server.id) !== trust) throw new Error('Computer trust changed during connection. Nothing was dispatched; select the target again.')
      return link.call('cli:product', args, authority)
    },
    run,
    serve,
    dispose: () => { for (const held of links.values()) void held.then((link) => link.channel.close(), () => undefined); links.clear() },
  }
}
export type RemoteComputers = ReturnType<typeof remoteComputers>
