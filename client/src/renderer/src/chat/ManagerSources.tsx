import { useEffect, useId, useRef, useState } from 'react'

import type { ManagerView } from '../../../shared/manager'
import { DEFAULT_MANAGER_INTAKE } from '../../../shared/manager-intake'
import type { ManagerIntakeConfig, ManagerWorkingWindow, VoiceMemosConnection } from '../../../shared/manager-intake'
import { Icon } from '../ui/Icon'
import { LOCAL_ZONE, ZonePicker, zoneOffset } from './ZonePicker'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const ITEM_STATES = { 'waiting-sync': 'Waiting for recording to finish syncing', transcribing: 'Transcribing locally', classifying: 'Reviewing recording', 'awaiting-user': 'Waiting for your answer in Telegram', claiming: 'Handing to Manager', claimed: 'Handed to Manager', note: 'Note saved', ignored: 'Skipped', failed: 'Failed' } as const
const INTAKE_STATES = { off: 'Automatic intake is off. Manual Manager work is unchanged.', 'outside-hours': 'Outside working hours', ready: 'Watching for new recordings', blocked: 'Automatic intake needs attention' } as const
const NEW_WINDOW: ManagerWorkingWindow = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }

function daysLabel(days: ManagerWorkingWindow['days']): string {
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Mon–Fri'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends'
  return DAY_ORDER.filter((day) => days.includes(day)).map((day) => DAYS[day]).join(', ')
}

function windowProblem(one: ManagerWorkingWindow): string | undefined {
  if (one.days.length === 0) return 'Choose at least one day.'
  if (one.start === '' || one.end === '') return 'Enter a start and an end time.'
  if (one.start === one.end) return 'Start and end must differ.'
  return undefined
}

function connectionCopy(connection: VoiceMemosConnection): string {
  if (connection.state === 'connected') return 'Voice Memos connected'
  if (connection.state === 'access') return 'Allow GeckIt in System Settings → Privacy & Security → Full Disk Access, then check again.'
  if (connection.state === 'missing') return 'Open Voice Memos on this Mac and turn on Voice Memos in iCloud, then check again.'
  return connection.detail
}

