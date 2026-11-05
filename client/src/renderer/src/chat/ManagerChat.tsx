import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SessionItem, SessionItems, Settings } from '../../../shared/api'
import type { ManagerDecision, ManagerThread, ManagerView } from '../../../shared/manager'
import { MANAGER_MAIN_THREAD } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { updatedItems } from '../../../shared/transcript-items'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { Files } from './Prose'
import { Transcript } from './Transcript'
import { ManagerComposer } from './ManagerComposer'
import { managerAssistant } from './manager-label'

interface InspectionRead extends Pick<SessionItems, 'id' | 'items'> { readonly attempt: number }
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
      else setRead((held) => held?.id !== id || held.attempt !== retry ? held : { id, attempt: retry, items: updatedItems(held.items, [items]) })
    })
    void Promise.resolve().then(() => { if (here) onReady(id, false); return api.inspect(id) }).then((snapshot) => {
      if (!here || snapshot.id !== id) return
      loading = false
      setFailure(undefined)
      setRead({ id, attempt: retry, items: updatedItems(snapshot.items, buffered) })
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
  const disabled = !connected || view.appChat !== true || !view.config.enabled || view.state === 'paused' || view.state === 'blocked'
  if (error !== '' && items.length === 0) return <div className="manager-inspection-empty"><Icon name="blocked" size={20} /><p className="manager-error" role="alert">Could not load the Manager session.</p><p className="manager-inspection-hint">{error}</p><button type="button" className="quiet" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
  if (id !== undefined && (read === undefined || read.id !== id || read.attempt !== retry) && connected) return <div className="manager-inspection-empty" role="status"><Icon name="spinner" size={20} /><p>Loading the Manager session...</p></div>
  const footer = <>
    {items.length === 0 ? <div className="manager-inspection-empty"><Icon name="chat" size={20} /><p>What would you like Manager to do?</p></div> : null}
    {answerError === '' ? null : <p className="manager-answer-error" role="alert">{answerError}</p>}
    {view.decisions.length === 0 ? null : <div className="manager-decisions">{view.decisions.filter((decision) => !(decision.session === id && items.some((item) => item.kind === 'card' && item.id === decision.card))).map((decision) => <Decision key={decision.id} decision={decision} session={id ?? ''} disabled={disabled} />)}</div>}
    {(view.requests ?? []).every((request) => request.state === 'sent') ? null : <div className="manager-queued" aria-label="Queued messages">{view.requests?.filter((request) => request.state !== 'sent').map((request) => <div key={request.id}><p>{request.source === 'desktop' && request.text.startsWith('[User request]\n') ? request.text.slice('[User request]\n'.length) : request.text}</p><span>{request.state === 'queued' ? 'Queued' : 'Sending...'}</span></div>)}</div>}
  </>
  return <div className="manager-history"><Files value={files}><Transcript at={id ?? 'manager'} items={items} readOnly={disabled} manager working={view.state === 'working'} onAnswer={answer} onAgain={noop} onFile={file} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} footer={footer} /></Files></div>
})

/** What the window shows for one thread: its own session, requests, decisions and state, with Manager-wide off and paused kept. */
export function threadView(view: ManagerView, thread: ManagerThread | undefined): ManagerView {
  if (thread === undefined || thread.id === MANAGER_MAIN_THREAD && (view.threads ?? []).length === 0) return view
  const main = thread.id === MANAGER_MAIN_THREAD
  const { session: _session, error: _error, ...rest } = view
  const session = main ? view.session : thread.conversation
  const error = main ? view.error : thread.error
  const state = view.state === 'off' || view.state === 'paused' || main && view.state === 'blocked' ? view.state : thread.state === 'failed' ? 'blocked' : thread.state === 'working' ? 'working' : 'idle'
  return { ...rest, ...(session === undefined ? {} : { session }), ...(error === undefined ? {} : { error }), state, requests: (view.requests ?? []).filter((request) => request.session === thread.session), decisions: view.decisions.filter((decision) => (decision.thread ?? MANAGER_MAIN_THREAD) === thread.id) }
}

export function threadOrder(threads: readonly ManagerThread[]): readonly ManagerThread[] {
  return threads.toSorted((a, b) => a.id === MANAGER_MAIN_THREAD ? -1 : b.id === MANAGER_MAIN_THREAD ? 1 : b.at - a.at)
}

const threadName = (thread: ManagerThread): string => thread.id === MANAGER_MAIN_THREAD ? 'GeckIt' : thread.title
const threadFrom = (thread: ManagerThread): string => thread.id === MANAGER_MAIN_THREAD ? 'Manager chat' : [thread.place, thread.from].filter((part) => part !== undefined && part !== '').join(' · ')

export function Threads({ threads, picked, workers, onPick }: { readonly threads: readonly ManagerThread[]; readonly picked: string; readonly workers: ManagerView['workers']; readonly onPick: (id: string) => void }): React.JSX.Element {
  if (ON_PHONE) return <label className="manager-thread-menu"><span>Thread</span><select value={picked} onChange={(event) => onPick(event.target.value)}>{threads.map((thread) => <option key={thread.id} value={thread.id}>{thread.id === MANAGER_MAIN_THREAD ? 'GeckIt' : `${threadFrom(thread)} · ${thread.title}`}</option>)}</select></label>
  return <nav className="manager-threads" aria-label="Manager threads">{threads.map((thread) => {
    const working = workers.filter((one) => one.state === 'working' && (thread.owns.includes(one.id) || thread.follows.includes(one.id))).length
    return <button key={thread.id} type="button" className="manager-thread" aria-current={thread.id === picked ? 'true' : undefined} onClick={() => onPick(thread.id)}>
      <span className="manager-thread-text"><strong>{threadName(thread)}</strong><span>{threadFrom(thread)}</span></span>
      {thread.state === 'idle' ? null : <span className="manager-thread-dot" data-state={thread.state} aria-label={thread.state === 'asks' ? 'Needs your answer' : thread.state === 'failed' ? 'Stopped' : 'Working'} />}
      {working === 0 ? null : <span className="manager-thread-count" aria-label={`${String(working)} working`}>{working}</span>}
    </button>
  })}</nav>
}

