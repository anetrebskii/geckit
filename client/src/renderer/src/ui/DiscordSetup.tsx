import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Settings } from '../../../shared/api'
import type { ChannelSetting, ChannelView } from '../../../shared/channels'
import { DISCORD_PORTAL, discordId } from '../../../shared/discord'
import type { DiscordPerson, DiscordServer, DiscordSetupView } from '../../../shared/discord'
import { homePath, projectLabel, projectName } from '../chat/project'
import { Icon } from './Icon'
import type { ChannelsApi } from './Channels'

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '')
const strings = (value: unknown): readonly string[] => Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
const open = (href: string): void => { window.geckit.chat?.openLink(href) }

type Check = { readonly state: 'idle' | 'checking' | 'done' } | { readonly state: 'failed'; readonly error: string }

function Avatar({ name, src }: { readonly name: string; readonly src?: string }): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  return <span className="discord-avatar" aria-hidden="true">{src !== undefined && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : (name.trim()[0] ?? '?').toUpperCase()}</span>
}

function Step({ number, title, done, waiting, children }: { readonly number: number; readonly title: string; readonly done: boolean; readonly waiting?: boolean; readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <section className={`discord-step${done ? ' done' : ''}${waiting === true ? ' waiting' : ''}`} aria-labelledby={`discord-step-${String(number)}`}>
      <span className="discord-step-mark" aria-hidden="true">{done ? <Icon name="check" size={12} /> : number}</span>
      <div className="discord-step-body">
        <h4 id={`discord-step-${String(number)}`}>{title}{done ? <span className="discord-hidden"> (done)</span> : null}</h4>
        {children}
      </div>
    </section>
  )
}

