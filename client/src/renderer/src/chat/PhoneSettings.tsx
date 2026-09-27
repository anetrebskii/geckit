import { Fragment, useEffect, useState } from 'react'

import { SESSION_MODES, shownProjects } from '../../../shared/api'
import type { Folders as FolderList, HiddenFolder, ProjectProfile, SessionMode, ShortcutDraft, Theme } from '../../../shared/api'
import { hostOf } from '../../../shared/hosts'
import { projectColor } from '../../../shared/project-color'
import { macs } from '../macs'
import { phoneCalls } from '../phone-calls'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { LANGUAGES } from '../ui/SettingsDialog'
import { Limits } from './PhoneInfo'
import { Cell, Page, tooOld } from './PhoneKit'
import { MacList } from './PhoneBoard'
import { PhoneShortcuts } from './PhoneShortcuts'
import { computerName, PhoneHostFolders, PhoneWhere } from './PhoneHosts'
import { accountsOf, placesOf, usageOf } from './plans'
import { homePath, projectLabel } from './project'
import { ALL } from './useChat'
import type { Chat } from './useChat'
import { useHostBounce } from './useHosts'

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
  | { readonly page: 'where' }
  | { readonly page: 'add'; readonly host?: string }
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
          ? 'Projects'
          : one.page === 'where'
              ? 'Where'
              : 'Back'
  }

  if (where.page === 'profiles') return <Profiles chat={chat} back={before()} onBack={back} onOpen={(id) => go({ page: 'profile', id })} />
  if (where.page === 'profile') return <Profile chat={chat} id={where.id} back={before()} onBack={back} />
  // With a host added, a new project is first asked where it is; without one, it is the computer's folders as before.
  if (where.page === 'projects') return <Projects chat={chat} back={before()} onBack={back} onAdd={() => go(chat.hosts.length === 0 ? { page: 'add' } : { page: 'where' })} />
  if (where.page === 'where')
    return (
      <Page title="Where" back={before()} onBack={back}>
        <PhoneWhere chat={chat} onComputer={() => go({ page: 'add' })} onHost={(id) => go({ page: 'add', host: id })} />
      </Page>
    )
  if (where.page === 'add')
    return (
      <AddProject
        chat={chat}
        {...(where.host === undefined ? {} : { host: where.host })}
        back={before()}
        onBack={back}
        onAdded={() => setTrail(trail.filter((one) => one.page !== 'add' && one.page !== 'where'))}
      />
    )
  if (where.page === 'hidden') return <Hidden chat={chat} back={before()} onBack={back} />
  if (where.page === 'phrases') return <Phrases chat={chat} back={before()} onBack={back} />
  if (where.page === 'shortcuts') return <PhoneShortcuts chat={chat} back={before()} onBack={back} onEdit={onEdit} />
  return <Root chat={chat} go={go} />
}

