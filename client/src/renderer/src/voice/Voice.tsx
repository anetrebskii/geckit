import { useCallback, useEffect, useState } from 'react'

import { base64, BARS, time, useRecorder } from '../recorder'
import { useSettings } from '../settings'
import { Icon } from '../ui/Icon'

/**
 * The capsule that appears while something is being dictated.
 *
 * It opens recording, because the shortcut was pressed to say something, and
 * pressing the same shortcut again stops it. What it hears goes on the
 * clipboard and is pasted back into whatever the person was typing in, which
 * the main process does once it has the words.
 */

type State = 'recording' | 'transcribing' | 'error'

export function Voice(): React.JSX.Element {
  const [settings, change] = useSettings()
  const [state, setState] = useState<State>('recording')
  const [error, setError] = useState('')
  const [last, setLast] = useState<Blob | undefined>()

  const send = useCallback(async (audio: Blob) => {
    setLast(audio)
    setState('transcribing')
    const answer = await window.geckit.voice.done({ audio: await base64(audio), fileName: 'dictation.webm' })
    if (answer.ok && answer.text !== undefined && answer.text.trim() !== '') return
    setState('error')
    setError(answer.error ?? 'Nothing was heard')
  }, [])

  const recorder = useRecorder(settings.microphoneDeviceId, (audio) => void send(audio))
  const { start, stop } = recorder

  useEffect(() => window.geckit.voice.onStart(start), [start])
  useEffect(() => window.geckit.voice.onStop(stop), [stop])

  // The window is opened by the shortcut, and the shortcut means "start now".
  useEffect(() => {
    const soon = setTimeout(start, 60)
    return () => clearTimeout(soon)
  }, [start])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.geckit.voice.cancel()
      if (event.key === 'Enter') stop()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [stop])

  const mics = settings.audioDevices

  return (
    <div className="capsule-window">
      <div className="capsule">
        {state === 'transcribing' ? (
          <>
            <Icon name="spinner" className="glyph spinning" />
            <span>Writing it down</span>
          </>
        ) : state === 'error' ? (
          <>
            <span className="said" style={{ color: 'var(--danger)' }} title={error}>
              {error}
            </span>
            {last === undefined ? null : (
              <button
                type="button"
                className="icon-button"
                aria-label="Try again"
                title="Try again"
                onClick={() => void send(last)}
              >
                <Icon name="refresh" />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={() => window.geckit.voice.cancel()}
            >
              <Icon name="close" />
            </button>
          </>
        ) : (
          <>
            <span className="mic">
              <Icon
                name="mic"
                size={15}
                {...(settings.microphoneDeviceId === '' ? {} : { className: 'chosen' })}
              />
              <select
                value={settings.microphoneDeviceId}
                aria-label="Microphone"
                onChange={(event) => change({ microphoneDeviceId: event.target.value })}
              >
                <option value="">Default</option>
                {mics.map((one) => (
                  <option key={one.deviceId} value={one.deviceId}>
                    {one.label === '' ? `Microphone ${one.deviceId.slice(0, 6)}` : one.label}
                  </option>
                ))}
              </select>
            </span>

            <span className="bars">
              {Array.from({ length: BARS }, (_one, at) => (
                <span key={at} style={{ height: 4 + (recorder.levels[at] ?? 0) * 16 }} />
              ))}
            </span>

            <span className="time">{time(recorder.elapsed)}</span>

            <button
              type="button"
              className="icon-button"
              aria-label="Stop and paste"
              title="Stop and paste (Enter)"
              style={{ color: 'var(--danger)' }}
              onClick={() => recorder.stop()}
            >
              <Icon name="stop" size={13} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel"
              title="Cancel (Esc)"
              onClick={() => {
                recorder.cancel()
                window.geckit.voice.cancel()
              }}
            >
              <Icon name="close" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
