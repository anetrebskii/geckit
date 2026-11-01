import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { assistantFor, assistantsIn, modelName, SESSION_MODES, shownProjects } from '../../../shared/api'
import { isCodexProvider, llmProviderInfo, providerModel, selectableProviders } from '../../../shared/providers'
import type { ClaudeModel, ModelsSaid, SessionMode, SessionProvider, Shortcut, ShortcutDraft } from '../../../shared/api'
import type { Employee } from '../../../shared/employees'
import { isRemote } from '../../../shared/hosts'
import { cronOf, describeCron, describeStartWindow, describeTime, nextRun, nextTimed, startWindowError, WEEKDAYS, whenOf } from '../../../shared/schedule'
import type { When } from '../../../shared/schedule'
import { defaultRecurrence, describeRecurrence, nextRecurrence, recurrenceError } from '../../../shared/recurrence'
import { saveShortcut } from '../../../shared/shortcut-save'
import { CustomRecurrence } from './CustomRecurrence'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { projectColor } from '../../../shared/project-color'
import { homePath, projectLabel, tint } from './project'
import type { Chat } from './useChat'
import { EmployeeAvatar, EmployeeSelect } from '../employees/Employees'

export type ShortcutChat = Pick<Chat, 'settings' | 'root' | 'everyone' | 'goTo' | 'employees'>

/** Saved prompts, each run a new conversation in its project: by hand, from here or the menu bar, or on a timetable. */

export type Repeats = 'never' | 'custom' | When['kind']

