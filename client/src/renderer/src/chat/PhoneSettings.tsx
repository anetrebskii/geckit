import { Fragment, useEffect, useMemo, useState } from 'react'

import { assistantsIn, planLine, providerOf, SESSION_MODES, shownProjects } from '../../../shared/api'
import type { ClaudeAccount, Folders as FolderList, HiddenFolder, ProjectProfile, SessionMode, SessionProvider, ShortcutDraft, Theme } from '../../../shared/api'
import { hostOf } from '../../../shared/hosts'
import { projectColor } from '../../../shared/project-color'
import { ear, setEar, voice } from '../dictate'
import type { Ear } from '../dictate'
import { macs } from '../macs'
import { phoneCalls } from '../phone-calls'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { LANGUAGES } from '../ui/SettingsDialog'
import { CodexLimits, Limits } from './PhoneInfo'
import { Cell, Page, Switch, tooOld } from './PhoneKit'
import { MacList } from './PhoneBoard'
import { PhoneShortcuts } from './PhoneShortcuts'
import { computerName } from './PhoneHosts'
import { PhoneProject } from './PhoneProject'
import { accountsOf, placesOf, usageOf } from './plans'
import { homePath, projectLabel } from './project'
import { ALL } from './useChat'
import type { Chat } from './useChat'

/**
 * The Settings tab: what of the Mac's Settings is done from a hand, and the
 * phone's own look. Each part opens as a page of its own, with Back to the one
 * before. See docs/ux/phone-parity.md.
 */

type Where =
  | { readonly page: 'root' }
  | { readonly page: 'profiles' }
  | { readonly page: 'profile'; readonly id: string }
  | { readonly page: 'projects' }
  | { readonly page: 'hidden' }
  | { readonly page: 'phrases' }
  | { readonly page: 'shortcuts' }

const THEMES: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function PhoneSettings({
  chat,
  onEdit,
}: {
  readonly chat: Chat
  readonly onEdit: (draft: ShortcutDraft) => void
}): React.JSX.Element {
  const [trail, setTrail] = useState<readonly Where[]>([{ page: 'root' }])
  const where = trail[trail.length - 1] ?? { page: 'root' }
  const go = (next: Where): void => setTrail([...trail, next])
  const back = (): void => setTrail(trail.slice(0, -1))
  const before = (): string => {
    const one = trail[trail.length - 2]
    return one === undefined || one.page === 'root'
      ? 'Settings'
      : one.page === 'profiles'
        ? 'Profiles'
        : one.page === 'projects'
          ? 'Folders'
          : 'Back'
  }

  if (where.page === 'profiles') return <Profiles chat={chat} back={before()} onBack={back} onOpen={(id) => go({ page: 'profile', id })} />
  if (where.page === 'profile') return <Profile chat={chat} id={where.id} back={before()} onBack={back} />
  if (where.page === 'projects') return <Projects chat={chat} back={before()} onBack={back} />
  if (where.page === 'hidden') return <Hidden chat={chat} back={before()} onBack={back} />
  if (where.page === 'phrases') return <Phrases chat={chat} back={before()} onBack={back} />
  if (where.page === 'shortcuts') return <PhoneShortcuts chat={chat} back={before()} onBack={back} onEdit={onEdit} />
  return <Root chat={chat} go={go} />
}

