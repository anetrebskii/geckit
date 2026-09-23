import { basename } from 'node:path'

import type { Planned, SessionStatus } from '../shared/api'
import { askPlan } from './correct'

/**
 * What somebody said out loud, turned into things this application does.
 *
 * The words are handed to a model along with the conversations and projects
 * there are, and it answers with orders: start this, say that in the one about
 * the radar, stop the other. Nothing here reads or writes a repository - every
 * order is something the person could have done with the mouse.
 */

export type Order =
  | { readonly do: 'start'; readonly project: string; readonly text: string; readonly goal?: string }
  | { readonly do: 'say'; readonly chat: string; readonly text: string }
  | { readonly do: 'stop'; readonly chat: string }
  | { readonly do: 'mark'; readonly chat: string; readonly status: SessionStatus }
  | { readonly do: 'open'; readonly chat: string }
  | { readonly do: 'delete'; readonly chat: string }

/** A conversation as the model is shown it: enough to tell them apart by ear. */
export interface Told {
  readonly id: string
  readonly title: string
  readonly root: string
  readonly state: string
}

const STATUSES = new Set(['review', 'blocked', 'done'])

const MARKS: Record<SessionStatus, string> = { review: 'eye', blocked: 'blocked', done: 'done' }

const string = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** One order, or nothing where it is not one this application carries out. */
function orderOf(said: unknown): Order | undefined {
  if (typeof said !== 'object' || said === null) return undefined
  const one = said as Readonly<Record<string, unknown>>
  const chat = string(one['chat'])
  const text = string(one['text'])
  switch (string(one['do'])) {
    case 'start': {
      const project = string(one['project'])
      const goal = string(one['goal'])
      return project === '' || text === ''
        ? undefined
        : { do: 'start', project, text, ...(goal === '' ? {} : { goal }) }
    }
    case 'say':
      return chat === '' || text === '' ? undefined : { do: 'say', chat, text }
    case 'stop':
      return chat === '' ? undefined : { do: 'stop', chat }
    case 'mark': {
      const status = string(one['status'])
      return chat === '' || !STATUSES.has(status) ? undefined : { do: 'mark', chat, status: status as SessionStatus }
    }
    case 'open':
      return chat === '' ? undefined : { do: 'open', chat }
    case 'delete':
      return chat === '' ? undefined : { do: 'delete', chat }
    default:
      return undefined
  }
}

/**
 * The orders in what the model answered.
 *
 * It is asked for a bare array, and it mostly gives one; a model that wraps it
 * in a fence or says a word first is read all the same, and anything that is
 * not an order this application carries out is left out rather than guessed at.
 */
export function ordersOf(answer: string): Order[] {
  const at = answer.indexOf('[')
  const to = answer.lastIndexOf(']')
  if (at < 0 || to < at) return []
  let said: unknown
  try {
    said = JSON.parse(answer.slice(at, to + 1))
  } catch {
    return []
  }
  if (!Array.isArray(said)) return []
  return said.flatMap((one) => orderOf(one) ?? [])
}

/** The name a project is spoken by: the folder's own, which is what the sidebar shows. */
export const projectSaid = (root: string): string => basename(root)

/** What the model is told there is, small enough to go in every time. */
export function listing(projects: readonly string[], chats: readonly Told[]): string {
  const where = projects.map((root) => `- ${projectSaid(root)}`).join('\n')
  const said = chats
    .map((one) => `- ${one.id} | ${projectSaid(one.root)} | ${one.state} | ${one.title}`)
    .join('\n')
  return `Projects:\n${where || '- (none)'}\n\nConversations, the newest first, as id | project | how it stands | what it is about:\n${said || '- (none)'}`
}

/** What the model is told to do with the words. */
export const ORDERS = [
  'You turn what somebody said out loud into orders for GeckIt, the application they are looking at. It holds conversations with Claude Code, one per piece of work.',
  'Answer with a JSON array of orders and nothing else: no prose, no code fence, no explanation. An empty array is a fine answer.',
  'The orders, each an object:',
  '{"do":"start","project":"<a project from the list>","text":"<what to ask it to do>","goal":"<optional: what has to be true for this to be finished>"}',
  '{"do":"say","chat":"<an id from the list>","text":"<what to say in that conversation>"}',
  '{"do":"stop","chat":"<an id>"}',
  '{"do":"mark","chat":"<an id>","status":"review"|"blocked"|"done"}',
  '{"do":"open","chat":"<an id>"}',
  '{"do":"delete","chat":"<an id>"}',
  'Rules:',
  '- They are speaking, so the words are loose and may be misheard. Match a conversation by what it is about, not by the exact wording, and match a project the same way.',
  '- Never use an id or a project that is not in the list. Where you cannot tell which one is meant, leave that order out.',
  '- Where nothing they said asks for any of this, answer with [].',
  '- Keep their own words in `text`. Do not answer the question yourself, do not carry out the work, do not make the task longer than they said it.',
  '- They may give several orders in one breath. Give them in the order they said them.',
  '- They may be taking back what they said a moment ago: the conversation they started was the wrong one, or it was started in the wrong project. That is two orders - delete the wrong one, start the right one - and the one they mean is usually the newest in the list. Only delete where they say the conversation should not exist; where they want it left alone, stop or mark it instead.',
  '- A `goal` is what has to be true for the work to be over, said so that it can be checked: what was asked for, and how anybody would see that it holds. Give one where the work has an end somebody could point at, and leave it out where it does not, such as a question or a look at something. Never put steps or a plan in it.',
].join('\n')

