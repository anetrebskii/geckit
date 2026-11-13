import { brokerOps, type SecretKind } from '../core/broker'
import { Secrets, lifetimeSaid, setRunningSecrets } from '../core/secrets'
import { setSecretsServer, type SecretFileAsk } from '../cli/secrets-serve'
import { onConversationDone } from '../main/store'
import { superviseBroker } from './broker-process'

interface Host {
  readonly source: boolean
  readonly sessions: () => readonly { readonly id: string; readonly title: string }[]
  readonly notice: (session: string, title: string, body: string) => void
  readonly log: (line: string) => void
}

/** The conversation a request came from, the same whether it is named by its provider id or GeckIt's board id. */
export const taskKey = (id: string): string => id.split(':').pop() ?? id

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
const decode = (chunk: string | undefined): string => chunk === undefined ? '' : Buffer.from(chunk, 'base64').toString('utf8')

/** Starts the broker and answers what conversations ask about secrets. */
export function serveSecrets(host: Host): () => void {
  const broker = superviseBroker({ source: host.source, log: host.log })
  const ops = brokerOps(broker.endpoint)
  const sessionOf = (conversation: string | undefined): { id: string; title: string } | undefined => {
    if (conversation === undefined) return undefined
    const key = taskKey(conversation)
    return host.sessions().find((one) => taskKey(one.id) === key)
  }
  const secrets = new Secrets({
    broker: () => ops,
    notify: (taskId, title, body) => { const session = sessionOf(taskId); host.notice(session?.id ?? '', title, body) },
  })
  const answer = async (ask: SecretFileAsk): Promise<object> => {
    const task = ask.conversation === undefined ? undefined : taskKey(ask.conversation)
    const needTask = (): string => { if (task === undefined) throw new Error('Secrets are asked for from a conversation; this command runs outside one.'); return task }
    switch (ask.op) {
      case 'request': {
        const made = await secrets.request({ name: text(ask['name']), kind: text(ask['kind']) as SecretKind, places: list(ask['places']), note: text(ask['note']), ...(text(ask['field']) === '' ? {} : { field: text(ask['field']) }), taskId: needTask(), taskTitle: sessionOf(ask.conversation)?.title ?? '', replace: ask['replace'] === true })
        if (made.existing !== undefined) return { kept: lifetimeSaid(made.existing) }
        host.notice(sessionOf(ask.conversation)?.id ?? '', `Secret requested: ${text(ask['name'])}`, `${text(ask['kind'])} on ${list(ask['places']).join(', ')}. The link works for 15 minutes.`)
        return { link: made.link, expiresAt: made.expiresAt }
      }
      case 'list': return { secrets: (await secrets.list()).secrets.map((one) => ({ ...one, kept: lifetimeSaid(one) })) }
      case 'show': {
        const found = (await secrets.list()).secrets.find((one) => one.name === text(ask['name']))
        if (found === undefined) throw new Error(`There is no secret ${text(ask['name'])}.`)
        return { secret: { ...found, kept: lifetimeSaid(found) }, records: (await secrets.history(found.name, 20)).records }
      }
      case 'status': return secrets.status()
      case 'revoke': return secrets.revoke(text(ask['name']) === '' ? undefined : text(ask['name']))
      case 'fill': return secrets.fill({ name: text(ask['name']), taskId: needTask(), origin: text(ask['origin']), field: text(ask['field']), endpointKey: text(ask['endpointKey']) })
      case 'run': {
        let out = ''
        let err = ''
        const done = await secrets.run({ taskId: needTask(), secrets: list(ask['secrets']), env: list(ask['env']), argv: list(ask['argv']), cwd: text(ask['cwd']) }, (chunk) => { out += decode(chunk.out); err += decode(chunk.err) })
        return { exit: done.exit, out, err }
      }
      default: throw new Error(`Unknown secrets request ${ask.op}.`)
    }
  }
  setSecretsServer(answer)
  setRunningSecrets(secrets)
  const stopDone = onConversationDone((id) => { void ops.taskEnded({ taskId: taskKey(id) }).catch(() => undefined) })
  return () => { stopDone(); setSecretsServer(undefined); setRunningSecrets(undefined); secrets.dispose(); broker.stop() }
}