function Root({ chat, go }: { readonly chat: Chat; readonly go: (where: Where) => void }): React.JSX.Element {
  const [picking, setPicking] = useState<'theme' | 'mode' | 'limit' | 'language' | 'ear' | undefined>()
  const [heardBy, setHeardBy] = useState<Ear>(ear)
  const [switching, setSwitching] = useState(false)
  const [paired, setPaired] = useState(() => macs()?.list())
  const [version, setVersion] = useState<string | undefined>()
  useEffect(() => {
    void phoneCalls()
      ?.version()
      .then(setVersion)
      .catch(() => undefined)
  }, [])
  const settings = chat.settings
  const enabled = assistantsIn(settings)
  const [assistantAccounts, setAssistantAccounts] = useState<readonly ClaudeAccount[]>([])
  useEffect(() => {
    let alive = true
    const keep = (account: ClaudeAccount): void => {
      if (alive) setAssistantAccounts((before) => [...before.filter((one) => (one.provider ?? 'claude') !== (account.provider ?? 'claude')), account])
    }
    for (const provider of enabled) void window.geckit.chat.account(provider).then(keep).catch(() => undefined)
    const off = window.geckit.chat.onAccount(keep)
    return () => {
      alive = false
      off()
    }
  }, [enabled])
  const claudeAccount = assistantAccounts.find((one) => (one.provider ?? 'claude') === 'claude')
  const codexAccount = assistantAccounts.find((one) => one.provider === 'codex')
  const toggle = (provider: SessionProvider, on: boolean): void => {
    const chatProviders = on ? [...enabled, provider] : enabled.filter((one) => one !== provider)
    if (chatProviders.length === 0) return
    chat.change({ chatProviders, chatProvider: chatProviders.includes(settings.chatProvider) ? settings.chatProvider : chatProviders[0] ?? 'claude' })
  }
  const profile = settings.profiles.find((one) => one.id === settings.profile)
  const thisMac = paired?.find((one) => one.current)
  const placeName = (place: string): string => (place === '' ? (thisMac?.name ?? 'Host') : (chat.hosts.find((one) => one.id === place)?.name ?? place))
  const accounts = accountsOf(placesOf(['', ...settings.projects], hostOf), chat.plans, placeName)

  return (
    <Page title="Settings">
      <div className="phone-head">This phone</div>
      <div className="phone-group">
        <Cell label="Appearance" value={THEMES.find((one) => one.value === settings.theme)?.label} onPress={() => setPicking('theme')} />
      </div>
      <div className="phone-note">On this phone only.</div>

      <div className="phone-head">Privacy</div>
      <div className="phone-group">
        <Cell label="Count what gets used">
          <Switch
            on={settings.analytics && settings.analyticsAsked}
            label="Count what gets used"
            onChange={(on) => chat.change({ analytics: on, analyticsAsked: true })}
          />
        </Cell>
        <Cell label="Send error reports">
          <Switch on={settings.sendErrors} label="Send error reports" onChange={(on) => chat.change({ sendErrors: on })} />
        </Cell>
      </div>
      <div className="phone-note">
        Counting sends Google Analytics the name of what was used, the version and a random id for this phone. Error reports go to Sentry with paths, addresses and links taken out. Never your conversations, files or keys. On this phone only.
      </div>

      {paired === undefined ? null : (
        <>
          {/* The host this phone works through, and the others it is paired with; the projects that host has on other hosts come with it. */}
          <div className="phone-head">Host</div>
          <div className="phone-group">
            <Cell label={thisMac?.name ?? 'Host'} says={paired.length > 1 ? `${String(paired.length)} hosts paired` : 'Paired'} onPress={() => setSwitching(true)} />
          </div>
          {/* A plan is an account's: one group per account the projects run on, headed by where it was measured once there is more than one. */}
          {(enabled.includes('claude') ? accounts : []).map((item, at) => {
            const usage = usageOf(item, chat.plan)
            if (usage?.fiveHour === undefined && usage?.sevenDay === undefined) return null
            const place = item.places[0] ?? ''
            const plan = item.entry?.plan ?? (place === '' ? claudeAccount?.plan : undefined)
            return (
              <Fragment key={place}>
                <div className="phone-head">{accounts.length === 1 ? 'Plan usage' : `${placeName(place)}${plan === undefined ? '' : ` · ${plan}`}`}</div>
                <Limits chat={chat} usage={usage} />
                {at === accounts.length - 1 ? (
                  <div className="phone-note">
                    {accounts.length === 1
                      ? `Of the plan the host's Claude Code runs on${plan === undefined ? '' : `, ${plan}`}, shared by every conversation on it.`
                      : 'Each account has its own windows, shared by every conversation that runs on it.'}
                  </div>
                ) : null}
              </Fragment>
            )
          })}
        </>
      )}

      <div className="phone-head">Assistants</div>
      <div className="phone-group">
        <Cell label="Claude Code" says="Uses the host's Claude plan">
          <Switch on={enabled.includes('claude')} label="Claude Code" disabled={enabled.length === 1 && enabled.includes('claude')} onChange={(on) => toggle('claude', on)} />
        </Cell>
        <Cell label="Codex" says="Uses the host's ChatGPT plan for its local folders">
          <Switch on={enabled.includes('codex')} label="Codex" disabled={enabled.length === 1 && enabled.includes('codex')} onChange={(on) => toggle('codex', on)} />
        </Cell>
      </div>
      <div className="phone-note">Choose at least one. Turning an assistant off hides its conversations until you turn it on again. Applies on the host and this phone.</div>
      {enabled.includes('codex') ? <><div className="phone-head">ChatGPT plan usage</div><CodexLimits limits={codexAccount?.limits} /></> : null}

      <div className="phone-head">Board</div>
      <div className="phone-group">
        <Cell label="Profiles" value={profile?.name ?? 'All folders'} onPress={() => go({ page: 'profiles' })} />
        <Cell label="Folders" value={String(settings.projects.length)} onPress={() => go({ page: 'projects' })} />
        <Cell label="Hidden conversations" onPress={() => go({ page: 'hidden' })} />
      </div>

      <div className="phone-head">New tasks</div>
      <div className="phone-group">
        <Cell label="Mode" value={SESSION_MODES.find((one) => one.mode === settings.chatMode)?.label} onPress={() => setPicking('mode')} />
        <Cell label="Working at once" value={settings.workingAtOnce === 0 ? 'No limit' : String(settings.workingAtOnce)} onPress={() => setPicking('limit')} />
      </div>
      <div className="phone-note">
        What a task started from the phone or the host runs in, until changed in it. Past the limit, a message waits in its conversation, and the highest card in In progress goes first when one working stops.
      </div>

      <div className="phone-head">Shortcuts</div>
      <div className="phone-group">
        <Cell label="Shortcuts" value={String(settings.shortcuts.filter((one) => shownProjects(settings).includes(one.root)).length)} onPress={() => go({ page: 'shortcuts' })} />
      </div>

      <div className="phone-head">Messages</div>
      <div className="phone-group">
        <Cell label="Phrases" value={String(settings.phrases.filter((one) => one.trim() !== '').length)} onPress={() => go({ page: 'phrases' })} />
      </div>

      <div className="phone-head">Dictation</div>
      <div className="phone-group">
        <Cell label="Your language" value={settings.nativeLanguage} onPress={() => setPicking('language')} />
        {voice() === undefined ? null : <Cell label="Heard by" value={heardBy === 'host' ? (thisMac?.name ?? 'Host') : 'iPhone'} onPress={() => setPicking('ear')} />}
      </div>
      <div className="phone-note">
        {voice() === undefined || heardBy === 'phone'
          ? 'What iOS listens for in the composer, in Say it, and in recordings.'
          : 'The host writes down what you say in the composer and in Say it with its own speech model, in whichever language you speak, once you stop. Recordings are heard by iOS.'}
      </div>

      <div className="phone-head">About</div>
      <div className="phone-group">
        <Cell label={`GeckIt on ${thisMac?.name ?? 'the host'}`} value={version ?? '-'} />
        {enabled.includes('claude') ? <Cell label="Claude Code" value={claudeAccount?.program?.version ?? '-'} says={claudeAccount === undefined ? undefined : planLine(claudeAccount)} /> : null}
        {enabled.includes('codex') ? <Cell label="Codex" value={codexAccount?.program?.version ?? '-'} says={codexAccount === undefined ? undefined : planLine(codexAccount)} /> : null}
      </div>

      {picking === 'theme' ? (
        <Menu
          anchor={new DOMRect()}
          title="Appearance"
          chosen={settings.theme}
          choices={THEMES}
          onPick={(value) => chat.change({ theme: value as Theme })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'mode' ? (
        <Menu
          anchor={new DOMRect()}
          title="New tasks start in"
          explained
          chosen={settings.chatMode}
          choices={SESSION_MODES.map((one) => ({ value: one.mode, label: one.label, says: one.why }))}
          onPick={(value) => chat.change({ chatMode: value as SessionMode })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'limit' ? (
        <Menu
          anchor={new DOMRect()}
          title="Conversations working at once"
          chosen={String(settings.workingAtOnce)}
          choices={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => ({ value: String(count), label: count === 0 ? 'No limit' : String(count) }))}
          onPick={(value) => chat.change({ workingAtOnce: Number(value) })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'language' ? (
        <Menu
          anchor={new DOMRect()}
          title="Your language"
          chosen={settings.nativeLanguage}
          choices={[...new Set([settings.nativeLanguage, ...LANGUAGES])].map((one) => ({ value: one, label: one }))}
          onPick={(value) => chat.change({ nativeLanguage: value })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'ear' ? (
        <Menu
          anchor={new DOMRect()}
          title="Dictation heard by"
          explained
          chosen={heardBy}
          choices={[
            { value: 'host', label: thisMac?.name ?? 'Host', says: 'Its own speech model, which hears which language you speak. The words come once you stop.' },
            { value: 'phone', label: 'iPhone', says: 'iOS speech recognition. The words come while you speak.' },
          ]}
          onPick={(value) => {
            setEar(value as Ear)
            setHeardBy(value as Ear)
          }}
          onClose={() => setPicking(undefined)}
        />
      ) : null}
      {switching && paired !== undefined ? <MacList paired={paired} onChange={() => setPaired(macs()?.list())} onClose={() => setSwitching(false)} /> : null}
    </Page>
  )
}

function Profiles({
  chat,
  back,
  onBack,
  onOpen,
}: {
  readonly chat: Chat
  readonly back: string
  readonly onBack: () => void
  readonly onOpen: (id: string) => void
}): React.JSX.Element {
  const settings = chat.settings
  const use = (id: string): void => {
    tap('light')
    chat.setScope(ALL)
    chat.change({ profile: id })
  }
  return (
    <Page title="Profiles" back={back} onBack={onBack}>
      <div className="phone-group">
        <Cell label="All folders" chosen={settings.profile === ''} onPress={() => use('')} />
        {settings.profiles.map((one) => (
          <div key={one.id} className="phone-cell-pair">
            <Cell label={one.name} says={`${String(one.projects.length)} ${one.projects.length === 1 ? 'folder' : 'folders'}`} chosen={settings.profile === one.id} onPress={() => use(one.id)} />
            <button type="button" className="phone-icon" aria-label={`Edit ${one.name}`} onClick={() => onOpen(one.id)}>
              <Icon name="pencil" size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="phone-note">The one ticked is what this phone shows; the host chooses its own. The profiles themselves are the host's.</div>
      <div className="phone-group phone-form-group">
        <Cell
          label="New profile"
          accent
          onPress={() => {
            const made: ProjectProfile = { id: `p${Date.now().toString(36)}`, name: 'New profile', projects: [] }
            chat.change({ profiles: [...settings.profiles, made] })
            onOpen(made.id)
          }}
        />
      </div>
    </Page>
  )
}

function Profile({ chat, id, back, onBack }: { readonly chat: Chat; readonly id: string; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const settings = chat.settings
  const profile = settings.profiles.find((one) => one.id === id)
  const [name, setName] = useState(profile?.name ?? '')
  const [deleting, setDeleting] = useState(false)
  const put = (next: ProjectProfile): void => chat.change({ profiles: settings.profiles.map((one) => (one.id === id ? next : one)) })
  if (profile === undefined) return <Page title="Profile" back={back} onBack={onBack}>{null}</Page>
  return (
    <Page title={profile.name} back={back} onBack={onBack}>
      <div className="phone-head">Name</div>
      <div className="phone-group">
        <input
          className="phone-cell-field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() !== '' && name.trim() !== profile.name) put({ ...profile, name: name.trim() })
          }}
        />
      </div>
      <div className="phone-head">Folders</div>
      <div className="phone-group">
        {settings.projects.map((root) => {
          const on = profile.projects.includes(root)
          return (
            <Cell
              key={root}
              label={<span style={{ color: `var(--project-${String(projectColor(root, settings))})` }}>{projectLabel(root)}</span>}
              says={homePath(root)}
              chosen={on}
              onPress={() => {
                tap('light')
                put({ ...profile, projects: on ? profile.projects.filter((one) => one !== root) : [...profile.projects, root] })
              }}
            />
          )
        })}
      </div>
      <div className="phone-group phone-form-group">
        <Cell label="Delete profile" danger onPress={() => setDeleting(true)} />
      </div>
      {deleting ? (
        <Menu
          anchor={new DOMRect()}
          title={`Delete "${profile.name}"?`}
          choices={[{ value: 'delete', label: 'Delete', says: 'Its folders and conversations stay', danger: true }]}
          onPick={() => {
            chat.change({ profiles: settings.profiles.filter((one) => one.id !== id), ...(settings.profile === id ? { profile: '' } : {}) })
            onBack()
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </Page>
  )
}

function Projects({ chat, back, onBack }: { readonly chat: Chat; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const [forgetting, setForgetting] = useState<string | undefined>()
  const [adding, setAdding] = useState(false)
  const settings = chat.settings
  return (
    <Page title="Folders" back={back} onBack={onBack}>
      <div className="phone-group">
        {settings.projects.map((root) => (
          <div key={root} className="phone-cell-pair">
            <Cell
              label={
                <>
                  <span className="phone-project-dot" style={{ background: `var(--project-${String(projectColor(root, settings))})` }} />
                  {projectLabel(root)}
                </>
              }
              says={homePath(root)}
            />
            <button type="button" className="phone-icon" aria-label={`Forget ${projectLabel(root)}`} onClick={() => setForgetting(root)}>
              <Icon name="more" size={20} />
            </button>
          </div>
        ))}
      </div>
      <div className="phone-group phone-form-group">
        <Cell label="Add a folder" accent onPress={() => setAdding(true)} />
      </div>
      {adding ? <PhoneProject chat={chat} add onClose={() => setAdding(false)} /> : null}
      {forgetting === undefined ? null : (
        <Menu
          anchor={new DOMRect()}
          title={projectLabel(forgetting)}
          choices={[{ value: 'forget', label: 'Forget', says: 'Its conversations stay on the host', danger: true }]}
          onPick={() => chat.forgetProject(forgetting)}
          onClose={() => setForgetting(undefined)}
        />
      )}
    </Page>
  )
}

/** The Mac's folders one level at a time, from its home, the one shown told to the sheet that picks it from its bar. */
export function Folders({
  from,
  onShown,
}: {
  /** The folder it opens in, the Mac's home when not given. */
  readonly from?: string
  readonly onShown: (folder: FolderList) => void
}): React.JSX.Element {
  const [at, setAt] = useState<string | undefined>(from)
  const [shown, setShown] = useState<FolderList | undefined>()
  const [trouble, setTrouble] = useState<string | undefined>()
  useEffect(() => {
    let here = true
    phoneCalls()
      ?.folders(at)
      .then((read) => {
        if (!here) return
        setTrouble(undefined)
        setShown(read)
        onShown(read)
      })
      .catch((error: unknown) => {
        if (here) setTrouble(tooOld(error))
      })
    return () => {
      here = false
    }
  }, [at, onShown])

  return shown === undefined ? (
    <div className="phone-empty">{trouble ?? `Reading ${computerName()}...`}</div>
  ) : (
    <>
      <div className="phone-head phone-path">{homePath(shown.path)}</div>
      <div className="phone-group">
        {shown.up === undefined ? null : <Cell label=".." icon="left" onPress={() => setAt(shown.up)} />}
        {shown.folders.map((one) => (
          <Cell key={one.path} label={one.name} icon="folder" {...(one.git ? { says: 'Git repository' } : {})} onPress={() => setAt(one.path)} />
        ))}
        {shown.folders.length === 0 ? (
          <Cell label={`No folders inside ${shown.path.split('/').filter((part) => part !== '').pop() ?? computerName()}`} />
        ) : null}
      </div>
    </>
  )
}

function Hidden({ chat, back, onBack }: { readonly chat: Chat; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const [storedFolders, setFolders] = useState<HiddenFolder[] | undefined>()
  const enabled = assistantsIn(chat.settings)
  const folders = useMemo(() => storedFolders?.map((folder) => ({ ...folder, chats: folder.chats.filter((one) => enabled.includes(providerOf(one.id))) })).filter((folder) => folder.chats.length > 0), [storedFolders, enabled])
  const [brought, setBrought] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    void window.geckit.chat.hidden(false).then(setFolders)
  }, [])
  return (
    <Page title="Hidden" back={back} onBack={onBack}>
      <div className="phone-note phone-lead">Kept by your assistants on the host and not on the board.</div>
      {folders === undefined ? (
        <div className="phone-empty">Reading conversations</div>
      ) : folders.length === 0 ? (
        <div className="phone-empty">Nothing is hidden. Every conversation from the last 30 days is on the board.</div>
      ) : (
        folders.map((folder) => (
          <div key={folder.path}>
            <div className="phone-head phone-path">{folder.project === undefined ? homePath(folder.path) : projectLabel(folder.project)}</div>
            <div className="phone-group">
              {folder.chats.map((one) => (
                <Cell key={one.id} label={one.title === '' ? 'Untitled' : one.title} says={one.stands}>
                  {one.reason === 'terminal' ? (
                    <span className="phone-cell-value">In a terminal</span>
                  ) : brought.has(one.id) ? (
                    <span className="phone-cell-value">On the board</span>
                  ) : (
                    <button
                      type="button"
                      className="phone-pill"
                      onClick={() => {
                        tap('light')
                        void window.geckit.chat.bring(one.id).then(() => {
                          setBrought((held) => new Set(held).add(one.id))
                          chat.refresh()
                        })
                      }}
                    >
                      Bring back
                    </button>
                  )}
                </Cell>
              ))}
            </div>
          </div>
        ))
      )}
    </Page>
  )
}

/** The buttons over the message field, each adding its words to the message; the Mac's list, edited here. */
function Phrases({ chat, back, onBack }: { readonly chat: Chat; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const phrases = chat.settings.phrases
  const [added, setAdded] = useState(false)
  const put = (at: number, text: string | undefined): void =>
    chat.change({ phrases: text === undefined ? phrases.filter((_one, index) => index !== at) : phrases.map((one, index) => (index === at ? text : one)) })
  return (
    <Page title="Phrases" back={back} onBack={onBack}>
      {phrases.length === 0 ? null : (
        <div className="phone-group">
          {phrases.map((phrase, at) => (
            <div key={at} className="phone-cell-pair">
              <input
                className="phone-cell-field"
                value={phrase}
                placeholder="commit to main"
                aria-label="Phrase"
                autoFocus={added && at === phrases.length - 1}
                onChange={(event) => put(at, event.target.value)}
              />
              <button
                type="button"
                className="phone-icon phone-remove"
                aria-label={`Remove ${phrase}`}
                onClick={() => {
                  tap('light')
                  put(at, undefined)
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="phone-group phone-form-group">
        <Cell
          label="Add a phrase"
          accent
          onPress={() => {
            setAdded(true)
            chat.change({ phrases: [...phrases, ''] })
          }}
        />
      </div>
      <div className="phone-note">Each is a button over the message field that adds its words to the message. Holding one there removes it too.</div>
    </Page>
  )
}