function Root({ chat, go }: { readonly chat: Chat; readonly go: (where: Where) => void }): React.JSX.Element {
  const [picking, setPicking] = useState<'theme' | 'mode' | 'language' | undefined>()
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

      {paired === undefined ? null : (
        <>
          {/* The host this phone works through, and the others it is paired with; the projects that host has on other hosts come with it. */}
          <div className="phone-head">Host</div>
          <div className="phone-group">
            <Cell label={thisMac?.name ?? 'Host'} says={paired.length > 1 ? `${String(paired.length)} hosts paired` : 'Paired'} onPress={() => setSwitching(true)} />
          </div>
          {/* A plan is an account's: one group per account the projects run on, headed by where it was measured once there is more than one. */}
          {accounts.map((item, at) => {
            const usage = usageOf(item, chat.plan)
            if (usage?.fiveHour === undefined && usage?.sevenDay === undefined) return null
            const place = item.places[0] ?? ''
            const plan = item.entry?.plan ?? (place === '' ? chat.account?.plan : undefined)
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

      <div className="phone-head">Board</div>
      <div className="phone-group">
        <Cell label="Profiles" value={profile?.name ?? 'All projects'} onPress={() => go({ page: 'profiles' })} />
        <Cell label="Projects" value={String(settings.projects.length)} onPress={() => go({ page: 'projects' })} />
        <Cell label="Hidden conversations" onPress={() => go({ page: 'hidden' })} />
      </div>

      <div className="phone-head">New tasks</div>
      <div className="phone-group">
        <Cell label="Mode" value={SESSION_MODES.find((one) => one.mode === settings.chatMode)?.label} onPress={() => setPicking('mode')} />
      </div>
      <div className="phone-note">What a task started from the phone or the host runs in, until changed in it.</div>

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
      </div>
      <div className="phone-note">What iOS listens for in the composer, in Say it, and in recordings.</div>

      <div className="phone-head">About</div>
      <div className="phone-group">
        <Cell label={`GeckIt on ${thisMac?.name ?? 'the host'}`} value={version ?? '-'} />
        <Cell label="Claude Code" value={chat.account?.program?.version ?? '-'} />
        {chat.account?.plan === undefined ? null : <Cell label="Plan" value={chat.account.plan} />}
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
      ) : picking === 'language' ? (
        <Menu
          anchor={new DOMRect()}
          title="Your language"
          chosen={settings.nativeLanguage}
          choices={[...new Set([settings.nativeLanguage, ...LANGUAGES])].map((one) => ({ value: one, label: one }))}
          onPick={(value) => chat.change({ nativeLanguage: value })}
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
        <Cell label="All projects" chosen={settings.profile === ''} onPress={() => use('')} />
        {settings.profiles.map((one) => (
          <div key={one.id} className="phone-cell-pair">
            <Cell label={one.name} says={`${String(one.projects.length)} ${one.projects.length === 1 ? 'project' : 'projects'}`} chosen={settings.profile === one.id} onPress={() => use(one.id)} />
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
      <div className="phone-head">Projects</div>
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
          choices={[{ value: 'delete', label: 'Delete', says: 'Its projects and conversations stay', danger: true }]}
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

function Projects({ chat, back, onBack, onAdd }: { readonly chat: Chat; readonly back: string; readonly onBack: () => void; readonly onAdd: () => void }): React.JSX.Element {
  const [forgetting, setForgetting] = useState<string | undefined>()
  const settings = chat.settings
  return (
    <Page title="Projects" back={back} onBack={onBack}>
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
        <Cell label="Add a project" accent onPress={onAdd} />
      </div>
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

function AddProject({
  chat,
  host,
  back,
  onBack,
  onAdded,
}: {
  readonly chat: Chat
  readonly host?: string
  readonly back: string
  readonly onBack: () => void
  readonly onAdded: () => void
}): React.JSX.Element {
  const on = host === undefined ? undefined : chat.hosts.find((one) => one.id === host)
  // The host removed while its folders are open, or a card there answered Not now, which always leaves it Not connected: back rather than the computer's folders in its place.
  useHostBounce(chat.hosts, host, onBack)
  return (
    <Page title="Choose a folder" back={back} onBack={onBack}>
      {host !== undefined && on === undefined ? null : on === undefined ? <Folders chat={chat} onAdded={onAdded} /> : <PhoneHostFolders chat={chat} host={on} onAdded={onAdded} />}
    </Page>
  )
}

/** The Mac's folders one level at a time, from its home, with the one shown added as a project at the bottom. */
export function Folders({
  chat,
  from,
  onShown,
  onAdded,
}: {
  readonly chat: Chat
  /** The folder it opens in, the Mac's home when not given. */
  readonly from?: string
  /** The folder shown, for a sheet that picks it from its bar; then there is no row for it at the bottom. */
  readonly onShown?: (folder: FolderList) => void
  readonly onAdded?: (root: string) => void
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
        onShown?.(read)
      })
      .catch((error: unknown) => {
        if (here) setTrouble(tooOld(error))
      })
    return () => {
      here = false
    }
  }, [at, onShown])
  const had = shown !== undefined && chat.settings.projects.includes(shown.path)

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
      {onShown !== undefined ? null : (
        <div className="phone-group phone-form-group">
          <Cell
            label={had ? 'Already a project' : 'Add this folder'}
            says={shown.git ? 'Git repository' : homePath(shown.path)}
            accent={!had}
            {...(had
              ? {}
              : {
                  onPress: () => {
                    tap('done')
                    void window.geckit.chat.rememberProject(shown.path).then(() => chat.refresh())
                    onAdded?.(shown.path)
                  },
                })}
          />
        </div>
      )}
    </>
  )
}

function Hidden({ chat, back, onBack }: { readonly chat: Chat; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const [folders, setFolders] = useState<HiddenFolder[] | undefined>()
  const [brought, setBrought] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    void window.geckit.chat.hidden(false).then(setFolders)
  }, [])
  return (
    <Page title="Hidden" back={back} onBack={onBack}>
      <div className="phone-note phone-lead">Kept by Claude Code on the host and not on the board.</div>
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
