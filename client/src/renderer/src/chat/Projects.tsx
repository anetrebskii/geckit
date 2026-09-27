import { useState } from 'react'

import { Icon } from '../ui/Icon'
import { MOD } from '../ui/Shortcuts'
import { homeOf, profileOf, shownProjects } from '../../../shared/api'
import { PROJECT_COLORS, projectColor } from '../../../shared/project-color'
import { hostOf, stateLine, targetLine } from '../../../shared/hosts'
import type { HostView } from '../../../shared/hosts'
import { AddHost } from './Hosts'
import { useMinute } from './useHosts'
import { HostDot, HostFolders } from './HostParts'
import { homePath, projectLabel, projectName } from './project'
import type { Chat } from './useChat'
import { ALL } from './useChat'
import { HiddenChats } from './HiddenChats'

/**
 * The project picker: every folder, what waits in each, a field to get to one
 * by typing a few letters, and a way to take one off the list.
 */

const ADD = ''
/** A host's own row, which lists every project on it. */
const ON_HOST = 'host:'
/** Add a folder on a host. */
const ADD_ON = 'add:'

const folders = (count: number): string => `${String(count)} ${count === 1 ? 'folder' : 'folders'}`

/** What the picker's button says for what is listed: one project, every one of a host's, or how many. */
export function chosenName(chat: Chat): string {
  if (chat.chosen.length === 0) return everyName(chat)
  if (chat.chosen.length === 1) return projectLabel(chat.scope)
  const host = chat.hosts.find((one) => {
    const on = shownProjects(chat.settings).filter((root) => hostOf(root) === one.id)
    return on.length === chat.chosen.length && on.every((root) => chat.chosen.includes(root))
  })
  return host === undefined ? `${String(chat.chosen.length)} projects` : `All on ${host.name}`
}

/** Every project listed at once: all of them, or all of the profile's in use. */
function everyName(chat: Chat): string {
  const profile = profileOf(chat.settings)
  return profile === undefined ? 'All projects' : `All in ${profile.name}`
}

interface Waits {
  readonly asks: number
  readonly unread: number
}

/** What stands in a project, in the board's own two columns. */
interface Work {
  readonly progress: number
  readonly review: number
}

function Standing({ work }: { readonly work: Work | undefined }): React.JSX.Element | null {
  if (work === undefined || (work.progress === 0 && work.review === 0)) return null
  return (
    <>
      {work.progress === 0 ? null : (
        <span className="project-count" title={`${String(work.progress)} in progress`}>
          {work.progress}
        </span>
      )}
      {work.review === 0 ? null : (
        <span className="project-count review" title={`${String(work.review)} in review`}>
          <Icon name="eye" size={11} />
          {work.review}
        </span>
      )}
    </>
  )
}

function Waiting({ waits }: { readonly waits: Waits | undefined }): React.JSX.Element | null {
  if (waits === undefined) return null
  const said = [
    ...(waits.asks === 0 ? [] : [`${String(waits.asks)} asking`]),
    ...(waits.unread === 0 ? [] : [`${String(waits.unread)} answered, not read`]),
  ].join(', ')
  return (
    <span className={`waits-count ${waits.asks > 0 ? 'asks' : 'unread'}`} title={said}>
      {waits.asks + waits.unread}
    </span>
  )
}

interface Row {
  readonly value: string
  readonly name: string
  readonly path: string
  readonly waits: Waits | undefined
  readonly work: Work | undefined
  readonly kind: 'all' | 'project' | 'host' | 'add'
  /** The host its group is under, or `local`; nothing where there are no hosts. */
  readonly group?: string
}

const sumWaits = (all: readonly (Waits | undefined)[]): Waits | undefined =>
  all.reduce<Waits | undefined>((sum, one) => (one === undefined ? sum : { asks: (sum?.asks ?? 0) + one.asks, unread: (sum?.unread ?? 0) + one.unread }), undefined)

