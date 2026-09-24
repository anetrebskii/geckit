import { useCallback, useEffect, useState } from 'react'

import type { Planned } from '../../../shared/api'
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

type State = 'recording' | 'transcribing' | 'asking' | 'doing' | 'done' | 'error'

/** How long what was done stays up to be read before the capsule goes. */
const READ_IT = 4_000

export function Voice(): React.JSX.Element {
  const [settings, change] = useSettings()
  const [state, setState] = useState<State>('recording')
  const [error, setError] = useState('')
  const [did, setDid] = useState('')
  const [plan, setPlan] = useState<readonly Planned[]>([])
  const [heard, setHeard] = useState('')
  const [last, setLast] = useState<Blob | undefined>()

  const send = useCallback(async (audio: Blob) => {
    setLast(audio)
    setState('transcribing')
    const answer = await window.geckit.voice.done({ audio: await base64(audio), fileName: 'dictation.webm' })
    // Said to the application: nothing has happened yet, this is what it would do.
    if (answer.ok && answer.plan !== undefined && answer.plan.length > 0) {
      setPlan(answer.plan)
      setHeard(answer.heard ?? '')
      setState('asking')
      return
    }
    if (answer.ok && answer.text !== undefined && answer.text.trim() !== '') {
      // Dictation is gone by now, pasted back where the person was.
      setDid(answer.text)
      setState('done')
      return
    }
    setState('error')
    setError(answer.error ?? 'Nothing was heard')
  }, [])

  const carryOut = useCallback(async () => {
    setState('doing')
    const answer = await window.geckit.voice.do()
    if (answer.ok && answer.text !== undefined) {
      setDid(answer.text)
      setState('done')
      return
    }
    setState('error')
    setError(answer.error ?? 'None of that could be done')
  }, [])

  useEffect(() => {
    if (state !== 'done') return
    const soon = setTimeout(() => window.geckit.voice.cancel(), READ_IT)
    return () => clearTimeout(soon)
  }, [state])

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
      // Enter stops the recording, and then says yes to what was heard.
      if (event.key === 'Enter') {
        if (state === 'asking') void carryOut()
        else stop()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [stop, state, carryOut])

  // The capsule is a window of its own, so it has to be grown to hold the list.
  useEffect(() => {
    const height = document.querySelector('.capsule')?.getBoundingClientRect().height
    window.geckit.voice.size(height === undefined ? 92 : height + 28)
  }, [state, plan])

  const mics = settings.audioDevices

  return (
    <div className="capsule-window">
      <div className="capsule">
        {state === 'transcribing' ? (
          <>
            <Icon name="spinner" className="glyph spinning" />
            <span>Writing it down</span>
          </>
        ) : state === 'asking' ? (
          <div className="asking">
            <div className="asking-heard">
              <Icon name="mic" size={11} />
              <span>{heard}</span>
            </div>
            <div className="asking-plan">
              {plan.map((one) => (
                <div className="asking-one" key={one.head + (one.text ?? '')}>
                  <Icon name={one.icon} size={13} />
                  <div className="asking-said">
                    <div className="asking-head">{one.head}</div>
                    {one.text === undefined ? null : <div className="asking-text">{one.text}</div>}
                    {one.goal === undefined ? null : (
                      <div className="asking-goal">
                        <Icon name="goal" size={11} />
                        <span>
                          <b>Until</b> {/^[A-Z][a-z]/.test(one.goal) ? one.goal.charAt(0).toLowerCase() + one.goal.slice(1) : one.goal}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="asking-foot">
              <button type="button" className="quiet" onClick={() => window.geckit.voice.cancel()}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void carryOut()}>
                Do it
                <span className="keys">Enter</span>
              </button>
            </div>
          </div>
        ) : state === 'doing' ? (
          <>
            <Icon name="spinner" className="glyph spinning" />
            <span>Doing it</span>
          </>
        ) : state === 'done' ? (
          <>
            <Icon name="check" className="glyph" />
            <span className="said" title={did}>
              {did.split('\n').join(' - ')}
            </span>
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
