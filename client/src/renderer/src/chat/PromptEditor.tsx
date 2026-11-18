import { useEffect, useMemo, useRef, useState } from 'react'

import { assistantsIn, modelName, shownProjects } from '../../../shared/api'
import { isCodexProvider, llmProviderInfo, providerModel, selectableProviders } from '../../../shared/providers'
import type { ClaudeModel, ModelsSaid, SessionProvider, Shortcut, ShortcutDraft } from '../../../shared/api'
import { isRemote } from '../../../shared/hosts'
import { cronOf, describeCron, nextRun, WEEKDAYS, whenOf } from '../../../shared/schedule'
import type { When } from '../../../shared/schedule'
import { defaultRecurrence, describeRecurrence, nextRecurrence, recurrenceError } from '../../../shared/recurrence'
import { clockText, dateField, dayText, civilDay, kindOf, onceError, onceFrom } from '../../../shared/prompt-kinds'
import type { PromptKind } from '../../../shared/prompt-kinds'
import { saveShortcut } from '../../../shared/shortcut-save'
import { shortcutChecklist } from '../../../shared/checklists'
import { ChecklistField } from './ChecklistField'
import { CustomRecurrence } from './CustomRecurrence'
import { ShortcutDestinationFields, useShortcutDestination } from './ShortcutDestinations'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { homePath, projectLabel } from './project'
import type { Chat } from './useChat'
import { EmployeeSelect } from '../employees/Employees'

export type ShortcutChat = Pick<Chat, 'settings' | 'root' | 'everyone' | 'goTo' | 'employees'> & Partial<Pick<Chat, 'change'>>

export type Repeats = 'custom' | When['kind']

export const REPEATS: readonly { readonly value: Repeats; readonly label: string }[] = [
  { value: 'hour', label: 'Every hour' },
  { value: 'day', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'week', label: 'Every week' },
  { value: 'custom', label: 'Custom...' },
  { value: 'cron', label: 'Cron' },
]

/** Where a new timetable starts. */
export const FIRST_CRON = '0 9 * * 1-5'

/** The same time of day, as another kind of timetable. */
export function turned(when: When, kind: When['kind']): When {
  const hour = 'hour' in when ? when.hour : 9
  const minute = 'minute' in when ? when.minute : 0
  switch (kind) {
    case 'hour':
      return { kind, minute }
    case 'day':
    case 'weekdays':
      return { kind, hour, minute }
    case 'week':
      return { kind, weekday: 'weekday' in when ? when.weekday : 1, hour, minute }
    case 'cron':
      return { kind, cron: cronOf(when) }
  }
}

export const KIND_NAME: Record<PromptKind, string> = { repeating: 'Repeating', scheduled: 'Scheduled', shortcut: 'Shortcut' }
export const NEW_LABEL: Record<PromptKind, string> = { repeating: 'New repeating', scheduled: 'New scheduled', shortcut: 'New shortcut' }
export const PAGE_NAME: Record<PromptKind, string> = { repeating: 'Repeating', scheduled: 'Scheduled', shortcut: 'Shortcuts' }

const clock = (hour: number, minute: number): string => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

/** "Every weekday around 09:00." when varied, "Every weekday at 09:00." when not. */
export function timetableSaid(draft: Pick<ShortcutDraft, 'cron' | 'recurrence' | 'vary'>): string {
  const said = draft.recurrence !== undefined ? describeRecurrence(draft.recurrence) : draft.cron === undefined ? '' : describeCron(draft.cron)
  return draft.vary === true ? said.replace(' at ', ' around ') : said
}