export const REPEATS: readonly { readonly value: Repeats; readonly label: string }[] = [
  { value: 'never', label: 'Never, only by hand' },
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

const clock = (hour: number, minute: number): string => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

const busy = (chat: ShortcutChat, session: string | undefined): boolean =>
  session !== undefined && chat.everyone.some((one) => one.id === session && (one.state === 'working' || one.state === 'asks'))

function shortcutGroups(chat: Pick<ShortcutChat, 'employees'>, shortcuts: readonly Shortcut[]): readonly { readonly key: string; readonly employee: Employee | null; readonly list: readonly Shortcut[] }[] {
  const groups = [...chat.employees.filter((one) => !one.archived), ...chat.employees.filter((one) => one.archived)]
    .map((employee) => ({ key: employee.id, employee, list: shortcuts.filter((one) => one.employeeId === employee.id) }))
    .filter((group) => group.list.length > 0)
  const owned = new Set(chat.employees.map((one) => one.id))
  const rest = shortcuts.filter((one) => one.employeeId === undefined || !owned.has(one.employeeId))
  return rest.length === 0 ? groups : [...groups, { key: 'none', employee: null, list: rest }]
}

export function ShortcutList({
  chat,
  start,
  only = false,
  onTeam,
  onClose,
}: {
  readonly chat: ShortcutChat
  /** The list, `new`, a shortcut's id to edit, or a new one already filled in. */
  readonly start: string | ShortcutDraft
  /** Opened for one shortcut from Team: saving or cancelling closes it rather than showing the list. */
  readonly only?: boolean
  readonly onTeam?: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  // Another profile's shortcuts are kept and run, and listed only where that profile is in use.
  const shortcuts = chat.settings.shortcuts.filter((one) => shownProjects(chat.settings).includes(one.root))
  const blank = (): ShortcutDraft => {
    const root = chat.root ?? shownProjects(chat.settings)[0] ?? ''
    const provider = assistantFor(chat.settings, root)
    return {
      name: '',
      root,
      prompt: '',
      mode: 'auto',
      provider,
      model: providerModel(chat.settings, provider),
      ...(isCodexProvider(provider) ? { reasoning: chat.settings.codexReasoning } : {}),
      on: true,
    }
  }
  const [editing, setEditing] = useState<ShortcutDraft | undefined>(() =>
    typeof start !== 'string' ? start : start === 'new' ? blank() : shortcuts.find((one) => one.id === start),
  )
  // "Next today at 9:00" goes on being true for a minute at most.
  const [search, setSearch] = useState('')
  const found = shortcuts.filter((one) => `${one.name} ${one.prompt} ${projectLabel(one.root)}`.toLowerCase().includes(search.trim().toLowerCase()))
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const run = (one: Shortcut): void => {
    onClose()
    void window.geckit.shortcuts.run(one.id).then((session) => {
      if (session !== undefined) chat.goTo(session)
    })
  }

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog shortcut-list" onMouseDown={(event) => event.stopPropagation()}>
        {editing === undefined ? (
          <>
            <header className="shortcut-list-head">
              <h2>Shortcuts{shortcuts.length === 0 ? null : <span className="employee-count">{shortcuts.length}</span>}</h2>
              <span className="spacer" />
              {shortcuts.length > 5 ? <label className="employee-find shortcut-find"><Icon name="search" size={11} /><input type="search" aria-label="Search shortcuts" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /></label> : null}
              <button type="button" className="primary shortcut-new" onClick={() => setEditing(blank())}><Icon name="plus" size={11} />New shortcut</button>
            </header>
            <p className="shortcut-list-about">Saved prompts. Each run starts a new conversation in its folder: by hand here or from the gecko in the menu bar, or on a timetable while GeckIt is open.</p>
            {shortcuts.length === 0 ? <div className="shortcut-empty"><Icon name="bolt" size={18} /><strong>No shortcuts yet</strong><span>Save a prompt you send often, like a daily plan or a code review.</span><button type="button" className="primary" onClick={() => setEditing(blank())}>New shortcut</button></div> : null}
            {shortcuts.length > 0 && found.length === 0 ? <div className="shortcut-empty"><span>No shortcuts match.</span></div> : null}
            {shortcutGroups(chat, found).map(({ key, employee, list }) => <Fragment key={key}>
            {employee === null && list.length === found.length ? null : <div className="shortcut-group">{employee === null ? null : <EmployeeAvatar employee={employee} />}{employee === null ? 'No employee' : employee.name}{employee?.archived === true ? <small>Archived, timetables paused</small> : null}</div>}
            <div className="shortcut-rows">
            {list.map((one) => {
              const next = nextTimed(one, now, chat.settings.calendarTimeZone)
              const running = busy(chat, one.lastSession)
              const provider = one.provider ?? 'claude'
              const info = llmProviderInfo(provider, 'stream', chat.settings.providerPlugins)
              const available = assistantsIn(chat.settings).includes(provider) && (info.localOnly !== true || !isRemote(one.root))
              const timed = one.recurrence !== undefined || one.cron !== undefined
              const timetable = one.recurrence !== undefined ? describeRecurrence(one.recurrence) : one.cron === undefined ? '' : [describeCron(one.cron), describeStartWindow(one)].filter(Boolean).join(' · ')
              const paused = timed && (!one.on || employee?.archived === true)
              return (
                <div key={one.id} className={`shortcut-row${running ? ' running' : ''}`}>
                  <span className={`shortcut-mark${timed && !paused ? ' timed' : ''}`} style={tint(projectColor(one.root, chat.settings))} aria-hidden="true"><Icon name={timed ? 'refresh' : 'bolt'} size={13} /></span>
                  <button type="button" className="shortcut-text" title="Edit" onClick={() => setEditing(one)}>
                    <span className="shortcut-title-line">
                      <span className="shortcut-name">{one.name}</span>
                      {timed ? <span className={`shortcut-chip${paused ? ' paused' : ''}`} title={timetable}>{paused ? employee?.archived === true ? 'Paused while archived' : 'Timetable paused' : timetable}</span> : null}
                    </span>
                    <span className="shortcut-when">
                      <span className="tinted" style={tint(projectColor(one.root, chat.settings))}>{projectLabel(one.root)}</span>
                      <span>{info.name}</span>
                      {available ? null : <span className="trouble">Assistant unavailable</span>}
                      {one.recurrence !== undefined && one.on && next === undefined ? <span>Timetable ended</span> : null}
                      {running ? (
                        <span className="live">Running now</span>
                      ) : next !== undefined && !paused ? (
                        <span>{`Next ${describeTime(next, now, one.recurrence === undefined && one.startWindowMinutes === undefined ? undefined : chat.settings.calendarTimeZone)}`}</span>
                      ) : one.lastRun === undefined ? null : (
                        <span>{`Last run ${describeTime(one.lastRun, now)}`}</span>
                      )}
                    </span>
                    <span className="shortcut-prompt">{one.prompt}</span>
                  </button>
                  <span className="shortcut-actions">
                    {one.lastSession === undefined ? null : (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Open the last run"
                        title="Open the conversation the last run started"
                        onClick={() => {
                          if (one.lastSession !== undefined) chat.goTo(one.lastSession)
                          onClose()
                        }}
                      >
                        <Icon name="right" size={13} />
                      </button>
                    )}
                    <button type="button" className="quiet shortcut-run" title="Start a new conversation with this prompt" disabled={!available || employee?.archived === true} onClick={() => run(one)}>
                      <Icon name="send" size={11} />Run
                    </button>
                  </span>
                </div>
              )
            })}
            </div>
            </Fragment>)}
            <div className="dialog-actions">
              {onTeam === undefined ? null : <button type="button" className="quiet" onClick={onTeam}>Manage in Team</button>}
              <span className="spacer" />
              <button type="button" className="quiet" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <Editor key={editing.id ?? 'new'} chat={chat} given={editing} now={now} onDone={only ? onClose : () => setEditing(undefined)} />
        )}
      </div>
    </div>
  )
}

function Editor({
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
  const [draft, setDraft] = useState<ShortcutDraft>(given)
  const [windowMinutes, setWindowMinutes] = useState(() => String(given.startWindowMinutes ?? 30))
  const provider = draft.provider ?? 'claude'
  const enabled = assistantsIn(chat.settings)
  const info = llmProviderInfo(provider, 'stream', chat.settings.providerPlugins)
  const available = enabled.includes(provider) && (info.localOnly !== true || !isRemote(draft.root))
  const assistant = info.name
  const [askedModels, setAskedModels] = useState<{ readonly provider: SessionProvider; readonly root: string; readonly said: ModelsSaid }>()
  useEffect(() => {
    if (!available) return
    let current = true
    void window.geckit.chat.models(draft.root || undefined, provider).then((said) => {
      if (current) setAskedModels({ provider, root: draft.root, said: said ?? 'unsaid' })
    }).catch(() => {
      if (current) setAskedModels({ provider, root: draft.root, said: 'unsaid' })
    })
    return () => { current = false }
  }, [draft.root, provider, available])
  const modelsSaid = available && askedModels?.provider === provider && askedModels.root === draft.root ? askedModels.said : 'unasked'
  const catalog: readonly ClaudeModel[] | undefined = Array.isArray(modelsSaid) ? modelsSaid : undefined
  // Kept apart from the line itself, so a cron being typed that happens to spell "every day" stays a cron line.
  const [repeats, setRepeats] = useState<Repeats>(() => given.recurrence !== undefined ? 'custom' : given.cron === undefined ? 'never' : whenOf(given.cron).kind)
  const [custom, setCustom] = useState(false)
  const repeatTrigger = useRef<HTMLDivElement>(null)
  const customOpener = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [failedDraft, setFailedDraft] = useState<ShortcutDraft>()
  const saveError = failedDraft === draft
  const [sure, setSure] = useState(false)
  const cron = draft.cron ?? FIRST_CRON
  const when = repeats === 'cron' ? ({ kind: 'cron', cron } as const) : turned(whenOf(cron), repeats === 'never' || repeats === 'custom' ? 'weekdays' : repeats)
  const setWhen = (next: When): void => setDraft({ ...draft, cron: cronOf(next) })
  const zone = chat.settings.calendarTimeZone
  const ruleError = useMemo(() => draft.recurrence === undefined ? undefined : recurrenceError(draft.recurrence, zone), [draft.recurrence, zone])
  const windowError = startWindowError(draft)
  const kept = chat.settings.shortcuts.find((one) => one.id === draft.id)
  const keptId = kept?.id
  const since = draft.cron === kept?.cron && draft.startWindowMinutes === kept?.startWindowMinutes ? kept?.since ?? now : now
  const next = useMemo(() => {
    if (draft.recurrence !== undefined) return nextRecurrence(draft.recurrence, now, zone)
    if (draft.cron === undefined) return undefined
    if (draft.startWindowMinutes === undefined || keptId === undefined) return nextRun(draft.cron, now, draft.startWindowMinutes === undefined ? undefined : zone)
    return nextTimed({ cron: draft.cron, startWindowMinutes: draft.startWindowMinutes, id: keptId, on: true, since }, now, zone)
  }, [draft.recurrence, draft.cron, draft.startWindowMinutes, keptId, since, now, zone])
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
  const ready = !saving && windowError === undefined && name !== '' && draft.root !== '' && draft.prompt.trim() !== '' && (draft.recurrence !== undefined ? ruleError === undefined : draft.cron === undefined || next !== undefined)
  const save = (): void => {
    if (!ready) return
    setSaving(true)
    setFailedDraft(undefined)
    void saveShortcut(window.geckit.shortcuts, chat.settings, { ...draft, provider, ...(!isCodexProvider(provider) ? {} : { reasoning }), name, prompt: draft.prompt.trim() }).then(onDone).catch(() => setFailedDraft(draft)).finally(() => setSaving(false))
  }

  const pickRepeats = (picked: Repeats): void => {
    if (picked === 'custom') { setCustom(true); return }
    setRepeats(picked)
    setFailedDraft(undefined)
    if (picked === 'never') {
      const { cron: _cron, recurrence: _recurrence, startWindowMinutes: _windowMinutes, ...rest } = draft
      setDraft(rest)
    } else {
      const { recurrence: _recurrence, ...rest } = draft
      setDraft({ ...rest, cron: cronOf(turned(when, picked)) })
    }
  }
  const scheduled = repeats !== 'never'
  const [goalOpen, setGoalOpen] = useState(() => (given.goal ?? '').trim() !== '')
  const owner = draft.employeeId === undefined ? undefined : chat.employees.find((one) => one.id === draft.employeeId)
  const agent = isCodexProvider(provider) ? 'Codex' : 'Claude'
  const summary = [
    `Each run starts a new task in ${draft.root === '' ? 'the folder you choose' : projectLabel(draft.root)}${owner === undefined ? '' : `, assigned to ${owner.name}`}, with ${assistant}.`,
    !scheduled ? 'It runs when you start it.' : draft.recurrence !== undefined ? ruleError === undefined ? next === undefined ? 'Its timetable has ended.' : draft.on ? `Next run ${describeTime(next, now, zone)}.` : 'Its timetable is paused.' : '' : next === undefined ? '' : !draft.on ? 'Its timetable is paused.' : draft.startWindowMinutes !== undefined && kept === undefined ? `${describeStartWindow(draft)}.` : `Next run ${describeTime(next, now, draft.startWindowMinutes === undefined ? undefined : zone)}.`,
  ].filter((one) => one !== '').join(' ')

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
        <span className="shortcut-kicker">{given.id === undefined ? 'New shortcut' : 'Shortcut'}</span>
        <input
          className="shortcut-title"
          type="text"
          aria-label="Name"
          value={draft.name}
          placeholder={name || 'Name it'}
          onChange={(event) => change({ name: event.target.value })}
        />
      </header>

      <div className="shortcut-editor-body">
        <div className="shortcut-editor-main">
          <label htmlFor="shortcut-prompt" className="shortcut-label">Prompt</label>
          <textarea
            id="shortcut-prompt"
            autoFocus={given.id === undefined && given.prompt === ''}
            value={draft.prompt}
            placeholder="Look through the pull requests waiting for my review and tell me which ones need me first."
            onChange={(event) => change({ prompt: event.target.value })}
          />
          {goalOpen ? (
            <div className="shortcut-goal">
              <label htmlFor="shortcut-goal" className="shortcut-label">Goal</label>
              <input
                id="shortcut-goal"
                type="text"
                autoFocus={(given.goal ?? '').trim() === ''}
                value={draft.goal ?? ''}
                placeholder="The tests pass and the PR is open"
                onChange={(event) => change({ goal: event.target.value })}
              />
              <span className="shortcut-next">
                {(draft.goal ?? '').trim() === '' ? `Empty: ${agent} stops when it is done.` : `${agent} keeps working until this holds, then the card shows Goal reached.`}
              </span>
            </div>
          ) : (
            <button type="button" className="shortcut-add-goal" onClick={() => setGoalOpen(true)}>
              <Icon name="plus" size={11} />
              Add a goal
              <span>keep working until a condition holds</span>
            </button>
          )}
        </div>

        <aside className="shortcut-editor-side" aria-label="Settings">
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
          <div className="shortcut-setting">
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
          </div>
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
                const { model: _model, reasoning: _reasoning, goal: _goal, ...rest } = draft
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
          <div className="shortcut-setting">
            <span>May do</span>
            <Picker
              label={SESSION_MODES.find((one) => one.mode === draft.mode)?.label ?? 'Auto'}
              choices={SESSION_MODES.map((one) => ({ value: one.mode, label: one.label, says: isCodexProvider(provider) ? one.mode === 'manual' ? 'Asks before running untrusted commands. Uses a sandbox.' : one.mode === 'auto' ? 'Works in a sandbox. Codex reviews requests for more access.' : 'Reads and proposes. Changes nothing.' : one.why }))}
              chosen={draft.mode}
              explained
              {...(!scheduled ? {} : { note: 'A timed run has nobody watching: in Manual it stops at the first thing it asks, and waits for you.' })}
              className="select"
              onPick={(mode) => change({ mode: mode as SessionMode })}
            />
          </div>
          {scheduled && draft.mode === 'manual' ? <span className="shortcut-next">Manual stops at the first question and waits for you.</span> : null}

          <div className="shortcut-when-block">
            <div className="views shortcut-runs" role="radiogroup" aria-label="Runs">
              <button type="button" role="radio" aria-checked={!scheduled} className={!scheduled ? 'on' : ''} onClick={() => pickRepeats('never')}>By hand</button>
              <button type="button" role="radio" aria-checked={scheduled} className={scheduled ? 'on' : ''} onClick={() => { if (!scheduled) pickRepeats('weekdays') }}>On a schedule</button>
            </div>
            {!scheduled ? <span className="shortcut-next">Run it from Shortcuts, Team or the gecko in the menu bar.</span> : <>
              <div ref={repeatTrigger} className="shortcut-repeat">
                <Picker
                  label={REPEATS.find((one) => one.value === repeats)?.label ?? 'Cron'}
                  choices={REPEATS.filter((one) => one.value !== 'never')}
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
              {repeats === 'custom' ? null : <>
                <label className="check shortcut-on">
                  <input type="checkbox" checked={draft.startWindowMinutes !== undefined} onChange={(event) => {
                    const { startWindowMinutes: _windowMinutes, ...rest } = draft
                    setWindowMinutes('30')
                    setFailedDraft(undefined)
                    setDraft(event.target.checked ? { ...rest, startWindowMinutes: 30 } : rest)
                  }} />
                  Vary start time
                </label>
                {draft.startWindowMinutes === undefined ? null : <>
                  <label className="shortcut-minute">Within<input type="number" min={1} max={1440} step={1} aria-label="Start window in minutes" aria-invalid={windowError !== undefined} value={windowMinutes} onChange={(event) => {
                    setWindowMinutes(event.target.value)
                    change({ startWindowMinutes: event.target.value === '' ? Number.NaN : Number(event.target.value) })
                  }} />minutes</label>
                  <span className="shortcut-next">after scheduled time. One random start per occurrence, before the next scheduled time.</span>
                  {windowError === undefined ? null : <span className="shortcut-next wrong" role="alert">{windowError}</span>}
                </>}
              </>}
              {draft.recurrence === undefined && next === undefined && windowError === undefined ? (
                <span className="shortcut-next wrong">Cron takes five fields: minute, hour, day of the month, month and day of the week, such as {FIRST_CRON}.</span>
              ) : (
                <label className="check shortcut-on">
                  <input type="checkbox" checked={draft.on} onChange={(event) => change({ on: event.target.checked })} />
                  Timetable on
                </label>
              )}
            </>}
          </div>
        </aside>
      </div>

      <p className="shortcut-summary">{summary}</p>
      {saveError ? <p className="shortcut-next wrong" role="alert">Couldn't save the shortcut. Try again.</p> : null}
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
          <button type="button" className="icon-button" aria-label="Delete" title="Delete this shortcut" onClick={() => setSure(true)}>
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
        const { cron: _cron, startWindowMinutes: _windowMinutes, ...rest } = draft
        setDraft({ ...rest, recurrence })
        setRepeats('custom')
        closeCustom()
      }} /> : null}
    </div>
  )
}
