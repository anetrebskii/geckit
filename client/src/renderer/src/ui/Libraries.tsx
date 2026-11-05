import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Settings } from '../../../shared/api'
import type { LlmProviderInfo, ProviderPluginFailure } from '../../../shared/providers'
import type { Geckit } from '../../../preload'
import { removeProviderLibrary } from '../../../shared/library-removal'
import { Icon } from './Icon'

export type LibraryApi = Pick<Geckit['chat'], 'installProvider' | 'reinstallProvider' | 'uninstallProvider' | 'applyProviderUpdate' | 'checkProviderUpdates' | 'getProviderPluginFailures'>

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '')

/** Everything about installed assistant libraries that the Assistants section draws in its own rows. */
export function useLibraries(settings: Settings, api: LibraryApi) {
  const ready = useMemo(() => new Set(settings.providerUpdatesReady), [settings.providerUpdatesReady])
  const [failures, setFailures] = useState<readonly ProviderPluginFailure[]>([])
  const [adding, setAdding] = useState(false)
  const [applying, setApplying] = useState('')
  const [confirming, setConfirming] = useState('')
  const [removing, setRemoving] = useState('')
  const [reinstalling, setReinstalling] = useState('')
  const [rowErrors, setRowErrors] = useState<{ readonly [id: string]: string }>({})
  const [message, setMessage] = useState('')
  useEffect(() => { void Promise.resolve().then(() => api.getProviderPluginFailures()).then(setFailures).catch(() => setFailures([])) }, [api])
  const rowError = useCallback((id: string, text: string): void => setRowErrors((current) => ({ ...current, [id]: text })), [])
  const remove = useCallback((provider: Pick<LlmProviderInfo, 'id' | 'name'>): void => {
    setRemoving(provider.id)
    rowError(provider.id, '')
    void removeProviderLibrary(api, provider).then((error) => {
      if (error === undefined) {
        setConfirming('')
        setFailures((current) => current.filter((one) => one.id !== provider.id))
      } else rowError(provider.id, error)
    }).finally(() => setRemoving(''))
  }, [api, rowError])
  const apply = useCallback((provider: LlmProviderInfo): void => {
    setApplying(provider.id)
    rowError(provider.id, '')
    setMessage('')
    void api.applyProviderUpdate(provider.id).then(() => setMessage(`${provider.name} updated.`)).catch((error: unknown) => rowError(provider.id, `Could not apply ${provider.name}. ${reason(error)}`)).finally(() => setApplying(''))
  }, [api, rowError])
  const reinstall = useCallback((failure: ProviderPluginFailure): void => {
    const id = failure.id
    if (id === undefined || failure.source === undefined) return
    setReinstalling(id)
    rowError(id, '')
    setMessage('')
    void api.reinstallProvider(id).then((provider) => {
      setFailures((current) => current.filter((one) => one.id !== id))
      setMessage(`${provider.name} reinstalled.`)
    }).catch((error: unknown) => rowError(id, `Could not reinstall ${failure.name}. ${reason(error)}`)).finally(() => setReinstalling(''))
  }, [api, rowError])
  return { api, ready, failures, adding, setAdding, applying, confirming, setConfirming, removing, reinstalling, rowErrors, message, setMessage, remove, apply, reinstall }
}

export type Libraries = ReturnType<typeof useLibraries>

export function AddAssistantButton({ libraries }: { readonly libraries: Libraries }): React.JSX.Element {
  return <button type="button" className="provider-library-add-button" onClick={() => libraries.setAdding(true)} disabled={libraries.adding}><Icon name="plus" size={14} />Add assistant</button>
}

/** Update and Remove for an assistant that came from a library, and the question before removing it. */
export function LibraryActions({ provider, libraries, children }: { readonly provider: LlmProviderInfo; readonly libraries: Libraries; readonly children: React.ReactNode }): React.JSX.Element {
  const removeButton = useRef<HTMLButtonElement>(null)
  const confirming = libraries.confirming === provider.id
  const removing = libraries.removing === provider.id
  const applying = libraries.applying === provider.id
  const ready = libraries.ready.has(provider.id)
  const cancel = (): void => { libraries.setConfirming(''); removeButton.current?.focus() }
  const error = libraries.rowErrors[provider.id] ?? ''
  return (
    <>
      <span className="assistant-library-actions">
        {ready ? <button type="button" className="quiet provider-library-apply" disabled={applying} onClick={() => libraries.apply(provider)}>{applying ? 'Applying…' : 'Apply update'}</button> : null}
        <button ref={removeButton} type="button" className="quiet provider-library-remove" aria-label={`Remove ${provider.name}`} aria-expanded={confirming} disabled={removing || applying} onClick={confirming ? cancel : () => libraries.setConfirming(provider.id)}>Remove</button>
      </span>
      {children}
      {error === '' ? null : <p className="provider-library-failure-reason" role="alert">{error}</p>}
      {confirming ? <div className="provider-library-confirm">
        <span>Remove {provider.name}? Its installed copy moves to Trash. Restart GeckIt to unload its code.</span>
        <div>
          <button type="button" className="quiet" disabled={removing} onClick={cancel}>Cancel</button>
          <button type="button" className="primary danger" disabled={removing} onClick={() => libraries.remove(provider)}>{removing ? 'Removing…' : 'Remove assistant'}</button>
        </div>
      </div> : null}
    </>
  )
}

