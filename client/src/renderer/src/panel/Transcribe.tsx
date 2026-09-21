import { useCallback, useRef, useState } from 'react'

import type { Settings, Transcription } from '../../../shared/api'
import { base64, BARS, time, useRecorder } from '../recorder'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'

/**
 * Speech to text: the microphone, or an audio file dropped on the list.
 *
 * Everything it has heard stays in the list until it is taken out, because the
 * reason to keep a transcription at all is to paste it somewhere later.
 */

const AUDIO = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac', '.aac']

const when = (at: number): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: new Date(at).toDateString() === new Date().toDateString() ? undefined : 'medium',
    timeStyle: 'short',
  }).format(at)

export function Transcribe({
  settings,
  change,
}: {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
}): React.JSX.Element {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState<string | undefined>()
  const file = useRef<HTMLInputElement>(null)
  const depth = useRef(0)

  const keep = useCallback(
    (text: string, source: string, seconds?: number) => {
      const said: Transcription = {
        id: crypto.randomUUID(),
        text,
        source,
        at: Date.now(),
        ...(seconds === undefined ? {} : { seconds }),
      }
      change({ transcriptions: [said, ...settings.transcriptions] })
    },
    [change, settings.transcriptions],
  )

  const send = useCallback(
    async (audio: Blob, fileName: string, source: string, seconds?: number) => {
      setWorking(true)
      setError('')
      const answer = await window.geckit.transcribe({ audio: await base64(audio), fileName })
      setWorking(false)
      if (!answer.ok || answer.text === undefined || answer.text.trim() === '') {
        setError(answer.error ?? 'Nothing was heard')
        return
      }
      keep(answer.text.trim(), source, seconds)
    },
    [keep],
  )

  const recorder = useRecorder(settings.microphoneDeviceId, (audio, seconds) => {
    void send(audio, 'recording.webm', 'Mic recording', seconds)
  })

  const take = useCallback(
    (files: readonly File[]) => {
      for (const one of files) {
        const extension = `.${one.name.split('.').pop()?.toLowerCase() ?? ''}`
        if (!AUDIO.includes(extension)) {
          setError(`${one.name} is not an audio file`)
          continue
        }
        void send(one, one.name, one.name)
      }
    },
    [send],
  )

  const mics = [
    { value: '', label: 'Default microphone' },
    ...settings.audioDevices.map((one) => ({
      value: one.deviceId,
      label: one.label === '' ? `Microphone ${one.deviceId.slice(0, 6)}` : one.label,
    })),
  ]
  const micName = mics.find((one) => one.value === settings.microphoneDeviceId)?.label ?? 'Default microphone'

  return (
    <div className="transcribe">
      <div className="transcribe-head">
        {recorder.recording ? (
          <button type="button" className="record on" onClick={recorder.stop}>
            <Icon name="stop" size={11} />
            Stop
            <span className="bars">
              {Array.from({ length: BARS }, (_one, at) => (
                <span key={at} style={{ height: 4 + (recorder.levels[at] ?? 0) * 14 }} />
              ))}
            </span>
            <span className="time">{time(recorder.elapsed)}</span>
          </button>
        ) : (
          <button type="button" className="record" onClick={recorder.start} disabled={working}>
            <span className="dot" />
            Record
          </button>
        )}
        <Picker
          label={<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{micName}</span>}
          choices={mics}
          chosen={settings.microphoneDeviceId}
          title="Microphone"
          onPick={(value) => change({ microphoneDeviceId: value })}
        />
        <div className="spacer" />
        <button type="button" className="icon-button" title="Open an audio file" onClick={() => file.current?.click()}>
          <Icon name="file" />
        </button>
        <input
          ref={file}
          type="file"
          accept={AUDIO.join(',')}
          multiple
          hidden
          onChange={(event) => {
            take([...(event.target.files ?? [])])
            event.target.value = ''
          }}
        />
      </div>

      {working ? <div className="working" /> : null}
      {error === '' ? null : <div className="error" style={{ padding: '4px 12px' }}>{error}</div>}
      {recorder.error === '' ? null : (
        <div className="error" style={{ padding: '4px 12px' }}>
          {recorder.error}
        </div>
      )}

      <div
        className={`drop${over ? ' over' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          depth.current += 1
          setOver(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          depth.current -= 1
          if (depth.current <= 0) setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          depth.current = 0
          setOver(false)
          take([...event.dataTransfer.files])
        }}
      >
        {settings.transcriptions.length === 0 ? (
          <div className="empty">
            Nothing yet. Record, drop an audio file here, or press {window.geckit.platform === 'darwin' ? 'Cmd' : 'Ctrl'}
            +Alt+V anywhere to dictate straight into whatever you are typing in.
          </div>
        ) : (
          settings.transcriptions.map((said) => (
            <div key={said.id} className="said">
              <div className="said-head">
                <span>{said.source}</span>
                <span>{when(said.at)}</span>
                {said.seconds === undefined ? null : <span>{time(said.seconds)}</span>}
                <div className="spacer" />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copy"
                  title="Copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(said.text)
                    setCopied(said.id)
                    setTimeout(() => setCopied(undefined), 1400)
                  }}
                >
                  <Icon name={copied === said.id ? 'check' : 'copy'} size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Delete"
                  title="Delete"
                  onClick={() =>
                    change({ transcriptions: settings.transcriptions.filter((one) => one.id !== said.id) })
                  }
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
              <div className="said-text">{said.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
