import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { browserFolder } from './browser'
import { requestingSession } from './start'

export interface SecretsAnswer { readonly ok: boolean; readonly said: string; readonly code?: number }

export const SECRETS_HELP = `geckit secrets: keys and passwords a conversation uses without ever seeing them.

  request <name> --use website|http|command|ssh --for <places> --note "<what for>" [--field "<element>"] [--replace]
                                sends the person a link to enter the secret; give the link to them as it is printed.
                                places: website https://github.com; http api.openai.com or *.stripe.com; command psql; ssh github.com
  wait <name>                   waits up to 15 minutes until the person has saved it
  list                          the secrets here: use, places, how long each is kept, last use. Never a value.
  show <name>                   one secret and its last 20 uses
  status                        whether secrets work here, and where they are stored
  revoke <name> | --all         remove at once
  run [--secret <name>]... [--env NAME=secret:<name>]... -- <command> [args...]
                                runs the command with the secrets put in by the broker; output comes back with values removed.
                                http: NAME holds a placeholder the broker replaces only on the secret's hosts.
                                command: NAME holds the value, for the named program only.
                                ssh: the command gets the broker's ssh-agent.

In a page: geckit browser type <tab> <ref> --secret <name> types a website secret into a password field.
Never ask the person to paste a secret into the conversation.`

const option = (rest: readonly string[], name: string): string | undefined => { const at = rest.indexOf(name); return at < 0 ? undefined : rest[at + 1] }
const options = (rest: readonly string[], name: string): string[] => rest.flatMap((one, at) => one === name && rest[at + 1] !== undefined ? [rest[at + 1] as string] : [])

/** Leaves a request for the service in the browser folder and waits for its answer. */
export async function askSecrets(request: object, waitMs = 30_000, folder: string = browserFolder()): Promise<{ readonly ok: boolean; readonly error?: string; readonly [key: string]: unknown }> {
  const file = join(folder, `${randomUUID()}.secret`)
  try {
    mkdirSync(folder, { recursive: true })
    writeFileSync(`${file}.part`, JSON.stringify({ ...request, conversation: requestingSession() }))
    renameSync(`${file}.part`, file)
  } catch { return { ok: false, error: `This sandbox may not write to ${folder}. GeckIt's own conversations may; elsewhere ask the person to allow writing there.` } }
  for (let waited = 0; waited < waitMs; waited += 100) {
    await new Promise((done) => setTimeout(done, 100))
    try {
      const told = JSON.parse(readFileSync(`${file}.told`, 'utf8')) as { ok: boolean; error?: string }
      rmSync(`${file}.told`, { force: true })
      return told
    } catch { continue }
  }
  rmSync(file, { force: true })
  return { ok: false, error: 'The GeckIt service did not answer. Is GeckIt running?' }
}

const refused = (error: string | undefined): SecretsAnswer => {
  const said = error ?? 'The secrets broker refused.'
  return { ok: false, said, code: /not reachable|not available|unavailable|locked|did not answer/i.test(said) ? 3 : /expired|not allowed|is for |not a |Name the|Say where/i.test(said) ? 2 : 1 }
}

interface Listed { readonly name: string; readonly kind: string; readonly places: readonly string[]; readonly lifetime: string; readonly kept: string; readonly lastUsedAt?: number; readonly cleaned: boolean }
const line = (one: Listed): string => `${one.name}  ${one.kind}  ${one.places.join(', ')}  ${one.kept}${one.lastUsedAt === undefined ? '' : `  used ${new Date(one.lastUsedAt).toLocaleString()}`}${one.kind === 'command' ? '  given to a program' : ''}${one.cleaned ? '' : '  not cleaned from output'}`

