import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ChatSession, SessionItem, SessionItems, Settings } from '../../../shared/api'
import { columnOf } from '../../../shared/api'
import type { ManagerDecision, ManagerThread, ManagerView } from '../../../shared/manager'
import { MANAGER_MAIN_THREAD } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { updatedItems } from '../../../shared/transcript-items'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Files } from './Prose'
import { Transcript } from './Transcript'
import { ManagerHistory } from './ManagerHistory'
import { ManagerComposer, NEW_CONVERSATION } from './ManagerComposer'
import { managerAssistant } from './manager-label'
import { ago } from './time'

interface InspectionRead extends Pick<SessionItems, 'id' | 'items'> { readonly attempt: number; readonly left: number }
const EMPTY: readonly SessionItem[] = []
const noop = (): void => undefined

function Decision({ decision, session, disabled }: { readonly decision: ManagerDecision; readonly session: string; readonly disabled: boolean }): React.JSX.Element {
  const [sending, setSending] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const answer = (choice: string): void => {
    if (pending.current || disabled) return
    pending.current = true
    setSending(true)
    setError('')
    void window.geckit.manager.answer({ session, id: decision.id, choice }).then((result) => { setError(result.answer === 'This request is no longer pending. Use /status to see current requests.' ? 'This request is no longer pending.' : result.answer) }, (caught: Error) => { setError(caught.message) }).finally(() => { pending.current = false; setSending(false) })
  }
  return <div className="card manager-decision"><div className="card-title">{decision.title}</div>{decision.choices.length === 0 ? <p>Open GeckIt on your computer to answer this request.</p> : <div className="card-actions">{decision.choices.map((choice) => <button key={choice.value} type="button" className="quiet" disabled={disabled || sending} onClick={() => answer(choice.value)}>{choice.label}</button>)}</div>}{error === '' ? null : <p role="status">{error}</p>}</div>
}

