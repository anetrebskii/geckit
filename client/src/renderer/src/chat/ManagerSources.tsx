import { useEffect, useRef, useState } from 'react'

import type { ManagerView } from '../../../shared/manager'
import { DEFAULT_MANAGER_INTAKE } from '../../../shared/manager-intake'
import type { ManagerIntakeConfig, ManagerWorkingWindow, VoiceMemosConnection } from '../../../shared/manager-intake'
import { Icon } from '../ui/Icon'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const ITEM_STATES = { 'waiting-sync': 'Waiting for recording to finish syncing', transcribing: 'Transcribing locally', classifying: 'Reviewing recording', 'awaiting-user': 'Waiting for your answer in Telegram', claiming: 'Handing to Manager', claimed: 'Handed to Manager', note: 'Note saved', ignored: 'Skipped', failed: 'Failed' } as const
const SOURCE_STATES = { disabled: 'Disabled', baseline: 'Baseline not established yet', ready: 'Ready for intake', blocked: 'Access or setup needed' } as const
const INTAKE_STATES = { off: 'Automatic intake is off. Manual Manager work is unchanged.', 'outside-hours': 'Outside working hours', ready: 'Watching for new recordings', blocked: 'Automatic intake needs attention' } as const

function workingSummary(windows: ManagerIntakeConfig['windows']): string {
  if (windows.length === 0) return 'No working hours set'
  return windows.map((one) => `${one.days.length === 7 ? 'Every day' : one.days.length === 5 && [1, 2, 3, 4, 5].every((day) => one.days.includes(day)) ? 'Mon–Fri' : DAY_ORDER.filter((day) => one.days.includes(day)).map((day) => DAYS[day]).join(', ')} · ${one.start}–${one.end}${one.end < one.start ? ' next day' : ''}`).join('; ')
}

function connectionCopy(connection: VoiceMemosConnection): string {
  if (connection.state === 'connected') return 'Voice Memos connected'
  if (connection.state === 'access') return 'Allow GeckIt in System Settings → Privacy & Security → Full Disk Access, then check again.'
  if (connection.state === 'missing') return 'Open Voice Memos on this Mac and turn on Voice Memos in iCloud, then check again.'
  return connection.detail
}

