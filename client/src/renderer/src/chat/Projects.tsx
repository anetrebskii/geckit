import { useState } from 'react'

import { Icon } from '../ui/Icon'
import { MOD } from '../ui/Shortcuts'
import { PROJECT_COLORS, projectColor } from '../../../shared/project-color'
import { homePath, projectName } from './project'
import type { Chat } from './useChat'
import { ALL } from './useChat'

/**
 * The project picker: every folder, what waits in each, a field to get to one
 * by typing a few letters, and a way to take one off the list.
 */

const ADD = ''

interface Waits {
  readonly asks: number
  readonly unread: number
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

function Menu({
  chat,
  anchor,
  onClose,
}: {
  readonly chat: Chat
  readonly anchor: DOMRect
  readonly onClose: () => void
}): React.JSX.Element {
  const [asked, setAsked] = useState('')
  // The project whose colours are laid out under it.
  const [painting, setPainting] = useState<string | undefined>()
  const colors = chat.settings.projectColors
  const paint = (root: string, color: number): void => {
    chat.change({ projectColors: { ...colors, [root]: color } })
    setPainting(undefined)
  }
  const sharing = (root: string, color: number): string[] =>
    chat.settings.projects.filter((one) => one !== root && projectColor(one, chat.settings) === color).map(projectName)
  // Opens on the project already chosen, so Enter with nothing typed keeps it.
  const [at, setAt] = useState(() => (chat.scope === ALL ? 0 : chat.settings.projects.indexOf(chat.scope) + 1))

  const waits = new Map<string, Waits>()
  for (const one of chat.waiting) {
    const held = waits.get(one.root) ?? { asks: 0, unread: 0 }
    waits.set(one.root, one.state === 'asks' ? { ...held, asks: held.asks + 1 } : { ...held, unread: held.unread + 1 })
  }
  const everywhere = [...waits.values()].reduce<Waits | undefined>(
    (sum, one) => ({ asks: (sum?.asks ?? 0) + one.asks, unread: (sum?.unread ?? 0) + one.unread }),
    undefined,
  )

  const words = asked.toLowerCase().split(/\s+/).filter((word) => word !== '')
  const rows = [
    { value: ALL, name: 'All projects', path: `${String(chat.settings.projects.length)} folders`, waits: everywhere },
    ...chat.settings.projects.map((root) => ({
      value: root,
      name: projectName(root),
      path: homePath(root),
      waits: waits.get(root),
    })),
  ].filter((row) => words.every((word) => `${row.name} ${row.value}`.toLowerCase().includes(word)))
  const here = Math.min(at, Math.max(0, rows.length - 1))

  const pick = (value: string): void => {
    if (value === ADD) chat.addProject()
    else chat.setScope(value)
    onClose()
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
            <div
              role="menuitem"
              className={`menu-item project-row${row.value === chat.scope ? ' on' : ''}${index === here ? ' at' : ''}`}
              onMouseMove={() => setAt(index)}
              onClick={() => pick(row.value)}
            >
              <span style={{ width: 14, flexShrink: 0 }}>
                {row.value === chat.scope ? <Icon name="check" size={13} /> : null}
              </span>
              {row.value === ALL ? (
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
              <Waiting waits={row.waits} />
              {row.value === ALL ? (
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
        <button type="button" role="menuitem" className="menu-item" onClick={() => pick(ADD)}>
          <span style={{ width: 14, flexShrink: 0 }}>
            <Icon name="plus" size={13} />
          </span>
          Add a project...
        </button>
      </div>
    </>
  )
}

export function Projects({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
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
          {chat.root === undefined ? 'Choose a project' : chat.scope === ALL ? 'All projects' : projectName(chat.scope)}
        </span>
        <span className="spacer" />
        <span className="keys">{MOD}+K</span>
        <Icon name="down" size={11} />
      </button>
      {anchor === undefined ? null : <Menu chat={chat} anchor={anchor} onClose={() => setAnchor(undefined)} />}
    </>
  )
}
