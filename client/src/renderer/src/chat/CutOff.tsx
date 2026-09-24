import { useEffect, useState } from 'react'

import type { CutOff } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { projectName } from './project'
import { stamp } from './time'

/** On a start, the conversations closing GeckIt cut off, each ticked, to be sent "continue" together. */
export function CutOffDialog({ list, onClose }: { readonly list: readonly CutOff[]; readonly onClose: () => void }): React.JSX.Element {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(list.map((one) => one.id)))
  const [now] = useState(() => Date.now())

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const flip = (id: string): void =>
    setTicked((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Continue where they stopped?</h2>
        <p>These were working when GeckIt closed. Each ticked one is sent &quot;continue&quot;.</p>
        <div className="projects-listed">
          {list.map((one) => {
            const on = ticked.has(one.id)
            return (
              <button
                key={one.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`project-listed${on ? '' : ' off'}`}
                onClick={() => flip(one.id)}
              >
                <span className="tick">{on ? <Icon name="check" size={13} /> : null}</span>
                <span className="name">{one.title === '' ? 'A conversation' : one.title}</span>
                <span className="says">
                  {projectName(one.root)}, working since {stamp(one.at, now)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={onClose}>
            Not now
          </button>
          <button
            type="button"
            className="primary"
            autoFocus
            disabled={ticked.size === 0}
            onClick={() => {
              window.geckit.chat.proceed([...ticked])
              onClose()
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
