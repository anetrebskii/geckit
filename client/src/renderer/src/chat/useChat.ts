import { readAccount } from './accounts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  CardAnswer,
  ChatSession,
  Lineup,
  ClaudeAccount,
  ClaudeModel,
  ClaudeTransport,
  ModelsSaid,
  PlaceUsage,
  PlanUsage,
  ReasoningEffort,
  SessionImage,
  SessionItem,
  SessionMessage,
  SessionMode,
  SessionProvider,
  SessionNotice,
  SessionStatus,
} from '../../../shared/api'
import { assistantFor, assistantsIn, homeOf, providerOf, resumeCommand, shownProjects } from '../../../shared/api'
import { isCodexProvider } from '../../../shared/providers'
import { hostOf, isRemote } from '../../../shared/hosts'
import type { HostPrompt, HostView } from '../../../shared/hosts'
import { asImage, canShow } from '../pictures'
import { useSettings } from '../settings'
import { ON_PHONE } from '../on-phone'
import type { Settings } from '../../../shared/api'
import { hostName } from './project'
import { useHosts } from './useHosts'

/** What the window is showing: a conversation, or one that has not been sent yet. */
export type Shown = { readonly kind: 'new' } | { readonly kind: 'session'; readonly id: string }

const NEW = 'new'

/** Chosen where the list is every project's conversations at once. A root is a path, so nothing collides with this. */
export const ALL = 'all'

/** More than this in one message is a mistake rather than an intention. */
const MOST_PICTURES = 8

const PLAN_EVERY = 5 * 60_000

/** How long a notice that asks for nothing stays up. */
const NOTICE_FOR = 8000

const NONE: readonly SessionImage[] = []

const DRAFTS = 'drafts'

/** What was typed and not sent, kept across a restart. */
function keptDrafts(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}
const keyOf = (shown: Shown): string => (shown.kind === 'new' ? NEW : shown.id)

export interface Chat {
  readonly settings: Settings
  /** Other computers conversations run on, and how each stands. */
  readonly hosts: readonly HostView[]
  /** What hosts are asking now. */
  readonly prompts: readonly HostPrompt[]
  /** The tasks waiting for fewer conversations to be working, top first. */
  readonly lineup: Lineup
  /** As many are working as the limit allows, so a new one would wait. */
  readonly full: boolean
  readonly change: (change: Partial<Settings>) => void
  readonly root: string | undefined
  /** Whose conversations are listed: one project's, or `ALL`. */
  readonly scope: string
  readonly sessions: readonly ChatSession[]
  /** The list has been read at least once, so an empty one means there is nothing. */
  readonly listed: boolean
  /** Every project's conversations, whichever is listed. */
  readonly everyone: readonly ChatSession[]
  /** General questions still open, newest first; each is gone a day after its last answer. */
  readonly questions: readonly ChatSession[]
  /** Every project's conversations that wait on the person: asking first, then answered and not yet read. */
  readonly waiting: readonly ChatSession[]
  /** Said in the window while it is in front, instead of a banner. One per conversation. */
  readonly notices: readonly SessionNotice[]
  readonly shown: Shown
  readonly session: ChatSession | undefined
  readonly items: readonly SessionItem[]
  /** The conversation the items are, which is the one shown once they have arrived. */
  readonly itemsFor: string
  /** How much of the conversation is before its items and still on the Mac: the phone is sent a conversation's end first. */
  readonly earlier: number
  readonly showEarlier: () => void
  /** Puts the steps of a run the phone was sent as one line where the line is. */
  readonly loadSteps: (run: Extract<SessionItem, { kind: 'steps' }>) => void
  readonly draft: string
  /** Pictures pasted or dropped into the field, waiting to go with the message. */
  readonly pictures: readonly SessionImage[]
  /** Said when something was pasted that cannot be sent. */
  readonly trouble: string
  /** A file dropped on a conversation on a host is still being copied there: the message waits for its path. */
  readonly uploading: boolean
  readonly account: ClaudeAccount | undefined
  /** How much of the plan is spent, once a turn has said. */
  readonly plan: PlanUsage | undefined
  /** Every place's plan, by the account it runs on: this computer's and each host's with projects here. */
  readonly plans: readonly PlaceUsage[]
  /** When each place's usage was last measured, by the place: what a faint plan item's tooltip says it is as of. */
  readonly plansAt: Readonly<Record<string, number>>
  readonly models: ModelsSaid
  /** The mode and model the next message goes with, on a new session or an old one. */
  readonly mode: SessionMode
  readonly transport: ClaudeTransport
  readonly provider: SessionProvider
  readonly showProviders: boolean
  readonly reasoning: ReasoningEffort | ''
  setReasoning: (reasoning: ReasoningEffort | '') => void
  readonly model: string
  readonly working: boolean
  /** Bumped when the composer should take the caret. */
  readonly focusSeed: number
  /** Every project's conversations are listed while this is empty. */
  readonly chosen: readonly string[]
  setScope: (scope: string) => void
  /** That project in the list beside the others already there, or out of it. */
  alsoScope: (root: string) => void
  /** Exactly these projects in the list: every one of a host's, for All on it. */
  choose: (roots: readonly string[]) => void
  /** Where a new conversation starts: listing every project, only that changes; listing one, the list moves to it. */
  setRoot: (root: string) => void
  addProject: () => void
  forgetProject: (root: string) => void
  open: (shown: Shown) => void
  /** Open one that may belong to a project other than the one being listed. */
  show: (session: ChatSession) => void
  /** The same, by id. */
  goTo: (id: string) => void
  dismiss: (session: string) => void
  startNew: () => void
  setDraft: (text: string) => void
  /** Dropped or pasted: pictures are carried, anything else goes into the field as its path. */
  addFiles: (files: readonly File[]) => void
  dropPicture: (at: number) => void
  setMode: (mode: SessionMode) => void
  setModel: (model: string) => void
  setProvider: (provider: SessionProvider) => void
  /** Asks which models the Claude Code that runs a project has: the chat's own project where none is given. */
  askModels: (root?: string) => void
  send: (again?: string, said?: string) => void
  /** A general question, in no project, which the board and the list never show. */
  ask: (text: string, images?: readonly SessionImage[]) => Promise<void>
  /** A new conversation from the board's form: the work goes first, then the goal. */
  startTask: (root: string, text: string, goal: string, images?: readonly SessionImage[]) => Promise<void>
  /** Words sent to the open conversation as they are, the field left alone: `/compact`, `/goal clear`. */
  say: (text: string) => void
  answer: (card: string, answer: CardAnswer | string) => void
  stop: () => void
  /** Cancels a message sent while Claude worked, before it goes. */
  unqueue: (queued: string) => void
  /** A message waiting in the queue, said again in other words. */
  requeue: (queued: string, text: string) => void
  reorderQueued: (queued: string, target: string, after: boolean) => void
  /** Starts a message waiting in the queue as a new conversation of its own, empty or with this one's history as it was then, and opens it. */
  delegate: (queued: string, history: boolean) => void
  /** Stops a command typed after `!` that is still running. */
  stopShell: (item: string) => void
  /** Types a line to a command typed after `!` that is still running, as its keyboard. */
  typeShell: (item: string, text: string) => void
  /** Sends a command Claude is waiting on into the background, as Ctrl+B does in a terminal. */
  toBackground: (item: string) => void
  stopTask: (task: string) => void
  /** Takes a task that has ended off the list, as x does in the terminal's `/tasks`. */
  clearTask: (task: string) => void
  /** The dialog with what runs in the background is open. */
  readonly tasksShown: boolean
  showTasks: (open: boolean) => void
  /** A /compact waiting for a yes: typed in the field, or asked for with the button. */
  readonly compacting: 'typed' | 'clicked' | undefined
  setCompacting: (from: 'typed' | 'clicked' | undefined) => void
  rename: (id: string, title: string) => void
  /** In review, blocked or done; nothing takes the mark off. */
  mark: (id: string, status: SessionStatus | undefined) => void
  hide: (id: string) => void
  /** Keeps a general question for good, or lets it go a day after its last answer again. */
  keep: (id: string, stays: boolean) => void
  /** Throws the conversations away for good. The window asks before this is called. */
  remove: (ids: readonly string[]) => void
  terminal: (id: string) => void
  /** Puts the command that continues it in a terminal on the clipboard, and lets go of it here. */
  /** Copies the line that continues a conversation in a terminal, and lets go of it here; answers whether a line was copied. */
  copyTerminal: (id: string) => Promise<boolean>
  refresh: () => void
}

