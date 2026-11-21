import { useEffect, useRef, useState } from 'react'

import type { Settings } from '../../../shared/api'
import { dictate, dropUnheard, hearAgain, languageCode, readUnheard, useDictationLanguage, useLevel } from '../dictate'
import type { Dictate, Unheard } from '../dictate'
import { ON_PHONE } from '../on-phone'
import { BARS, time, toHear, useRecorder } from '../recorder'
import { downloading, useSpeechModel } from '../speech'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'

export type Dictation = ReturnType<typeof useDictation>

function micProblem(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : String(error)
}

/** Grows the field with what is in it, up to a limit, and back to one line when it is empty. */
export function fitField(area: HTMLTextAreaElement, text: string): void {
  area.style.height = ''
  if (text === '') return
  area.style.height = '0px'
  // Over the board the conversation is put away between openings, and a field
  // that is not on the screen measures nothing. Left to itself it stands one
  // line high, which is what it is measured to anyway.
  const wanted = area.scrollHeight
  area.style.height = wanted === 0 ? '' : `${String(Math.min(wanted, 260))}px`
}

/** Dictation into a message field: whisper on the computer, the phone's or the host's ears on the phone. */
export function useDictation({ settings, draft, setDraft, field, place, session, onHeard }: {
  readonly settings: Pick<Settings, 'microphoneDeviceId' | 'nativeLanguage' | 'secondLanguage'>
  readonly draft: string
  readonly setDraft: (text: string) => void
  readonly field: React.RefObject<HTMLTextAreaElement | null>
  /** Where a recording the host failed to write down is kept for. */
  readonly place: string
  /** A change of it drops what is being recorded. */
  readonly session: string | undefined
  readonly onHeard?: (text: string) => void
}) {
  const [listening, setListening] = useState<string | undefined>()
  const [opening, setOpening] = useState(false)
  const active = useRef<{ ears: Dictate; opening: boolean; stopping: boolean; abandoned: boolean }>(undefined)
  const [spoken, flipSpoken] = useDictationLanguage(settings.nativeLanguage, settings.secondLanguage)
  const [unheard, setUnheard] = useState<string | undefined>()
  // The host writes down what was said once the mic stops, which takes a few seconds.
  const [writing, setWriting] = useState(false)
  const level = useLevel(listening !== undefined)
  // A recording said here that the host failed to write down, kept on the phone to try again.
  const [kept, setKept] = useState<Unheard | undefined>()
  // Dictation on the computer: heard by whisper here, and put after what was typed.
  const [hearing, setHearing] = useState(false)
  const [micError, setMicError] = useState('')
  const model = useSpeechModel()
  const hear = async (audio: Blob): Promise<void> => {
    setHearing(true)
    try {
      const answer = await window.geckit.transcribe(await toHear(audio))
      const text = answer.text?.trim() ?? ''
      if (!answer.ok || text === '') {
        setMicError(answer.error ?? 'Nothing was heard')
        return
      }
      const typed = draft.trimEnd()
      const next = typed === '' ? text : `${typed} ${text}`
      setDraft(next)
      onHeard?.(next)
    } catch (error) {
      setMicError(error instanceof Error ? error.message : String(error))
    } finally {
      setHearing(false)
      field.current?.focus()
    }
  }
  const recorder = useRecorder(settings.microphoneDeviceId, (audio) => void hear(audio))
  const { cancel: dropRecording } = recorder
  // The microphone's own error, until it is closed.
  const [closedError, setClosedError] = useState('')
  const problem = micError !== '' ? micError : recorder.error !== closedError ? recorder.error : ''
  useEffect(() => () => dropRecording(), [dropRecording, session])
  const record = (): void => {
    if (recorder.recording) {
      recorder.stop()
      return
    }
    setMicError('')
    recorder.start()
    field.current?.focus()
  }
  const close = (): void => {
    if (recorder.recording) recorder.cancel()
    setMicError('')
    setClosedError(recorder.error)
    field.current?.focus()
  }

  // What is said goes after what was typed, and replaces itself as iOS hears it better.
  const lookKept = (): void => void readUnheard().then((one) => setKept(one?.place === place ? one : undefined))
  useEffect(lookKept, [place])
  const failed = (error: unknown): void => {
    setUnheard(micProblem(error))
    lookKept()
  }
  const listen = (goOn = false): void => {
    const current = active.current
    const finish = (capture: NonNullable<typeof current>): void => {
      if (active.current !== capture) return
      active.current = undefined
      setOpening(false)
      setListening(undefined)
      setWriting(false)
    }
    if (current !== undefined) {
      if (current.opening || current.stopping) return
      current.stopping = true
      setListening(undefined)
      setWriting(true)
      void current.ears.stop().then(() => {
        if (active.current !== current || current.ears.live) return
        setKept(undefined)
        finish(current)
      }, (error: unknown) => {
        if (active.current !== current) return
        failed(error)
        finish(current)
      })
      return
    }
    const ears = dictate()
    if (ears === undefined || writing) return
    const capture = { ears, opening: true, stopping: false, abandoned: false }
    active.current = capture
    const typed = draft.trimEnd()
    setUnheard(undefined)
    setOpening(true)
    tap('light')
    void ears.start(spoken, (text) => {
      if (active.current === capture && text !== '') setDraft(typed === '' ? text : `${typed} ${text}`)
    }, () => {
      if (ears.live) finish(capture)
    }, place, goOn).then(() => {
      capture.opening = false
      if (capture.abandoned) ears.cancel()
      if (active.current !== capture) return
      setOpening(false)
      setListening(ears.live ? `Listening in ${spoken}` : 'Recording')
    }, (error: unknown) => {
      if (active.current !== capture) return
      setUnheard(micProblem(error))
      finish(capture)
    })
  }
  useEffect(() => () => {
    const capture = active.current
    if (capture === undefined) return
    active.current = undefined
    capture.abandoned = true
    if (!capture.opening && !capture.stopping) capture.ears.cancel()
    setOpening(false)
    setListening(undefined)
    setWriting(false)
  }, [session])
  const tryAgain = (): void => {
    const typed = draft.trimEnd()
    setUnheard(undefined)
    setWriting(true)
    hearAgain()
      .then((text) => {
        setKept(undefined)
        if (text !== '') setDraft(typed === '' ? text : `${typed} ${text}`)
      })
      .catch(failed)
      .finally(() => setWriting(false))
  }
  const drop = (): void => {
    setKept(undefined)
    setUnheard(undefined)
    void dropUnheard()
  }
  /** Enter puts a recording in the field and Escape drops it; true when the key was that. */
  const keyDown = (event: React.KeyboardEvent): boolean => {
    if (!recorder.recording || (event.key !== 'Enter' && event.key !== 'Escape')) return false
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Enter') recorder.stop()
    else recorder.cancel()
    return true
  }
  const phoneStatus = opening ? 'Opening the microphone' : listening ?? (writing ? 'Writing down what you said' : unheard)
  /** What the field says while words are being heard, or the given words. */
  const placeholder = (idle: string): string =>
    ON_PHONE
      ? idle
      : recorder.recording
        ? 'Listening'
        : hearing
          ? 'Writing down what you said'
          : idle
  const capturing = listening !== undefined || opening || writing || recorder.recording || hearing
  return { recorder, hearing, problem, model, record, close, listening, spoken, flipSpoken, opening, writing, phoneStatus, unheard, level, kept, listen, tryAgain, drop, keyDown, placeholder, capturing }
}

