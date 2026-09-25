import { useCallback, useEffect, useRef, useState } from 'react'

import type { Planned, RecordedFrame, Recording } from '../../../shared/api'
import { clock, HELD_FRAMES, LONGEST, MOST_FRAMES, thinFrames, WARN } from '../../../shared/recording'
import { base64, BARS, useRecorder } from '../recorder'
import { useSettings } from '../settings'
import { Icon } from '../ui/Icon'

/**
 * The capsule while the screen is recorded and talked over.
 *
 * Claude Code cannot watch a video, so what it is handed is what was said and
 * a few stills: one whenever the picture changes a lot, one each time a thing
 * said comes to an end, and the last. The video itself is kept on disk for
 * Claude to take more from. What was heard is shown with the stills before
 * anything is sent, to be corrected, and any still can be left out.
 */

type State =
  | 'starting'
  | 'recording'
  | 'writing'
  | 'choosing'
  | 'planning'
  | 'planned'
  | 'doing'
  | 'started'
  | 'denied'
  | 'failed'

/** What "Try again" does after a failure: write the words down again, or go back to change them. */
type Retry = 'write' | 'choose' | 'none'

/** How long what was done stays up to be read before the capsule goes. */
const READ_IT = 4_000

/** The picture is compared at this size, which is enough to see a dialog open and too coarse to see a cursor blink. */
const SMALL_W = 64
const SMALL_H = 40

/** A tenth of the screen changed makes a frame. */
const CHANGED = 0.1

/** Claude reads a picture at most this long on its long edge, so a larger one only costs more. */
const LONG_EDGE = 1568

/** Loud enough to be talking, and quiet for long enough to have finished a thing. */
const SPEAKING = 0.3
const PAUSE = 700

interface Capture {
  readonly stream: MediaStream
  readonly view: HTMLVideoElement
  readonly recorder: MediaRecorder
  readonly chunks: Blob[]
  readonly began: number
  frames: RecordedFrame[]
  last?: Uint8ClampedArray | undefined
  watching?: ReturnType<typeof setInterval>
}

async function openScreen(id: string): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 2560, maxHeight: 1600, maxFrameRate: 15 },
    } as MediaTrackConstraints,
  })
  const view = document.createElement('video')
  view.muted = true
  view.srcObject = stream
  await view.play()
  const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_000_000 })
  const capture: Capture = { stream, view, recorder, chunks: [], began: Date.now(), frames: [] }
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) capture.chunks.push(event.data)
  }
  recorder.start(1000)
  capture.watching = setInterval(() => {
    const now = small(view)
    if (now !== undefined && (capture.last === undefined || changed(capture.last, now) > CHANGED)) take(capture)
  }, 500)
  return capture
}

function small(view: HTMLVideoElement): Uint8ClampedArray | undefined {
  if (view.videoWidth === 0) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = SMALL_W
  canvas.height = SMALL_H
  const drawn = canvas.getContext('2d', { willReadFrequently: true })
  drawn?.drawImage(view, 0, 0, SMALL_W, SMALL_H)
  return drawn?.getImageData(0, 0, SMALL_W, SMALL_H).data
}

function changed(was: Uint8ClampedArray, now: Uint8ClampedArray): number {
  let moved = 0
  for (let at = 0; at < now.length; at += 4) {
    const apart =
      Math.abs((now[at] ?? 0) - (was[at] ?? 0)) +
      Math.abs((now[at + 1] ?? 0) - (was[at + 1] ?? 0)) +
      Math.abs((now[at + 2] ?? 0) - (was[at + 2] ?? 0))
    if (apart > 48) moved++
  }
  return moved / (now.length / 4)
}

