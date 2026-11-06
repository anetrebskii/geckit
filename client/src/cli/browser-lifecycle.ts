import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { ChatSession } from '../shared/api'

export type BrowserConversation = Pick<ChatSession, 'id' | 'root'> & { readonly done: boolean }
const defaultFolder = (): string => join(homedir(), '.geckit', 'browser')
export const browserStateFolder = (folder = defaultFolder()): string => `${folder}-state`
const digest = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16)
const conversationFile = (id: string, folder: string): string => join(browserStateFolder(folder), 'conversations', `${digest(id)}.json`)

export interface TestAccount { readonly name: string; readonly note: string; readonly at: number }
const accountFile = (name: string, folder: string): string => join(browserStateFolder(folder), 'accounts', `${name}.json`)

/** A test profile made for one account on purpose, with a note saying which: any conversation may use it by name. */
export function testAccount(name: string, folder = defaultFolder()): TestAccount | undefined {
  try { const saved = JSON.parse(readFileSync(accountFile(name, folder), 'utf8')) as TestAccount; return saved.name === name && typeof saved.note === 'string' ? saved : undefined } catch { return undefined }
}

export function saveTestAccount(name: string, note: string, folder = defaultFolder()): TestAccount {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) throw new Error('Name the profile with lowercase letters, digits and hyphens, such as github-work.')
  const trimmed = note.trim().replace(/\s+/g, ' ').slice(0, 120)
  if (trimmed === '') throw new Error('Say which account the profile is for, such as --note "GitHub as alex".')
  const account: TestAccount = { name, note: trimmed, at: testAccount(name, folder)?.at ?? Date.now() }
  mkdirSync(join(browserStateFolder(folder), 'accounts'), { recursive: true, mode: 0o700 })
  const file = accountFile(name, folder)
  writeFileSync(`${file}.part`, JSON.stringify(account))
  renameSync(`${file}.part`, file)
  return account
}

export const forgetTestAccount = (name: string, folder = defaultFolder()): void => { rmSync(accountFile(name, folder), { force: true }) }

export function browserConversation(id: string, folder = defaultFolder()): BrowserConversation | undefined {
  try { const saved = JSON.parse(readFileSync(conversationFile(id, folder), 'utf8')) as BrowserConversation; return saved.id === id ? saved : undefined } catch { return undefined }
}

export function registerBrowserConversation(id: string, root: string, done: boolean, folder = defaultFolder()): void {
  const previous = browserConversation(id, folder)
  if (previous?.root === root && previous.done === done) return
  mkdirSync(join(browserStateFolder(folder), 'conversations'), { recursive: true, mode: 0o700 })
  const file = conversationFile(id, folder)
  const part = `${file}.${randomUUID()}.part`
  writeFileSync(part, JSON.stringify({ id, root, done } satisfies BrowserConversation))
  renameSync(part, file)
}

export function setBrowserConversationDone(id: string, done: boolean): void {
  const previous = browserConversation(id)
  if (previous !== undefined) registerBrowserConversation(id, previous.root, done)
}

export function registerProjectBrowserConversation(conversation: Pick<ChatSession, 'id' | 'root' | 'status'>, projects: readonly string[], folder = defaultFolder()): void {
  const root = projects.filter((project) => conversation.root === project || conversation.root.startsWith(`${project}/`)).sort((a, b) => b.length - a.length)[0]
  if (root !== undefined) registerBrowserConversation(conversation.id, root, conversation.status === 'done', folder)
}

export function projectTestName(root: string): string {
  let canonical = root
  if (!root.startsWith('ssh://')) { try { canonical = realpathSync(root) } catch { canonical = resolve(root) } }
  const label = basename(canonical).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '').slice(0, 14) || 'project'
  return `project-${label}-${digest(canonical)}`
}

export function conversationTestName(id: string, folder = defaultFolder(), requested?: string): string {
  const conversation = browserConversation(id, folder)
  if (conversation === undefined) throw new Error('This conversation is not registered with GeckIt. Open its project in GeckIt before starting a test browser.')
  if (conversation.done) throw new Error('This conversation is Done. Move its card back to In progress before using test browsers.')
  // Account overrides are explicit user configuration, keyed by the registered project folder.
  let accounts: { readonly [root: string]: string | readonly string[] } = {}
  try { accounts = JSON.parse(readFileSync(join(browserStateFolder(folder), 'test-project-profiles.json'), 'utf8')) as typeof accounts } catch { /* The default needs no configuration. */ }
  const configured = accounts[conversation.root]
  const allowed = typeof configured === 'string' ? [configured] : configured ?? []
  if (allowed.some((name) => !/^[a-z0-9][a-z0-9-]{0,39}$/.test(name))) throw new Error('The configured project test profile name is invalid.')
  if (requested !== undefined && (allowed.includes(requested) || testAccount(requested, folder) !== undefined)) return requested
  return typeof configured === 'string' ? configured : projectTestName(conversation.root)
}

export function acquireTestLock(name: string, folder = defaultFolder()): (() => void) | undefined {
  mkdirSync(join(browserStateFolder(folder), 'test-locks'), { recursive: true, mode: 0o700 })
  const file = join(browserStateFolder(folder), 'test-locks', `${name}.lock`)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx', 0o600)
      try { writeFileSync(fd, String(process.pid)) } finally { closeSync(fd) }
      return () => { try { if (readFileSync(file, 'utf8') === String(process.pid)) rmSync(file) } catch { return } }
    } catch {
      let reap: number
      try { reap = openSync(`${file}.reap`, 'wx', 0o600) } catch { return undefined }
      try {
        const pid = Number(readFileSync(file, 'utf8'))
        if (!Number.isInteger(pid) || pid <= 0) { if (Date.now() - statSync(file).mtimeMs < 30_000) return undefined }
        else { try { process.kill(pid, 0); return undefined } catch { /* A departed driver no longer owns the lock. */ } }
        if (existsSync(file)) rmSync(file)
      } catch { return undefined }
      finally { closeSync(reap); rmSync(`${file}.reap`, { force: true }) }
    }
  }
  return undefined
}

export class TestTabOwners {
  readonly conversations = new Set<string>()
  readonly tabs = new Map<string, string>()
  constructor(readonly name: string, readonly folder: string, readonly managed: boolean) {}

  acquire(id: string | undefined): void {
    if (id === undefined) { if (this.managed) throw new Error('Project test browsers require a registered conversation.'); return }
    if (!this.managed) throw new Error('This test browser was opened manually and its ownership is unknown. Close it yourself before starting it from a conversation.')
    if (conversationTestName(id, this.folder, this.name) !== this.name) throw new Error('This test browser belongs to another project or account profile.')
    this.conversations.add(id)
  }

  authorize(id: string | undefined, target: string): void {
    if (id !== undefined && this.tabs.get(target) !== id) throw new Error('This tab belongs to another conversation. Open a separate tab with --profile test.')
    this.acquire(id)
  }

  inherit(target: string, opener: string | undefined): void {
    const owner = opener === undefined ? undefined : this.tabs.get(opener)
    if (owner !== undefined) this.tabs.set(target, owner)
  }

  released(): string[] {
    const released = [...this.conversations].filter((id) => {
      try { return conversationTestName(id, this.folder, this.name) !== this.name } catch { return true }
    })
    for (const id of released) this.conversations.delete(id)
    return [...this.tabs].filter(([, owner]) => !this.conversations.has(owner)).map(([target]) => target)
  }
}
