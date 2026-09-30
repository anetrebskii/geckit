import { useEffect, useState } from 'react'

import { useSettings } from '../settings'
import { Icon } from '../ui/Icon'
import { Correct } from './Correct'
import { Transcribe } from './Transcribe'

type Tab = 'correct' | 'transcribe'

/**
 * The small window: correcting and dictating, one press from anywhere.
 *
 * Everything else, settings and shortcuts included, is in Chat, the main
 * window; this one is opened for a moment and closed again.
 */
export function Panel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('correct')
  const [settings, change] = useSettings()

  // Whatever the shortcut picked up belongs in Correct, so that is the tab.
  useEffect(() => window.geckit.panel.onText(() => setTab('correct')), [])

  // The microphone list is kept so the dictation capsule can name them before
  // it has opened one of its own.
  useEffect(() => {
    const refresh = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) =>
          change({
            audioDevices: devices
              .filter((one) => one.kind === 'audioinput')
              .map((one) => ({ deviceId: one.deviceId, label: one.label })),
          }),
        )
        .catch(() => undefined)
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
    // Run once: `change` is stable and re-running would loop on its own write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key === '1') {
        event.preventDefault()
        setTab('correct')
      } else if (event.key === '2') {
        event.preventDefault()
        setTab('transcribe')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return (
    <div className="panel">
      <div className="topbar drag">
        <button
          type="button"
          className={`tab no-drag${tab === 'correct' ? ' on' : ''}`}
          onClick={() => setTab('correct')}
          title="Ctrl+1"
        >
          <Icon name="spellcheck" />
          Correct
        </button>
        <button
          type="button"
          className={`tab no-drag${tab === 'transcribe' ? ' on' : ''}`}
          onClick={() => setTab('transcribe')}
          title="Ctrl+2"
        >
          <Icon name="mic" />
          Transcribe
        </button>
      </div>

      <div className="panel-body">
        {tab === 'correct' ? (
          <Correct settings={settings} change={change} />
        ) : (
          <Transcribe settings={settings} change={change} />
        )}
      </div>
    </div>
  )
}
