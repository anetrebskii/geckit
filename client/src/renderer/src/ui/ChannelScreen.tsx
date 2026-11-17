import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChannelScreen as Screen, ChannelScreenAction, ChannelScreenRequest } from '../../../shared/channel-ui'
import type { ChannelId, ChannelValues } from '../../../shared/channels'
import type { ChannelsApi } from './Channels'
import { Icon } from './Icon'

const defaults = (screen: Screen): ChannelValues => Object.fromEntries([...(screen.fields ?? []), ...(screen.sections ?? []).flatMap((one) => one.fields ?? [])].map((field) => [field.key, field.default ?? (field.type === 'boolean' ? false : field.type === 'list' ? [] : '')]))

export function ChannelScreen({ id, api }: { readonly id: ChannelId; readonly api: ChannelsApi }): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>()
  const [values, setValues] = useState<ChannelValues>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ChannelScreenAction>()
  const [pending, setPending] = useState<ChannelScreenAction>()
  const latest = useRef(0)
  const current = useRef<Screen | undefined>(undefined)
  const acting = useRef(false)
  const refresh = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  const clicked = useRef<HTMLButtonElement | null>(null)
  const restoreFocus = useRef(false)
  useLayoutEffect(() => {
    if (busy || !restoreFocus.current) return
    restoreFocus.current = false
    if (clicked.current?.isConnected && !clicked.current.disabled) clicked.current.focus()
    else panel.current?.focus()
  }, [busy, screen, error])
  useEffect(() => {
    let here = true
    const load = async (): Promise<void> => {
      if (acting.current) { refresh.current = true; return }
      const generation = ++latest.current
      try {
        const next = await api.screen(id, { ...(current.current?.state === undefined ? {} : { state: current.current.state }) })
        if (!here || generation !== latest.current) return
        const initial = current.current === undefined
        current.current = next
        setScreen(next)
        setValues((kept) => ({ ...defaults(next), ...kept }))
        setError('')
        if (initial) requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input, textarea, button')?.focus())
      } catch (caught) { if (here && generation === latest.current) setError(caught instanceof Error ? caught.message : String(caught)) }
    }
    void load()
    const off = api.onShown((shown) => { if (shown.id === id) void load() })
    const invalidate = (): void => { latest.current++ }
    return () => { here = false; invalidate(); off() }
  }, [id, api])
  const run = async (action: ChannelScreenAction): Promise<void> => {
    const generation = ++latest.current
    acting.current = true
    restoreFocus.current = true
    setBusy(true); setError(''); setConfirm(undefined); setPending(action)
    try {
      const request: ChannelScreenRequest = { ...(screen?.state === undefined ? {} : { state: screen.state }), ...(action.action === undefined ? {} : { action: action.action }), values }
      let next = await api.screen(id, request)
      if (generation !== latest.current) return
      if (refresh.current) {
        refresh.current = false
        next = await api.screen(id, { ...(next.state === undefined ? {} : { state: next.state }) })
        if (generation !== latest.current) return
      }
      current.current = next
      setScreen(next); setValues(defaults(next))
    } catch (caught) { if (generation === latest.current) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { if (generation === latest.current) { acting.current = false; setBusy(false); setPending(undefined) } }
  }
  const choose = (action: ChannelScreenAction, button: HTMLButtonElement): void => {
    clicked.current = button
    if (action.href !== undefined) { window.geckit.chat.openLink(action.href); return }
    if (action.confirm !== undefined) { setConfirm(action); return }
    void run(action)
  }
  const section = (one: Screen, at: number): React.JSX.Element => <section key={at} className={at === -1 ? 'channel-screen-section channel-screen-head' : 'channel-screen-section'}>
    {one.title === undefined ? null : at === -1 ? <h4>{one.title}</h4> : <h5>{one.title}</h5>}
    {one.text === undefined || one.text.length === 0 ? null : <div className="channel-screen-text">{one.text.map((line, index) => <p key={index}>{line}</p>)}</div>}
    {one.fields?.map((field) => {
      const fieldId = `${id}-${field.key}`
      return <div className="field" key={field.key}>
        {field.type === 'boolean' ? <label className="check"><input id={fieldId} type="checkbox" checked={values[field.key] === true} disabled={busy} onChange={(event) => setValues((kept) => ({ ...kept, [field.key]: event.target.checked }))} />{field.label}</label> : <><label htmlFor={fieldId}>{field.label}</label>{field.type === 'list' ? <textarea id={fieldId} rows={3} value={Array.isArray(values[field.key]) ? (values[field.key] as readonly string[]).join('\n') : ''} disabled={busy} onChange={(event) => setValues((kept) => ({ ...kept, [field.key]: event.target.value.split('\n') }))} /> : <input id={fieldId} type={field.type === 'secret' ? 'password' : 'text'} autoComplete="off" value={String(values[field.key] ?? '')} disabled={busy} onChange={(event) => setValues((kept) => ({ ...kept, [field.key]: event.target.value }))} />}</>}
        {field.help === undefined ? null : <span className="channel-help">{field.help}</span>}
      </div>
    })}
    {one.actions === undefined || one.actions.length === 0 ? null : <div className="channel-setup-actions">{one.actions.map((action, index) => <button key={index} type="button" className={action.primary === true ? 'primary' : action.confirm === undefined ? 'quiet' : 'quiet channel-risky'} disabled={busy} aria-busy={busy && pending === action ? true : undefined} onClick={(event) => choose(action, event.currentTarget)}>{busy && pending === action ? <span className="spinner-turn"><Icon name="spinner" size={12} /></span> : null}{action.label}{action.href === undefined ? null : <Icon name="external" size={12} />}</button>)}</div>}
  </section>
  return <div ref={panel} tabIndex={-1} className="channel-screen" aria-label="Connection" aria-busy={busy} onKeyDown={(event) => {
    if (event.key === 'Escape' && confirm !== undefined) { event.preventDefault(); event.stopPropagation(); setConfirm(undefined); clicked.current?.focus() }
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && confirm === undefined && !busy) { const primary = [screen, ...(screen?.sections ?? [])].flatMap((one) => one?.actions ?? []).find((one) => one.primary && one.action !== undefined); if (primary !== undefined) { event.preventDefault(); clicked.current = panel.current?.querySelector<HTMLButtonElement>('button.primary') ?? null; if (primary.confirm !== undefined) setConfirm(primary); else void run(primary) } }
  }}>
    {screen === undefined ? error === '' ? <div className="channel-screen-loading">
      <p role="status"><span className="spinner-turn"><Icon name="spinner" size={12} /></span>Loading connection settings...</p>
      <span className="channel-bone title" /><span className="channel-bone" /><span className="channel-bone short" />
      <span className="channel-bone-actions"><span className="channel-bone button" /><span className="channel-bone button" /></span>
    </div> : null : <div className="channel-screen-body">{section(screen, -1)}{screen.sections?.map(section)}</div>}
    {busy ? <p role="status" className={pending !== undefined && [screen, ...(screen?.sections ?? [])].some((one) => one?.actions?.includes(pending) === true) ? 'channel-loading-label' : 'channel-working'}><span className="spinner-turn"><Icon name="spinner" size={12} /></span>Working...</p> : null}
    {confirm === undefined ? null : <div className="provider-library-confirm" role="alert"><p>{confirm.confirm}</p><div><button autoFocus type="button" className="quiet" onClick={() => { setConfirm(undefined); clicked.current?.focus() }}>Cancel</button><button type="button" className="primary danger" onClick={() => { void run(confirm) }}>Confirm</button></div></div>}
    {error === '' ? null : <div role="alert" className="error channel-error">{error}{screen === undefined ? <button type="button" className="quiet" onClick={() => { void run({ label: 'Try again' }) }}>Try again</button> : null}</div>}
  </div>
}
