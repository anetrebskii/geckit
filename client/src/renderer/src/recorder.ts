import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The microphone, for the two places that listen to it.
 *
 * It reports how loud each of five bands is while it is running, which is what
 * the bars are drawn from, and hands back what was recorded when it stops.
 */

export const BARS = 5

export interface Recorder {
  readonly recording: boolean
  /** Whole seconds since it started. */
  readonly elapsed: number
  /** One number per bar, 0 to 1. */
  readonly levels: readonly number[]
  readonly error: string
  start: () => void
  /** Stops and hands back what was recorded, or nothing where there was none. */
  stop: () => void
  cancel: () => void
}

export function useRecorder(
  deviceId: string,
  done: (audio: Blob, seconds: number) => void,
  /** Bits a second for the audio; a long recording asks for few, so it still fits what Whisper takes. */
  bits?: number,
): Recorder {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: BARS }, () => 0))
  const [error, setError] = useState('')

  const media = useRef<MediaRecorder | undefined>(undefined)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | undefined>(undefined)
  const context = useRef<AudioContext | undefined>(undefined)
  const frame = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const began = useRef(0)
  const keep = useRef(true)
  const said = useRef(done)
  useEffect(() => {
    said.current = done
  }, [done])

  const release = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined
    void context.current?.close()
    context.current = undefined
    if (timer.current !== undefined) clearInterval(timer.current)
    timer.current = undefined
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = undefined
    setLevels(Array.from({ length: BARS }, () => 0))
  }, [])

  const watch = useCallback((live: MediaStream) => {
    const audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 64
    audio.createMediaStreamSource(live).connect(analyser)
    context.current = audio
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = (): void => {
      analyser.getByteFrequencyData(data)
      const step = Math.max(1, Math.floor(analyser.frequencyBinCount / BARS))
      setLevels(
        Array.from({ length: BARS }, (_one, at) => (data[Math.min(at * step, data.length - 1)] ?? 0) / 255),
      )
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [])

  const start = useCallback(() => {
    if (media.current !== undefined) return
    setError('')
    const wanted: MediaStreamConstraints = {
      audio: deviceId === '' ? true : { deviceId: { exact: deviceId } },
    }
    void navigator.mediaDevices
      .getUserMedia(wanted)
      .catch((problem: unknown) => {
        // A microphone that was unplugged since it was chosen.
        if (deviceId !== '' && problem instanceof DOMException && problem.name === 'OverconstrainedError') {
          return navigator.mediaDevices.getUserMedia({ audio: true })
        }
        throw problem
      })
      .then((live) => {
        stream.current = live
        const recorder = new MediaRecorder(live, bits === undefined ? undefined : { audioBitsPerSecond: bits })
        media.current = recorder
        chunks.current = []
        keep.current = true
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.current.push(event.data)
        }
        recorder.onstop = () => {
          const seconds = Math.round((Date.now() - began.current) / 1000)
          const audio = new Blob(chunks.current, { type: 'audio/webm' })
          media.current = undefined
          release()
          setRecording(false)
          if (keep.current && audio.size > 0) said.current(audio, seconds)
        }
        recorder.start()
        watch(live)
        began.current = Date.now()
        setElapsed(0)
        setRecording(true)
        timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - began.current) / 1000)), 250)
      })
      .catch((problem: unknown) => {
        release()
        setRecording(false)
        setError(problem instanceof Error ? problem.message : String(problem))
      })
  }, [deviceId, bits, release, watch])

  const stop = useCallback(() => {
    keep.current = true
    if (media.current?.state !== 'inactive') media.current?.stop()
  }, [])

  const cancel = useCallback(() => {
    keep.current = false
    if (media.current?.state !== 'inactive') media.current?.stop()
    else {
      release()
      setRecording(false)
    }
  }, [release])

  useEffect(() => release, [release])

  return { recording, elapsed, levels, error, start, stop, cancel }
}

/** base64, which is how a recording crosses to the main process. */
export function base64(audio: Blob): Promise<string> {
  return new Promise((done, fail) => {
    const reader = new FileReader()
    reader.onloadend = () => done(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => fail(reader.error ?? new Error('The recording could not be read'))
    reader.readAsDataURL(audio)
  })
}

export function time(seconds: number): string {
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`
}
