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
import { useHostBounce } from './useHosts'

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
  const [trouble, setTrouble] = useState<string | undefined>()
  const pick = (one: string): void => {
    tap('light')
    onPick(one)
    onClose()
  }
  const onShownFolder = (found: FolderList): void => {
    setTrouble(undefined)
    setFolder(found)
  }
  const projects = shownProjects(chat.settings)
  const onHostId = at.step === 'folders' ? at.host : undefined
  const host = onHostId === undefined ? undefined : chat.hosts.find((one) => one.id === onHostId)
  // The host removed while its folders are open, or a card there answered Not now, which always leaves it Not connected: back to Where, never the computer's folders in its place.
  useHostBounce(chat.hosts, onHostId, () => setAt({ step: 'where' }))
  const here = (): void => {
    if (folder === undefined) return
    if (host !== undefined) {
      // A folder on a host is made a project there first, which also reads where its links lead.
      setAdding(true)
      setTrouble(undefined)
      void window.geckit.hosts.addFolderSaying(host.id, folder.path).then((said) => {
        setAdding(false)
        if ('problem' in said) {
          setTrouble(said.problem)
          return
        }
        chat.refresh()
        pick(said.root)
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
        <>
          {onHostId !== undefined && host === undefined ? null : host === undefined ? (
            <Folders chat={chat} {...(near === undefined ? {} : { from: near })} onShown={onShownFolder} />
          ) : (
            <PhoneHostFolders chat={chat} host={host} onShown={onShownFolder} />
          )}
          {trouble === undefined ? null : <div className="phone-note phone-lead">{trouble}</div>}
        </>
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
