import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  CardAnswer,
  ChatSession,
  ClaudeAccount,
  ModelsSaid,
  PlanUsage,
  SessionImage,
  SessionItem,
  SessionMode,
  SessionNotice,
  SessionStatus,
} from '../../../shared/api'
import { resumeCommand, shownProjects } from '../../../shared/api'
import { asImage, canShow } from '../pictures'
import { useSettings } from '../settings'
import type { Settings } from '../../../shared/api'

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
const keyOf = (shown: Shown): string => (shown.kind === 'new' ? NEW : shown.id)

export interface Chat {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
  readonly root: string | undefined
  /** Whose conversations are listed: one project's, or `ALL`. */
  readonly scope: string
  readonly sessions: readonly ChatSession[]
  /** Every project's conversations, whichever is listed. */
  readonly everyone: readonly ChatSession[]
  /** General questions still open, newest first; each is gone two minutes after its last answer. */
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
  readonly draft: string
  /** Pictures pasted or dropped into the field, waiting to go with the message. */
  readonly pictures: readonly SessionImage[]
  /** Said when something was pasted that cannot be sent. */
  readonly trouble: string
  readonly account: ClaudeAccount | undefined
  /** How much of the plan is spent, once a turn has said. */
  readonly plan: PlanUsage | undefined
  readonly models: ModelsSaid
  /** The mode and model the next message goes with, on a new session or an old one. */
  readonly mode: SessionMode
  readonly model: string
  readonly working: boolean
  /** Bumped when the composer should take the caret. */
  readonly focusSeed: number
  /** Every project's conversations are listed while this is empty. */
  readonly chosen: readonly string[]
  setScope: (scope: string) => void
  /** That project in the list beside the others already there, or out of it. */
  alsoScope: (root: string) => void
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
  askModels: () => void
  send: (again?: string, said?: string) => void
  /** A general question, in no project, which the board and the list never show. */
  ask: (text: string, images?: readonly SessionImage[]) => void
  /** A new conversation from the board's form: the work goes first, then the goal. */
  startTask: (root: string, text: string, goal: string, images?: readonly SessionImage[]) => void
  /** Words sent to the open conversation as they are, the field left alone: `/compact`, `/goal clear`. */
  say: (text: string) => void
  answer: (card: string, answer: CardAnswer | string) => void
  stop: () => void
  /** Cancels a message sent while Claude worked, before it goes. */
  unqueue: (queued: string) => void
  /** A message waiting in the queue, said again in other words. */
  requeue: (queued: string, text: string) => void
  /** Starts a message waiting in the queue as a new conversation of its own. */
  delegate: (queued: string) => void
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
  /** Throws the conversations away for good. The window asks before this is called. */
  remove: (ids: readonly string[]) => void
  terminal: (id: string) => void
  /** Puts the command that continues it in a terminal on the clipboard, and lets go of it here. */
  copyTerminal: (id: string) => void
  refresh: () => void
}

