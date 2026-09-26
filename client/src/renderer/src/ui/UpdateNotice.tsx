import { useEffect, useState } from 'react'

import { updateText } from '../../../shared/api'
import type { UpdateView } from '../../../shared/api'
import { Icon } from './Icon'

/** Where the update stands, kept current from the main process. */
function useUpdate(): UpdateView | undefined {
  const [view, setView] = useState<UpdateView>()
  useEffect(() => window.geckit.update.on(setView), [])
  // The check runs on a timer in the main process, so a window opened after it found something asks what it missed.
  useEffect(() => {
    void window.geckit.update.view().then(setView)
  }, [])
  return view
}

/**
 * A version on its way and then downloaded, in a card in the corner, with the
 * download's bar as Notula shows it. It installs on the next quit anyway, so
 * Later is a fine answer.
 */
export function UpdateNotice(): React.JSX.Element | null {
  const view = useUpdate()
  const [later, setLater] = useState<string>()
  if (view === undefined || !['downloading', 'ready', 'waiting'].includes(view.state) || view.offered === later) return null

  return (
    <div className="update-notice no-drag" aria-live="polite">
      <div className="notice update">
        <span className="state" />
        <span className="lines">
          <span className="title">
            {view.state === 'downloading' ? `Downloading GeckIt ${view.offered}` : `GeckIt ${view.offered} is ready`}
          </span>
          {view.state === 'downloading' ? (
            <span className="progress" role="progressbar" aria-valuenow={view.percent}>
              <span style={{ width: `${String(view.percent)}%` }} />
            </span>
          ) : (
            <span className="body">{view.state === 'waiting' ? updateText(view) : 'It installs when the app restarts.'}</span>
          )}
          {view.state === 'ready' ? (
            <span className="actions">
              <button type="button" className="primary" onClick={() => window.geckit.update.restart()}>
                Restart to Update
              </button>
            </span>
          ) : null}
        </span>
        <button type="button" className="icon-button" aria-label="Later" title="Later" onClick={() => setLater(view.offered)}>
          <Icon name="close" size={12} />
        </button>
      </div>
    </div>
  )
}

/** The version in Settings, what the last check said, and the one button that fits. */
export function Version(): React.JSX.Element | null {
  const view = useUpdate()
  if (view === undefined) return null
  const ready = view.state === 'ready' || view.state === 'waiting'
  const line = updateText(view)
  return (
    <div className="version">
      <span className="lines">
        <span>GeckIt {view.version}</span>
        {line === '' ? null : <span className="why">{line}</span>}
        {view.state === 'downloading' ? (
          <span className="progress" role="progressbar" aria-valuenow={view.percent}>
            <span style={{ width: `${String(view.percent)}%` }} />
          </span>
        ) : null}
      </span>
      {view.state === 'off' ? null : (
        <button
          type="button"
          className={ready ? 'primary' : 'quiet'}
          disabled={view.state === 'checking' || view.state === 'waiting' || view.state === 'downloading'}
          onClick={() => {
            if (view.state === 'ready') window.geckit.update.restart()
            else void window.geckit.update.check()
          }}
        >
          {ready ? 'Restart to Update' : 'Check for Updates'}
        </button>
      )}
    </div>
  )
}