/**
 * The words read as orders, on the person's own plan.
 *
 * The same one-shot run as Correct: no tools, no conversation left behind, so
 * the only thing that can come of it is the array it answers with.
 */
export async function askOrders(
  said: string,
  projects: readonly string[],
  chats: readonly Told[],
  model = '',
): Promise<{ readonly orders: Order[]; readonly error?: string }> {
  const answer = await askPlan(`${listing(projects, chats)}\n\nWhat they said:\n${said}`, ORDERS, model)
  if (!answer.ok) return { orders: [], error: answer.error ?? 'It could not be read as orders' }
  return { orders: ordersOf(answer.text ?? '') }
}

const shortly = (text: string, most = 60): string =>
  text.length > most ? `${text.slice(0, most - 1).trimEnd()}...` : text

/**
 * What the orders would do, for the person to say yes to before anything runs.
 *
 * An order naming a conversation or a project that is not there is left out
 * here rather than at the last moment, so that what is shown is what happens.
 */
export function saying(
  orders: readonly Order[],
  projects: readonly string[],
  chats: readonly Told[],
): { readonly orders: readonly Order[]; readonly lines: readonly Planned[] } {
  const here = new Map(chats.map((one) => [one.id, one]))
  const kept: Order[] = []
  const lines: Planned[] = []
  for (const order of orders) {
    if (order.do === 'start') {
      if (!projects.some((one) => projectSaid(one) === order.project)) continue
      kept.push(order)
      // Whole, however long: this is what is about to be sent, and it is being agreed to.
      lines.push({
        icon: 'plus',
        head: `Start in ${order.project}`,
        text: order.text,
        ...(order.goal === undefined ? {} : { goal: order.goal }),
      })
      continue
    }
    const chat = here.get(order.chat)
    if (chat === undefined) continue
    const title = shortly(chat.title, 40)
    kept.push(order)
    if (order.do === 'say') lines.push({ icon: 'chat', head: `Say in ${title}`, text: order.text })
    if (order.do === 'stop') lines.push({ icon: 'stop', head: `Stop ${title}` })
    if (order.do === 'mark') lines.push({ icon: MARKS[order.status], head: `Mark ${title} as ${order.status}` })
    if (order.do === 'open') lines.push({ icon: 'ahead', head: `Open ${title}` })
    if (order.do === 'delete') lines.push({ icon: 'trash', head: `Delete ${title}` })
  }
  return { orders: kept, lines }
}

/** Carrying an order out is the same as pressing what it names in the window. */
export interface Doing {
  readonly start: (root: string, text: string, goal: string | undefined) => Promise<string>
  readonly say: (id: string, text: string) => Promise<void>
  readonly stop: (id: string) => void
  readonly mark: (id: string, status: SessionStatus) => void
  readonly open: (id: string) => void
  readonly delete: (id: string) => Promise<void>
}

/**
 * The orders done, and a line about each for the person to read.
 *
 * An order naming something that is no longer there is dropped: the list the
 * model was given is a moment old, and a conversation can be deleted in that
 * moment.
 */
export async function carryOut(
  orders: readonly Order[],
  projects: readonly string[],
  chats: readonly Told[],
  doing: Doing,
): Promise<string[]> {
  const done: string[] = []
  const here = new Map(chats.map((one) => [one.id, one]))
  for (const order of orders) {
    if (order.do === 'start') {
      const root = projects.find((one) => projectSaid(one) === order.project)
      if (root === undefined) continue
      await doing.start(root, order.text, order.goal)
      done.push(
        `Started in ${order.project}: ${shortly(order.text)}${order.goal === undefined ? '' : ` (until ${shortly(order.goal)})`}`,
      )
      continue
    }
    const chat = here.get(order.chat)
    if (chat === undefined) continue
    const title = shortly(chat.title, 40)
    switch (order.do) {
      case 'say':
        await doing.say(order.chat, order.text)
        done.push(`Said in ${title}: ${shortly(order.text)}`)
        break
      case 'stop':
        doing.stop(order.chat)
        done.push(`Stopped ${title}`)
        break
      case 'mark':
        doing.mark(order.chat, order.status)
        done.push(`Marked ${title} as ${order.status}`)
        break
      case 'open':
        doing.open(order.chat)
        done.push(`Opened ${title}`)
        break
      case 'delete':
        await doing.delete(order.chat)
        done.push(`Deleted ${title}`)
        break
    }
  }
  return done
}
