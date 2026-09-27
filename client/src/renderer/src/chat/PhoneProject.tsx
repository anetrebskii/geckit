import { useState } from 'react'

import { shownProjects } from '../../../shared/api'
import type { Folders as FolderList } from '../../../shared/api'
import { hostOf } from '../../../shared/hosts'
import { projectColor } from '../../../shared/project-color'
import { tap } from '../tap'
import { Cell, FullSheet } from './PhoneKit'
import { PhoneHostFolders, PhoneWhere } from './PhoneHosts'
import { Folders } from './PhoneSettings'
import { homePath, projectLabel } from './project'
import type { Chat } from './useChat'

/** Which step of choosing a folder the sheet is at: where it is, then the folders there, on the computer or a host. */
type Step = { readonly step: 'list' } | { readonly step: 'where' } | { readonly step: 'folders'; readonly host?: string }

/** Where a new task starts, drawn as Settings draws its lists: the projects with their colour and path, and the folders of the computer or a host for one that is not a project yet. */
export function PhoneProject({
  chat,
  root,
  onPick,
  onClose,
}: {
  readonly chat: Chat
  readonly root: string
  readonly onPick: (root: string) => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [at, setAt] = useState<Step>({ step: 'list' })
  const [folder, setFolder] = useState<FolderList | undefined>()
  const [adding, setAdding] = useState(false)
  const pick = (one: string): void => {
    tap('light')
    onPick(one)
    onClose()
  }
  const projects = shownProjects(chat.settings)
  const host = at.step === 'folders' && at.host !== undefined ? chat.hosts.find((one) => one.id === at.host) : undefined
  const here = (): void => {
    if (folder === undefined) return
    if (host !== undefined) {
      // A folder on a host is made a project there first, which also reads where its links lead.
      setAdding(true)
      void window.geckit.hosts.addFolder(host.id, folder.path).then((made) => {
        setAdding(false)
        if (made === undefined) return
        chat.refresh()
        pick(made)
      })
      return
    }
    if (!chat.settings.projects.includes(folder.path)) void window.geckit.chat.rememberProject(folder.path).then(() => chat.refresh())
    pick(folder.path)
  }
  // The folder the current project is in, to start from, when it is on the computer.
  const near = root === '' || hostOf(root) !== undefined ? undefined : root.slice(0, root.lastIndexOf('/')) || undefined
  const choose = (): void => {
    setFolder(undefined)
    setAt(chat.hosts.length === 0 ? { step: 'folders' } : { step: 'where' })
  }

  const title = at.step === 'list' ? 'Project' : at.step === 'where' ? 'Where' : (folder?.path.split('/').pop() ?? 'Choose a folder')
  const bar =
    at.step === 'list'
      ? {}
      : at.step === 'where'
        ? { back: 'Project', onBack: () => setAt({ step: 'list' }) }
        : {
            back: chat.hosts.length === 0 ? 'Project' : 'Where',
            onBack: () => setAt(chat.hosts.length === 0 ? { step: 'list' } : { step: 'where' }),
            action: adding ? 'Adding...' : 'Start here',
            ready: folder !== undefined && !adding,
            onAction: here,
          }

  return (
    <FullSheet title={title} {...bar} onClose={onClose}>
      {at.step === 'where' ? (
        <PhoneWhere
          chat={chat}
          onComputer={() => setAt({ step: 'folders' })}
          onHost={(id) => {
            setFolder(undefined)
            setAt({ step: 'folders', host: id })
          }}
        />
      ) : at.step === 'folders' ? (
        host === undefined ? (
          <Folders chat={chat} {...(near === undefined ? {} : { from: near })} onShown={setFolder} />
        ) : (
          <PhoneHostFolders chat={chat} host={host} onShown={setFolder} />
        )
      ) : (
        <>
          {projects.length === 0 ? null : (
            <div className="phone-group">
              {projects.map((one) => (
                <Cell
                  key={one}
                  label={
                    <>
                      <span className="phone-project-dot" style={{ background: `var(--project-${String(projectColor(one, chat.settings))})` }} />
                      {projectLabel(one)}
                    </>
                  }
                  says={homePath(one)}
                  chosen={one === root}
                  onPress={() => pick(one)}
                />
              ))}
            </div>
          )}
          <div className={`phone-group${projects.length === 0 ? '' : ' phone-form-group'}`}>
            <Cell label="Choose a folder" icon="folder" onPress={choose} />
          </div>
          <div className="phone-sheet-note">A folder started in is added to the projects.</div>
        </>
      )}
    </FullSheet>
  )
}
