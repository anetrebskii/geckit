import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Settings } from '../../../shared/api'
import type { LlmProviderInfo, ProviderPluginFailure } from '../../../shared/providers'
import type { Geckit } from '../../../preload'
import { removeProviderLibrary } from '../../../shared/library-removal'
import { Icon } from './Icon'

export type LibraryApi = Pick<Geckit['chat'], 'installProvider' | 'reinstallProvider' | 'uninstallProvider' | 'applyProviderUpdate' | 'checkProviderUpdates' | 'getProviderPluginFailures'>

type Part = {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
  readonly api?: LibraryApi
}

function FailedProviderLibraryRow({ failure, confirming, removing, reinstalling, removeError, reinstallError, onAsk, onCancel, onRemove, onReinstall }: {
  readonly failure: ProviderPluginFailure
  readonly confirming: boolean
  readonly removing: boolean
  readonly reinstalling: boolean
  readonly removeError: string
  readonly reinstallError: string
  readonly onAsk: () => void
  readonly onCancel: () => void
  readonly onRemove: () => void
  readonly onReinstall: () => void
}): React.JSX.Element {
  const removeButton = useRef<HTMLButtonElement>(null)
  const cancel = (): void => { onCancel(); removeButton.current?.focus() }
  return (
    <div className="provider-library-row provider-library-failure">
      <span className="provider-library-icon"><Icon name={failure.icon ?? 'terminal'} size={16} /></span>
      <span className="provider-library-copy"><strong>{failure.name}</strong><span title={failure.source}>{failure.source?.replace(/^https:\/\//, '') ?? 'Installed locally'}</span></span>
      {failure.id !== undefined && failure.source !== undefined ? <button type="button" className="quiet provider-library-reinstall" aria-label={reinstalling ? `Reinstalling ${failure.name}` : `Reinstall ${failure.name}`} disabled={reinstalling || removing || confirming} onClick={onReinstall}>{reinstalling ? 'Reinstalling…' : 'Reinstall'}</button> : null}
      {failure.id === undefined ? null : <button ref={removeButton} type="button" className="quiet provider-library-remove" aria-label={`Remove ${failure.name}`} aria-expanded={confirming} disabled={removing || reinstalling} onClick={confirming ? cancel : onAsk}>{confirming ? 'Cancel' : 'Remove'}</button>}
      <p className="provider-library-failure-reason" role="alert">Could not load this library: {failure.error}</p>
      <p className="provider-library-failure-help">Reinstall from GitHub or remove this copy.</p>
      {failure.id === undefined ? <p className="provider-library-failure-help">GeckIt could not identify this library, so it cannot remove it here.</p> : null}
      {failure.id === undefined || failure.source === undefined ? <p className="provider-library-failure-help">Reinstall is unavailable because GeckIt could not identify this library&apos;s provider ID or GitHub source.</p> : null}
      {removeError === '' ? null : <p className="provider-library-failure-reason" role="alert">{removeError}</p>}
      {reinstallError === '' ? null : <p className="provider-library-failure-reason" role="alert">{reinstallError}</p>}
      {confirming ? <div className="provider-library-confirm">
        <span>Remove {failure.name}? Its installed copy moves to Trash.</span>
        <div>
          <button type="button" className="quiet" disabled={removing} onClick={cancel}>Cancel</button>
          <button type="button" className="primary danger" disabled={removing} onClick={onRemove}>{removing ? 'Removing…' : 'Remove library'}</button>
        </div>
      </div> : null}
    </div>
  )
}

const ProviderLibraryRow = memo(function ProviderLibraryRow({ provider, ready, applying, confirming, removing, focusOnMount, onFocused, onApply, onAsk, onCancel, onRemove }: {
  readonly provider: LlmProviderInfo
  readonly ready: boolean
  readonly applying: boolean
  readonly confirming: boolean
  readonly removing: boolean
  readonly focusOnMount: boolean
  readonly onFocused: () => void
  readonly onApply: (provider: LlmProviderInfo) => Promise<boolean>
  readonly onAsk: (id: LlmProviderInfo['id']) => void
  readonly onCancel: () => void
  readonly onRemove: (provider: LlmProviderInfo) => void
}): React.JSX.Element {
  const removeButton = useRef<HTMLButtonElement>(null)
  const focusAfterApply = useRef(false)
  useLayoutEffect(() => {
    if (focusOnMount) {
      removeButton.current?.focus()
      onFocused()
    }
  }, [focusOnMount, onFocused])
  useLayoutEffect(() => {
    if (!ready && focusAfterApply.current) {
      focusAfterApply.current = false
      removeButton.current?.focus()
    }
  }, [ready])
  const cancel = (): void => { onCancel(); removeButton.current?.focus() }
  const apply = (): void => {
    focusAfterApply.current = true
    void onApply(provider).then((applied) => { if (!applied) focusAfterApply.current = false })
  }
  return (
    <div className="provider-library-row">
      <span className="provider-library-icon"><Icon name={provider.icon} size={16} /></span>
      <span className="provider-library-copy"><strong>{provider.name}</strong><span title={provider.source}>{provider.source?.replace(/^https:\/\//, '') ?? 'Installed locally'}</span></span>
      {ready ? <span className="provider-library-ready">Update ready</span> : null}
      {ready ? <button type="button" className="quiet provider-library-apply" disabled={applying} onClick={apply}>{applying ? 'Applying…' : 'Apply update'}</button> : null}
      <button ref={removeButton} type="button" className="quiet provider-library-remove" aria-label={`Remove ${provider.name}`} aria-expanded={confirming} disabled={removing || applying} onClick={confirming ? cancel : () => onAsk(provider.id)}>Remove</button>
      {confirming ? <div className="provider-library-confirm">
        <span>Remove {provider.name}? Its installed copy moves to Trash. Restart GeckIt to unload its code.</span>
        <div>
          <button type="button" className="quiet" disabled={removing} onClick={cancel}>Cancel</button>
          <button type="button" className="primary danger" disabled={removing} onClick={() => onRemove(provider)}>{removing ? 'Removing…' : 'Remove library'}</button>
        </div>
      </div> : null}
    </div>
  )
})


export function Libraries({ settings, change, api = window.geckit.chat }: Part): React.JSX.Element {
  const readyLibraries = useMemo(() => new Set(settings.providerUpdatesReady), [settings.providerUpdatesReady])
  const [failedLibraries, setFailedLibraries] = useState<readonly ProviderPluginFailure[] | undefined>(undefined)
  const addForm = useRef<HTMLFormElement>(null)
  const restartNotice = useRef<HTMLParagraphElement>(null)
  const [repository, setRepository] = useState('')
  const [adding, setAdding] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState('')
  const [applying, setApplying] = useState('')
  const [applyError, setApplyError] = useState('')
  const [confirming, setConfirming] = useState('')
  const [removing, setRemoving] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [confirmingFailure, setConfirmingFailure] = useState('')
  const [removingFailure, setRemovingFailure] = useState('')
  const [reinstallingFailure, setReinstallingFailure] = useState('')
  const [reinstallFocus, setReinstallFocus] = useState('')
  const [failedRemoveErrors, setFailedRemoveErrors] = useState<readonly (Pick<ProviderPluginFailure, 'name'> & { readonly message: string })[]>([])
  const [failedReinstallErrors, setFailedReinstallErrors] = useState<readonly (Pick<ProviderPluginFailure, 'name'> & { readonly message: string })[]>([])
  useEffect(() => { void api.getProviderPluginFailures().then(setFailedLibraries).catch(() => setFailedLibraries([])) }, [api])
  const failed = failedLibraries ?? []
  const askRemove = useCallback((id: LlmProviderInfo['id']): void => { setConfirming(id); setRemoveError('') }, [])
  const cancelRemove = useCallback((): void => setConfirming(''), [])
  const removeLibrary = useCallback((provider: LlmProviderInfo): void => {
    setRemoving(provider.id)
    setRemoveError('')
    void removeProviderLibrary(api, provider).then((error) => {
      if (error === undefined) setConfirming('')
      else setRemoveError(error)
    }).finally(() => setRemoving(''))
  }, [api])
  const removeFailedLibrary = useCallback((failure: ProviderPluginFailure): void => {
    if (failure.id === undefined) return
    setRemovingFailure(failure.name)
    setFailedRemoveErrors((current) => current.filter((one) => one.name !== failure.name))
    void removeProviderLibrary(api, { id: failure.id, name: failure.name }).then((error) => {
      if (error === undefined) {
        setFailedLibraries((current) => (current ?? []).filter((one) => one.id !== failure.id))
        setConfirmingFailure('')
      } else setFailedRemoveErrors((current) => [...current.filter((one) => one.name !== failure.name), { name: failure.name, message: error }])
    }).finally(() => setRemovingFailure(''))
  }, [api])
  const reinstallFailedLibrary = useCallback((failure: ProviderPluginFailure): void => {
    if (failure.id === undefined || failure.source === undefined) return
    const id = failure.id
    setReinstallingFailure(failure.name)
    setCheckMessage('')
    setFailedReinstallErrors((current) => current.filter((one) => one.name !== failure.name))
    void api.reinstallProvider(id).then((provider) => {
      setFailedLibraries((current) => (current ?? []).filter((one) => one.id !== id))
      setCheckMessage(`${provider.name} reinstalled.`)
      setReinstallFocus(id)
    }).catch((error: Error) => {
      const reason = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
      setFailedReinstallErrors((current) => [...current.filter((one) => one.name !== failure.name), { name: failure.name, message: `Could not reinstall ${failure.name}. ${reason}` }])
    }).finally(() => setReinstallingFailure(''))
  }, [api])
  const applyLibrary = useCallback(async (provider: LlmProviderInfo): Promise<boolean> => {
    setApplying(provider.id)
    setApplyError('')
    setCheckMessage('')
    try {
      await api.applyProviderUpdate(provider.id)
      setCheckMessage(`${provider.name} updated.`)
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error)
      setApplyError(`Could not apply ${provider.name}. ${reason}`)
      return false
    } finally {
      setApplying('')
    }
  }, [api])
  useLayoutEffect(() => {
    if (adding) addForm.current?.scrollIntoView({ block: 'center' })
  }, [adding])
  useLayoutEffect(() => {
    if (settings.providerRemovalPending && (removing !== '' || removingFailure !== '')) restartNotice.current?.focus()
  }, [settings.providerRemovalPending, removing, removingFailure])
  const clearReinstallFocus = useCallback((): void => setReinstallFocus(''), [])
  return (
    <section className="provider-libraries" aria-labelledby="provider-libraries-title">
      <div className="provider-library-head">
        <h3 id="provider-libraries-title">Libraries</h3>
        <button type="button" className="provider-library-add-button" onClick={() => setAdding(true)} disabled={adding}><Icon name="plus" size={14} />Add library</button>
      </div>
      <p className="provider-library-intro">Providers from GitHub. Apply updates without restarting GeckIt.</p>
      {settings.providerPlugins.length === 0 && failedLibraries === undefined ? null : settings.providerPlugins.length === 0 && failed.length === 0 ? adding ? null : <p className="provider-library-empty">No libraries installed.</p> : <div className="provider-library-list">
        {failed.map((failure) => <FailedProviderLibraryRow key={failure.id ?? failure.name} failure={failure} confirming={confirmingFailure === (failure.id ?? failure.name)} removing={removingFailure === failure.name} reinstalling={reinstallingFailure === failure.name} removeError={failedRemoveErrors.find((one) => one.name === failure.name)?.message ?? ''} reinstallError={failedReinstallErrors.find((one) => one.name === failure.name)?.message ?? ''} onAsk={() => setConfirmingFailure(failure.id ?? failure.name)} onCancel={() => setConfirmingFailure('')} onRemove={() => removeFailedLibrary(failure)} onReinstall={() => reinstallFailedLibrary(failure)} />)}
        {settings.providerPlugins.map((one) => <ProviderLibraryRow key={one.id} provider={one} ready={readyLibraries.has(one.id)} applying={applying === one.id} confirming={confirming === one.id} removing={removing === one.id} focusOnMount={reinstallFocus === one.id} onFocused={clearReinstallFocus} onApply={applyLibrary} onAsk={askRemove} onCancel={cancelRemove} onRemove={removeLibrary} />)}
      </div>}
      {settings.providerRemovalPending ? <p ref={restartNotice} className="provider-library-restart" role="status" tabIndex={-1}>Restart GeckIt to finish removing libraries.</p> : null}
      {removeError === '' ? null : <span className="error" role="alert">{removeError}</span>}
      {applyError === '' ? null : <span className="error" role="alert">{applyError}</span>}
      {adding ? <form ref={addForm} className="provider-library-add" onSubmit={(event) => {
          event.preventDefault()
          setInstalling(true)
          setInstallError('')
          void api.installProvider(repository.trim()).then(() => { setRepository(''); setAdding(false) }).catch((error: Error) => setInstallError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''))).finally(() => setInstalling(false))
        }}>
        <input autoFocus id="provider-repository" type="url" required value={repository} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" onChange={(event) => setRepository(event.target.value)} />
        <button type="submit" className="primary" disabled={installing || repository.trim() === ''}>{installing ? 'Adding library…' : 'Add'}</button>
        <button type="button" className="quiet" disabled={installing} onClick={() => { setAdding(false); setRepository(''); setInstallError('') }}>Cancel</button>
      </form> : null}
      {installError === '' ? null : <span className="error" role="alert">{installError}</span>}
      {checkMessage === '' ? null : <span role="status">{checkMessage}</span>}
      {adding ? <p className="provider-library-trust">Provider code runs on this computer. Add a repository you trust.</p> : null}
      <div className="provider-library-updates">
        <label className="check"><input type="checkbox" checked={settings.providerAutoUpdate} onChange={(event) => change({ providerAutoUpdate: event.target.checked })} />Update libraries automatically</label>
        {settings.providerPlugins.length === 0 ? null : <button type="button" className="quiet" disabled={checking} onClick={() => {
          setChecking(true)
          setCheckMessage('')
          void api.checkProviderUpdates().then((result) => setCheckMessage(result.failed.length > 0 ? 'Could not check every library. Try again.' : result.ready.length === 0 ? 'Libraries are up to date.' : '')).catch(() => setCheckMessage('Could not check every library. Try again.')).finally(() => setChecking(false))
        }}>{checking ? 'Checking…' : 'Check now'}</button>}
      </div>
    </section>
  )
}