/** The Discord row's Set up: bot, then where it answers, then who may write, then what it may reach in GeckIt. */
export function DiscordSetup({ setting, view, settings, api, onDone }: {
  readonly setting: ChannelSetting
  readonly view: ChannelView
  readonly settings: Settings
  readonly api: ChannelsApi
  readonly onDone: () => void
}): React.JSX.Element {
  const id = setting.info.id
  const saved = view.secrets.includes('botToken')
  const [check, setCheck] = useState<Check>({ state: saved ? 'checking' : 'idle' })
  const [found, setFound] = useState<DiscordSetupView | undefined>(undefined)
  const [token, setToken] = useState('')
  const [replacing, setReplacing] = useState(!saved)
  const [rejected, setRejected] = useState(false)
  const [allow, setAllow] = useState<readonly string[]>(strings(setting.config['allow']))
  const [places, setPlaces] = useState<readonly string[]>(strings(setting.config['places']))
  const [choose, setChoose] = useState(strings(setting.config['places']).length > 0)
  const [direct, setDirect] = useState(setting.config['directMessages'] !== false)
  const [secretsCheck, setSecretsCheck] = useState(setting.config['checkSecrets'] !== false)
  const [manager, setManager] = useState(setting.manager)
  const [projects, setProjects] = useState<readonly string[]>(setting.projects.filter((root) => settings.projects.includes(root)))
  const [person, setPerson] = useState('')
  const [personError, setPersonError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const tokenField = useRef<HTMLInputElement>(null)
  const personField = useRef<HTMLInputElement>(null)

  const latest = useRef(0)
  const ask = useCallback((people: readonly string[]): Promise<void> => {
    const asked = ++latest.current
    return api.inspect(id, { people: [...people] })
      .then((result) => { if (asked !== latest.current) return; setFound(result as unknown as DiscordSetupView); setCheck({ state: 'done' }) })
      .catch((failure: unknown) => { if (asked === latest.current) setCheck({ state: 'failed', error: reason(failure) }) })
  }, [api, id])
  const inspect = (people: readonly string[]): void => { setCheck({ state: 'checking' }); void ask(people) }
  const [firstPeople] = useState(() => strings(setting.config['allow']))
  const [firstSaved] = useState(saved)
  useEffect(() => { if (firstSaved) void ask(firstPeople) }, [ask, firstPeople, firstSaved])
  useLayoutEffect(() => { (tokenField.current ?? panel.current)?.focus() }, [])

  const ready = found?.token === 'ok' ? found : undefined
  const refused = found?.token === 'refused'
  const form = replacing || !saved || refused

  const connect = (): void => {
    const typed = token.trim()
    if (typed === '') return
    setError('')
    setRejected(false)
    setCheck({ state: 'checking' })
    const asked = ++latest.current
    void api.inspect(id, { people: [...allow], token: typed })
      .then(async (result) => {
        const next = result as unknown as DiscordSetupView
        if (next.token === 'refused') { if (asked === latest.current) { setRejected(true); setToken(''); setCheck({ state: 'done' }) } return }
        await api.configure(id, { secrets: { botToken: typed } })
        if (asked !== latest.current) return
        setToken('')
        setReplacing(false)
        setFound(next)
        setCheck({ state: 'done' })
      })
      .catch((failure: unknown) => { if (asked === latest.current) setCheck({ state: 'failed', error: reason(failure) }) })
  }

  const addPerson = (): void => {
    const added = discordId(person)
    if (added === undefined) { setPersonError('That is not a Discord user ID. It is a long number, such as 301234567890123456.'); return }
    setPersonError('')
    setPerson('')
    if (allow.includes(added)) return
    const next = [...allow, added]
    setAllow(next)
    if (ready !== undefined) inspect(next)
    personField.current?.focus()
  }

  const peopleShown = allow.map((one): DiscordPerson | { readonly id: string; readonly found: 'checking' } => ready?.people.find((known) => known.id === one) ?? (check.state === 'checking' ? { id: one, found: 'checking' } : { id: one, found: false }))
  const placesValid = !choose || places.length > 0
  const complete = ready !== undefined && !form && ready.messageContent && allow.length > 0 && placesValid && manager && peopleShown.every((one) => one.found === true)
  const save = (turnOn: boolean): void => {
    if (!placesValid) { setError('Choose at least one channel, or let it answer in every channel it can see.'); return }
    setSaving(true)
    setError('')
    void api.configure(id, { config: { allow, places: choose ? places : [], directMessages: direct, checkSecrets: secretsCheck }, projects, manager, ...(turnOn ? { enabled: true } : {}) })
      .then(onDone)
      .catch((failure: unknown) => setError(reason(failure)))
      .finally(() => setSaving(false))
  }

  const server = (one: DiscordServer): React.JSX.Element => (
    <li key={one.id} className="discord-server">
      <div className="discord-server-head"><Avatar name={one.name} {...(one.icon === undefined ? {} : { src: one.icon })} /><strong>{one.name}</strong>{one.unreadable === true ? <span className="channel-help">Cannot list its channels</span> : null}</div>
      {choose ? (
        <div className="discord-channels" role="group" aria-label={`Channels in ${one.name}`}>
          {one.channels.length === 0 ? <span className="channel-help">No text channels it can see.</span> : one.channels.map((channel) => {
            const on = places.includes(channel.id)
            return (
              <button key={channel.id} type="button" role="checkbox" aria-checked={on} className={`discord-chip${on ? ' on' : ''}`} onClick={() => setPlaces((current) => on ? current.filter((place) => place !== channel.id) : [...current, channel.id])}>
                <span aria-hidden="true">{channel.kind === 'forum' ? '≡' : '#'}</span>{channel.name}
              </button>
            )
          })}
        </div>
      ) : null}
    </li>
  )

  return (
    <div ref={panel} tabIndex={-1} className="channel-setup discord-setup" aria-label="Set up Discord" onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onDone() } }}>
      {view.state === 'failed' && view.says !== undefined ? <div className="discord-note danger" role="alert">{view.says}</div> : null}
      <Step number={1} title="Connect the bot" done={ready !== undefined && !form && ready.messageContent}>
        {!form && ready === undefined ? (
          <div className="discord-identity">
            <Avatar name="?" />
            <span className="discord-identity-copy"><strong>{check.state === 'failed' ? 'Saved token not checked' : 'Checking the saved token…'}</strong><span>Token saved</span></span>
            <button type="button" className="quiet" onClick={() => { setReplacing(true); requestAnimationFrame(() => tokenField.current?.focus()) }}>Replace token</button>
          </div>
        ) : ready !== undefined && !form ? (
          <>
            <div className="discord-identity">
              <Avatar name={ready.bot.name} {...(ready.bot.avatar === undefined ? {} : { src: ready.bot.avatar })} />
              <span className="discord-identity-copy"><strong>{ready.bot.name}</strong><span>Token checked</span></span>
              <button type="button" className="quiet" onClick={() => { setReplacing(true); requestAnimationFrame(() => tokenField.current?.focus()) }}>Replace token</button>
            </div>
            {ready.messageContent ? null : (
              <div className="discord-note warning" role="status">
                <span>Message Content Intent is off, so the bot cannot read follow-ups in its threads. Turn it on under Bot, Privileged Gateway Intents.</span>
                <span className="discord-note-actions">
                  <button type="button" className="quiet" onClick={() => open(`${DISCORD_PORTAL}/${ready.application}/bot`)}>Open Bot settings<Icon name="external" size={11} /></button>
                  <button type="button" className="quiet" onClick={() => inspect(allow)}>Check again</button>
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="discord-lead">Create an application in the Discord Developer Portal. Under Bot, turn on Message Content Intent, then Reset Token and paste it here.</p>
            <button type="button" className="quiet discord-link" onClick={() => open(DISCORD_PORTAL)}>Open Developer Portal<Icon name="external" size={11} /></button>
            <form className="discord-token" onSubmit={(event) => { event.preventDefault(); connect() }}>
              <label htmlFor="discord-token" className="discord-hidden">Bot token</label>
              <input ref={tokenField} id="discord-token" type="password" autoComplete="off" spellCheck={false} value={token} placeholder={saved ? 'Paste a new bot token' : 'Bot token'} onChange={(event) => setToken(event.target.value)} />
              <button type="submit" className="primary" disabled={token.trim() === '' || check.state === 'checking'}>{check.state === 'checking' ? 'Checking…' : 'Connect'}</button>
              {saved && replacing ? <button type="button" className="quiet" onClick={() => { setReplacing(false); setRejected(false); setToken('') }}>Cancel</button> : null}
            </form>
            {refused || rejected ? <p className="error" role="alert">Discord did not accept this token. Reset it in the Developer Portal and paste the new one.</p> : null}
          </>
        )}
        {check.state === 'failed' ? <p className="error" role="alert">Could not check with Discord: {check.error} <button type="button" className="quiet discord-retry" onClick={() => inspect(allow)}>Try again</button></p> : null}
      </Step>

      <Step number={2} title="Choose where it answers" done={ready !== undefined && ready.servers.length > 0 && placesValid} waiting={ready === undefined}>
        {ready === undefined ? <p className="channel-help">Connect the bot first.</p> : ready.servers.length === 0 ? (
          <div className="discord-empty">
            <p className="discord-lead">The bot is not in a server yet. Add it to one you manage; Discord asks which.</p>
            <span className="discord-note-actions">
              <button type="button" className="primary" onClick={() => open(ready.invite)}>Add to server<Icon name="external" size={11} /></button>
              <button type="button" className="quiet" disabled={check.state === 'checking'} onClick={() => inspect(allow)}>{check.state === 'checking' ? 'Checking…' : 'Check again'}</button>
            </span>
          </div>
        ) : (
          <>
            <div className="discord-scope" role="radiogroup" aria-label="Where it answers">
              <label className="check"><input type="radio" name="discord-scope" checked={!choose} onChange={() => setChoose(false)} />Every channel it can see</label>
              <label className="check"><input type="radio" name="discord-scope" checked={choose} onChange={() => setChoose(true)} />Only the channels I choose</label>
            </div>
            <ul className="discord-servers">{ready.servers.map(server)}</ul>
            <div className="discord-row-actions">
              <button type="button" className="quiet discord-link" onClick={() => open(ready.invite)}>Add to another server<Icon name="external" size={11} /></button>
              <button type="button" className="quiet" disabled={check.state === 'checking'} onClick={() => inspect(allow)}>{check.state === 'checking' ? 'Checking…' : 'Check again'}</button>
            </div>
            <label className="check"><input type="checkbox" checked={direct} onChange={(event) => setDirect(event.target.checked)} />Answer direct messages</label>
            <span className="channel-help">Mention the bot in a channel and it opens a thread; each thread and each direct message is its own Manager conversation.</span>
          </>
        )}
      </Step>

      <Step number={3} title="Choose who may write" done={allow.length > 0 && peopleShown.every((one) => one.found !== false)}>
        {allow.length === 0 ? <p className="channel-help">Nobody yet. The bot answers only the people listed here.</p> : (
          <ul className="discord-people">
            {peopleShown.map((one) => (
              <li key={one.id} className={one.found === false ? 'missing' : ''}>
                <Avatar name={one.found === true ? one.name : '?'} {...(one.found === true && one.avatar !== undefined ? { src: one.avatar } : {})} />
                <span className="discord-person-copy">
                  <strong>{one.found === true ? one.name : one.id}</strong>
                  <span>{one.found === true ? one.bot === true ? 'A bot. Bots are never answered.' : one.handle === undefined ? one.id : `@${one.handle}` : one.found === 'checking' ? 'Checking…' : ready === undefined ? 'Not checked yet' : 'Discord has no user with this ID'}</span>
                </span>
                <button type="button" className="quiet discord-remove" aria-label={`Remove ${one.found === true ? one.name : one.id}`} onClick={() => setAllow((current) => current.filter((other) => other !== one.id))}><Icon name="close" size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        <form className="discord-add" onSubmit={(event) => { event.preventDefault(); addPerson() }}>
          <label htmlFor="discord-person" className="discord-hidden">Discord user ID</label>
          <input ref={personField} id="discord-person" type="text" inputMode="numeric" autoComplete="off" value={person} placeholder="Discord user ID" aria-invalid={personError !== ''} aria-describedby="discord-person-help" onChange={(event) => { setPerson(event.target.value); setPersonError('') }} />
          <button type="submit" className="quiet" disabled={person.trim() === ''}>Add</button>
        </form>
        {personError === '' ? null : <p className="error" role="alert">{personError}</p>}
        <span id="discord-person-help" className="channel-help">In Discord, turn on Developer Mode in Settings, Advanced. Then right-click a person and choose Copy User ID.</span>
      </Step>

      <Step number={4} title="Choose what it may reach" done={manager}>
        <label className="check"><input type="checkbox" checked={manager} onChange={(event) => setManager(event.target.checked)} />May talk to Manager</label>
        <span className="channel-help">{manager ? 'Manager answers in Discord and starts work in the folders Manager may use.' : 'Without it the bot only says Manager is not available.'}</span>
        <details className="discord-more">
          <summary>More</summary>
          <div className="field">
            <label>Folders it may start conversations in</label>
            {settings.projects.length === 0 ? <span className="channel-help">Add a folder to GeckIt first.</span> : (
              <div className="projects-listed">
                {settings.projects.map((root) => {
                  const on = projects.includes(root)
                  return (
                    <button key={root} type="button" role="switch" aria-checked={on} aria-label={projectLabel(root)} className={`project-listed${on ? '' : ' off'}`} onClick={() => setProjects((current) => on ? current.filter((one) => one !== root) : [...current, root])}>
                      <span className="tick">{on ? <Icon name="check" size={13} /> : null}</span>
                      <span className="name">{projectName(root)}</span>
                      <span className="says">{homePath(root)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <label className="check"><input type="checkbox" checked={secretsCheck} onChange={(event) => setSecretsCheck(event.target.checked)} />Refuse messages that contain a token or key</label>
        </details>
      </Step>

      {error === '' ? null : <span className="error" role="alert">{error}</span>}
      <div className="channel-setup-actions">
        <button type="button" className="quiet" disabled={saving} onClick={onDone}>Cancel</button>
        {!setting.enabled && complete
          ? <button type="button" className="primary" disabled={saving} onClick={() => save(true)}>{saving ? 'Saving…' : 'Save and turn on'}</button>
          : <button type="button" className="primary" disabled={saving || !saved} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save'}</button>}
      </div>
    </div>
  )
}

const firstSentence = (text: string): string => /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text

/** What the Discord row says under its name. */
export function discordLine(view: ChannelView): string {
  const threads = view.threads ?? 0
  const count = threads === 0 ? '' : ` · ${String(threads)} thread${threads === 1 ? '' : 's'}`
  if (!view.secrets.includes('botToken')) return 'Not set up'
  if (view.state === 'off') return `Off${count}`
  if (view.state === 'setup') return view.says === undefined ? 'Finish setting up.' : `Finish setting up: ${view.says.replace(/^Fill in /, '').replace(/\.$/, '')}.`
  if (view.state === 'starting') return view.says === undefined || view.says === 'Connecting to Discord' ? 'Connecting…' : `${view.says}…`
  if (view.state === 'failed') return `Stopped: ${firstSentence(view.says ?? 'it failed to start.')}`
  return `Connected${view.says === undefined ? '' : ` ${view.says.replace(/^As /, 'as ')}`}${count}`
}
