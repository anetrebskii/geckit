import { useEffect, useRef, useState } from 'react'

import { endsIn } from '../../../shared/share'
import type { SharedLink } from '../../../shared/share'
import type { TelegramAction, TelegramView } from '../../../shared/telegram'

export function useTelegram(): readonly [TelegramView | undefined, (next: TelegramView) => void] {
  const [view, setView] = useState<TelegramView>()
  useEffect(() => {
    const api = window.geckit.telegram
    if (api === undefined) return
    let here = true
    void api.view().then((next) => { if (here) setView(next) }, () => undefined)
    const off = api.on((next) => { if (here) setView(next) })
    return () => { here = false; off() }
  }, [])
  return [view, setView]
}

const label = (state: TelegramView['state']): string => {
  switch (state) {
    case 'disconnected': return 'Not connected'
    case 'pairing': return 'Waiting for you in Telegram'
    case 'confirming': return 'Confirm your Telegram account'
    case 'connected': return 'Connected'
    case 'offline': return 'Reconnecting to Telegram'
    case 'revoked': case 'conflict': case 'storage-error': return 'Telegram needs attention'
  }
}

/** The links shared from Telegram that are live, each with the time it has left and Stop, shown under the steps whenever there is one; focus moves to the next Stop, or the list, once one goes. */
export function SharedLinks({ view, onView }: { readonly view: TelegramView | undefined; readonly onView: (next: TelegramView) => void }): React.JSX.Element | null {
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The last one stopped here leaves a line saying so, which takes the focus its Stop had.
  const [emptied, setEmptied] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const after = useRef<number | undefined>(undefined)
  const shared = view?.links
  const links: readonly SharedLink[] = shared ?? []
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (after.current === undefined || busy) return
    const buttons = list.current?.querySelectorAll('button') ?? []
    const next = buttons[Math.min(after.current, buttons.length - 1)]
    after.current = undefined
    if (next !== undefined) next.focus()
    else list.current?.focus()
  }, [shared, busy])
  if (links.length === 0 && !emptied) return null
  const stop = async (id: SharedLink['id'], at: number): Promise<void> => {
    setBusy(true); setError('')
    try {
      after.current = at
      const next = await window.geckit.telegram.action({ kind: 'stop-link', id })
      setEmptied((next.links ?? []).length === 0)
      onView(next)
    } catch (caught) { after.current = undefined; setError(caught instanceof Error ? caught.message : String(caught)) } finally { setBusy(false) }
  }
  return <div ref={list} className="manager-links" tabIndex={-1} aria-labelledby="manager-links-title">
    <p id="manager-links-title" className="manager-links-title">Shared links</p>
    {links.length === 0 ? <p className="manager-links-none" role="status">Nothing is shared now.</p> : null}
    <ul>{links.map((link, at) => <li key={link.id}>
      <span className="manager-links-name">{link.title}</span>
      <span className="manager-links-left">Ends in {endsIn(link.expiresAt, now)}</span>
      <button type="button" className="quiet" disabled={busy} aria-label={`Stop sharing ${link.title}`} onClick={() => { void stop(link.id, at) }}>Stop</button>
    </li>)}</ul>
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
  </div>
}

const who = (view: TelegramView): string => [
  view.bot === undefined ? undefined : `@${view.bot.username}`,
  view.account === undefined ? undefined : `${view.account.name}${view.account.username === undefined ? '' : ` · @${view.account.username}`}`,
].filter((part) => part !== undefined).join(' · ')

