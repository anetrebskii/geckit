import type { ChatSession, Settings } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { projectName, tint } from './project'
import { Dot } from './Tasks'

/**
 * Ctrl+Tab, as VS Code does it between files: the conversations opened last,
 * this one first. Tab moves down while Ctrl is held, and letting go of Ctrl
 * opens the one it is on.
 */
export function Recent({
  list,
  at,
  colors,
}: {
  readonly list: readonly ChatSession[]
  readonly at: number
  readonly colors: Pick<Settings, 'projectColors'>
}): React.JSX.Element {
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
            <Dot session={session} />
            <span className="lines">
              <span className="head">
                <span className="title">{session.title === '' ? 'Untitled' : session.title}</span>
              </span>
              <span className="stands">
                <span className="where" style={tint(projectColor(session.root, colors))}>
                  {projectName(session.root)}
                </span>
                {session.stands === '' ? null : <span>{session.stands}</span>}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