/** One editor for the three kinds: the kind is fixed when the prompt is made, and only the timing differs. */
export function PromptEditor({
  chat,
  given,
  now,
  onDone,
}: {
  readonly chat: ShortcutChat
  readonly given: ShortcutDraft
  readonly now: number
  readonly onDone: () => void
}): React.JSX.Element {
  const kind = kindOf(given)
  const [draft, setDraft] = useState<ShortcutDraft>(() => {
    const { goal: _goal, checklist: _checklist, startWindowMinutes: legacyWindow, ...rest } = given
    const checklist = shortcutChecklist(given)
    const varied = rest.vary ?? (legacyWindow !== undefined && legacyWindow > 0)
    return { ...rest, ...(kind === 'shortcut' ? {} : { vary: varied }), ...(checklist === undefined ? {} : { checklist }) }
  })
  useEffect(() => {
    const id = given.id
    if (id === undefined || kind !== 'scheduled') return
    window.geckit.shortcuts.hold(id, true)
    return () => window.geckit.shortcuts.hold(id, false)
  }, [given.id, kind])
  const destination = useShortcutDestination(chat.settings, draft.destination, (destination) => {
    const { destination: _destination, ...rest } = draft
    setDraft(destination === undefined ? rest : { ...rest, destination })
  })
  const manager = draft.target === 'manager'
  const provider = draft.provider ?? 'claude'
  const enabled = assistantsIn(chat.settings)
  const info = llmProviderInfo(provider, 'stream', chat.settings.providerPlugins)
  const available = enabled.includes(provider) && (info.localOnly !== true || !isRemote(draft.root))
  const assistant = info.name
  const [askedModels, setAskedModels] = useState<{ readonly provider: SessionProvider; readonly root: string; readonly said: ModelsSaid }>()
  useEffect(() => {
    if (manager || !available) return
    let current = true
    void window.geckit.chat.models(draft.root || undefined, provider).then((said) => {
      if (current) setAskedModels({ provider, root: draft.root, said: said ?? 'unsaid' })
    }).catch(() => {
      if (current) setAskedModels({ provider, root: draft.root, said: 'unsaid' })
    })
    return () => { current = false }
  }, [draft.root, provider, available, manager])
  const modelsSaid = available && askedModels?.provider === provider && askedModels.root === draft.root ? askedModels.said : 'unasked'
  const catalog: readonly ClaudeModel[] | undefined = Array.isArray(modelsSaid) ? modelsSaid : undefined
  // Kept apart from the line itself, so a cron being typed that happens to spell "every day" stays a cron line.
  const [repeats, setRepeats] = useState<Repeats>(() => given.recurrence !== undefined ? 'custom' : whenOf(given.cron ?? FIRST_CRON).kind)
  const [custom, setCustom] = useState(false)
  const repeatTrigger = useRef<HTMLDivElement>(null)
  const customOpener = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [failedDraft, setFailedDraft] = useState<ShortcutDraft>()
  const saveError = failedDraft === draft
  const [sure, setSure] = useState(false)
  const cron = draft.cron ?? FIRST_CRON
  const when = repeats === 'cron' ? ({ kind: 'cron', cron } as const) : turned(whenOf(cron), repeats === 'custom' ? 'weekdays' : repeats)
  const setWhen = (next: When): void => setDraft({ ...draft, cron: cronOf(next) })
  const zone = chat.settings.calendarTimeZone
  const ruleError = useMemo(() => draft.recurrence === undefined ? undefined : recurrenceError(draft.recurrence, zone), [draft.recurrence, zone])
  const next = useMemo(() => {
    if (draft.recurrence !== undefined) return nextRecurrence(draft.recurrence, now, zone)
    return draft.cron === undefined ? undefined : nextRun(draft.cron, now)
  }, [draft.recurrence, draft.cron, now, zone])
  const [onceDate, setOnceDate] = useState(() => dateField(given.at ?? now, zone))
  const [onceTime, setOnceTime] = useState(() => clockText(given.at ?? now, zone))
  const once = kind === 'scheduled' ? onceFrom(onceDate, onceTime, zone) : Number.NaN
  const unchangedOnce = given.id !== undefined && once === given.at
  const wrongOnce = kind === 'scheduled' && !unchangedOnce ? onceError(once, now) : undefined
  const change = (change: Partial<ShortcutDraft>): void => { setFailedDraft(undefined); setDraft({ ...draft, ...change }) }
  const closeCustom = (): void => { setCustom(false); (customOpener.current?.isConnected === true ? customOpener.current : repeatTrigger.current?.querySelector('button'))?.focus() }

  const models = [
    { value: '', label: 'Default', says: `As ${assistant} is set up` },
    ...(catalog !== undefined
      ? catalog.map((one) => ({ value: one.value, label: one.name, ...(one.disabled === true ? { disabled: true } : {}), ...(one.id === undefined ? {} : { says: modelName(one.id) }) }))
      : [{ value: '__asking', label: !available ? 'Assistant unavailable' : modelsSaid === 'unsaid' ? 'Models unavailable' : `Asking ${assistant}...`, disabled: true }]),
  ]
  const model = draft.model ?? ''
  const selectedModel = model === '' ? catalog?.find((one) => one.isDefault) : catalog?.find((one) => one.value === model)
  const modelLabel = model === '' ? 'Default' : selectedModel?.name ?? model
  const reasoning = draft.reasoning ?? ''
  const reasoningChoices = [
    { value: '', label: selectedModel?.defaultReasoning === undefined ? 'Default' : `Default (${selectedModel.defaultReasoning === 'xhigh' ? 'Extra high' : selectedModel.defaultReasoning.charAt(0).toUpperCase() + selectedModel.defaultReasoning.slice(1)})` },
    ...(selectedModel?.reasoning?.map((one) => ({ value: one.value, label: one.value === 'xhigh' ? 'Extra high' : one.value.charAt(0).toUpperCase() + one.value.slice(1), says: one.says })) ?? []),
  ]
  const reasoningLabel = reasoningChoices.find((one) => one.value === reasoning)?.label ?? reasoning

  const name = draft.name.trim() || (draft.prompt.trim().split('\n')[0] ?? '').slice(0, 60)
  const timingReady = kind === 'shortcut' ? true : kind === 'scheduled' ? Number.isFinite(once) && wrongOnce === undefined : draft.recurrence !== undefined ? ruleError === undefined : next !== undefined
  const ready = destination.valid && !saving && name !== '' && draft.root !== '' && draft.prompt.trim() !== '' && timingReady
  const save = (): void => {
    if (!ready) return
    setSaving(true)
    setFailedDraft(undefined)
    void saveShortcut(window.geckit.shortcuts, chat.settings, { ...draft, mode: 'auto', ...(manager ? {} : { provider }), ...(manager || !isCodexProvider(provider) ? {} : { reasoning }), ...(kind === 'scheduled' ? { at: once, on: true } : {}), name, prompt: draft.prompt.trim() }).then(onDone).catch(() => setFailedDraft(draft)).finally(() => setSaving(false))
  }

  const pickRepeats = (picked: Repeats): void => {
    if (picked === 'custom') { setCustom(true); return }
    setRepeats(picked)
    setFailedDraft(undefined)
    const { recurrence: _recurrence, ...rest } = draft
    setDraft({ ...rest, cron: cronOf(turned(when, picked)) })
  }
  const owner = draft.employeeId === undefined ? undefined : chat.employees.find((one) => one.id === draft.employeeId)
  const where = draft.root === '' ? 'the folder you choose' : projectLabel(draft.root)
  const timing = kind === 'shortcut'
    ? 'Run it from Shortcuts, Team or the gecko in the menu bar.'
    : kind === 'scheduled'
      ? Number.isFinite(once) ? `Runs once on ${dayText(civilDay(once, zone))} ${draft.vary === true ? 'around' : 'at'} ${clockText(once, zone)}.` : ''
      : draft.recurrence !== undefined && ruleError !== undefined ? '' : draft.recurrence !== undefined && next === undefined ? 'Its timetable has ended.' : !draft.on ? 'Its timetable is paused.' : next === undefined ? '' : `${timetableSaid(draft)}.`
  const summary = [
    manager ? `Sends this prompt to Manager with ${where} as context. Manager uses its configured assistant and approvals.` : `Each run starts a new task in ${where}${owner === undefined ? '' : `, assigned to ${owner.name}`}, with ${assistant}.`,
    timing,
  ].filter((one) => one !== '').join(' ')

  const vary = (
    <label className="check shortcut-on">
      <input type="checkbox" checked={draft.vary === true} onChange={(event) => change({ vary: event.target.checked })} />
      Vary start time
    </label>
  )
  const time = (
    <input
      type="time"
      aria-label="At"
      value={'hour' in when ? clock(when.hour, when.minute) : '09:00'}
      onChange={(event) => {
        const [hour = 9, minute = 0] = event.target.value.split(':').map(Number)
        if (when.kind === 'day' || when.kind === 'weekdays' || when.kind === 'week') setWhen({ ...when, hour, minute })
      }}
    />
  )

  return (
    <div
      className="shortcut-editor"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() }
      }}
    >
      <header className="shortcut-editor-head">
        <button type="button" className="shortcut-crumb" title={`Back to ${PAGE_NAME[kind]}`} onClick={onDone}>{PAGE_NAME[kind]}</button>
        <span className="shortcut-crumb-sep" aria-hidden="true">/</span>
        <h2 className="shortcut-heading">{given.id === undefined ? NEW_LABEL[kind] : given.name.trim() || KIND_NAME[kind]}</h2>
      </header>

      <div className="shortcut-editor-body">
        <div className="shortcut-editor-main">
          <label htmlFor="shortcut-name" className="shortcut-label">Name</label>
          <input
            id="shortcut-name"
            className="shortcut-name"
            autoFocus={given.id !== undefined || given.prompt !== ''}
            type="text"
            value={draft.name}
            placeholder={name === '' ? 'Morning check' : name}
            onChange={(event) => change({ name: event.target.value })}
          />
          <label htmlFor="shortcut-prompt" className="shortcut-label">Prompt</label>
          <textarea
            id="shortcut-prompt"
            autoFocus={given.id === undefined && given.prompt === ''}
            value={draft.prompt}
            placeholder="Look through the pull requests waiting for my review and tell me which ones need me first."
            onChange={(event) => change({ prompt: event.target.value })}
          />
          {manager ? null : <ChecklistField checklists={chat.settings.checklists ?? []} root={draft.root} value={draft.checklist ?? { items: [] }} onChange={(checklist) => change({ checklist })} />}
        </div>

        <aside className="shortcut-editor-side" aria-label="Settings">
          <div className="shortcut-setting">
            <span>Target</span>
            <Picker label={manager ? 'Manager' : 'New task'} chosen={manager ? 'manager' : 'task'} choices={[{ value: 'task', label: 'New task' }, { value: 'manager', label: 'Manager' }]} className="select" onPick={(value) => {
              const { target: _target, employeeId: _employee, provider: _provider, model: _model, reasoning: _reasoning, checklist: _checklist, ...rest } = draft
              setFailedDraft(undefined)
              setDraft(value === 'manager' ? { ...rest, target: 'manager' } : rest)
            }} />
          </div>
          {manager ? null : <div className="shortcut-setting">
            <span>Employee</span>
            <EmployeeSelect
              employees={chat.employees.filter((one) => !one.archived || one.id === draft.employeeId)}
              value={draft.employeeId ?? ''}
              className="select employee-select"
              onPick={(id) => {
                const { employeeId: _employeeId, ...rest } = draft
                setFailedDraft(undefined)
                setDraft(id === '' ? rest : { ...rest, employeeId: id })
              }}
            />
          </div>}
          <div className="shortcut-setting">
            <span>Folder</span>
            <Picker
              label={draft.root === '' ? 'Choose a folder' : projectLabel(draft.root)}
              choices={shownProjects(chat.settings).map((one) => ({ value: one, label: projectLabel(one), says: homePath(one) }))}
              chosen={draft.root}
              {...(draft.root === '' ? {} : { tip: homePath(draft.root) })}
              className="select"
              onPick={(root) => change({ root })}
            />
          </div>
          {manager ? null : <>
          <div className="shortcut-setting">
            <span>Assistant</span>
            <Picker
              label={assistant}
              chosen={provider}
              choices={[
                ...(enabled.includes(provider) ? [] : [{ value: provider, label: assistant, disabled: true, says: 'Disabled in Settings' }]),
                ...selectableProviders(chat.settings).map((one) => ({ value: one.family, label: one.name, icon: one.icon, ...(one.localOnly === true && isRemote(draft.root) ? { disabled: true, says: 'Local folders only' } : {}) })),
              ]}
              className="select"
              disabled={enabled.length === 1 && enabled.includes(provider)}
              onPick={(value) => {
                if (value === provider) return
                const { model: _model, reasoning: _reasoning, ...rest } = draft
                const nextProvider = value as SessionProvider
                setDraft({ ...rest, provider: nextProvider, model: providerModel(chat.settings, nextProvider), ...(isCodexProvider(nextProvider) ? { reasoning: chat.settings.codexReasoning } : {}) })
              }}
            />
          </div>
          {available ? null : <span className="shortcut-next wrong">{enabled.includes(provider) ? 'Codex supports local folders only.' : `Will not run while ${assistant} is off in Settings.`}</span>}
          <div className="shortcut-setting">
            <span>Model</span>
            <Picker
              label={modelLabel}
              choices={models}
              chosen={model}
              className="select"
              onPick={(value) => {
                if (value === '__asking') return
                const { model: _model, ...rest } = draft
                const picked = value === '' ? catalog?.find((one) => one.isDefault) : catalog?.find((one) => one.value === value)
                setDraft({ ...rest, ...(value === '' ? {} : { model: value }), ...(!isCodexProvider(provider) ? {} : { reasoning: picked?.reasoning?.some((one) => one.value === reasoning) === true ? reasoning : '' }) })
              }}
            />
          </div>
          {!isCodexProvider(provider) ? null : <div className="shortcut-setting">
            <span>Reasoning</span>
            <Picker label={reasoningLabel} choices={reasoningChoices} chosen={reasoning} className="select" onPick={(value) => change({ reasoning: value as NonNullable<Shortcut['reasoning']> })} />
          </div>}
          </>}

          <ShortcutDestinationFields editor={destination} />
          {kind === 'shortcut' ? null : <div className="shortcut-when-block">
            <span className="shortcut-label">{kind === 'scheduled' ? 'Runs once' : 'Repeats'}</span>
            {kind === 'scheduled' ? <>
              <div className="shortcut-once">
                <input type="date" aria-label="Date" value={onceDate} aria-invalid={wrongOnce !== undefined} onChange={(event) => { setFailedDraft(undefined); setOnceDate(event.target.value) }} />
                <input type="time" aria-label="Time" value={onceTime} aria-invalid={wrongOnce !== undefined} onChange={(event) => { setFailedDraft(undefined); setOnceTime(event.target.value) }} />
              </div>
              {wrongOnce === undefined ? null : <span className="shortcut-next wrong" role="alert">{wrongOnce}</span>}
              {vary}
            </> : <>
              <div ref={repeatTrigger} className="shortcut-repeat">
                <Picker
                  label={REPEATS.find((one) => one.value === repeats)?.label ?? 'Cron'}
                  choices={REPEATS}
                  chosen={repeats}
                  className="select"
                  onOpen={() => { customOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null }}
                  onPick={(value) => pickRepeats(value as Repeats)}
                />
                {repeats === 'custom' ? <button type="button" className="quiet" onClick={(event) => { customOpener.current = event.currentTarget; setCustom(true) }}>Edit</button> : when.kind === 'hour' ? (
                  <label className="shortcut-minute">
                    at
                    <input
                      type="number"
                      min={0}
                      max={59}
                      aria-label="Minutes past the hour"
                      value={when.minute}
                      onChange={(event) => setWhen({ ...when, minute: Math.min(59, Math.max(0, Math.round(Number(event.target.value)) || 0)) })}
                    />
                    past
                  </label>
                ) : when.kind === 'cron' ? null : time}
              </div>
              {when.kind === 'week' && repeats !== 'custom' ? (
                <Picker
                  label={WEEKDAYS[when.weekday] ?? 'Monday'}
                  choices={[1, 2, 3, 4, 5, 6, 0].map((day) => ({ value: String(day), label: WEEKDAYS[day] ?? '' }))}
                  chosen={String(when.weekday)}
                  className="select"
                  onPick={(day) => setWhen({ ...when, weekday: Number(day) })}
                />
              ) : null}
              {when.kind === 'cron' && repeats === 'cron' ? (
                <input type="text" className="shortcut-cron" aria-label="Cron line" value={cron} placeholder={FIRST_CRON} spellCheck={false} onChange={(event) => change({ cron: event.target.value })} />
              ) : null}
              {draft.recurrence !== undefined ? <span className={`shortcut-next${ruleError === undefined ? '' : ' wrong'}`}>{ruleError ?? describeRecurrence(draft.recurrence)}</span> : null}
              {draft.recurrence === undefined && next === undefined ? (
                <span className="shortcut-next wrong">Cron takes five fields: minute, hour, day of the month, month and day of the week, such as {FIRST_CRON}.</span>
              ) : null}
              {vary}
              <label className="check shortcut-on">
                <input type="checkbox" checked={draft.on} onChange={(event) => change({ on: event.target.checked })} />
                Timetable on
              </label>
            </>}
          </div>}
        </aside>
      </div>

      <p className="shortcut-summary">{summary}</p>
      {saveError ? <p className="shortcut-next wrong" role="alert">Couldn't save. Try again.</p> : null}
      <div className="dialog-actions">
        {given.id === undefined ? null : sure ? (
          <button
            type="button"
            className="primary danger"
            onClick={() => {
              if (given.id !== undefined) window.geckit.shortcuts.remove(given.id)
              onDone()
            }}
          >
            Delete it
          </button>
        ) : (
          <button type="button" className="icon-button" aria-label="Delete" title="Delete" onClick={() => setSure(true)}>
            <Icon name="trash" />
          </button>
        )}
        <span className="spacer" />
        <span className="together">
          <button type="button" className="quiet" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!ready} title={`Save (${MOD}+Enter)`} onClick={save}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </span>
      </div>
      {custom ? <CustomRecurrence given={draft.recurrence !== undefined && ruleError === undefined ? draft.recurrence : defaultRecurrence(now, 'hour' in when ? clock(when.hour, when.minute) : '09:00', zone)} now={now} {...(zone === undefined ? {} : { zone })} onCancel={closeCustom} onDone={(recurrence) => {
        const { cron: _cron, ...rest } = draft
        setDraft({ ...rest, recurrence })
        setRepeats('custom')
        closeCustom()
      }} /> : null}
    </div>
  )
}