export async function secrets(rest: readonly string[]): Promise<SecretsAnswer> {
  const [what, ...more] = rest
  const words = more.filter((one, at) => !one.startsWith('--') && !['--use', '--for', '--note', '--field', '--secret', '--env'].includes(more[at - 1] ?? ''))
  switch (what) {
    case 'request': {
      const name = words[0]
      const kind = option(more, '--use')
      const places = (option(more, '--for') ?? '').split(',').map((one) => one.trim()).filter((one) => one !== '')
      if (name === undefined || kind === undefined) return { ok: false, said: 'Use geckit secrets request <name> --use website|http|command|ssh --for <places> --note "<what for>".', code: 1 }
      const told = await askSecrets({ op: 'request', name, kind, places, note: option(more, '--note') ?? '', ...(option(more, '--field') === undefined ? {} : { field: option(more, '--field') }), replace: more.includes('--replace') })
      if (!told.ok) return refused(told.error)
      if (typeof told['link'] !== 'string') return { ok: true, said: `${name} is already saved (${String(told['kept'])}); nothing was sent. Add --replace to send a link anyway.` }
      const minutes = Math.max(1, Math.round((Number(told['expiresAt']) - Date.now()) / 60_000))
      return { ok: true, said: `${told['link']}\nPut this link, as it is, in your final reply to the person in this turn, not only in a note between steps, which the chat folds away. It works for ${minutes} minutes, once; they type the secret there. Then run geckit secrets wait ${name}. You never see the value: use it by name with geckit secrets run or geckit browser type --secret.` }
    }
    case 'wait': {
      const name = words[0]
      if (name === undefined) return { ok: false, said: 'Give the secret, such as geckit secrets wait openai-key.', code: 1 }
      for (const until = Date.now() + 15 * 60_000; Date.now() < until; await new Promise((done) => setTimeout(done, 3_000))) {
        const told = await askSecrets({ op: 'list' })
        if (!told.ok) return refused(told.error)
        const found = (told['secrets'] as Listed[]).find((one) => one.name === name)
        if (found !== undefined) return { ok: true, said: `${name} is ready: ${line(found)}` }
      }
      return { ok: false, said: `${name} was not saved within 15 minutes. Ask the person again, with geckit secrets request ${name} --replace ... for a new link.`, code: 2 }
    }
    case 'list': {
      const told = await askSecrets({ op: 'list' })
      if (!told.ok) return refused(told.error)
      const listed = told['secrets'] as Listed[]
      return { ok: true, said: listed.length === 0 ? 'No secrets yet.' : listed.map(line).join('\n') }
    }
    case 'show': {
      if (words[0] === undefined) return { ok: false, said: 'Give the secret, such as geckit secrets show openai-key.', code: 1 }
      const told = await askSecrets({ op: 'show', name: words[0] })
      if (!told.ok) return refused(told.error)
      const records = (told['records'] as { at: number; taskId?: string; kind: string; place?: string; result: string }[]).map((one) => `  ${new Date(one.at).toLocaleString()}  ${one.kind}  ${one.place ?? ''}  ${one.result}`)
      return { ok: true, said: [line(told['secret'] as Listed), ...records].join('\n') }
    }
    case 'status': {
      const told = await askSecrets({ op: 'status' })
      if (!told.ok) return refused(told.error)
      return { ok: true, said: `Secrets work here. Stored in ${String(told['store'])}. Broker ${String(told['version'])}${told['locked'] === true ? ', but the store is locked: unlock it to use secrets.' : '.'}` }
    }
    case 'revoke': {
      const all = more.includes('--all')
      if (!all && words[0] === undefined) return { ok: false, said: 'Give the secret, or --all.', code: 1 }
      const told = await askSecrets({ op: 'revoke', ...(all ? {} : { name: words[0] }) })
      if (!told.ok) return refused(told.error)
      return { ok: true, said: Number(told['removed']) === 0 ? 'Nothing to remove.' : all ? `Removed ${String(told['removed'])} secrets.` : `Removed ${words[0] ?? ''}.` }
    }
    case 'run': {
      const split = more.indexOf('--')
      if (split < 0 || more[split + 1] === undefined) return { ok: false, said: 'Put the command after --, such as geckit secrets run --secret openai-key -- curl https://api.openai.com/v1/models.', code: 1 }
      const head = more.slice(0, split)
      const told = await askSecrets({ op: 'run', secrets: options(head, '--secret'), env: options(head, '--env'), argv: more.slice(split + 1), cwd: process.cwd() }, 15 * 60_000)
      if (!told.ok) return refused(told.error)
      if (typeof told['out'] === 'string' && told['out'] !== '') process.stdout.write(told['out'])
      if (typeof told['err'] === 'string' && told['err'] !== '') process.stderr.write(told['err'])
      const exit = Number(told['exit'] ?? 1)
      return { ok: exit === 0, said: '', code: exit }
    }
    default: return { ok: what === undefined || what === 'help', said: SECRETS_HELP, code: what === undefined || what === 'help' ? 0 : 1 }
  }
}