const History = memo(function History({ view, connected, onReady }: { readonly view: ManagerView; readonly connected: boolean; readonly onReady: (id: string, ready: boolean) => void }): React.JSX.Element {
  const [read, setRead] = useState<InspectionRead>()
  const [failure, setFailure] = useState<Pick<InspectionRead, 'id' | 'attempt'> & { readonly text: string }>()
  const [retry, setRetry] = useState(0)
  const [answerError, setAnswerError] = useState('')
  const answering = useRef(false)
  const id = view.session?.id
  useEffect(() => {
    if (id === undefined || !connected) return
    let here = true
    let loading = true
    const buffered: SessionItems[] = []
    const api = window.geckit.manager
    const off = api.onItems((items) => {
      if (!here || items.id !== id) return
      if (loading) buffered.push(items)
      else setRead((held) => held?.id !== id || held.attempt !== retry ? held : { ...held, items: updatedItems(held.items, [items]) })
    })
    void Promise.resolve().then(() => { if (here) onReady(id, false); return (api.turns === undefined ? Promise.reject(new Error('No pages.')) : api.turns(id)).catch(async () => ({ ...await api.inspect(id), left: 0 })) }).then((snapshot) => {
      if (!here || snapshot.id !== id) return
      loading = false
      setFailure(undefined)
      setRead({ id, attempt: retry, left: snapshot.left, items: updatedItems(snapshot.items, buffered) })
      onReady(id, true)
    }, (caught: Error) => { if (here) { loading = false; setFailure({ id, attempt: retry, text: caught.message }); onReady(id, false) } })
    return () => { here = false; off() }
  }, [id, retry, connected, onReady])
  const error = failure?.id === id && failure?.attempt === retry ? failure.text : ''
  const root = view.session?.root ?? ''
  const file = useCallback((path: string): void => { if (root !== '') window.geckit.chat.openFile(root, path) }, [root])
  const files = useMemo(() => ({ root, onFile: file }), [root, file])
  const answer = useCallback(async (card: string, value: string): Promise<boolean> => {
    if (answering.current || id === undefined || !connected || view.appChat !== true || !view.config.enabled || view.state === 'paused' || view.state === 'blocked') return false
    answering.current = true
    setAnswerError('')
    try {
      const accepted = await window.geckit.manager.answerCard(id, card, value)
      if (!accepted) setAnswerError('This request is no longer pending.')
      return accepted
    } catch (caught) { setAnswerError(caught instanceof Error ? caught.message : String(caught)); return false }
    finally { answering.current = false }
  }, [id, connected, view.appChat, view.config.enabled, view.state])
  const items = read !== undefined && read.id === id && read.attempt === retry ? read.items : EMPTY
  const left = read !== undefined && read.id === id && read.attempt === retry ? read.left : 0
  const first = items[0]?.id
  const earlier = useCallback(async (): Promise<void> => {
    const before = window.geckit.manager.before
    if (id === undefined || first === undefined || before === undefined) return
    const piece = await before(id, first)
    setRead((held) => held?.id !== id || held.items[0]?.id !== first ? held : { ...held, left: piece.left, items: [...piece.items, ...held.items] })
  }, [id, first])
  const disabled = !connected || view.appChat !== true || !view.config.enabled || view.state === 'paused' || view.state === 'blocked'
  if (error !== '' && items.length === 0) return <div className="manager-inspection-empty"><Icon name="blocked" size={20} /><p className="manager-error" role="alert">Could not load the Manager session.</p><p className="manager-inspection-hint">{error}</p><button type="button" className="quiet" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
  if (id !== undefined && (read === undefined || read.id !== id || read.attempt !== retry) && connected) return <div className="manager-inspection-empty" role="status"><Icon name="spinner" size={20} /><p>Loading the Manager session...</p></div>
  const footer = <>
    {items.length === 0 ? <div className="manager-inspection-empty"><Icon name="chat" size={20} /><p>What would you like Manager to do?</p></div> : null}
    {answerError === '' ? null : <p className="manager-answer-error" role="alert">{answerError}</p>}
    {view.decisions.length === 0 ? null : <div className="manager-decisions">{view.decisions.filter((decision) => !(decision.session === id && items.some((item) => item.kind === 'card' && item.id === decision.card))).map((decision) => <Decision key={decision.id} decision={decision} session={id ?? ''} disabled={disabled} />)}</div>}
    {(view.requests ?? []).every((request) => request.state === 'sent') ? null : <div className="manager-queued" aria-label="Queued messages">{view.requests?.filter((request) => request.state !== 'sent').map((request) => <div key={request.id}><p>{request.source === 'desktop' && request.text.startsWith('[User request]\n') ? request.text.slice('[User request]\n'.length) : request.text}</p><span>{request.state === 'queued' ? 'Queued' : 'Sending...'}</span></div>)}</div>}
  </>
  return <div className="manager-history"><Files value={files}><Transcript at={id ?? 'manager'} items={items} readOnly={disabled} manager working={view.state === 'working'} onAnswer={answer} onAgain={noop} onFile={file} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} footer={footer} earlier={left} onEarlier={earlier} /></Files></div>
})

/** What the window shows for one thread: its own session, requests, decisions and state, with Manager-wide off and paused kept. */
export function threadView(view: ManagerView, thread: ManagerThread | undefined): ManagerView {
  if (thread === undefined || thread.id === MANAGER_MAIN_THREAD && (view.threads ?? []).length === 0) return view
  const main = thread.id === MANAGER_MAIN_THREAD
  const { session: _session, error: _error, historyPending: _pending, historyRevision: _revision, ...rest } = view
  const session = main ? view.session : thread.conversation
  const error = main ? view.error : thread.error
  const state = view.state === 'off' || view.state === 'paused' || main && view.state === 'blocked' ? view.state : thread.state === 'failed' ? 'blocked' : thread.state === 'working' ? 'working' : 'idle'
  return { ...rest, historyRevision: thread.historyRevision, ...(thread.historyPending === undefined ? {} : { historyPending: thread.historyPending }), ...(session === undefined ? {} : { session }), ...(error === undefined ? {} : { error }), state, requests: (view.requests ?? []).filter((request) => request.session === thread.session), decisions: view.decisions.filter((decision) => (decision.thread ?? MANAGER_MAIN_THREAD) === thread.id) }
}

/** Those needing an answer first, then the newest. */
export function threadOrder(threads: readonly ManagerThread[]): readonly ManagerThread[] {
  return threads.toSorted((a, b) => Number(b.state === 'asks') - Number(a.state === 'asks') || b.at - a.at)
}

export const threadName = (thread: ManagerThread): string => thread.id === MANAGER_MAIN_THREAD ? 'GeckIt' : thread.title
export const threadFrom = (thread: ManagerThread): string => thread.id === MANAGER_MAIN_THREAD ? 'Manager chat' : thread.place === undefined ? 'GeckIt' : [thread.place, thread.from].filter((part) => part !== undefined && part !== '').join(' · ')