function Work({ thread, workers, onOpen }: { readonly thread: ManagerThread; readonly workers: ManagerView['workers']; readonly onOpen?: ((id: string) => void) | undefined }): React.JSX.Element | null {
  const owns = workers.filter((one) => thread.owns.includes(one.id))
  const follows = workers.filter((one) => thread.follows.includes(one.id))
  if (owns.length === 0 && follows.length === 0) return null
  const list = (title: string, rows: ManagerView['workers']): React.JSX.Element | null => rows.length === 0 ? null : <div className="manager-work-list"><h4>{title}</h4>{rows.map((one) => <button key={one.id} type="button" className="manager-work-row" disabled={onOpen === undefined} title="Open this conversation" onClick={() => onOpen?.(one.id)}><span className="manager-thread-dot" data-state={one.state === 'asks' ? 'asks' : one.state === 'failed' ? 'failed' : one.state === 'working' ? 'working' : 'idle'} aria-hidden="true" /><span>{one.title}</span></button>)}</div>
  return <details className="manager-work" open><summary>Work <span>{owns.length + follows.length}</span></summary>{list('Started here', owns)}{list('Following', follows)}</details>
}

export function ManagerChat({ view: all, settings, connected = true, onSettings, onOpen }: { readonly view: ManagerView; readonly settings: Settings; readonly connected?: boolean; readonly onSettings?: (() => void) | undefined; readonly onOpen?: ((id: string) => void) | undefined }): React.JSX.Element {
  const threads = useMemo(() => threadOrder(all.threads ?? []), [all.threads])
  const [picked, setPicked] = useState(MANAGER_MAIN_THREAD)
  const thread = threads.find((one) => one.id === picked) ?? threads[0]
  const view = useMemo(() => threadView(all, thread), [all, thread])
  const channel = thread !== undefined && thread.id !== MANAGER_MAIN_THREAD
  const [error, setError] = useState('')
  const [history, setHistory] = useState<{ readonly id: string; readonly ready: boolean }>()
  const historyRead = useCallback((id: string, ready: boolean): void => setHistory({ id, ready }), [])
  const recover = (): void => {
    setError('')
    void (view.state === 'paused' ? window.geckit.manager.resume() : window.geckit.manager.retry()).catch((caught: Error) => setError(caught.message))
  }
  const facts = [llmProviderInfo(managerAssistant(view), undefined, settings.providerPlugins).name, view.session?.model ?? 'Provider default', view.workers.length === 0 ? undefined : `${String(view.workers.length)} ${view.workers.length === 1 ? 'worker' : 'workers'}`].filter((fact) => fact !== undefined)
  const chat = <div className="manager-chat">
    <div className="manager-inspection-info"><p className="manager-inspection-facts">{facts.join(' · ')}</p>
      {!view.config.enabled ? <p>{ON_PHONE && view.session === undefined ? 'Set up Manager on your computer, then chat here.' : 'Manager disabled. History is kept.'}</p> : view.state === 'paused' ? <p>Manager paused</p> : view.state === 'blocked' ? <p>Manager unavailable</p> : null}
      {view.error === undefined ? null : <p className="manager-error" role="status">{view.error}</p>}{error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
      {view.state !== 'working' || view.session?.retryNotice === undefined ? null : <p className="manager-retry" role="status">{view.session.retryNotice}</p>}
      {connected && view.config.enabled && (view.state === 'paused' || view.state === 'blocked') ? <button type="button" className="quiet small" onClick={recover}>{view.state === 'paused' ? 'Resume' : 'Try again'}</button> : null}
      {!view.config.enabled && onSettings !== undefined ? <button type="button" className="quiet small" onClick={onSettings}>Open Manager in Team</button> : null}
    </div>
    {!channel ? null : <div className="manager-thread-head">
      <p>{[thread.place, thread.title, thread.from].filter((part) => part !== undefined && part !== '').join(' · ')}{thread.link === undefined ? null : <button type="button" className="quiet small" onClick={() => { if (thread.link !== undefined) window.geckit.chat.openLink(thread.link) }}>Open in {thread.place ?? 'channel'}</button>}</p>
      {Object.entries(thread.labels).map(([key, value]) => <p key={key} className="manager-thread-label">{key}: {value}</p>)}
      {thread.closed === undefined ? null : <p className="manager-error" role="status">{thread.closed}</p>}
    </div>}
    {thread === undefined ? null : <Work thread={thread} workers={all.workers} onOpen={onOpen} />}
    <History key={view.session?.id ?? thread?.id ?? 'manager'} view={view} connected={connected} onReady={historyRead} />
    <ManagerComposer view={view} connected={connected} historyReady={view.session === undefined || (history?.id === view.session.id && history.ready)} closed={!channel ? undefined : thread.closed ?? (thread.session === undefined ? 'This thread has no Manager session yet.' : undefined)} posted={channel ? `Manager's answer is also posted to ${thread.place ?? 'the channel'}.` : undefined} />
  </div>
  if (threads.length === 0) return chat
  return <div className="manager-chat-threads"><Threads threads={threads} picked={thread?.id ?? MANAGER_MAIN_THREAD} workers={all.workers} onPick={setPicked} />{chat}</div>
}
