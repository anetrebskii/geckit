import { useEffect, useState } from 'react'

import { shownProjects } from '../../../shared/api'
import type { HiddenFolder, HiddenReason } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { Icon } from '../ui/Icon'
import { homePath, projectName, tint } from './project'
import { ago } from './time'
import type { Chat } from './useChat'

const REASONS: Record<HiddenReason, string> = {
  hidden: 'Hidden by you',
  driven: 'Started by another app',
  terminal: 'Started in a terminal',
}

/** Rows a folder shows before "N more": a folder a script writes to every night would push every other one off. */
const MOST = 5

/**
 * What Claude Code kept on this Mac and no board lists, by folder: brought
 * onto the board one at a time where the folder is in a project, and the
 * folder added as a project where it is in none.
 */
export function HiddenChats({ chat, onClose }: { readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  const [folders, setFolders] = useState<HiddenFolder[] | undefined>()
  const [older, setOlder] = useState<'not' | 'reading' | 'read'>('not')
  // Brought onto the board here, by the profile whose board it is on: empty is the one in use.
  const [brought, setBrought] = useState<ReadonlyMap<string, string>>(new Map())
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [now] = useState(() => Date.now())

  useEffect(() => {
    void window.geckit.chat.hidden(false).then(setFolders)
  }, [])

  const readOlder = (): void => {
    setOlder('reading')
    void window.geckit.chat.hidden(true).then((more) => {
      setFolders((held) => [...(held ?? []), ...more])
      setOlder('read')
    })
  }

  // The board a project is on, where it is not the one being looked at.
  const boardOf = (project: string): string => {
    if (shownProjects(chat.settings).includes(project)) return ''
    return chat.settings.profiles.find((one) => one.projects.includes(project))?.id ?? ''
  }
  const profileName = (id: string): string => chat.settings.profiles.find((one) => one.id === id)?.name ?? 'All projects'

  const bring = async (id: string, project: string): Promise<void> => {
    await window.geckit.chat.bring(id)
    setBrought((held) => new Map(held).set(id, boardOf(project)))
    chat.refresh()
  }

  const add = async (folder: HiddenFolder): Promise<void> => {
    await window.geckit.chat.rememberProject(folder.path)
    for (const one of folder.chats) if (one.reason !== 'terminal') await window.geckit.chat.bring(one.id)
    setAdded((held) => new Set(held).add(folder.path))
    setBrought((held) => {
      const next = new Map(held)
      for (const one of folder.chats) next.set(one.id, '')
      return next
    })
    chat.refresh()
  }

  const open = (id: string): void => {
    onClose()
    chat.goTo(id)
  }

  return (
    <div
      className="dialog-scrim"
      onMouseDown={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        className="dialog hidden-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hidden-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="hidden-title">Hidden conversations</h2>
        <p>Kept by Claude Code on this Mac and not on the board.</p>
        <div className="hidden-body">
          {folders === undefined ? (
            <div className="empty">Reading conversations...</div>
          ) : folders.length === 0 ? (
            <div className="empty">Nothing is hidden. Every conversation from the last 30 days is on the board.</div>
          ) : (
            folders.map((folder) => {
              const shown = opened.has(folder.path) ? folder.chats : folder.chats.slice(0, MOST)
              const more = folder.chats.length - shown.length
              return (
                <div key={folder.path}>
                  <div className="hidden-folder">
                    <Icon name="folder" size={13} />
                    <span className="path" title={folder.path}>
                      {homePath(folder.path)}
                    </span>
                    {folder.project === undefined ? null : (
                      <span className="tinted" style={tint(projectColor(folder.project, chat.settings))}>
                        in {projectName(folder.project)}
                      </span>
                    )}
                    <span className="spacer" />
                    {added.has(folder.path) ? (
                      <span className="done">Added as a project</span>
                    ) : folder.project === undefined ? (
                      <button type="button" className="quiet" onClick={() => void add(folder)}>
                        Add as project
                      </button>
                    ) : null}
                  </div>
                  {shown.map((one) => {
                    const board = brought.get(one.id)
                    return (
                      <div key={one.id} className="row hidden-row">
                        <span className="lines">
                          <span className="head">
                            <span className="title">{one.title}</span>
                            <span className="changed">{ago(one.at, now, true)}</span>
                          </span>
                          <span className="stands">
                            <span className="reason">{REASONS[one.reason]}</span>
                            {one.stands}
                          </span>
                        </span>
                        {board === undefined ? (
                          folder.project === undefined ? null : (
                            <button type="button" className="quiet" onClick={() => void bring(one.id, folder.project ?? '')}>
                              Show on the board
                            </button>
                          )
                        ) : board === '' ? (
                          <span className="on-board">
                            On the board.
                            <button type="button" className="quiet" autoFocus onClick={() => open(one.id)}>
                              Open
                            </button>
                          </span>
                        ) : (
                          <span className="on-board">
                            On the board of {profileName(board)}.
                            <button
                              type="button"
                              className="quiet"
                              autoFocus
                              onClick={() => {
                                chat.change({ profile: board })
                                open(one.id)
                              }}
                            >
                              Switch
                            </button>
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {more > 0 ? (
                    <button
                      type="button"
                      className="hidden-more"
                      onClick={() => setOpened((held) => new Set(held).add(folder.path))}
                    >
                      {more} more
                    </button>
                  ) : null}
                </div>
              )
            })
          )}
          {folders === undefined || older === 'read' ? null : (
            <div className="hidden-older">
              {older === 'reading' ? (
                <span className="empty">Reading conversations...</span>
              ) : (
                <button type="button" className="quiet" onClick={readOlder}>
                  Show older
                </button>
              )}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
