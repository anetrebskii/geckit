import { flushSync } from 'react-dom'

import type { ChatSession, Settings } from '../../../shared/api'
import { homeOf } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { projectLabel, tint } from './project'
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
  onAt,
  onPick,
}: {
  readonly list: readonly ChatSession[]
  readonly at: number
  readonly colors: Pick<Settings, 'projectColors'>
  readonly onAt: (index: number) => void
  readonly onPick: (index: number) => void
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
            // Drawn at once, rather than left to React for later, so the choice keeps up with the pointer.
            onMouseMove={() => {
              if (index !== at) flushSync(() => onAt(index))
            }}
            onMouseDown={() => onPick(index)}
          >
            <Dot session={session} />
            <span className="lines">
              <span className="head">
                <span className="title">{session.title === '' ? 'Untitled' : session.title}</span>
              </span>
              <span className="stands">
                <span className="where tinted" style={tint(projectColor(homeOf(session), colors))}>
                  {projectLabel(homeOf(session))}
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