export function PhoneDictationStatus({ dictation, className = 'phone-hint' }: { readonly dictation: Dictation; readonly className?: string }): React.JSX.Element | null {
  const { phoneStatus, unheard } = dictation
  if (!ON_PHONE || phoneStatus === undefined) return null
  return <div className={unheard === undefined ? className : `${className} trouble`} role={unheard === undefined ? 'status' : 'alert'}>{phoneStatus}</div>
}

/** On the computer, the recording under the field, or what went wrong with it. */
export function DictatingStrip({ dictation }: { readonly dictation: Dictation }): React.JSX.Element | null {
  const { recorder, hearing, problem, model } = dictation
  if (ON_PHONE || (!recorder.recording && !hearing && problem === '')) return null
  return (
    <div className={problem !== '' && !recorder.recording && !hearing ? 'dictating failed' : 'dictating'}>
      {recorder.recording ? (
        <>
          <span className="dictating-dot" />
          <span className="bars">
            {Array.from({ length: BARS }, (_one, index) => (
              <span key={index} style={{ height: 4 + (recorder.levels[index] ?? 0) * 14 }} />
            ))}
          </span>
          <span className="dictating-time">{time(recorder.elapsed)}</span>
          <span>Recording. Enter puts it in the field, Esc drops it</span>
        </>
      ) : hearing ? (
        <>
          <Icon name="spinner" size={12} className="spinning" />
          <span>{model?.state === 'downloading' ? `${downloading(model)}. It is written down once that is done` : 'Writing down what you said'}</span>
        </>
      ) : (
        <span>{problem}</span>
      )}
      <div className="spacer" />
      {hearing ? null : (
        <button
          type="button"
          className="icon-button"
          aria-label={recorder.recording ? 'Drop the recording' : 'Close'}
          title={recorder.recording ? 'Drop the recording (Esc)' : 'Close'}
          onClick={dictation.close}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}

/** On the phone, a recording the host failed to write down, with what can be done with it. */
export function KeptRecording({ dictation }: { readonly dictation: Dictation }): React.JSX.Element | null {
  const { kept, listening, writing } = dictation
  if (!ON_PHONE || kept === undefined || listening !== undefined || writing || dictation.opening) return null
  return (
    <Picker
      label="Not written down"
      title="What you said"
      explained
      note={kept.why}
      choices={[
        { value: 'again', label: 'Try again', says: 'The host writes down the same recording once more' },
        ...(dictate()?.live === false ? [{ value: 'on', label: 'Go on recording', says: 'What you say next is added to it, and both are written down together' }] : []),
        { value: 'drop', label: 'Drop the recording', says: 'What was said is lost', danger: true },
      ]}
      onPick={(value) => {
        if (value === 'again') dictation.tryAgain()
        else if (value === 'on') dictation.listen(true)
        else dictation.drop()
      }}
    />
  )
}

/** The buttons at the end of a message box: dictation, Send or Queue, and Stop while it works. */
export function SendControls({ dictation, typed, pictures = 0, working, cannot, checkingIp = false, hidden = false, micDisabled, queue, queues = false, onSend, onStop, stopTitle = 'Stop' }: {
  readonly dictation: Dictation
  /** Whether anything but spaces is typed. */
  readonly typed: boolean
  readonly pictures?: number
  readonly working: boolean
  /** Nothing can be sent now, whatever is typed. */
  readonly cannot: boolean
  readonly checkingIp?: boolean
  /** Something else stands in their place, such as a host being reached. */
  readonly hidden?: boolean
  readonly micDisabled: boolean
  /** The title of the button that queues what is typed while it works; without it, what is typed is sent. */
  readonly queue?: string
  /** Whether Send queues the message rather than sends it. */
  readonly queues?: boolean
  readonly onSend: () => void
  /** Without it there is no Stop. */
  readonly onStop?: (() => void) | undefined
  readonly stopTitle?: string
}): React.JSX.Element {
  const { recorder, hearing, listening, opening, writing, spoken, level } = dictation
  const ears = ON_PHONE ? dictate() : undefined
  const micBusy = opening || listening !== undefined || writing
  const beside = !micBusy && (typed || pictures > 0 || working)
  const label = queues ? 'Queue' : 'Send'
  return (
    <>
      {ON_PHONE || hidden ? null : (
        <button
          type="button"
          className={recorder.recording ? 'icon-button dictate-mic on' : 'icon-button dictate-mic'}
          disabled={micDisabled || hearing}
          onClick={dictation.record}
          title={recorder.recording ? 'Put it in the field (Enter)' : 'Dictate'}
          aria-label={recorder.recording ? 'Stop dictating' : 'Dictate'}
        >
          <Icon name={recorder.recording ? 'check' : 'mic'} size={15} />
        </button>
      )}
      {checkingIp || hidden ? null : working && !micBusy && (typed || pictures > 0) ? (
        <button
          type="button"
          className="send"
          disabled={cannot}
          onClick={onSend}
          title={queue === undefined ? (ON_PHONE ? 'Send' : 'Send (Enter)') : `${queue}${ON_PHONE ? '' : ' (Enter)'}`}
          aria-label={queue === undefined ? 'Send' : 'Queue'}
        >
          <Icon name="send" size={14} />
        </button>
      ) : null}
      {checkingIp || hidden ? null : ears?.live === true && !micBusy ? (
        <button type="button" className={beside ? 'spoken beside' : 'spoken'} onClick={dictation.flipSpoken} aria-label={`Dictating in ${spoken}. Switch language`}>
          {languageCode(spoken)}
        </button>
      ) : null}
      {!checkingIp && !hidden && ears !== undefined ? (
        <button
          type="button"
          className={listening !== undefined ? 'send listening' : beside ? 'send mic beside' : 'send'}
          style={{ '--level': level } as React.CSSProperties}
          disabled={opening || writing || (cannot && listening === undefined)}
          onClick={() => dictation.listen()}
          aria-label={listening !== undefined ? 'Stop dictating' : `Dictate in ${spoken}`}
        >
          <Icon name={opening || writing ? 'spinner' : listening !== undefined ? 'stop' : 'mic'} size={listening !== undefined ? 12 : 16} className={opening || writing ? 'spinning' : ''} />
        </button>
      ) : null}
      {checkingIp ? (
        <button type="button" className="quiet sending" onClick={onStop} title="Cancel sending" aria-label="Cancel sending">
          <Icon name="spinner" className="spinning" size={14} />
          <span>Sending...</span>
          <Icon name="close" size={12} />
        </button>
      ) : hidden || (ears !== undefined && !beside) ? null : working && ON_PHONE && (typed || pictures > 0) ? null : working ? (onStop === undefined ? null : (
        <button type="button" className="send stop" onClick={onStop} title={stopTitle} aria-label="Stop">
          <Icon name="stop" size={12} />
        </button>
      )) : (
        <button
          type="button"
          className="send"
          disabled={cannot || (!typed && pictures === 0)}
          onClick={onSend}
          title={ON_PHONE ? label : `${label} (Enter)`}
          aria-label={label}
        >
          <Icon name="send" size={14} />
        </button>
      )}
    </>
  )
}