function take(capture: Capture): void {
  const { view } = capture
  if (view.videoWidth === 0) return
  const scale = Math.min(1, LONG_EDGE / Math.max(view.videoWidth, view.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(view.videoWidth * scale)
  canvas.height = Math.round(view.videoHeight * scale)
  canvas.getContext('2d')?.drawImage(view, 0, 0, canvas.width, canvas.height)
  const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? ''
  const at = Math.round((Date.now() - capture.began) / 1000)
  capture.frames.push({ at, image: { media: 'image/jpeg', data } })
  capture.last = small(view)
  if (capture.frames.length > HELD_FRAMES) capture.frames = thinFrames(capture.frames, HELD_FRAMES)
}

function closeScreen(capture: Capture): void {
  if (capture.watching !== undefined) clearInterval(capture.watching)
  capture.stream.getTracks().forEach((one) => one.stop())
}

/** The last frame taken, the video ended and kept, and the frames cut down to what is sent. */
async function endScreen(capture: Capture): Promise<{ frames: RecordedFrame[]; video?: string }> {
  take(capture)
  const ended = new Promise<void>((done) => {
    capture.recorder.onstop = () => done()
  })
  if (capture.recorder.state !== 'inactive') capture.recorder.stop()
  await ended
  closeScreen(capture)
  const frames = thinFrames(capture.frames, MOST_FRAMES)
  try {
    const bytes = new Uint8Array(await new Blob(capture.chunks, { type: 'video/webm' }).arrayBuffer())
    return { frames, video: await window.geckit.voice.keep(bytes) }
  } catch {
    // The frames and the words are what matter; the video is only a way to more of them.
    return { frames }
  }
}

const lowered = (goal: string): string =>
  /^[A-Z][a-z]/.test(goal) ? goal.charAt(0).toLowerCase() + goal.slice(1) : goal

export function Record(): React.JSX.Element {
  const [settings, change] = useSettings()
  const [state, setState] = useState<State>('starting')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState<Retry>('none')
  const [text, setText] = useState('')
  const [frames, setFrames] = useState<readonly RecordedFrame[]>([])
  const [plan, setPlan] = useState<readonly Planned[]>([])
  const [did, setDid] = useState('')

  const capture = useRef<Capture | undefined>(undefined)
  const screenDone = useRef<Promise<{ frames: RecordedFrame[]; video?: string }> | undefined>(undefined)
  const heard = useRef<Blob | undefined>(undefined)
  const seconds = useRef(0)
  const video = useRef<string | undefined>(undefined)
  const speaking = useRef<number | undefined>(undefined)
  const field = useRef<HTMLTextAreaElement>(null)

  const fail = useCallback((said: string, again: Retry) => {
    setError(said)
    setRetry(again)
    setState('failed')
  }, [])

  const write = useCallback(
    async (audio: Blob) => {
      heard.current = audio
      setState('writing')
      const [said, screen] = await Promise.all([
        window.geckit.transcribe({ audio: await base64(audio), fileName: 'recording.webm' }),
        screenDone.current ?? Promise.resolve<{ frames: RecordedFrame[]; video?: string }>({ frames: [] }),
      ])
      setFrames(screen.frames)
      video.current = screen.video
      if (!said.ok) {
        const missing = said.error?.startsWith('Transcription needs') === true
        fail(
          missing ? 'Recording needs an OpenRouter key in Settings, to write down what was said.' : (said.error ?? 'Nothing was heard'),
          missing ? 'none' : 'write',
        )
        return
      }
      setText(said.text?.trim() ?? '')
      setState('choosing')
    },
    [fail],
  )

  const recorder = useRecorder(settings.microphoneDeviceId, (audio, took) => {
    seconds.current = took
    void write(audio)
  })
  const { start, stop, cancel, elapsed, levels } = recorder
  // Held rather than depended on: choosing another microphone must not open the screen a second time.
  const starting = useRef(start)
  useEffect(() => {
    starting.current = start
  }, [start])

  // The screen first, then the microphone, so the time counts from when both are running.
  useEffect(() => {
    let gone = false
    let made: Capture | undefined
    void (async () => {
      const source = await window.geckit.voice.screen()
      if (gone) return
      if ('denied' in source) {
        setState('denied')
        return
      }
      if ('error' in source) {
        fail(source.error, 'none')
        return
      }
      made = await openScreen(source.id)
      if (gone) {
        closeScreen(made)
        return
      }
      capture.current = made
      starting.current()
      setState('recording')
    })().catch((problem: unknown) => {
      if (!gone) fail(problem instanceof Error ? problem.message : String(problem), 'none')
    })
    return () => {
      gone = true
      if (made !== undefined) closeScreen(made)
    }
  }, [fail])

  const finish = useCallback(() => {
    const held = capture.current
    if (held === undefined) return
    capture.current = undefined
    setState('writing')
    screenDone.current = endScreen(held)
    stop()
  }, [stop])

  const throwAway = useCallback(() => {
    if (capture.current !== undefined) closeScreen(capture.current)
    capture.current = undefined
    cancel()
    window.geckit.voice.cancel()
  }, [cancel])

  useEffect(() => {
    if (state === 'recording' && elapsed >= LONGEST) finish()
  }, [state, elapsed, finish])

  // The end of each thing said is a moment worth a frame: it is usually when the thing being talked about is on the screen.
  useEffect(() => {
    const held = capture.current
    if (held === undefined) return
    const loud = Math.max(...levels)
    const now = Date.now()
    if (loud > SPEAKING) speaking.current = now
    else if (speaking.current !== undefined && now - speaking.current > PAUSE) {
      speaking.current = undefined
      take(held)
    }
  }, [levels])

  useEffect(() => window.geckit.voice.onStop(() => (state === 'recording' ? finish() : undefined)), [state, finish])

  const recording = useCallback(
    (): Recording => ({
      text: text.trim(),
      frames,
      seconds: seconds.current,
      ...(video.current === undefined ? {} : { video: video.current }),
    }),
    [text, frames],
  )

  const ask = useCallback(async () => {
    if (text.trim() === '') return
    setState('doing')
    const answer = await window.geckit.voice.ask(recording())
    if (!answer.ok) fail(answer.error ?? 'The question could not be asked', 'choose')
  }, [text, recording, fail])

  const task = useCallback(async () => {
    if (text.trim() === '') return
    setState('planning')
    const answer = await window.geckit.voice.task(recording())
    if (answer.ok && answer.plan !== undefined && answer.plan.length > 0) {
      setPlan(answer.plan)
      setState('planned')
      return
    }
    fail(answer.error ?? 'No project fits what was said. Name the project and try again.', 'choose')
  }, [text, recording, fail])

  const carryOut = useCallback(async () => {
    setState('doing')
    const answer = await window.geckit.voice.do()
    if (answer.ok && answer.text !== undefined) {
      setDid(answer.text)
      setState('started')
      return
    }
    fail(answer.error ?? 'The task could not be started', 'choose')
  }, [fail])

  const again = useCallback(() => {
    if (retry === 'write' && heard.current !== undefined) void write(heard.current)
    else setState('choosing')
  }, [retry, write])

  useEffect(() => {
    if (state !== 'started') return
    const soon = setTimeout(() => window.geckit.voice.cancel(), READ_IT)
    return () => clearTimeout(soon)
  }, [state])

  useEffect(() => {
    if (state !== 'choosing') return
    const box = field.current
    if (box === null) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
  }, [state])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (state === 'planned') setState('choosing')
        else if (state === 'recording' || state === 'starting') throwAway()
        else if (state === 'choosing' || state === 'failed' || state === 'denied') window.geckit.voice.cancel()
        return
      }
      if (event.key !== 'Enter' || event.shiftKey) return
      if (state === 'recording') {
        event.preventDefault()
        finish()
      } else if (state === 'choosing') {
        event.preventDefault()
        void (event.metaKey || event.ctrlKey ? ask() : task())
      } else if (state === 'planned') {
        event.preventDefault()
        void carryOut()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [state, finish, throwAway, ask, task, carryOut])

  // The capsule is a window of its own, so it is grown to hold the card.
  useEffect(() => {
    const height = document.querySelector('.capsule')?.getBoundingClientRect().height
    window.geckit.voice.size(height === undefined ? 92 : height + 28, 460)
  }, [state, frames, plan, text])

  // A microphone that would not start ends the recording where it stands.
  const deaf = recorder.error !== '' && (state === 'starting' || state === 'recording')
  const shown: State = deaf ? 'failed' : state
  const trouble = deaf ? recorder.error : error
  const empty = text.trim() === ''
  const ending = elapsed >= WARN

  return (
    <div className="capsule-window">
      <div className="capsule">
        {shown === 'writing' || shown === 'planning' || shown === 'doing' ? (
          <>
            <Icon name="spinner" className="glyph spinning" />
            <span>{shown === 'writing' ? 'Writing it down' : shown === 'planning' ? 'Finding the project' : 'Doing it'}</span>
          </>
        ) : shown === 'choosing' ? (
          <div className="asking recorded">
            <label className="asking-heard">
              <Icon name="mic" size={11} />
              <textarea
                ref={field}
                rows={3}
                value={text}
                aria-label="What was heard"
                placeholder="Nothing was heard. Say it here in writing."
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            {frames.length === 0 ? null : (
              <div className="frames">
                {frames.map((one, index) => (
                  <div className="frame" key={`${String(one.at)}-${String(index)}`}>
                    <img src={`data:${one.image.media};base64,${one.image.data}`} alt="" />
                    <span className="at">{clock(one.at)}</span>
                    <button
                      type="button"
                      className="leave"
                      aria-label="Leave this frame out"
                      title="Leave this frame out"
                      onClick={() => setFrames((all) => all.filter((_one, at) => at !== index))}
                    >
                      <Icon name="close" size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="asking-foot">
              <button type="button" className="quiet" onClick={() => window.geckit.voice.cancel()}>
                Cancel
              </button>
              <button type="button" className="quiet" disabled={empty} onClick={() => void ask()}>
                Ask
                <span className="keys">Cmd+Enter</span>
              </button>
              <button type="button" className="primary" disabled={empty} onClick={() => void task()}>
                Make a task
                <span className="keys">Enter</span>
              </button>
            </div>
          </div>
        ) : shown === 'planned' ? (
          <div className="asking recorded">
            <div className="asking-heard">
              <Icon name="mic" size={11} />
              <span>{text}</span>
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
                          <b>Until</b> {lowered(one.goal)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="asking-foot">
              <button type="button" className="quiet" onClick={() => setState('choosing')}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void carryOut()}>
                Start it
                <span className="keys">Enter</span>
              </button>
            </div>
          </div>
        ) : shown === 'started' ? (
          <>
            <Icon name="check" className="glyph" />
            <span className="said" title={did}>
              {did.split('\n').join(' - ')}
            </span>
          </>
        ) : shown === 'denied' ? (
          <>
            <span className="capsule-note danger">The Mac has not allowed GeckIt to record the screen.</span>
            <button type="button" className="quiet" onClick={() => window.geckit.voice.allow()}>
              Open Settings
            </button>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => window.geckit.voice.cancel()}>
              <Icon name="close" />
            </button>
          </>
        ) : shown === 'failed' ? (
          <>
            <span className="capsule-note danger" title={trouble}>
              {trouble}
            </span>
            {deaf || retry === 'none' ? null : (
              <button type="button" className="icon-button" aria-label="Try again" title="Try again" onClick={again}>
                <Icon name="refresh" />
              </button>
            )}
            <button type="button" className="icon-button" aria-label="Close" onClick={() => window.geckit.voice.cancel()}>
              <Icon name="close" />
            </button>
          </>
        ) : (
          <>
            <span className="rec-dot" aria-hidden="true" />
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
                {settings.audioDevices.map((one) => (
                  <option key={one.deviceId} value={one.deviceId}>
                    {one.label === '' ? `Microphone ${one.deviceId.slice(0, 6)}` : one.label}
                  </option>
                ))}
              </select>
            </span>
            <span className="bars">
              {Array.from({ length: BARS }, (_one, at) => (
                <span key={at} style={{ height: 4 + (levels[at] ?? 0) * 16 }} />
              ))}
            </span>
            <span className={`time${ending ? ' ending' : ''}`}>
              {ending ? `${clock(LONGEST - elapsed)} left` : clock(elapsed)}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Stop"
              title="Stop (Enter)"
              style={{ color: 'var(--danger)' }}
              onClick={finish}
            >
              <Icon name="stop" size={13} />
            </button>
            <button type="button" className="icon-button" aria-label="Throw away" title="Throw away (Esc)" onClick={throwAway}>
              <Icon name="close" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
