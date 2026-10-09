import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { modelDetailRows, pricingRows, resolvedModel } from '../../../shared/model-details'
import { llmProviderInfo } from '../../../shared/providers'
import { ON_PHONE } from '../on-phone'
import { Sheet } from '../ui/Sheet'
import { Cell } from './PhoneKit'
import { Icon } from '../ui/Icon'
import type { Chat } from './useChat'
import './phone-home.css'

export type ModelDetailsChat = Pick<Chat, 'provider' | 'transport' | 'settings' | 'models' | 'model' | 'session' | 'root' | 'account' | 'askModels'>

function Details({ chat, model, phone, onClose }: { readonly chat: ModelDetailsChat; readonly model: string | undefined; readonly phone: boolean; readonly onClose: () => void }): React.JSX.Element {
  const title = useId()
  const body = useRef<HTMLDivElement>(null)
  const provider = llmProviderInfo(chat.provider, chat.transport, chat.settings.providerPlugins)
  const found = resolvedModel(Array.isArray(chat.models) ? chat.models : undefined, model)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    body.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = body.current?.querySelectorAll<HTMLElement>('button, a[href]')
      const first = controls?.[0]
      const last = controls?.[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); opener?.focus() }
  }, [onClose])

  const content = <div ref={body} className="model-details">
    <div className="model-details-title">
      <Icon name={provider.icon} size={22} />
      <div><h2 id={title}>{found?.name ?? model ?? 'Model details'}</h2><span>{provider.name}{chat.account?.program === undefined ? '' : ` · CLI ${chat.account.program.version}`}</span></div>
      <button type="button" className="quiet" onClick={onClose}>Done</button>
    </div>
    {found === undefined ? <p role="status">{chat.models === 'asking' || chat.models === 'unasked' ? 'Loading model details...' : 'Model details unavailable'}</p> : <>
      {found.says === undefined ? null : <p className="model-details-description">{found.says}</p>}
      <div className="phone-head">Model</div>
      <div className="phone-group">{modelDetailRows(found).map((row) => <Cell key={row.label} label={row.label} value={row.value} />)}</div>
      <div className="phone-head">Prices per million tokens</div>
      {found.pricing === undefined || pricingRows(found.pricing).length === 0 ? <p className="model-details-note">Pricing not reported</p> : <>
        <div className="phone-group">{pricingRows(found.pricing).map((row) => <Cell key={row.label} label={row.label} value={row.value} />)}</div>
        <p className="model-details-note">{found.pricing.currency} · API rates{found.pricing.asOf === undefined ? '' : ` · As of ${found.pricing.asOf}`}{found.pricing.source === undefined ? null : <> · <button type="button" className="act" onClick={() => window.geckit.chat.openLink(found.pricing?.source ?? '')}>Price source</button></>}</p>
      </>}
    </>}
  </div>

  if (phone) return <Sheet title="Model details" className="model-details-sheet" cancel={false} onClose={onClose}>{content}</Sheet>
  return createPortal(<div className="dialog-scrim" onMouseDown={onClose}><div className="dialog model-details-dialog" role="dialog" aria-modal="true" aria-labelledby={title} onMouseDown={(event) => event.stopPropagation()}>{content}</div></div>, document.body)
}

export function ModelDetailsButton({ chat, model = chat.model || chat.session?.model, phone = ON_PHONE }: { readonly chat: ModelDetailsChat; readonly model?: string | undefined; readonly phone?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const show = (): void => { setOpen(true); chat.askModels(chat.root); }
  return <>{phone ? <Cell label="Model details" onPress={show} /> : <button type="button" className="model-details-button act" onClick={show}>Model details</button>}{open ? <Details chat={chat} model={model} phone={phone} onClose={close} /> : null}</>
}