// How long a message sent stays up on its own once the Mac has taken it.
const SHOWN_FOR = 1500

let before = new Map<string, { readonly said: string; readonly one: ChatSession }>()

/** The list as main sends it, each conversation that did not change kept as the object it was, so the cards drawing it are not drawn again. */
function sameAsBefore(all: readonly ChatSession[]): ChatSession[] {
  const now = new Map<string, { readonly said: string; readonly one: ChatSession }>()
  const kept = all.map((one) => {
    const said = JSON.stringify(one)
    const was = before.get(one.id)
    const same = was?.said === said ? was.one : one
    now.set(one.id, { said, one: same })
    return same
  })
  before = now
  return kept
}

export function useChat(): Chat {
  const [settings, change] = useSettings()
  const { hosts, prompts } = useHosts()
  const [lineup, setLineup] = useState<Lineup>({ working: 0, limit: 0 })
  useEffect(() => {
    let gone = false
    void window.geckit.lineup.state().then((now) => {
      if (!gone && now !== undefined) setLineup(now)
    })
    const off = window.geckit.lineup.onChanged(setLineup)
    return () => {
      gone = true
      off()
    }
  }, [])
  const [picked, setPicked] = useState<readonly string[] | undefined>()
  const [started, setStarted] = useState<string | undefined>()
  const [storedSessions, setSessions] = useState<readonly ChatSession[]>([])
  const [listed, setListed] = useState(false)
  const [storedEveryone, setEveryone] = useState<readonly ChatSession[]>([])
  const [storedQuestions, setQuestions] = useState<readonly ChatSession[]>([])
  const [notices, setNotices] = useState<readonly SessionNotice[]>([])
  const [shown, setShown] = useState<Shown>({ kind: 'new' })
  const [nextChoices, setNextChoices] = useState<ReadonlyMap<string, Pick<SessionMessage, 'model' | 'reasoning'>>>(() => new Map())
  const [items, setItems] = useState<readonly SessionItem[]>([])
  const [itemsFor, setItemsFor] = useState('new')
  const [earlier, setEarlier] = useState({ id: '', left: 0 })
  const [drafts, setDrafts] = useState<Record<string, string>>(keptDrafts)
  useEffect(() => {
    localStorage.setItem(DRAFTS, JSON.stringify(Object.fromEntries(Object.entries(drafts).filter(([, text]) => text.trim() !== ''))))
  }, [drafts])
  const [pictures, setPictures] = useState<Record<string, readonly SessionImage[]>>({})
  const [trouble, setTrouble] = useState('')
  // Files still being copied to a host, by the conversation they were dropped on.
  const [uploads, setUploads] = useState<Readonly<Record<string, number>>>({})
  const uploadsRef = useRef(uploads)
  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])
  const [account, setAccount] = useState<ClaudeAccount | undefined>()
  const [plan, setPlan] = useState<PlanUsage | undefined>()
  const [plans, setPlansState] = useState<readonly PlaceUsage[]>([])
  // When a place's usage was last measured, so a faint plan item's tooltip can say as of when it was last asked. Every answer or tell counts, whether or not its numbers moved: it says when it was last known fresh, not when it last changed.
  const [plansAt, setPlansAt] = useState<Readonly<Record<string, number>>>({})
  const setPlans = useCallback((all: readonly PlaceUsage[]): void => {
    const at = Date.now()
    setPlansState(all)
    setPlansAt((held) => {
      const next = { ...held }
      for (const one of all) next[one.place] = at
      return next
    })
  }, [])
  // Which Claude Code the list is of, this computer's ('') or a host's by id: each has its own models, and a list is never shown for the other.
  const [models, setModels] = useState<{ readonly on: string; readonly said: ModelsSaid }>({ on: '', said: 'unasked' })
  const [focusSeed, setFocusSeed] = useState(0)
  // The projects the list shows, kept from last time. None of them is every one of the profile's.
  const chosen = useMemo<readonly string[]>(() => {
    const shown = shownProjects(settings)
    const kept = picked ?? settings.chatProjects ?? (settings.chatAll || shown[0] === undefined ? [] : [shown[0]])
    return kept.filter((one) => shown.includes(one))
  }, [picked, settings])
  // One project is a scope the rest of the window understands; several are every project, narrowed.
  const scope = chosen.length === 1 ? (chosen[0] ?? ALL) : ALL
  const enabled = assistantsIn(settings)
  const sessions = useMemo(() => storedSessions.filter((one) => enabled.includes(providerOf(one.id))), [storedSessions, enabled])
  const everyone = useMemo(() => storedEveryone.filter((one) => enabled.includes(providerOf(one.id))), [storedEveryone, enabled])
  const questions = useMemo(() => storedQuestions.filter((one) => enabled.includes(providerOf(one.id))), [storedQuestions, enabled])
  const visibleNotices = useMemo(() => notices.filter((one) => enabled.includes(providerOf(one.session))), [notices, enabled])
  const provider = shown.kind === 'session' ? providerOf(shown.id) : assistantFor(settings, scope === ALL ? started ?? shownProjects(settings)[0] ?? '' : scope)

  const shownRef = useRef(shown)
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  const scopeRef = useRef(scope)
  const chosenRef = useRef(chosen)
  const sessionsRef = useRef(sessions)
  const everyoneRef = useRef(everyone)
  // The shown one is not kept here but where it is set: an effect of an earlier render can run after that and put it back.
  useEffect(() => {
    scopeRef.current = scope
    chosenRef.current = chosen
    sessionsRef.current = sessions
    everyoneRef.current = everyone
  }, [scope, chosen, sessions, everyone])

  /** Listed: every project's, or only the chosen ones'. */
  const within = (one: ChatSession): boolean =>
    one.question !== true && (chosenRef.current.length === 0 || chosenRef.current.includes(homeOf(one)))

  const refresh = useCallback(() => {
    const one = chosenRef.current.length === 1 ? chosenRef.current[0] : undefined
    void window.geckit.chat.list(one).then((listed) => {
      const all = sameAsBefore(listed)
      setSessions(all.filter(within))
      setListed(true)
      // Asked for every project, this is every project: the counts are made from the same answer.
      if (one === undefined) setEveryone(all.filter((session) => session.question !== true))
    })
  }, [])

  // Another profile changes what the list may hold, with the scope itself unmoved.
  useEffect(refresh, [refresh, scope, chosen.join('\n'), shownProjects(settings).join('\n')])

  // Asked until it is answered: a phone that opened while the host was starting, or while the link was down, would otherwise never know who is signed in.
  useEffect(() => {
    let gone = false
    let again: number | undefined
    const ask = (): void => {
      readAccount(provider).then(
        (said: ClaudeAccount | undefined) => {
          if (gone) return
          if (said === undefined) again = window.setTimeout(ask, 5_000)
          else setAccount(said)
        },
        () => {
          if (!gone) again = window.setTimeout(ask, 5_000)
        },
      )
    }
    ask()
    const every = window.setInterval(() => { if (document.visibilityState === 'visible') ask() }, PLAN_EVERY)
    window.addEventListener('focus', ask)
    const off = window.geckit.chat.onAccount((said) => {
      if ((said.provider ?? 'claude') === provider) setAccount(said)
    })
    return () => {
      gone = true
      window.clearTimeout(again)
      window.clearInterval(every)
      off()
      window.removeEventListener('focus', ask)
    }
  }, [provider])

  // Asking has the plan measured again, so it is asked for on opening, on
  // coming to the front, and every few minutes while the window is seen.
  useEffect(() => {
    const ask = (): void => {
      if (document.visibilityState !== 'visible') return
      void window.geckit.chat.plan().then(setPlan)
      // A computer from before plans were measured per account says nothing here, and its one plan is still shown.
      void window.geckit.chat.plans().then(setPlans, () => undefined)
    }
    ask()
    const every = setInterval(ask, PLAN_EVERY)
    window.addEventListener('focus', ask)
    const off = window.geckit.chat.onPlan(setPlan)
    const offPlans = window.geckit.chat.onPlans(setPlans)
    return () => {
      clearInterval(every)
      window.removeEventListener('focus', ask)
      off()
      offPlans()
    }
  }, [setPlans])

  useEffect(() => {
    void window.geckit.chat.list(undefined).then((all) => setEveryone(sameAsBefore(all).filter((one) => one.question !== true)))
    let asked = new Set<string>()
    return window.geckit.chat.onSessions((sent) => {
      const all = sameAsBefore(sent)
      setSessions(all.filter(within))
      setListed(true)
      setEveryone(all.filter((one) => one.question !== true))
      const now = all.filter((one) => one.question === true)
      setQuestions(now)
      // A question deleted, by hand or a day after its last answer, is gone, and so is its view.
      const shownNow = shownRef.current
      if (shownNow.kind === 'session' && asked.has(shownNow.id) && !now.some((one) => one.id === shownNow.id)) {
        shownRef.current = { kind: 'new' }
        setShown({ kind: 'new' })
        setItems([])
        setItemsFor('new')
        window.geckit.chat.watching(undefined)
      }
      asked = new Set(now.map((one) => one.id))
      // A question answered anywhere, here or in a terminal, has nothing left to say.
      setNotices((held) =>
        held.filter((notice) => !notice.asks || all.some((one) => one.id === notice.session && one.state === 'asks')),
      )
    })
  }, [])

  useEffect(
    () =>
      window.geckit.chat.onNotice((notice) => {
        setNotices((held) => [...held.filter((one) => one.session !== notice.session), notice])
        if (!notice.asks) setTimeout(() => setNotices((held) => held.filter((one) => one !== notice)), NOTICE_FOR)
      }),
    [],
  )

  useEffect(
    () =>
      // A dev app started before this was added has a preload without it until it is started again.
      window.geckit.chat.onEarlier?.((said) => {
        if (shownRef.current.kind === 'session' && shownRef.current.id === said.id) setEarlier(said)
      }),
    [],
  )

  // A message sent is up the moment Send is pressed, and gives way to the Mac's own once that arrives.
  const sending = useRef(0)
  useEffect(
    () =>
      window.geckit.chat.onItems((arrived) => {
        if (shownRef.current.kind !== 'session' || shownRef.current.id !== arrived.id) return
        setItems((held) => {
          const kept = new Map(held.map((item) => [item.id, item]))
          for (const item of arrived.items) {
            if (item.kind !== 'mine') continue
            const mine = [...kept.values()].find((one) => one.kind === 'mine' && one.id.startsWith('sending:') && one.text === item.text)
            if (mine !== undefined) kept.delete(mine.id)
          }
          for (const id of arrived.gone ?? []) kept.delete(id)
          for (const item of arrived.items) kept.set(item.id, item)
          return [...kept.values()]
        })
      }),
    [],
  )

  const open = useCallback((next: Shown) => {
    const before = shownRef.current
    shownRef.current = next
    setShown(next)
    setFocusSeed((seed) => seed + 1)
    if (next.kind === 'new') {
      setItems([])
      setItemsFor('new')
      window.geckit.chat.watching(undefined)
      return
    }
    setNotices((held) => held.filter((one) => one.session !== next.id))
    setEarlier({ id: next.id, left: 0 })
    // Another conversation's lines are not left up while this one is read.
    if (before.kind !== 'session' || before.id !== next.id) setItems([])
    window.geckit.chat.watching(next.id)
    void window.geckit.chat.items(next.id).then((read) => {
      if (shownRef.current.kind !== 'session' || shownRef.current.id !== next.id) return
      setItems(read)
      setItemsFor(next.id)
    })
  }, [])

  if (shown.kind === 'session' && !enabled.includes(providerOf(shown.id))) {
    setShown({ kind: 'new' })
    setItems([])
    setItemsFor('new')
  }
  useEffect(() => {
    const current = shownRef.current
    if (current.kind === 'session' && !enabled.includes(providerOf(current.id))) {
      shownRef.current = { kind: 'new' }
      window.geckit.chat.watching(undefined)
    }
  }, [enabled])

  // Nothing is watched while the window is behind something else.
  useEffect(() => {
    const said = (): void =>
      window.geckit.chat.watching(
        document.hasFocus() && shownRef.current.kind === 'session' ? shownRef.current.id : undefined,
      )
    window.addEventListener('focus', said)
    window.addEventListener('blur', said)
    return () => {
      window.removeEventListener('focus', said)
      window.removeEventListener('blur', said)
    }
  }, [])

  const session = useMemo(
    () =>
      shown.kind === 'new'
        ? undefined
        : (sessions.find((one) => one.id === shown.id) ?? questions.find((one) => one.id === shown.id)),
    [shown, sessions, questions],
  )

  // Where a message goes: the project listed, or the one the open conversation belongs to.
  const root =
    scope === ALL
      ? (session?.root ??
        (started !== undefined && shownProjects(settings).includes(started) ? started : shownProjects(settings)[0]))
      : scope
  const rootRef = useRef(root)
  useEffect(() => {
    rootRef.current = root
  }, [root])

  const mode = session?.mode ?? settings.chatMode
  const transport: ClaudeTransport = 'stream'
  const nextChoice = shown.kind === 'session' ? nextChoices.get(shown.id) : undefined
  const model = nextChoice?.model ?? session?.chosen ?? (isCodexProvider(provider) ? session?.model ?? settings.codexModel : settings.chatModel)
  const wantedReasoning = nextChoice?.reasoning ?? session?.reasoning ?? settings.codexReasoning
  const catalog: readonly ClaudeModel[] | undefined = Array.isArray(models.said) && models.on.startsWith(`${provider}:`) ? models.said : undefined
  const reasoningModel = catalog?.find((one) => one.value === (model || session?.model)) ?? catalog?.find((one) => one.isDefault)
  const reasoning = wantedReasoning !== '' && reasoningModel?.reasoning !== undefined && !reasoningModel.reasoning.some((one) => one.value === wantedReasoning) ? '' : wantedReasoning
  const working = session?.state === 'working' || session?.state === 'asks'

  useEffect(() => {
    if (!isCodexProvider(provider) || (root !== undefined && isRemote(root))) return
    let current = true
    const on = `${provider}:`
    void window.geckit.chat.models(root, provider).then((said) => {
      if (current) setModels({ on, said: said ?? 'unsaid' })
    })
    return () => { current = false }
  }, [provider, root])
  const draft = drafts[keyOf(shown)] ?? ''

  // What Send needs, kept where a callback can read it without being made
  // again: a callback made again on every keystroke draws the whole
  // conversation again with it.
  const held = useRef({ drafts, pictures, mode, model, provider, reasoning, settings })
  useEffect(() => {
    held.current = { drafts, pictures, mode, model, provider, reasoning, settings }
  }, [drafts, pictures, mode, model, provider, reasoning, settings])

  const setDraft = useCallback(
    (text: string) => setDrafts((held) => ({ ...held, [keyOf(shownRef.current)]: text })),
    [],
  )

  // A turn that ended by itself, on an error or the plan's limit, is not one to send the next message into: it comes back to the field, ahead of what is typed there. The ones behind it keep their place in the queue, each its own message still. After Stop the queue carries on by itself, so nothing is taken out of it here.
  const taken = useRef(new Set<string>())
  useEffect(() => {
    const id = session?.id
    if (id === undefined) return
    if (working) {
      taken.current.delete(id)
      return
    }
    if (session?.state !== 'failed' && session?.state !== 'limit') return
    // One only, however many are waiting: the next is not pulled out too by the update the first one causes.
    if (taken.current.has(id)) return
    const first = session?.queued?.[0]
    if (first === undefined) return
    taken.current.add(id)
    void window.geckit.chat.unqueue(id, first.id).then((message) => {
      if (message === undefined) return
      setDrafts((all) => ({ ...all, [id]: [message.text, all[id] ?? ''].filter((text) => text.trim() !== '').join('\n\n') }))
      const images = message.images ?? []
      if (images.length > 0) setPictures((all) => ({ ...all, [id]: [...images, ...(all[id] ?? [])] }))
    })
  }, [session, working])

  // A path typed into the field, once known: quoted if it has a space in it, added after what is already there.
  const addPath = (key: string, path: string): void => {
    const quoted = path.includes(' ') ? `"${path}"` : path
    setDrafts((held) => {
      const now = held[key] ?? ''
      return { ...held, [key]: `${now}${now === '' || now.endsWith(' ') ? '' : ' '}${quoted} ` }
    })
  }

  const addFiles = useCallback((files: readonly File[]) => {
    const dropped = files.filter((one) => !canShow(one))
    let copying = false
    if (dropped.length > 0) {
      const where = rootRef.current
      const key = keyOf(shownRef.current)
      for (const one of dropped) {
        const local = window.geckit.pathFor(one)
        if (local === '') continue
        // What was dropped is a path on this computer; a host cannot read it, so it is copied there first.
        if (where === undefined || !isRemote(where)) {
          addPath(key, local)
          continue
        }
        const busy = `Copying ${one.name} to ${hostName(where) ?? where}...`
        const count = (by: number): void => setUploads((held) => ({ ...held, [key]: Math.max(0, (held[key] ?? 0) + by) }))
        copying = true
        count(1)
        setTrouble(busy)
        void window.geckit.chat
          .upload(where, local)
          .catch(() => ({ problem: `Could not copy ${one.name}.` }))
          .then((landed) => {
            count(-1)
            if ('problem' in landed) {
              setTrouble(landed.problem)
              return
            }
            setTrouble((now) => (now === busy ? '' : now))
            addPath(key, landed.path)
          })
      }
    }

    const wanted = files.filter(canShow)
    if (wanted.length === 0) return
    // A copy under way keeps its line; only a drop of pictures alone starts from a clean one.
    if (!copying) setTrouble('')
    void Promise.all(wanted.map((file) => asImage(file).catch(() => undefined))).then((read) => {
      const kept = read.filter((one): one is SessionImage => one !== undefined)
      if (kept.length < wanted.length) setTrouble('A picture was too big to send')
      if (kept.length === 0) return
      const key = keyOf(shownRef.current)
      setPictures((held) => ({ ...held, [key]: [...(held[key] ?? []), ...kept].slice(0, MOST_PICTURES) }))
    })
  }, [])

  const dropPicture = useCallback((at: number) => {
    const key = keyOf(shownRef.current)
    setPictures((held) => ({ ...held, [key]: (held[key] ?? []).filter((_one, index) => index !== at) }))
  }, [])

  const listing = useCallback(
    (next: readonly string[]) => {
      setPicked(next)
      chosenRef.current = next
      change({ chatAll: next.length === 0, chatProjects: next })
      shownRef.current = { kind: 'new' }
      setShown({ kind: 'new' })
      setItems([])
      setItemsFor('new')
      window.geckit.chat.watching(undefined)
    },
    [change],
  )

  const setScope = useCallback((next: string) => listing(next === ALL ? [] : [next]), [listing])

  const alsoScope = useCallback(
    (root: string) => listing(chosenRef.current.includes(root) ? chosenRef.current.filter((one) => one !== root) : [...chosenRef.current, root]),
    [listing],
  )

  const send = useCallback(
    (again?: string, said?: string) => {
      const where = rootRef.current
      const key = keyOf(shownRef.current)
      const now = held.current
      // Words given here, as Continue gives them, go without touching what is typed in the field.
      const text = said ?? now.drafts[key] ?? ''
      const carried = said === undefined ? (now.pictures[key] ?? []) : []
      // The path of a file still on its way to the host is not in the words yet; it goes once it is.
      if (said === undefined && (uploadsRef.current[key] ?? 0) > 0) return
      if (where === undefined || (again === undefined && text.trim() === '' && carried.length === 0)) return
      // A message that starts with ! is a command for the project folder, as in the terminal.
      const command = again === undefined && said === undefined && text.trim().startsWith('!') ? text.trim().slice(1).trim() : undefined
      if (command !== undefined) {
        if (command === '') return
        setDraft('')
        setTrouble('')
        void window.geckit.chat
          .shell({ ...(shownRef.current.kind === 'session' ? { session: shownRef.current.id } : {}), provider: now.provider, root: where, command })
          .then((id) => {
            if (shownRef.current.kind === 'session' && shownRef.current.id === id) return
            open({ kind: 'session', id })
          })
          .catch((error: Error) => {
            setDrafts((all) => ({ ...all, [key]: text }))
            setTrouble(error.message)
          })
        return
      }
      if (said === undefined) {
        setDraft('')
        setPictures((all) => ({ ...all, [key]: [] }))
      }
      setTrouble('')
      const into = shownRef.current
      const shownNow = `sending:${String(sending.current++)}`
      if (into.kind === 'session' && again === undefined) {
        setItems((held) => [...held, { kind: 'mine', id: shownNow, text, ...(carried.length === 0 ? {} : { images: carried }), at: Date.now() }])
      }
      const unshow = (): void => setItems((held) => held.filter((one) => one.id !== shownNow))
      void window.geckit.chat
        .send({
          ...(into.kind === 'session' ? { session: into.id } : {}),
          root: where,
          provider: now.provider,
          ...(!isCodexProvider(now.provider) ? {} : { reasoning: now.reasoning }),
          mode: now.mode,
          text,
          ...(carried.length === 0 ? {} : { images: carried }),
          ...(now.model === '' ? {} : { model: now.model }),
          ...(again === undefined ? {} : { again }),
        })
        .then(
          (id) => {
            // What the Mac made of it has been told by now, unless it went into the queue or became something else.
            setTimeout(unshow, SHOWN_FOR)
            if (shownRef.current.kind === 'session' && shownRef.current.id === id) return
            open({ kind: 'session', id })
          },
          (error: Error) => {
            unshow()
            if (said === undefined) {
              setDrafts((all) => ({ ...all, [key]: text }))
              setPictures((all) => ({ ...all, [key]: carried }))
            }
            setTrouble(ON_PHONE ? 'Not sent: the host could not be reached' : error.message)
          },
        )
    },
    [open, setDraft],
  )

  const ask = useCallback(
    (text: string, images: readonly SessionImage[] = []) => {
      const now = held.current
      const provider = assistantFor(now.settings)
      return window.geckit.chat
        .send({
          root: '',
          provider,
          ...(!isCodexProvider(provider) ? {} : { reasoning: now.settings.codexReasoning }),
          mode: now.mode,
          text,
          question: true,
          ...(images.length === 0 ? {} : { images }),
          ...((isCodexProvider(provider) ? now.settings.codexModel : now.settings.chatModel) === '' ? {} : { model: isCodexProvider(provider) ? now.settings.codexModel : now.settings.chatModel }),
        })
        .then((id) => open({ kind: 'session', id }))
    },
    [open],
  )

  const startTask = useCallback(
    (root: string, text: string, goal: string, images: readonly SessionImage[] = []) => {
      const now = held.current
      const provider = assistantFor(now.settings, root)
      const chosen = isCodexProvider(provider) ? now.settings.codexModel : now.settings.chatModel
      const model = chosen === '' ? {} : { model: chosen }
      const carried = images.length === 0 ? {} : { images }
      return window.geckit.chat.send({ root, provider, ...(!isCodexProvider(provider) ? {} : { reasoning: now.settings.codexReasoning }), mode: now.mode, text, ...carried, ...model, ...(isCodexProvider(provider) && goal.trim() !== '' ? { goal: goal.trim() } : {}) }).then((id) => {
        open({ kind: 'session', id })
        if (isCodexProvider(provider) || goal.trim() === '') return
        void window.geckit.chat.send({ session: id, root, mode: now.mode, text: `/goal ${goal.trim()}`, ...model })
      })
    },
    [open],
  )

  const showEarlier = useCallback(() => {
    const now = shownRef.current
    if (now.kind !== 'session') return
    const first = itemsRef.current[0]
    if (first === undefined) return
    void window.geckit.chat.before(now.id, first.id).then((piece) => {
      if (shownRef.current.kind !== 'session' || shownRef.current.id !== now.id) return
      setItems((held) => {
        const have = new Set(held.map((one) => one.id))
        return [...piece.items.filter((one) => !have.has(one.id)), ...held]
      })
      setEarlier({ id: now.id, left: piece.left })
    })
  }, [])

  const loadSteps = useCallback((run: Extract<SessionItem, { kind: 'steps' }>) => {
    const now = shownRef.current
    if (now.kind !== 'session') return
    void window.geckit.chat.steps(now.id, run.ids).then((found) => {
      if (shownRef.current.kind !== 'session' || shownRef.current.id !== now.id) return
      setItems((held) => held.flatMap((one) => (one.id === run.id ? found : [one])))
    })
  }, [])

  const stopShell = useCallback((item: string) => {
    if (shownRef.current.kind === 'session') window.geckit.chat.stopShell(shownRef.current.id, item)
  }, [])

  const typeShell = useCallback((item: string, text: string) => {
    if (shownRef.current.kind === 'session') window.geckit.chat.typeShell(shownRef.current.id, item, text)
  }, [])

  const toBackground = useCallback((item: string) => {
    if (shownRef.current.kind === 'session') window.geckit.chat.toBackground(shownRef.current.id, item)
  }, [])

  const stopTask = useCallback((task: string) => {
    if (shownRef.current.kind === 'session') window.geckit.chat.stopTask(shownRef.current.id, task)
  }, [])

  const [tasksShown, showTasks] = useState(false)
  const [compacting, setCompacting] = useState<'typed' | 'clicked' | undefined>()

  const clearTask = useCallback((task: string) => {
    if (shownRef.current.kind === 'session') window.geckit.chat.clearTask(shownRef.current.id, task)
  }, [])

  const answer = useCallback((card: string, said: CardAnswer | string) => {
    if (shownRef.current.kind !== 'session') return
    window.geckit.chat.answer(shownRef.current.id, card, said)
  }, [])

  // What the rows in the sidebar are given. Made once, so that typing in the
  // field draws the field and nothing else.
  const show = useCallback(
    (one: ChatSession) => {
      // Opened from somewhere the list does not show: that project joins the ones it does.
      if (chosenRef.current.length > 0 && !chosenRef.current.includes(homeOf(one))) {
        const next = [...chosenRef.current, homeOf(one)]
        chosenRef.current = next
        setPicked(next)
      }
      open({ kind: 'session', id: one.id })
    },
    [open],
  )

  const goTo = useCallback(
    (id: string) => {
      const found = everyoneRef.current.find((one) => one.id === id)
      if (found !== undefined) {
        show(found)
        return
      }
      // Asked for before the list was read, as when a notification opens the window.
      void window.geckit.chat.list(undefined).then((all) => {
        const listed = all.find((one) => one.id === id)
        if (listed === undefined) open({ kind: 'session', id })
        else show(listed)
      })
    },
    [open, show],
  )

  useEffect(() => window.geckit.chat.onShow(goTo), [goTo])

  const dismiss = useCallback((session: string) => setNotices((held) => held.filter((one) => one.session !== session)), [])

  const waiting = useMemo(
    () => [...everyone.filter((one) => one.state === 'asks'), ...everyone.filter((one) => one.state === 'unread')],
    [everyone],
  )

  const rename = useCallback((id: string, title: string) => window.geckit.chat.rename(id, title), [])
  const mark = useCallback((id: string, status: SessionStatus | undefined) => window.geckit.chat.mark(id, status), [])

  const hide = useCallback(
    (id: string) => {
      window.geckit.chat.hide(id)
      if (shownRef.current.kind === 'session' && shownRef.current.id === id) open({ kind: 'new' })
    },
    [open],
  )

  const keep = useCallback((id: string, stays: boolean) => window.geckit.chat.keep(id, stays), [])

  const remove = useCallback(
    (ids: readonly string[]) => {
      void window.geckit.chat.remove(ids).then((gone) => {
        const shownNow = shownRef.current
        if (shownNow.kind === 'session' && gone.includes(shownNow.id)) open({ kind: 'new' })
      })
    },
    [open],
  )

  const terminal = useCallback((id: string) => {
    const where = sessionsRef.current.find((one) => one.id === id)?.root ?? rootRef.current
    if (where !== undefined) window.geckit.chat.terminal(id, where)
  }, [])

  const copyTerminal = useCallback((id: string) => {
    const where = sessionsRef.current.find((one) => one.id === id)?.root ?? rootRef.current
    if (where === undefined) return Promise.resolve(false)
    // On a host, the line a local terminal would type is that host's own; nothing here says `cd` into an address ssh does not read.
    const command = resumeCommand(id)
    const line =
      hostOf(where) === undefined
        ? Promise.resolve<string | undefined>(command === undefined ? undefined : `cd ${JSON.stringify(where)} && ${command}`)
        : window.geckit.hosts.resumeLine(where, id)
    // Handed over only once the line is on the clipboard: a host out of reach gives none, and the conversation stays here.
    return line
      .then(async (said) => {
        if (said === undefined) {
          setTrouble(`Could not reach ${hostName(where) ?? where} for the line that continues it`)
          return false
        }
        await navigator.clipboard.writeText(said)
        window.geckit.chat.handOver(id)
        return true
      })
      .catch(() => false)
  }, [])

  const startNew = useCallback(() => open({ kind: 'new' }), [open])

  return {
    settings,
    hosts,
    prompts,
    lineup,
    full: lineup.limit !== 0 && lineup.working >= lineup.limit,
    change,
    root,
    scope,
    sessions,
    listed,
    earlier: shown.kind === 'session' && earlier.id === shown.id ? earlier.left : 0,
    showEarlier,
    loadSteps,
    everyone,
    questions,
    waiting,
    notices: visibleNotices,
    shown,
    session,
    items,
    itemsFor,
    draft,
    pictures: pictures[keyOf(shown)] ?? NONE,
    trouble,
    uploading: (uploads[keyOf(shown)] ?? 0) > 0,
    account: (account?.provider ?? 'claude') === provider ? account : undefined,
    plan,
    plans,
    plansAt,
    models: models.on === `${provider}:${root === undefined ? '' : hostOf(root) ?? ''}` ? models.said : 'unasked',
    mode,
    transport,
    provider,
    showProviders: enabled.length > 1,
    reasoning,
    setReasoning: (next) => {
      change({ codexReasoning: next })
      if (shownRef.current.kind === 'session') {
        const id = shownRef.current.id
        setNextChoices((all) => new Map(all).set(id, { ...all.get(id), reasoning: next }))
      }
    },
    model,
    working,
    focusSeed,
    chosen,
    setScope,
    alsoScope,
    choose: listing,
    setRoot: (next) => {
      if (scopeRef.current === ALL) setStarted(next)
      else setScope(next)
      setFocusSeed((seed) => seed + 1)
    },
    addProject: () => {
      void window.geckit.chat.addProject().then((picked) => {
        if (picked !== undefined) setScope(picked)
      })
    },
    forgetProject: (which) => {
      void window.geckit.chat.forgetProject(which)
      if (which === scopeRef.current) setScope(shownProjects(settings).find((one) => one !== which) ?? ALL)
    },
    open,
    show,
    goTo,
    dismiss,
    startNew,
    setDraft,
    addFiles,
    dropPicture,
    setMode: (next) => {
      change({ chatMode: next })
      if (shownRef.current.kind === 'session') {
        const id = keyOf(shownRef.current)
        setSessions((all) => all.map((one) => (one.id === id ? { ...one, mode: next } : one)))
        window.geckit.chat.mode(id, next)
      }
    },
    setModel: (next) => {
      change(isCodexProvider(provider) ? { codexModel: next, codexReasoning: '' } : { chatModel: next })
      if (shownRef.current.kind === 'session') {
        const id = shownRef.current.id
        setNextChoices((all) => new Map(all).set(id, { ...all.get(id), model: next, ...(isCodexProvider(provider) ? { reasoning: '' } : {}) }))
      }
    },
    setProvider: (next) => {
      if (shownRef.current.kind === 'new' && enabled.includes(next)) change({ chatProvider: next })
    },
    // Asked at every opening: main keeps the answer, and asks Claude Code again once another version of it answers. On a host it is that host's models, not this computer's.
    askModels: (root) => {
      const where = root ?? rootRef.current
      const on = `${provider}:${where === undefined ? '' : hostOf(where) ?? ''}`
      setModels((held) => (held.on === on && Array.isArray(held.said) ? held : { on, said: 'asking' }))
      // An answer for a Claude Code asked about before another was is not this one's, and is let go.
      void window.geckit.chat
        .models(where, provider)
        .then((said) => setModels((held) => (held.on !== on ? held : { on, said: said ?? (Array.isArray(held.said) ? held.said : 'unsaid') })))
        .catch(() => setModels((held) => held.on !== on ? held : { on, said: Array.isArray(held.said) ? held.said : 'unsaid' }))
      void readAccount(provider).then(setAccount, () => undefined)
    },
    send,
    ask,
    startTask,
    say: (text: string) => {
      const where = rootRef.current
      if (where === undefined || shownRef.current.kind !== 'session') return
      const now = held.current
      void window.geckit.chat.send({
        session: shownRef.current.id,
        root: where,
        mode: now.mode,
        ...(!isCodexProvider(now.provider) ? {} : { reasoning: now.reasoning }),
        text,
        ...(now.model === '' ? {} : { model: now.model }),
      }).catch((error: Error) => setTrouble(error.message))
    },
    answer,
    stop: () => {
      if (shownRef.current.kind !== 'session') return
      window.geckit.chat.stop(shownRef.current.id)
    },
    unqueue: (queued) => {
      if (shownRef.current.kind === 'session') void window.geckit.chat.unqueue(shownRef.current.id, queued)
    },
    requeue: (queued, text) => {
      if (shownRef.current.kind === 'session') window.geckit.chat.requeue(shownRef.current.id, queued, text)
    },
    reorderQueued: (queued, target, after) => {
      if (shownRef.current.kind === 'session') window.geckit.chat.reorderQueued(shownRef.current.id, queued, target, after)
    },
    delegate: (queued, history) => {
      if (shownRef.current.kind !== 'session') return
      void window.geckit.chat.delegate(shownRef.current.id, queued, history).then((id) => {
        if (id !== undefined) open({ kind: 'session', id })
      })
    },
    stopShell,
    typeShell,
    toBackground,
    stopTask,
    clearTask,
    tasksShown,
    showTasks,
    compacting,
    setCompacting,
    rename,
    mark,
    hide,
    keep,
    remove,
    terminal,
    copyTerminal,
    refresh,
  }
}