export function Threads({ threads, picked, workers, onPick, onNew }: { readonly threads: readonly ManagerThread[]; readonly picked: string; readonly workers: ManagerView['workers']; readonly onPick: (id: string) => void; readonly onNew?: (() => void) | undefined }): React.JSX.Element {
  return <nav className="manager-threads" aria-label="Manager threads">{onNew === undefined ? null : <button type="button" className="manager-thread manager-thread-new" onClick={onNew}><Icon name="compose" size={14} /><span className="manager-thread-text"><strong>New conversation</strong></span></button>}{threads.map((thread) => {
    const working = workers.filter((one) => one.state === 'working' && thread.owns.includes(one.id)).length
    return <button key={thread.id} type="button" className="manager-thread" aria-current={thread.id === picked ? 'true' : undefined} onClick={() => onPick(thread.id)}>
      <span className="manager-thread-text"><strong>{threadName(thread)}</strong><span>{threadFrom(thread)}</span></span>
      {thread.state === 'idle' ? null : <span className="manager-thread-dot" data-state={thread.state} aria-label={thread.state === 'asks' ? 'Needs your answer' : thread.state === 'failed' ? 'Stopped' : 'Working'} />}
      {working === 0 ? null : <span className="manager-thread-count" aria-label={`${String(working)} working`}>{working}</span>}
    </button>
  })}</nav>
}

const workSays = (one: ChatSession): string => [one.status === 'blocked' ? 'Blocked' : columnOf(one.status).title, one.stands].filter((part) => part !== '').join(' · ')

function Tasks({ thread, workers, connected, onOpen, inline = false }: { readonly thread: ManagerThread; readonly workers: ManagerView['workers']; readonly connected: boolean; readonly onOpen?: ((id: string) => void) | undefined; readonly inline?: boolean }): React.JSX.Element | null {
  const [anchor, setAnchor] = useState<DOMRect>()
  const [now, setNow] = useState(0)
  const [leaving, setLeaving] = useState<string>()
  const [error, setError] = useState('')
  const owns = workers.filter((one) => thread.owns.includes(one.id))
  if (owns.length === 0) return null
  const close = (): void => { setAnchor(undefined); setError('') }
  const stop = (id: string): void => {
    setLeaving(id)
    setError('')
    const last = owns.length === 1
    void window.geckit.manager.unfollow(thread.id, id).then(() => { if (last) document.querySelector<HTMLElement>('.manager-toolbar [aria-label="Details"]')?.focus() }, (caught: Error) => setError(caught.message)).finally(() => setLeaving(undefined))
  }
  return <>
    <button type="button" className={inline ? 'phone-nav-started' : 'manager-tasks'} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => { setNow(Date.now()); setAnchor(event.currentTarget.getBoundingClientRect()) }}>
      {owns.some((one) => one.state === 'asks') ? <span className="manager-thread-dot" data-state="asks" aria-label="Needs your answer" /> : null}
      {owns.length} {owns.length === 1 ? 'task' : 'tasks'}{inline ? null : <Icon name="down" size={10} />}
    </button>
    {anchor === undefined ? null : <Menu anchor={anchor} title="Tracked by this thread" autoFocus choices={[]} onPick={noop} onClose={close}>
      {owns.map((one) => <div key={one.id} className="manager-work-row">
        <button type="button" className="menu-item manager-work-open" disabled={onOpen === undefined} title={`${one.title}\n${workSays(one)}`} onClick={() => { close(); onOpen?.(one.id) }}>
          <span className="manager-thread-dot" data-state={one.state === 'asks' ? 'asks' : one.state === 'failed' ? 'failed' : one.state === 'working' ? 'working' : 'idle'} aria-hidden="true" />
          <span className="manager-work-text">
            <span className="manager-work-line"><span className="manager-work-title">{one.title}</span><time className="manager-work-at" dateTime={new Date(one.at).toISOString()}>{ago(one.at, now)}</time></span>
            <span className="manager-work-says">{workSays(one)}</span>
          </span>
        </button>
        <button type="button" className={`icon-button manager-work-stop${leaving === one.id ? ' is-leaving' : ''}`} aria-label={`Stop tracking ${one.title}`} title="Stop tracking" disabled={!connected || leaving !== undefined} onClick={() => stop(one.id)}><Icon name={leaving === one.id ? 'spinner' : 'unlink'} size={14} /></button>
      </div>)}
      {error === '' ? null : <p className="manager-work-error" role="alert">{error}</p>}
    </Menu>}
  </>
}