export function useChat(): Chat {
  const [settings, change] = useSettings()
  const [picked, setPicked] = useState<readonly string[] | undefined>()
  const [started, setStarted] = useState<string | undefined>()
  const [sessions, setSessions] = useState<readonly ChatSession[]>([])
  const [everyone, setEveryone] = useState<readonly ChatSession[]>([])
  const [questions, setQuestions] = useState<readonly ChatSession[]>([])
  const [notices, setNotices] = useState<readonly SessionNotice[]>([])
  const [shown, setShown] = useState<Shown>({ kind: 'new' })
  const [items, setItems] = useState<readonly SessionItem[]>([])
  const [itemsFor, setItemsFor] = useState('new')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pictures, setPictures] = useState<Record<string, readonly SessionImage[]>>({})
  const [trouble, setTrouble] = useState('')
  const [account, setAccount] = useState<ClaudeAccount | undefined>()
  const [plan, setPlan] = useState<PlanUsage | undefined>()
  const [models, setModels] = useState<ModelsSaid>('unasked')
  const [focusSeed, setFocusSeed] = useState(0)
  // The projects the list shows, kept from last time. None of them is every one of the profile's.
  const chosen = useMemo<readonly string[]>(() => {
    const shown = shownProjects(settings)
    const kept = picked ?? settings.chatProjects ?? (settings.chatAll || shown[0] === undefined ? [] : [shown[0]])
    return kept.filter((one) => shown.includes(one))
  }, [picked, settings])
  // One project is a scope the rest of the window understands; several are every project, narrowed.
  const scope = chosen.length === 1 ? (chosen[0] ?? ALL) : ALL

  const shownRef = useRef(shown)
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
    one.question !== true && (chosenRef.current.length === 0 || chosenRef.current.includes(one.root))

  const refresh = useCallback(() => {
    const one = chosenRef.current.length === 1 ? chosenRef.current[0] : undefined
    void window.geckit.chat.list(one).then((all) => {
      setSessions(all.filter(within))
      // Asked for every project, this is every project: the counts are made from the same answer.
      if (one === undefined) setEveryone(all.filter((session) => session.question !== true))
    })
  }, [])

  // Another profile changes what the list may hold, with the scope itself unmoved.
  useEffect(refresh, [refresh, scope, chosen.join('\n'), shownProjects(settings).join('\n')])

  useEffect(() => {
    void window.geckit.chat.account().then(setAccount)
    return window.geckit.chat.onAccount(setAccount)
  }, [])

  // Asking has the plan measured again, so it is asked for on opening, on
  // coming to the front, and every few minutes while the window is seen.
  useEffect(() => {
    const ask = (): void => {
      if (document.visibilityState === 'visible') void window.geckit.chat.plan().then(setPlan)
    }
    ask()
    const every = setInterval(ask, PLAN_EVERY)
    window.addEventListener('focus', ask)
    const off = window.geckit.chat.onPlan(setPlan)
    return () => {
      clearInterval(every)
      window.removeEventListener('focus', ask)
      off()
    }
  }, [])

  useEffect(() => {
    void window.geckit.chat.list(undefined).then((all) => setEveryone(all.filter((one) => one.question !== true)))
    let asked = new Set<string>()
    return window.geckit.chat.onSessions((all) => {
      setSessions(all.filter(within))
      setEveryone(all.filter((one) => one.question !== true))
      const now = all.filter((one) => one.question === true)
      setQuestions(now)
      // A question ended after two quiet minutes is gone, and so is its view.
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
      window.geckit.chat.onItems((arrived) => {
        if (shownRef.current.kind !== 'session' || shownRef.current.id !== arrived.id) return
        setItems((held) => {
          const kept = new Map(held.map((item) => [item.id, item]))
          for (const id of arrived.gone ?? []) kept.delete(id)
          for (const item of arrived.items) kept.set(item.id, item)
          return [...kept.values()]
        })
      }),
    [],
  )

  const open = useCallback((next: Shown) => {
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
    window.geckit.chat.watching(next.id)
    void window.geckit.chat.items(next.id).then((read) => {
      if (shownRef.current.kind !== 'session' || shownRef.current.id !== next.id) return
      setItems(read)
      setItemsFor(next.id)
    })
  }, [])

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
  const model = session?.chosen ?? settings.chatModel
  const working = session?.state === 'working' || session?.state === 'asks'
  const draft = drafts[keyOf(shown)] ?? ''

  // What Send needs, kept where a callback can read it without being made
  // again: a callback made again on every keystroke draws the whole
  // conversation again with it.
  const held = useRef({ drafts, pictures, mode, model })
  useEffect(() => {
    held.current = { drafts, pictures, mode, model }
  }, [drafts, pictures, mode, model])

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

  const addFiles = useCallback((files: readonly File[]) => {
    const paths = files
      .filter((one) => !canShow(one))
      .map((one) => window.geckit.pathFor(one))
      .filter((path) => path !== '')
      .map((path) => (path.includes(' ') ? `"${path}"` : path))
    if (paths.length > 0) {
      setDrafts((held) => {
        const key = keyOf(shownRef.current)
        const now = held[key] ?? ''
        return { ...held, [key]: `${now}${now === '' || now.endsWith(' ') ? '' : ' '}${paths.join(' ')} ` }
      })
    }

    const wanted = files.filter(canShow)
    if (wanted.length === 0) return
    setTrouble('')
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
      if (where === undefined || (again === undefined && text.trim() === '' && carried.length === 0)) return
      // A message that starts with ! is a command for the project folder, as in the terminal.
      const command = again === undefined && said === undefined && text.trim().startsWith('!') ? text.trim().slice(1).trim() : undefined
      if (command !== undefined) {
        if (command === '') return
        setDraft('')
        setTrouble('')
        void window.geckit.chat
          .shell({ ...(shownRef.current.kind === 'session' ? { session: shownRef.current.id } : {}), root: where, command })
          .then((id) => {
            if (shownRef.current.kind === 'session' && shownRef.current.id === id) return
            open({ kind: 'session', id })
          })
        return
      }
      if (said === undefined) {
        setDraft('')
        setPictures((all) => ({ ...all, [key]: [] }))
      }
      setTrouble('')
      void window.geckit.chat
        .send({
          ...(shownRef.current.kind === 'session' ? { session: shownRef.current.id } : {}),
          root: where,
          mode: now.mode,
          text,
          ...(carried.length === 0 ? {} : { images: carried }),
          ...(now.model === '' ? {} : { model: now.model }),
          ...(again === undefined ? {} : { again }),
        })
        .then(
          (id) => {
            if (shownRef.current.kind === 'session' && shownRef.current.id === id) return
            open({ kind: 'session', id })
          },
          // Only the phone's link can fail on the way: what was written goes back where it was written.
          () => {
            if (said === undefined) {
              setDrafts((all) => ({ ...all, [key]: text }))
              setPictures((all) => ({ ...all, [key]: carried }))
            }
            setTrouble('Not sent: the Mac could not be reached')
          },
        )
    },
    [open, setDraft],
  )

  const ask = useCallback(
    (text: string, images: readonly SessionImage[] = []) => {
      const now = held.current
      void window.geckit.chat
        .send({
          root: '',
          mode: now.mode,
          text,
          question: true,
          ...(images.length === 0 ? {} : { images }),
          ...(now.model === '' ? {} : { model: now.model }),
        })
        .then((id) => open({ kind: 'session', id }))
    },
    [open],
  )

  // The goal goes first and the work after it, so it holds from the first turn rather than from the second.
  const startTask = useCallback(
    (root: string, text: string, goal: string, images: readonly SessionImage[] = []) => {
      const now = held.current
      const model = now.model === '' ? {} : { model: now.model }
      // The task goes first: a goal on its own tells Claude to start working toward it, and it would start without knowing what the task is.
      const carried = images.length === 0 ? {} : { images }
      void window.geckit.chat.send({ root, mode: now.mode, text, ...carried, ...model }).then((id) => {
        open({ kind: 'session', id })
        if (goal === '') return
        void window.geckit.chat.send({ session: id, root, mode: now.mode, text: `/goal ${goal}`, ...model })
      })
    },
    [open],
  )

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
      if (chosenRef.current.length > 0 && !chosenRef.current.includes(one.root)) {
        const next = [...chosenRef.current, one.root]
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
    if (where === undefined) return
    void navigator.clipboard.writeText(`cd ${JSON.stringify(where)} && ${resumeCommand(id)}`)
    window.geckit.chat.handOver(id)
  }, [])

  const startNew = useCallback(() => open({ kind: 'new' }), [open])

  return {
    settings,
    change,
    root,
    scope,
    sessions,
    everyone,
    questions,
    waiting,
    notices,
    shown,
    session,
    items,
    itemsFor,
    draft,
    pictures: pictures[keyOf(shown)] ?? NONE,
    trouble,
    account,
    plan,
    models,
    mode,
    model,
    working,
    focusSeed,
    chosen,
    setScope,
    alsoScope,
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
      change({ chatModel: next })
      if (shownRef.current.kind === 'session') {
        setSessions((all) =>
          all.map((one) => (one.id === keyOf(shownRef.current) ? { ...one, chosen: next } : one)),
        )
      }
    },
    askModels: () => {
      if (models !== 'unasked' && models !== 'unsaid') return
      setModels('asking')
      void window.geckit.chat.models().then((said) => setModels(said ?? 'unsaid'))
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
        text,
        ...(now.model === '' ? {} : { model: now.model }),
      })
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
    delegate: (queued) => {
      if (shownRef.current.kind === 'session') void window.geckit.chat.delegate(shownRef.current.id, queued)
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
    remove,
    terminal,
    copyTerminal,
    refresh,
  }
}