const sumWork = (all: readonly (Work | undefined)[]): Work =>
  all.reduce<Work>((sum, one) => ({ progress: sum.progress + (one?.progress ?? 0), review: sum.review + (one?.review ?? 0) }), { progress: 0, review: 0 })

function Menu({
  chat,
  anchor,
  onClose,
  onHidden,
  onFolderOn,
  onAddHost,
}: {
  readonly chat: Chat
  readonly anchor: DOMRect
  readonly onClose: () => void
  readonly onHidden: () => void
  readonly onFolderOn: (host: HostView) => void
  readonly onAddHost: () => void
}): React.JSX.Element {
  const [asked, setAsked] = useState('')
  // The project whose colours are laid out under it.
  const [painting, setPainting] = useState<string | undefined>()
  const colors = chat.settings.projectColors
  const projects = shownProjects(chat.settings)
  const paint = (root: string, color: number): void => {
    chat.change({ projectColors: { ...colors, [root]: color } })
    setPainting(undefined)
  }
  const sharing = (root: string, color: number): string[] =>
    projects.filter((one) => one !== root && projectColor(one, chat.settings) === color).map(projectName)
  // Opens on the project already chosen, so Enter with nothing typed keeps it.
  const [at, setAt] = useState(() => (chat.scope === ALL ? 0 : projects.indexOf(chat.scope) + 1))

  const waits = new Map<string, Waits>()
  for (const one of chat.waiting) {
    const held = waits.get(homeOf(one)) ?? { asks: 0, unread: 0 }
    waits.set(homeOf(one), one.state === 'asks' ? { ...held, asks: held.asks + 1 } : { ...held, unread: held.unread + 1 })
  }
  const everywhere = [...waits.values()].reduce<Waits | undefined>(
    (sum, one) => ({ asks: (sum?.asks ?? 0) + one.asks, unread: (sum?.unread ?? 0) + one.unread }),
    undefined,
  )

  const work = new Map<string, Work>()
  for (const one of chat.everyone) {
    if (one.status === 'done') continue
    const held = work.get(homeOf(one)) ?? { progress: 0, review: 0 }
    work.set(homeOf(one), one.status === 'review' ? { ...held, review: held.review + 1 } : { ...held, progress: held.progress + 1 })
  }
  const standing = [...work.values()].reduce<Work>(
    (sum, one) => ({ progress: sum.progress + one.progress, review: sum.review + one.review }),
    { progress: 0, review: 0 },
  )

  const words = asked.toLowerCase().split(/\s+/).filter((word) => word !== '')
  const projectRow = (root: string, group?: string): Row => ({
    value: root,
    name: projectName(root),
    path: homePath(root),
    waits: waits.get(root),
    work: work.get(root),
    kind: 'project',
    ...(group === undefined ? {} : { group }),
  })
  const onHost = (id: string): string[] => projects.filter((root) => hostOf(root) === id)
  const matches = (row: Row): boolean => row.kind === 'all' || words.every((word) => `${row.name} ${row.value}`.toLowerCase().includes(word))
  const all: Row = { value: ALL, name: everyName(chat), path: folders(projects.length), waits: everywhere, work: standing, kind: 'all' }
  const rows: Row[] =
    chat.hosts.length === 0
      ? [all, ...projects.map((root) => projectRow(root))].filter(matches)
      : [
          all,
          ...projects.filter((root) => hostOf(root) === undefined).map((root) => projectRow(root, 'local')),
          ...chat.hosts.flatMap((host): Row[] => [
            {
              value: `${ON_HOST}${host.id}`,
              name: `All on ${host.name}`,
              path: folders(onHost(host.id).length),
              waits: sumWaits(onHost(host.id).map((root) => waits.get(root))),
              work: sumWork(onHost(host.id).map((root) => work.get(root))),
              kind: 'host',
              group: host.id,
            },
            ...onHost(host.id).map((root) => projectRow(root, host.id)),
            { value: `${ADD_ON}${host.id}`, name: `Add a folder on ${host.name}...`, path: '', waits: undefined, work: undefined, kind: 'add', group: host.id },
          ]),
        ].filter(matches)
  const here = Math.min(at, Math.max(0, rows.length - 1))

  const pick = (value: string): void => {
    if (value === ADD) chat.addProject()
    else if (value.startsWith(ON_HOST)) chat.choose(onHost(value.slice(ON_HOST.length)))
    else if (value.startsWith(ADD_ON)) {
      const host = chat.hosts.find((one) => one.id === value.slice(ADD_ON.length))
      if (host !== undefined) onFolderOn(host)
    } else chat.setScope(value)
    onClose()
  }

  // The check is the way to list several at once; the row itself still switches to one.
  const on = (value: string): boolean => {
    if (value === ALL) return chat.chosen.length === 0
    if (value.startsWith(ON_HOST)) {
      const roots = onHost(value.slice(ON_HOST.length))
      return chat.chosen.length > 0 && roots.length > 0 && roots.every((root) => chat.chosen.includes(root))
    }
    return chat.chosen.includes(value)
  }
  const also = (value: string): void => {
    if (value === ALL) chat.setScope(ALL)
    else if (value.startsWith(ON_HOST)) {
      const roots = onHost(value.slice(ON_HOST.length))
      chat.choose(on(value) ? chat.chosen.filter((root) => !roots.includes(root)) : [...new Set([...chat.chosen, ...roots])])
    } else chat.alsoScope(value)
  }

  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div className="floating menu projects" role="menu" style={{ left: Math.max(8, anchor.left), top: anchor.bottom + 4 }}>
        <input
          type="text"
          className="projects-field"
          value={asked}
          autoFocus
          placeholder="Switch to a project"
          onChange={(event) => {
            setAsked(event.target.value)
            setAt(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setAt(Math.min(here + 1, rows.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setAt(Math.max(here - 1, 0))
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              const row = rows[here]
              if (row !== undefined) pick(row.value)
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }
          }}
        />
        {rows.length === 0 ? <div className="empty">No project by that name.</div> : null}
        {rows.map((row, index) => (
          <div key={row.value}>
            {row.group === undefined || rows[index - 1]?.group === row.group ? null : <GroupHead chat={chat} group={row.group} />}
            {row.kind === 'add' ? (
              <div
                role="menuitem"
                className={`menu-item project-add${index === here ? ' at' : ''}`}
                onMouseMove={() => setAt(index)}
                onClick={() => pick(row.value)}
              >
                <Icon name="plus" size={12} />
                {row.name}
              </div>
            ) : (
            <div
              role="menuitem"
              className={`menu-item project-row${on(row.value) ? ' on' : ''}${index === here ? ' at' : ''}`}
              onMouseMove={() => setAt(index)}
              onClick={(event) => {
                // Held down, the row does what its check does: adds this project to the list beside the others.
                if (event.metaKey || event.ctrlKey) also(row.value)
                else pick(row.value)
              }}
            >
              <button
                type="button"
                className={`project-pick${on(row.value) ? ' on' : ''}`}
                aria-label={on(row.value) ? `Stop listing ${row.name}` : `List ${row.name} as well`}
                title={row.value === ALL ? 'Every project' : 'List it as well as the others'}
                onClick={(event) => {
                  event.stopPropagation()
                  also(row.value)
                }}
              >
                {on(row.value) ? <Icon name="check" size={13} /> : null}
              </button>
              {row.kind === 'all' || row.kind === 'host' ? (
                <span className="project-dot-space" />
              ) : (
                <button
                  type="button"
                  className="project-dot"
                  style={{ background: `var(--project-${String(projectColor(row.value, chat.settings))})` }}
                  aria-label={`Colour of ${row.name}`}
                  title={`${PROJECT_COLORS[projectColor(row.value, chat.settings)] ?? ''}. Press to choose another.`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setPainting(painting === row.value ? undefined : row.value)
                  }}
                />
              )}
              <span className="lines">
                <span className="name">{row.name}</span>
                <span className="says" title={row.value === ALL ? undefined : row.value}>
                  {row.path}
                </span>
              </span>
              <Standing work={row.work} />
              <Waiting waits={row.waits} />
              {row.kind === 'all' || row.kind === 'host' ? (
                <span className="forget-space" />
              ) : (
                <button
                  type="button"
                  className="icon-button forget"
                  aria-label={`Take ${row.name} off the list`}
                  title="Take it off the list. The folder and its conversations stay where they are."
                  onClick={(event) => {
                    event.stopPropagation()
                    chat.forgetProject(row.value)
                  }}
                >
                  <Icon name="close" size={11} />
                </button>
              )}
            </div>
            )}
            {painting !== row.value ? null : (
              <div className="project-palette">
                {PROJECT_COLORS.map((name, color) => (
                  <button
                    key={name}
                    type="button"
                    className={`project-swatch${projectColor(row.value, chat.settings) === color ? ' on' : ''}`}
                    style={{ background: `var(--project-${String(color)})` }}
                    aria-label={name}
                    title={sharing(row.value, color).length === 0 ? name : `${name}, as ${sharing(row.value, color).join(', ')}`}
                    onClick={() => paint(row.value, color)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="menu-divider" />
        <div className="projects-hint">A check lists a project beside the others. Pressing a row shows only that one.</div>
        <button type="button" role="menuitem" className="menu-item" onClick={() => pick(ADD)}>
          <span style={{ width: 14, flexShrink: 0 }}>
            <Icon name="plus" size={13} />
          </span>
          {chat.hosts.length === 0 ? 'Add a project...' : 'Add a folder on this computer...'}
        </button>
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          onClick={() => {
            onClose()
            onAddHost()
          }}
        >
          <span style={{ width: 14, flexShrink: 0 }}>
            <Icon name="plus" size={13} />
          </span>
          Add a host...
        </button>
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          onClick={() => {
            onClose()
            onHidden()
          }}
        >
          <span style={{ width: 14, flexShrink: 0 }}>
            <Icon name="hidden" size={13} />
          </span>
          Hidden conversations...
        </button>
      </div>
    </>
  )
}

/** Over a group of projects: Local, or a host with how it stands. */
function GroupHead({ chat, group }: { readonly chat: Chat; readonly group: string }): React.JSX.Element {
  const host = chat.hosts.find((one) => one.id === group)
  const now = useMinute()
  return (
    <div className="projects-group">
      {host === undefined ? null : <HostDot state={host.state} />}
      <span className="name">{host === undefined ? 'Local' : host.name}</span>
      {host === undefined ? null : <span className="says">{host.state === 'up' ? targetLine(host) : stateLine(host, now)}</span>}
    </div>
  )
}

export function Projects({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
  const [hidden, setHidden] = useState(false)
  const [folderOn, setFolderOn] = useState<HostView | undefined>()
  const [addingHost, setAddingHost] = useState(false)
  return (
    <>
      <button
        type="button"
        className="project no-drag"
        title={`Switch project (${MOD}+K)`}
        onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
      >
        <Icon name="folder" />
        <span className="name">
          {chat.root === undefined ? 'Choose a project' : chosenName(chat)}
        </span>
        <span className="spacer" />
        <span className="keys">{MOD}+K</span>
        <Icon name="down" size={11} />
      </button>
      {anchor === undefined ? null : (
        <Menu
          chat={chat}
          anchor={anchor}
          onClose={() => setAnchor(undefined)}
          onHidden={() => setHidden(true)}
          onFolderOn={setFolderOn}
          onAddHost={() => setAddingHost(true)}
        />
      )}
      {hidden ? <HiddenChats chat={chat} onClose={() => setHidden(false)} /> : null}
      {folderOn === undefined ? null : <HostFolders host={folderOn} onClose={() => setFolderOn(undefined)} onAdded={(root) => chat.setScope(root)} />}
      {addingHost ? <AddHost onClose={() => setAddingHost(false)} /> : null}
    </>
  )
}