function Details({ rows }: { readonly rows: readonly (readonly [string, string])[] }): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect>()
  return <>
    <button type="button" className="icon-button" aria-label="Details" title="Details" aria-haspopup="dialog" aria-expanded={anchor !== undefined} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}><Icon name="info" /></button>
    {anchor === undefined ? null : <Menu anchor={anchor} title="Details" choices={[]} onPick={noop} onClose={() => setAnchor(undefined)}>
      <dl className="manager-details in-menu">{rows.map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}</dl>
    </Menu>}
  </>
}

export function ManagerChat({ view: all, settings, connected = true, onSettings, onOpen, onBack, head, tail, initial = MANAGER_MAIN_THREAD }: { readonly initial?: string; readonly onBack?: (() => void) | undefined; readonly view: ManagerView; readonly settings: Settings; readonly connected?: boolean; readonly onSettings?: (() => void) | undefined; readonly onOpen?: ((id: string) => void) | undefined; readonly head?: React.ReactNode; readonly tail?: React.ReactNode }): React.JSX.Element {
  const [chosen, setChosen] = useState(initial)
  const [draftModel, setDraftModel] = useState<string>()
  const [made, setMade] = useState<string>()
  // A new conversation is opened once its first message made it on the computer.
  const arrived = chosen === NEW_CONVERSATION && made !== undefined ? all.threads?.find((one) => one.session === made) : undefined
  const picked = arrived?.id ?? chosen
  const setPicked = useCallback((id: string): void => { setMade(undefined); setChosen(id) }, [])
  const drafting = picked === NEW_CONVERSATION
  const fresh = useMemo((): ManagerThread | undefined => drafting ? { id: NEW_CONVERSATION, title: 'New conversation', provider: all.config.provider, model: draftModel ?? all.config.chatModel, labels: {}, state: 'idle', at: 0, owns: [] } : undefined, [drafting, all.config.provider, all.config.chatModel, draftModel])
  const threads = useMemo(() => [...(fresh === undefined ? [] : [fresh]), ...threadOrder(all.threads ?? [])], [all.threads, fresh])
  const thread = threads.find((one) => one.id === picked) ?? threads.find((one) => one.id === MANAGER_MAIN_THREAD) ?? threads[0]
  const view = useMemo(() => threadView(all, thread), [all, thread])
  const channel = thread?.place !== undefined
  const start = useCallback((): void => { setDraftModel(undefined); setPicked(NEW_CONVERSATION) }, [setPicked])
  useEffect(() => {
    const sent = (event: Event): void => { if (event instanceof CustomEvent && typeof event.detail === 'string') setMade(event.detail) }
    window.addEventListener('manager:sent', sent)
    return () => window.removeEventListener('manager:sent', sent)
  }, [])
  useEffect(() => {
    if (ON_PHONE) return
    const key = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'n') return
      event.preventDefault()
      event.stopImmediatePropagation()
      start()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [start])
  const pickModel = (model: string): void => {
    if (thread === undefined) return
    if (thread.id === NEW_CONVERSATION) { setDraftModel(model); return }
    setError('')
    void window.geckit.manager.setModel(thread.id, model).catch((caught: Error) => setError(caught.message))
  }
  const [error, setError] = useState('')
  const [history, setHistory] = useState<{ readonly id: string; readonly ready: boolean }>()
  const historyRead = useCallback((id: string, ready: boolean): void => setHistory({ id, ready }), [])
  const recover = (): void => {
    setError('')
    void (view.state === 'paused' ? window.geckit.manager.resume() : window.geckit.manager.retry()).catch((caught: Error) => setError(caught.message))
  }
  const details: (readonly [string, string])[] = [['Assistant', llmProviderInfo(thread?.provider ?? managerAssistant(view), undefined, settings.providerPlugins).name], ['Model', thread === undefined ? view.session?.model ?? 'Default' : thread.model === '' ? 'Default' : thread.model], ['Managed workers', String(all.workers.length)], ...Object.entries(thread?.labels ?? {})]
  const notices = [
    !view.config.enabled ? <p key="off">{ON_PHONE && view.session === undefined ? 'Set up Manager on your computer, then chat here.' : 'Manager disabled. History is kept.'}</p> : view.state === 'paused' ? <p key="paused">Manager paused</p> : view.state === 'blocked' ? <p key="blocked">Manager unavailable</p> : null,
    view.error === undefined ? null : <p key="error" className="manager-error" role="status">{view.error}</p>,
    error === '' ? null : <p key="recover" className="manager-error" role="alert">{error}</p>,
    view.state !== 'working' || view.session?.retryNotice === undefined ? null : <p key="retry" className="manager-retry" role="status">{view.session.retryNotice}</p>,
  ].filter((one) => one !== null)
  const recoverable = connected && view.config.enabled && (view.state === 'paused' || view.state === 'blocked')
  const setUp = !view.config.enabled && onSettings !== undefined
  const toolbar = <div className="manager-toolbar">
    {thread === undefined || threads.length === 0 ? head : <div className="manager-toolbar-title">
      <h3 title={threadName(thread)}>{threadName(thread)}</h3>
      <p><span>{threadFrom(thread)}</span><Tasks thread={thread} workers={all.workers} connected={connected} onOpen={onOpen} /></p>
    </div>}
    <div className="manager-toolbar-actions">
      {!channel || thread.link === undefined ? null : <button type="button" className="icon-button" aria-label={`Open in ${thread.place ?? 'channel'}`} title={`Open in ${thread.place ?? 'channel'}`} onClick={() => { if (thread.link !== undefined) window.geckit.chat.openLink(thread.link) }}><Icon name="external" /></button>}
      <Details rows={details} />
      {drafting ? null : <ManagerHistory view={view} thread={thread} connected={connected} onDeleted={() => setPicked(MANAGER_MAIN_THREAD)} />}
      {tail}
    </div>
  </div>
  // On the phone, a conversation's own bar: Back, the name with where it is from under it, and two buttons.
  const phoneBar = thread === undefined || onBack === undefined ? undefined : <div className="phone-nav manager-phone-nav">
    <button type="button" className="phone-back" onClick={onBack}><Icon name="left" size={22} />Back</button>
    <div className="phone-nav-title">
      <b>{drafting ? 'New conversation' : threadName(thread)}</b>
      {drafting ? null : <span>
        {!channel || thread.link === undefined ? threadFrom(thread) : <button type="button" className="phone-nav-started" aria-label={`Open in ${thread.place ?? 'channel'}`} onClick={() => { if (thread.link !== undefined) window.geckit.chat.openLink(thread.link) }}>{threadFrom(thread)}</button>}
        {!all.workers.some((one) => thread.owns.includes(one.id)) ? null : <>{' · '}<Tasks thread={thread} workers={all.workers} connected={connected} onOpen={onOpen} inline /></>}
      </span>}
    </div>
    <span className="phone-nav-end manager-toolbar-actions">
      <Details rows={details} />
      {drafting ? null : <ManagerHistory view={view} thread={thread} connected={connected} onDeleted={() => setPicked(MANAGER_MAIN_THREAD)} />}
    </span>
  </div>
  const chat = <div className="manager-chat">
    {ON_PHONE && phoneBar !== undefined ? phoneBar : toolbar}
    {notices.length === 0 && !recoverable && !setUp ? null : <div className="manager-inspection-info">
      {notices}
      {recoverable ? <button type="button" className="quiet small" onClick={recover}>{view.state === 'paused' ? 'Resume' : 'Try again'}</button> : null}
      {setUp ? <button type="button" className="quiet small" onClick={onSettings}>Open Manager in Team</button> : null}
    </div>}
    <History key={view.session?.id ?? thread?.id ?? 'manager'} view={view} connected={connected} onReady={historyRead} />
    <ManagerComposer view={view} settings={settings} connected={connected} historyReady={view.session === undefined || (history?.id === view.session.id && history.ready)} closed={!channel ? undefined : thread.closed ?? (thread.session === undefined ? 'This thread has no Manager session yet.' : undefined)} posted={channel ? `Manager's answer is also posted to ${thread.place ?? 'the channel'}.` : undefined} thread={thread} onModel={pickModel} />
  </div>
  if (threads.length === 0 || ON_PHONE) return chat
  return <div className="manager-chat-threads"><div className="manager-side">{head === undefined ? null : <div className="manager-side-head">{head}</div>}<Threads threads={threads} picked={thread?.id ?? MANAGER_MAIN_THREAD} workers={all.workers} onPick={setPicked} onNew={all.config.enabled && connected ? start : undefined} /></div>{chat}</div>
}