export function ManagerSources({ view }: { readonly view: ManagerView }): React.JSX.Element {
  const id = useId()
  const current = view.config.intake ?? DEFAULT_MANAGER_INTAKE
  const fresh = (): ManagerIntakeConfig => view.config.intake ?? { ...DEFAULT_MANAGER_INTAKE, timeZone: LOCAL_ZONE }
  const [draft, setDraft] = useState<ManagerIntakeConfig>(fresh)
  const [kept, setKept] = useState(() => JSON.stringify(fresh()))
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
  const changed = JSON.stringify(draft) !== kept
  const offset = zoneOffset(draft.timeZone)
  const busy = saving || checking
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
    if (offset === undefined) { setError('Enter a valid IANA time zone, such as Europe/Samara.'); setHoursOpen(true); return }
    if (draft.windows.some((one) => windowProblem(one) !== undefined)) { setError('Choose at least one day and different start and end times for each interval.'); setHoursOpen(true); return }
    if (draft.enabled && (draft.windows.length === 0 || !connectedSource)) { setError('Connect Voice Memos and set working hours before turning on automatic intake.'); return }
    setSaving(true)
    try {
      const next = await window.geckit.manager.configure({ intake: draft })
      const config = next.config.intake ?? DEFAULT_MANAGER_INTAKE
      setDraft(config); setKept(JSON.stringify(config)); setBase(JSON.stringify(config)); setSaved(true); setHoursOpen(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setSaving(false) }
  }
  const discard = (): void => { setDraft(JSON.parse(kept) as ManagerIntakeConfig); setHoursOpen(false); setError(''); setSaved(false) }
  const reload = (): void => { check.current.generation++; const next = fresh(); setDraft(next); setKept(JSON.stringify(next)); setBase(JSON.stringify(current)); setConnection(undefined); setError(''); setSaved(false); setHoursOpen(false) }
  const blocked = view.intake?.sources.filter((one) => one.state === 'blocked') ?? []
  const sourceState = checking ? 'checking' : connection?.state ?? (blocked.length > 0 ? 'blocked' : draft.sources.length === 0 ? 'none' : 'unchecked')
  const sourceCopy = checking ? 'Checking Voice Memos…' : connection !== undefined ? connectionCopy(connection) : blocked.length > 0 ? blocked.map((one) => one.detail ?? 'Access or setup needed').join(' ') : draft.sources.length === 0 ? 'Record on your iPhone. Review new recordings in Telegram.' : 'Not checked in this window.'
  const intakeCopy = !draft.enabled ? INTAKE_STATES.off : current.enabled ? INTAKE_STATES[view.intake?.state ?? 'off'] : 'Turns on when you save.'
  return <form className="manager-sources" aria-labelledby={`${id}-title`} onSubmit={(event) => { event.preventDefault(); void save() }}>
    <div className="manager-sources-head">
      <div>
        <h4 id={`${id}-title`}>Automatic task sources</h4>
        <p id={`${id}-state`} className="manager-sources-status" role="status">{intakeCopy}</p>
      </div>
      <input className="assistant-toggle" type="checkbox" role="switch" aria-label="Automatic intake" aria-describedby={`${id}-state`} checked={draft.enabled} disabled={busy} onChange={(event) => edit({ enabled: event.target.checked })} />
    </div>
    {view.intake?.detail === undefined ? null : <p className="manager-error" role="status">{view.intake.detail}</p>}

    <div className="manager-source-list">
      <div className="manager-source-row">
        <span className="manager-source-icon"><Icon name="mic" size={14} /></span>
        <div className="manager-source-copy">
          <strong>Apple Voice Memos</strong>
          <span className="manager-source-readiness" role="status" data-state={sourceState}>{sourceCopy}</span>
          {connection?.transcription === undefined || checking ? null : <span className="manager-source-readiness" data-state={connection.transcription.ready ? 'ready' : 'not-ready'}>{connection.transcription.ready ? 'Local transcription is ready.' : 'Local transcription is not ready. Open GeckIt Transcribe to finish setup.'}</span>}
          {draft.sources.length === 0 ? null : <span className="manager-source-links">
            <button type="button" className="manager-source-link" disabled={busy} onClick={() => { void probe() }}>Check again</button>
            {connection?.state !== 'access' ? null : <button type="button" className="manager-source-link" disabled={busy} onClick={() => { void probe('privacy') }}>Open Privacy Settings</button>}
          </span>}
        </div>
        {draft.sources.length === 0
          ? <button type="button" className="primary" disabled={busy} onClick={connect}>{checking ? 'Checking…' : 'Connect Voice Memos'}</button>
          : <input className="assistant-toggle" type="checkbox" role="switch" aria-label="Use Voice Memos" checked={connectedSource} disabled={busy} onChange={(event) => edit({ sources: draft.sources.map((one) => ({ ...one, enabled: event.target.checked })) })} />}
      </div>
    </div>
    <p className="manager-source-note">Existing recordings are excluded. Only new recordings will be reviewed.{draft.sources.length > 1 ? ` ${draft.sources.length} saved Voice Memos connections are retained.` : ''}</p>

    <div className="manager-hours-head">
      <h5 id={`${id}-hours`}>Working hours</h5>
      <button type="button" className="manager-source-link" aria-expanded={hoursOpen} aria-controls={`${id}-hours-list`} disabled={saving} onClick={() => setHoursOpen((before) => !before)}>{hoursOpen ? 'Done editing' : 'Edit hours'}</button>
    </div>
    <div id={`${id}-hours-list`} className={hoursOpen ? 'manager-hours editing' : 'manager-hours'} role="group" aria-labelledby={`${id}-hours`}>
      {!hoursOpen
        ? <>
          {draft.windows.length === 0
            ? <div className="manager-hours-row"><span className="manager-hours-empty">No working hours. New recordings wait until you add them.</span></div>
            : draft.windows.map((one, index) => <div className="manager-hours-row" key={index}><span>{daysLabel(one.days)}</span><span className="manager-hours-time">{one.start} – {one.end}{one.end < one.start ? <small> next day</small> : null}</span></div>)}
          <div className="manager-hours-row"><span className="manager-hours-label">Time zone</span><span className="manager-hours-zone">{draft.timeZone}{offset === undefined ? null : <small> {offset}</small>}</span></div>
        </>
        : <>
          {draft.windows.map((one, index) => {
            const problem = windowProblem(one)
            const clash = problem !== undefined && one.start === one.end
            return <div className="manager-hours-row manager-hours-window" role="group" aria-label={`Working interval ${index + 1}`} key={index}>
              <div className="manager-hours-days">{DAY_ORDER.map((at) => <button type="button" key={at} title={DAY_NAMES[at]} aria-label={`${DAYS[at]}, interval ${index + 1}`} aria-pressed={one.days.includes(at)} className={one.days.includes(at) ? 'on' : ''} disabled={saving} onClick={() => windowAt(index, { days: one.days.includes(at) ? one.days.filter((value) => value !== at) : [...one.days, at].sort() })}>{DAYS[at].slice(0, 2)}</button>)}</div>
              <div className="manager-hours-span">
                <input type="time" aria-label={`Start, interval ${index + 1}`} aria-invalid={clash} value={one.start} disabled={saving} onChange={(event) => windowAt(index, { start: event.target.value })} />
                <span aria-hidden="true">–</span>
                <input type="time" aria-label={`End, interval ${index + 1}`} aria-invalid={clash} value={one.end} disabled={saving} onChange={(event) => windowAt(index, { end: event.target.value })} />
              </div>
              <button type="button" className="icon-button" aria-label={`Remove interval ${index + 1}, ${daysLabel(one.days) || 'no days'} ${one.start}–${one.end}`} title="Remove" disabled={saving} onClick={() => edit({ windows: draft.windows.filter((_, at) => at !== index) })}><Icon name="trash" size={13} /></button>
              {problem !== undefined ? <p className="manager-hours-problem">{problem}</p> : one.end < one.start ? <p className="manager-hours-hint">Ends at {one.end} the next day.</p> : null}
            </div>
          })}
          <div className="manager-hours-row">
            <button type="button" className="manager-source-link" disabled={saving} onClick={() => edit({ windows: [...draft.windows, draft.windows.length === 0 ? NEW_WINDOW : { ...NEW_WINDOW, days: [0, 6] }] })}><Icon name="plus" size={12} /> Add interval</button>
          </div>
          <div className="manager-hours-row manager-hours-zone-edit">
            <span id={`${id}-zone`} className="manager-hours-label">Time zone</span>
            <ZonePicker value={draft.timeZone} disabled={saving} labelledBy={`${id}-zone`} onPick={(timeZone) => edit({ timeZone })} />
          </div>
        </>}
    </div>
    <p className="manager-source-note">Working hours apply only to new task sources. Manual messages and queued work continue at any time.</p>

    <div className="manager-actions manager-sources-actions">
      <button type="submit" className={changed ? 'primary' : 'quiet'} disabled={busy}>{saving ? 'Saving...' : 'Save task sources'}</button>
      {!changed ? null : <button type="button" className="quiet" disabled={busy} onClick={discard}>Discard changes</button>}
      {base === JSON.stringify(current) ? null : <button type="button" className="quiet" disabled={busy} onClick={reload}>Reload source settings</button>}
      {changed ? <span className="manager-sources-unsaved">Unsaved changes</span> : saved ? <span className="manager-sources-saved" role="status"><Icon name="check" size={12} /> Saved</span> : null}
    </div>
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <details className="manager-source-history"><summary>Privacy and recent intake{view.intake?.items.length ? ` (${Math.min(view.intake.items.length, 20)})` : ''}</summary><p>Manager and paired Telegram must be connected. GeckIt must stay open; checks run during working hours.</p><p>Recording transcripts are sent to your selected Manager assistant for classification. Audio transcription stays on this computer.</p>{view.intake?.notesDirectory === undefined ? null : <p>Saved notes: <span className="manager-source-path">{view.intake.notesDirectory}</span></p>}{view.intake === undefined || view.intake.items.length === 0 ? <p>No recordings have been reviewed yet.</p> : <div className="manager-source-recent"><ul>{view.intake.items.slice(0, 20).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{ITEM_STATES[item.state]}</span>{item.summary === undefined ? null : <p>{item.summary}</p>}{item.error === undefined ? null : <p className="manager-error">{item.error}</p>}{item.notePath === undefined ? null : <p className="manager-source-path">{item.notePath}</p>}</li>)}</ul></div>}</details>
  </form>
}