export function ManagerTelegram({ view, onView, done }: { readonly view: TelegramView | undefined; readonly onView: (next: TelegramView) => void; readonly done?: React.ReactNode }): React.JSX.Element {
  const [setup, setSetup] = useState<'create' | 'token'>()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const create = useRef<HTMLButtonElement>(null)
  const entry = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const restoring = useRef(false)
  const generation = useRef(0)
  const pairing = view?.pairing !== undefined
  useEffect(() => { const attempts = generation; return () => { attempts.current++ } }, [])
  useEffect(() => {
    if (setup === 'token') field.current?.focus()
    else if (setup === 'create') create.current?.focus()
    else if (!pairing && restoring.current) {
      restoring.current = false
      if (opener.current?.isConnected) opener.current.focus()
      else entry.current?.focus()
    }
  }, [setup, pairing])
  const action = async (next: TelegramAction): Promise<void> => {
    const attempt = ++generation.current
    setBusy(true); setError('')
    try {
      const updated = await window.geckit.telegram.action(next)
      if (generation.current !== attempt) return
      onView(updated)
      if ((next.kind === 'connect' && updated.pairing !== undefined) || next.kind === 'cancel-pairing' || next.kind === 'disconnect') { setSetup(undefined); setToken('') }
      if (next.kind === 'cancel-pairing') restoring.current = true
      setDisconnecting(false)
    } catch (caught) { if (generation.current === attempt) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { if (generation.current === attempt) setBusy(false) }
  }
  const cancel = (): void => {
    if (busy || pairing) { void action({ kind: 'cancel-pairing' }); return }
    generation.current++; restoring.current = true; setSetup(undefined); setToken(''); setError('')
  }
  const begin = (step: NonNullable<typeof setup>, button: HTMLButtonElement): void => {
    opener.current = button; setError(''); setSetup(step)
  }
  const connect = (): void => {
    if (token.trim() === '') { setError('Enter your bot token.'); field.current?.focus(); return }
    void action({ kind: 'connect', token: token.trim() })
  }
  useEffect(() => {
    if (setup === undefined && !pairing) return
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopImmediatePropagation(); cancel()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })
  return <section className="manager-telegram" aria-label="Telegram">
    <p className="manager-message">Keep this computer online with GeckIt open. Messages pass through Telegram.</p>
    {view === undefined ? <><p role="status">Loading Telegram...</p>{done === undefined ? null : <div className="manager-actions">{done}</div>}</> : <>
      <div className="manager-telegram-state" data-state={view.state}>
        <span className="manager-telegram-dot" aria-hidden="true" />
        <div>
          <strong>{label(view.state)}</strong>
          {who(view) === '' ? null : <p>{who(view)}</p>}
          {view.account === undefined ? null : <p className="manager-telegram-id">Account ID {String(view.account.id)}</p>}
          {view.detail === undefined ? null : <p className="manager-telegram-detail" role="status">{view.detail}</p>}
        </div>
      </div>
      {setup === undefined && !pairing ? null : <div className="manager-setup">
        <ol className="manager-setup-steps" aria-label="Telegram setup progress">
          <li className={setup === 'token' || pairing ? 'done' : ''} aria-current={setup === 'create' ? 'step' : undefined}>Create a bot</li>
          <li className={pairing ? 'done' : ''} aria-current={setup === 'token' ? 'step' : undefined}>Paste its token</li>
          <li className={view.state === 'confirming' ? 'done' : ''} aria-current={pairing ? 'step' : undefined}>Connect your account</li>
        </ol>
        {setup !== 'create' ? null : <div className="manager-bot-guide">
          <p>In Telegram, open the official <strong>@BotFather</strong> and send <code>/newbot</code>.</p>
          <p>Choose a name, then a unique username ending in <code>bot</code>. Copy the API token BotFather gives you.</p>
          <div className="manager-actions"><button ref={create} type="button" className="primary" onClick={() => window.geckit.chat.openLink('https://t.me/BotFather')}>Open BotFather</button><button type="button" className="quiet" onClick={() => setSetup('token')}>I have the token</button><button type="button" className="quiet" onClick={cancel}>Cancel</button></div>
        </div>}
        {setup !== 'token' ? null : <form className="manager-token" onSubmit={(event) => { event.preventDefault(); connect() }}>
          <label htmlFor="manager-bot-token">Bot token</label><input ref={field} id="manager-bot-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} disabled={busy} aria-describedby="manager-token-privacy" />
          <p id="manager-token-privacy">Stored securely on this computer. Never shared with the manager or workers.</p>
          <div className="manager-actions"><button type="button" className="quiet" disabled={busy} onClick={() => { setToken(''); setError(''); setSetup('create') }}>Back</button><button type="button" className="quiet" onClick={cancel}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Checking bot...' : 'Continue'}</button></div>
        </form>}
        {view.pairing === undefined || view.state === 'confirming' ? null : <div className="manager-pairing"><p>Open your bot in Telegram and press <strong>Start</strong>. Then return here to confirm your account.</p><div className="manager-actions">{view.state === 'pairing' ? <button type="button" className="primary" onClick={() => window.geckit.chat.openLink(view.pairing?.url ?? '')}>Open Telegram</button> : <button type="button" className="primary" disabled={busy} onClick={() => { void action({ kind: 'retry' }) }}>Try again</button>}<button type="button" className="quiet" disabled={busy} onClick={cancel}>Cancel</button></div><p>Pairing link expires in ten minutes.</p></div>}
        {view.candidate === undefined || view.state !== 'confirming' ? null : <div className="manager-candidate"><p>Is this your Telegram account?</p><strong>{view.candidate.name}{view.candidate.username === undefined ? '' : ` · @${view.candidate.username}`}</strong><p>Account ID: {String(view.candidate.id)}</p><div className="manager-actions"><button type="button" className="quiet" disabled={busy} onClick={cancel}>This is not me</button><button type="button" className="primary" disabled={busy} onClick={() => { const candidate = view.candidate; if (candidate !== undefined) void action({ kind: 'confirm', userId: candidate.id, chatId: candidate.chatId }) }}>Connect account</button></div></div>}
      </div>}
      {view.pendingLate === 0 ? null : <p role="status">{String(view.pendingLate)} delayed requests need confirmation in Telegram.</p>}
      <div hidden={setup !== undefined || pairing}>{view.state === 'disconnected' ? <div className="manager-actions"><button ref={entry} type="button" className="primary" onClick={(event) => begin('create', event.currentTarget)}>Connect Telegram</button><button type="button" className="quiet" onClick={(event) => begin('token', event.currentTarget)}>I already have a bot</button>{done}</div> : <div className="manager-actions">{view.state === 'connected' ? null : <button type="button" className="quiet" disabled={busy} onClick={() => { void action({ kind: 'retry' }) }}>Try again</button>}{view.state === 'revoked' || view.state === 'storage-error' ? <button ref={entry} type="button" className="quiet" onClick={(event) => begin('token', event.currentTarget)}>Replace token</button> : null}<button type="button" className="quiet danger" onClick={() => setDisconnecting(true)}>Disconnect</button>{done}</div>}</div>
      {!disconnecting ? null : <div className="manager-candidate"><p>Disconnect Telegram? This account loses access. Workers continue; Manager settings and history are kept.</p><div className="manager-actions"><button type="button" className="quiet" onClick={() => setDisconnecting(false)}>Cancel</button><button type="button" className="quiet danger" disabled={busy} onClick={() => { void action({ kind: 'disconnect' }) }}>Disconnect Telegram</button></div></div>}
    </>}
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <details className="manager-aside"><summary>Privacy</summary><p>Your tasks and replies use Telegram's bot service. This is separate from GeckIt's encrypted phone connection.</p></details>
  </section>
}
