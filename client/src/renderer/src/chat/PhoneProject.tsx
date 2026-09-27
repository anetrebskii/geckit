import { useState } from 'react'

import { shownProjects } from '../../../shared/api'
import type { Folders as FolderList } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { tap } from '../tap'
import { Cell, FullSheet } from './PhoneKit'
import { Folders } from './PhoneSettings'
import { homePath, projectName } from './project'
import type { Chat } from './useChat'

/** Where a new task starts, drawn as Settings draws its lists: the projects with their colour and path, and the Mac's folders for one that is not a project yet. */
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
  const [browsing, setBrowsing] = useState(false)
  const [folder, setFolder] = useState<FolderList | undefined>()
  const pick = (one: string): void => {
    tap('light')
    onPick(one)
    onClose()
  }
  const projects = shownProjects(chat.settings)
  const here = (): void => {
    if (folder === undefined) return
    if (!chat.settings.projects.includes(folder.path)) void window.geckit.chat.rememberProject(folder.path).then(() => chat.refresh())
    pick(folder.path)
  }
  const near = root === '' ? undefined : root.slice(0, root.lastIndexOf('/')) || undefined

  return (
    <FullSheet
      title={browsing ? (folder?.path.split('/').pop() ?? 'Choose a folder') : 'Project'}
      {...(browsing
        ? { back: 'Project', onBack: () => setBrowsing(false), action: 'Start here', ready: folder !== undefined, onAction: here }
        : {})}
      onClose={onClose}
    >
      {browsing ? (
        <Folders chat={chat} {...(near === undefined ? {} : { from: near })} onShown={setFolder} />
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
                      {projectName(one)}
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
            <Cell label="Choose a folder" icon="folder" onPress={() => setBrowsing(true)} />
          </div>
          <div className="phone-sheet-note">A folder started in is added to the projects.</div>
        </>
      )}
    </FullSheet>
  )
}
