import { useState } from 'react'

import { profileOf, shownProjects } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { Cell, FullSheet } from './PhoneKit'
import { Folders } from './PhoneSettings'
import { projectLabel } from './project'
import { ALL } from './useChat'
import type { Chat } from './useChat'

/** Which projects the phone's board shows: a profile, some of its projects, or all of them. Kept on this phone only. See docs/ux/phone-parity.md. */

function scopeName(chat: Chat): string {
  const profile = profileOf(chat.settings)
  if (chat.chosen.length === 1) return projectLabel(chat.chosen[0] ?? '')
  if (chat.chosen.length > 1) return `${String(chat.chosen.length)} projects`
  return profile?.name ?? 'All projects'
}

export function ScopeButton({ chat, onPress }: { readonly chat: Chat; readonly onPress: () => void }): React.JSX.Element {
  return (
    <button type="button" className="phone-scope" onClick={onPress}>
      {scopeName(chat)}
      <Icon name="down" size={12} />
    </button>
  )
}

export function PhoneScope({ chat, onClose }: { readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  const settings = chat.settings
  const use = (profile: string): void => {
    tap('light')
    chat.setScope(ALL)
    chat.change({ profile })
    onClose()
  }
  return (
    <>
      <Sheet title="Show" onClose={onClose} cancel={false} className="phone-scope-sheet">
        {settings.profiles.length === 0 ? null : (
          <>
            <div className="sheet-head">Profile</div>
            <div className="sheet-list">
              <Cell label="All projects" chosen={settings.profile === ''} onPress={() => use('')} />
              {settings.profiles.map((one) => (
                <Cell key={one.id} label={one.name} says={`${String(one.projects.length)} ${one.projects.length === 1 ? 'project' : 'projects'}`} chosen={settings.profile === one.id} onPress={() => use(one.id)} />
              ))}
            </div>
          </>
        )}
        <div className="sheet-head">Projects</div>
        <div className="sheet-list">
          {chat.chosen.length === 0 ? null : <Cell label="Every one of them" accent onPress={() => chat.setScope(ALL)} />}
          {shownProjects(settings).map((root) => (
            <Cell
              key={root}
              label={
                <>
                  <span className="phone-project-dot" style={{ background: `var(--project-${String(projectColor(root, settings))})` }} />
                  {projectLabel(root)}
                </>
              }
              chosen={chat.chosen.includes(root)}
              onPress={() => {
                tap('light')
                chat.alsoScope(root)
              }}
            />
          ))}
          <Cell label="Add a project" accent onPress={() => setAdding(true)} />
        </div>
        <div className="sheet-note">Nothing ticked shows every project{profileOf(settings) === undefined ? '' : ` in ${profileOf(settings)?.name ?? ''}`}. On this phone only.</div>
      </Sheet>
      {adding ? (
        <FullSheet title="Choose a folder" onClose={() => setAdding(false)}>
          <Folders chat={chat} onAdded={() => setAdding(false)} />
        </FullSheet>
      ) : null}
    </>
  )
}