export function FailedLibraryRow({ failure, libraries }: { readonly failure: ProviderPluginFailure; readonly libraries: Libraries }): React.JSX.Element {
  const removeButton = useRef<HTMLButtonElement>(null)
  const key = failure.id ?? failure.name
  const confirming = libraries.confirming === key
  const removing = failure.id !== undefined && libraries.removing === failure.id
  const reinstalling = failure.id !== undefined && libraries.reinstalling === failure.id
  const cancel = (): void => { libraries.setConfirming(''); removeButton.current?.focus() }
  const error = failure.id === undefined ? '' : libraries.rowErrors[failure.id] ?? ''
  return (
    <div className="assistant-option assistant-library provider-library-failure">
      <span className="assistant-option-copy">
        <span className="assistant-option-name"><Icon name={failure.icon ?? 'terminal'} size={14} /> {failure.name}</span>
        <span className="assistant-option-description" title={failure.source}>{failure.source?.replace(/^https:\/\//, '') ?? 'Installed locally'}</span>
      </span>
      <span className="assistant-library-actions">
        {failure.id !== undefined && failure.source !== undefined ? <button type="button" className="quiet provider-library-reinstall" aria-label={reinstalling ? `Reinstalling ${failure.name}` : `Reinstall ${failure.name}`} disabled={reinstalling || removing || confirming} onClick={() => libraries.reinstall(failure)}>{reinstalling ? 'Reinstalling…' : 'Reinstall'}</button> : null}
        {failure.id === undefined ? null : <button ref={removeButton} type="button" className="quiet provider-library-remove" aria-label={`Remove ${failure.name}`} aria-expanded={confirming} disabled={removing || reinstalling} onClick={confirming ? cancel : () => libraries.setConfirming(key)}>{confirming ? 'Cancel' : 'Remove'}</button>}
      </span>
      <p className="provider-library-failure-reason" role="alert">Could not load this assistant: {failure.error}</p>
      <p className="provider-library-failure-help">{failure.id === undefined ? 'GeckIt could not identify this library, so it cannot remove it here.' : failure.source === undefined ? 'Reinstall is unavailable because GeckIt could not identify its GitHub source.' : 'Reinstall from GitHub or remove this copy.'}</p>
      {error === '' ? null : <p className="provider-library-failure-reason" role="alert">{error}</p>}
      {confirming && failure.id !== undefined ? <div className="provider-library-confirm">
        <span>Remove {failure.name}? Its installed copy moves to Trash.</span>
        <div>
          <button type="button" className="quiet" disabled={removing} onClick={cancel}>Cancel</button>
          <button type="button" className="primary danger" disabled={removing} onClick={() => { if (failure.id !== undefined) libraries.remove({ id: failure.id, name: failure.name }) }}>{removing ? 'Removing…' : 'Remove assistant'}</button>
        </div>
      </div> : null}
    </div>
  )
}

/** The repository field that Add assistant opens, under the list. */
export function AddLibrary({ libraries }: { readonly libraries: Libraries }): React.JSX.Element | null {
  const form = useRef<HTMLFormElement>(null)
  const [repository, setRepository] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  useLayoutEffect(() => { if (libraries.adding) form.current?.scrollIntoView({ block: 'center' }) }, [libraries.adding])
  if (!libraries.adding) return null
  const close = (): void => { libraries.setAdding(false); setRepository(''); setError('') }
  return (
    <>
      <form ref={form} className="provider-library-add" onSubmit={(event) => {
        event.preventDefault()
        setInstalling(true)
        setError('')
        void libraries.api.installProvider(repository.trim()).then((provider) => { close(); libraries.setMessage(`${provider.name} added. Turn it on above.`) }).catch((failure: unknown) => setError(reason(failure))).finally(() => setInstalling(false))
      }}>
        <input autoFocus id="provider-repository" type="url" required value={repository} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" onChange={(event) => setRepository(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && !installing) { event.stopPropagation(); close() } }} />
        <button type="submit" className="primary" disabled={installing || repository.trim() === ''}>{installing ? 'Adding…' : 'Add'}</button>
        <button type="button" className="quiet" disabled={installing} onClick={close}>Cancel</button>
      </form>
      {error === '' ? null : <span className="error" role="alert">{error}</span>}
      <p className="provider-library-trust">An assistant from GitHub runs its code on this computer. Add a repository you trust.</p>
    </>
  )
}

/** Automatic updates and Check now, which also cover channel libraries. */
export function LibraryUpdates({ settings, change, libraries }: { readonly settings: Settings; readonly change: (change: Partial<Settings>) => void; readonly libraries: Libraries }): React.JSX.Element {
  const restart = useRef<HTMLParagraphElement>(null)
  const [checking, setChecking] = useState(false)
  useLayoutEffect(() => { if (settings.providerRemovalPending) restart.current?.focus() }, [settings.providerRemovalPending])
  return (
    <>
      {settings.providerRemovalPending ? <p ref={restart} className="provider-library-restart" role="status" tabIndex={-1}>Restart GeckIt to finish removing assistants.</p> : null}
      {libraries.message === '' ? null : <span className="assistant-library-message" role="status">{libraries.message}</span>}
      <div className="provider-library-updates">
        <label className="check"><input type="checkbox" checked={settings.providerAutoUpdate} onChange={(event) => change({ providerAutoUpdate: event.target.checked })} />Update libraries automatically</label>
        {settings.providerPlugins.length === 0 ? null : <button type="button" className="quiet" disabled={checking} onClick={() => {
          setChecking(true)
          libraries.setMessage('')
          void libraries.api.checkProviderUpdates().then((result) => libraries.setMessage(result.failed.length > 0 ? 'Could not check every assistant. Try again.' : result.ready.length === 0 ? 'Assistants are up to date.' : '')).catch(() => libraries.setMessage('Could not check every assistant. Try again.')).finally(() => setChecking(false))
        }}>{checking ? 'Checking…' : 'Check now'}</button>}
      </div>
    </>
  )
}
