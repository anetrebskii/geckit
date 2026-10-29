import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { providerOf } from '../../../shared/api'
import type { ChatSession, ClaudeModel, ConversationExport, SessionProvider } from '../../../shared/api'
import { isRemote } from '../../../shared/hosts'
import { providerModel, selectableProviders } from '../../../shared/providers'
import { useBack } from '../phone-back'
import type { Chat } from './useChat'

export function ConversationTransfer({ chat, session, onClose, onFile }: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly onClose: () => void
  readonly onFile: (path: string) => void
}): React.JSX.Element {
  const providers = selectableProviders(chat.settings)
  const remote = isRemote(session.root)
  const [provider, setProvider] = useState<SessionProvider>(() => {
    const original = providers.find((one) => one.family === (session.provider ?? providerOf(session.id)) && !(remote && one.localOnly === true))
    return original?.family ?? providers.find((one) => !(remote && one.localOnly === true))?.family ?? session.provider ?? providerOf(session.id)
  })
  const [model, setModel] = useState(() => provider === (session.provider ?? providerOf(session.id)) ? session.chosen ?? session.model ?? '' : providerModel(chat.settings, provider))
  const [models, setModels] = useState<{ readonly provider: SessionProvider; readonly catalog: readonly ClaudeModel[] | 'unavailable' }>()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<'export' | 'create' | 'copy'>()
  const [saved, setSaved] = useState<ConversationExport>()
  const [problem, setProblem] = useState('')
  const busy = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const latestClose = useRef(onClose)
  useEffect(() => { latestClose.current = onClose }, [onClose])
  const id = useId()
  const selectedProvider = providers.find((one) => one.family === provider)
  const unavailable = selectedProvider === undefined ? 'This assistant is no longer enabled. Choose another assistant.' : remote && selectedProvider.localOnly === true ? `${selectedProvider.name} is available for local folders. Choose an assistant that supports this host.` : ''
  const catalog = models?.provider === provider && models.catalog !== 'unavailable' ? models.catalog : undefined
  const loading = models?.provider !== provider
  const disabledModel = catalog?.find((one) => one.value === model)?.disabled === true

  useEffect(() => {
    let current = true
    void window.geckit.chat.models(session.root, provider).then((catalog) => {
      if (current) setModels({ provider, catalog: catalog ?? 'unavailable' })
    }).catch(() => {
      if (current) setModels({ provider, catalog: 'unavailable' })
    })
    return () => { current = false }
  }, [session.root, provider])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    form.current?.querySelector<HTMLElement>('select')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!busy.current) latestClose.current()
      } else if (event.key === 'Tab') {
        const controls = Array.from(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])
        const first = controls[0]
        const last = controls.at(-1)
        if (controls.length === 0) { event.preventDefault(); form.current?.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === form.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === form.current)) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  useBack(() => { if (!busy.current) onClose() })

  const run = async (action: 'export' | 'create' | 'copy'): Promise<void> => {
    if (busy.current || (action !== 'export' && (unavailable !== '' || loading || disabledModel))) return
    busy.current = true
    setPending(action)
    setProblem('')
    try {
      if (action === 'export') setSaved(await window.geckit.chat.exportConversation(session.id))
      else {
        const destination = await window.geckit.chat[action === 'copy' ? 'copyConversation' : 'continueConversation']({ source: session.id, provider, ...(model === '' ? {} : { model }), text })
        if (typeof destination !== 'string' || destination === '') throw new Error('The new conversation was not accepted. Try again.')
        onClose()
        chat.goTo(destination)
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      busy.current = false
      setPending(undefined)
    }
  }

  return createPortal(
    <div className="dialog-scrim" onMouseDown={() => { if (!busy.current) onClose() }}>
      <form ref={form} tabIndex={-1} className="dialog conversation-transfer" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-explanation`} aria-busy={pending !== undefined} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void run('copy') }}>
        <h2 id={`${id}-title`}>Continue with another model</h2>
        <p id={`${id}-explanation`}>Copy the available history into a new chat. Nothing is sent until you press Send.</p>
        <div className="new-task-models">
          <label className="new-task-label">
            Assistant
            <select className="new-task-where" value={provider} disabled={pending !== undefined} onChange={(event) => {
              const next = providers.find((one) => one.family === event.target.value)
              if (next === undefined) return
              setProvider(next.family)
              setModel(providerModel(chat.settings, next.family))
              setProblem('')
            }}>
              {providers.map((one) => <option key={one.id} value={one.family} disabled={remote && one.localOnly === true}>{one.name}</option>)}
            </select>
          </label>
          <label className="new-task-label">
            Model
            <select className="new-task-where" value={model} disabled={pending !== undefined || loading} onChange={(event) => { setModel(event.target.value); setProblem('') }}>
              <option value="">Default</option>
              {model === '' || catalog?.some((one) => one.value === model) ? null : <option value={model}>{model}</option>}
              {catalog?.map((one) => <option key={one.value} value={one.value} disabled={one.disabled}>{one.name}{one.disabled ? ` - ${one.says ?? 'Unavailable'}` : ''}</option>)}
            </select>
          </label>
        </div>
        {loading ? <p role="status">Loading models...</p> : models?.catalog === 'unavailable' ? <p>Model list unavailable. Use Default or the recorded model.</p> : null}
        <label className="new-task-label">
          Next instruction (optional)
          <textarea className="new-task-text" rows={2} value={text} disabled={pending !== undefined} placeholder="What should the new assistant do next?" onChange={(event) => setText(event.target.value)} />
        </label>
        {unavailable === '' ? null : <p className="transfer-problem" role="alert">{unavailable}</p>}
        {problem === '' ? null : <p className="transfer-problem" role="alert">{problem}</p>}
        {saved === undefined ? null : <div className="transfer-export" role="status"><button type="button" className="quiet" disabled={pending !== undefined} onClick={() => onFile(saved.path)}>Show export</button><span>{saved.path}</span></div>}
        {pending === undefined ? null : <p role="status">{pending === 'export' ? 'Exporting...' : pending === 'copy' ? 'Copying conversation...' : 'Creating conversation...'}</p>}
        <div className="transfer-utilities">
          <button type="button" disabled={pending !== undefined} onClick={() => void run('export')}>Export Markdown</button>
          <button type="button" disabled={pending !== undefined || unavailable !== '' || loading || disabledModel} onClick={() => void run('create')}>Create and send</button>
        </div>
        <div className="dialog-actions">
          <button type="button" className="quiet" disabled={pending !== undefined} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={pending !== undefined || unavailable !== '' || loading || disabledModel}>Copy without sending</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
