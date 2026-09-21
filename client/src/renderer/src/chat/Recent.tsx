import type { ChatSession } from '../../../shared/api'
import { projectName } from './project'

/**
 * Ctrl+Tab, as VS Code does it between files: the conversations opened last,
 * this one first. Tab moves down while Ctrl is held, and letting go of Ctrl
 * opens the one it is on.
 */
export function Recent({ list, at }: { readonly list: readonly ChatSession[]; readonly at: number }): React.JSX.Element {
  return (
    <div className="switcher recent floating" role="listbox" aria-label="Opened last">
      <div className="switcher-rows">
        <div className="switcher-head">Opened last</div>
        {list.map((session, index) => (
          <div
            key={session.id}
            role="option"
            aria-selected={index === at}
            className={`row${index === at ? ' on' : ''}${session.state === 'asks' || session.state === 'unread' ? ` waits ${session.state}` : ''}`}
          >
            <span className={`state ${session.state}`} />
            <span className="lines">
              <span className="head">
                <span className="title">{session.title === '' ? 'Untitled' : session.title}</span>
              </span>
              <span className="stands">
                <span className="where">{projectName(session.root)}</span>
                {session.stands === '' ? null : <span>{session.stands}</span>}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