export function ManagerSources({ view }: { readonly view: ManagerView }): React.JSX.Element {
  const current = view.config.intake ?? DEFAULT_MANAGER_INTAKE
  const fresh = (): ManagerIntakeConfig => view.config.intake ?? { ...DEFAULT_MANAGER_INTAKE, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  const [draft, setDraft] = useState<ManagerIntakeConfig>(fresh)
  const [base, setBase] = useState(JSON.stringify(current))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [connection, setConnection] = useState<VoiceMemosConnection>()
  const [checking, setChecking] = useState(false)
  const check = useRef({ active: true, busy: false, generation: 0 })
  useEffect(() => { const state = check.current; state.active = true; return () => { state.active = false; state.generation++ } }, [])
  const edit = (change: Partial<ManagerIntakeConfig>): void => { setDraft((before) => ({ ...before, ...change })); setSaved(false); setError('') }
  const windowAt = (index: number, change: Partial<ManagerWorkingWindow>): void => edit({ windows: draft.windows.map((one, at) => at === index ? { ...one, ...change } : one) })
  const connectedSource = draft.sources.some((one) => one.enabled)
  const probe = async (action?: 'privacy'): Promise<void> => {
    if (check.current.busy) return
    const generation = ++check.current.generation
    check.current.busy = true; setChecking(true)
    try {
      const result = await window.geckit.manager.voiceMemos(action)
      if (check.current.active && check.current.generation === generation) setConnection(result)
    } catch (caught) {
      if (check.current.active && check.current.generation === generation) setConnection({ state: 'failed', detail: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      check.current.busy = false
      if (check.current.active && check.current.generation === generation) setChecking(false)
    }
  }
  const connect = (): void => {
    edit({ sources: draft.sources.length === 0 ? [{ id: crypto.randomUUID(), kind: 'voice-memos', enabled: true }] : draft.sources.map((one, at) => at === 0 ? { ...one, enabled: true } : one) })
    void probe()
  }
  const save = async (): Promise<void> => {
    setError('')
    if (base !== JSON.stringify(current)) { setError('These settings changed in another window. Reload them before saving.'); return }
    try { new Intl.DateTimeFormat('en', { timeZone: draft.timeZone }).format() } catch { setError('Enter a valid IANA time zone, such as Europe/Samara.'); setHoursOpen(true); return }
    if (draft.windows.some((one) => one.days.length === 0 || one.start === '' || one.end === '' || one.start === one.end)) { setError('Choose at least one day and different start and end times for each interval.'); setHoursOpen(true); return }
    if (draft.enabled && (draft.windows.length === 0 || !connectedSource)) { setError('Connect Voice Memos and set working hours before turning on automatic intake.'); return }
    setSaving(true)
    try {
      const next = await window.geckit.manager.configure({ intake: draft })
      const config = next.config.intake ?? DEFAULT_MANAGER_INTAKE
      setDraft(config); setBase(JSON.stringify(config)); setSaved(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setSaving(false) }
  }
  return <form className="manager-sources" aria-labelledby="manager-sources-title" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <h4 id="manager-sources-title">Automatic task sources</h4>
    <div className="manager-source-card">
      <div className="manager-source-heading"><span className="manager-source-icon"><Icon name="mic" /></span><div><strong>Apple Voice Memos</strong><p>Record on your iPhone. Review new recordings in Telegram.</p></div></div>
      <div className="manager-source-connect"><button type="button" className={connectedSource ? 'quiet' : 'primary'} disabled={saving || checking} onClick={connectedSource ? () => { void probe() } : connect}>{checking ? 'Checking Voice Memos…' : connectedSource ? 'Check again' : 'Connect Voice Memos'}</button>{connection?.state !== 'access' ? null : <button type="button" className="quiet" disabled={saving || checking} onClick={() => { void probe('privacy') }}>Open Privacy Settings</button>}{draft.sources.length === 0 ? null : <label className="manager-sources-check"><input type="checkbox" checked={connectedSource} disabled={saving || checking} onChange={(event) => edit({ sources: draft.sources.map((one) => ({ ...one, enabled: event.target.checked })) })} />Use Voice Memos</label>}</div>
      {checking ? <p className="manager-source-readiness" role="status">Checking Voice Memos…</p> : connection === undefined ? <p className="manager-source-readiness">{draft.sources.length === 0 ? 'Connect to check access on this Mac.' : 'Connection has not been checked in this window.'}</p> : <p className="manager-source-readiness" role="status" data-state={connection.state}>{connectionCopy(connection)}</p>}
      {connection?.transcription === undefined ? null : <p className="manager-source-readiness" role="status">{connection.transcription.ready ? 'Local transcription is ready.' : 'Local transcription is not ready. Open GeckIt Transcribe to finish setup.'}</p>}
      {draft.sources.length > 1 ? <p>{draft.sources.length} saved Voice Memos connections are retained.</p> : null}
      {view.intake?.sources.filter((one) => one.state === 'blocked').map((one) => <p className="manager-error" role="status" key={one.id}>{one.detail ?? SOURCE_STATES[one.state]}</p>)}
      <p className="manager-source-baseline">Existing recordings are excluded. Only new recordings will be reviewed.</p>
    </div>
    <div className="manager-source-hours">
      <div className="manager-setting"><div><strong>Working hours</strong><p>{workingSummary(draft.windows)}</p><span className="manager-source-zone">{draft.timeZone}</span></div><button type="button" className="quiet" aria-expanded={hoursOpen} disabled={saving} onClick={() => setHoursOpen((before) => !before)}>{hoursOpen ? 'Done editing hours' : 'Edit hours'}</button></div>
      {!hoursOpen ? null : <div className="manager-source-hours-editor">
        {draft.windows.map((one, index) => <div className="manager-source-window" role="group" aria-label={`Working interval ${index + 1}`} key={index}>
          <div className="manager-source-days">{DAY_ORDER.map((at) => <button type="button" key={at} aria-label={`${DAYS[at]}, interval ${index + 1}`} aria-pressed={one.days.includes(at)} className={one.days.includes(at) ? 'on' : ''} disabled={saving} onClick={() => windowAt(index, { days: one.days.includes(at) ? one.days.filter((value) => value !== at) : [...one.days, at].sort() })}>{DAYS[at]}</button>)}</div>
          <div className="manager-source-times"><label>From<input type="time" aria-label={`Start, interval ${index + 1}`} value={one.start} disabled={saving} onChange={(event) => windowAt(index, { start: event.target.value })} /></label><label>To<input type="time" aria-label={`End, interval ${index + 1}`} value={one.end} disabled={saving} onChange={(event) => windowAt(index, { end: event.target.value })} /></label><button type="button" className="quiet" disabled={saving} onClick={() => edit({ windows: draft.windows.filter((_, at) => at !== index) })}>Remove interval {index + 1}</button></div>
        </div>)}
        <div className="manager-actions"><button type="button" className="quiet" disabled={saving} onClick={() => edit({ windows: [...draft.windows, { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }] })}>Add interval</button></div>
        <label className="manager-source-timezone">Time zone<input value={draft.timeZone} disabled={saving} onChange={(event) => edit({ timeZone: event.target.value })} /></label>
        <p>An end time before the start continues into the next day.</p>
      </div>}
    </div>
    <label className="manager-sources-check manager-source-enable"><input type="checkbox" checked={draft.enabled} disabled={saving || checking} onChange={(event) => edit({ enabled: event.target.checked })} />Enable automatic intake</label>
    <p>Transcribed locally. Your Manager reviews the transcript; you decide in Telegram.</p>
    <p className="manager-sources-status" role="status">{INTAKE_STATES[view.intake?.state ?? 'off']}</p>
    {view.intake?.detail === undefined ? null : <p className="manager-error" role="status">{view.intake.detail}</p>}
    <p>Working hours apply only to new task sources. Manual messages and queued work continue at any time.</p>
    <div className="manager-actions"><button type="submit" className={connectedSource ? 'primary' : 'quiet'} disabled={saving || checking}>{saving ? 'Saving...' : 'Save task sources'}</button>{base === JSON.stringify(current) ? null : <button type="button" className="quiet" disabled={saving || checking} onClick={() => { check.current.generation++; setDraft(fresh()); setBase(JSON.stringify(current)); setConnection(undefined); setError(''); setSaved(false) }}>Reload source settings</button>}{saved ? <span role="status">Settings saved. Access and intake readiness are separate.</span> : null}</div>
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <details className="manager-source-history"><summary>Privacy and recent intake{view.intake?.items.length ? ` (${Math.min(view.intake.items.length, 20)})` : ''}</summary><p>Manager and paired Telegram must be connected. GeckIt must stay open; checks run during working hours.</p><p>Recording transcripts are sent to your selected Manager assistant for classification. Audio transcription stays on this computer.</p>{view.intake?.notesDirectory === undefined ? null : <p>Saved notes: <span className="manager-source-path">{view.intake.notesDirectory}</span></p>}{view.intake === undefined || view.intake.items.length === 0 ? <p>No recordings have been reviewed yet.</p> : <div className="manager-source-recent"><ul>{view.intake.items.slice(0, 20).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{ITEM_STATES[item.state]}</span>{item.summary === undefined ? null : <p>{item.summary}</p>}{item.error === undefined ? null : <p className="manager-error">{item.error}</p>}{item.notePath === undefined ? null : <p className="manager-source-path">{item.notePath}</p>}</li>)}</ul></div>}</details>
  </form>
}
