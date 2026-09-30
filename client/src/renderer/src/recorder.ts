import { useCallback, useEffect, useRef, useState } from 'react'

import type { TranscribeRequest } from '../../shared/api'

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

const RATE = 16_000

/** Any recording or audio file the page can play, as a WAV at 16 kHz mono in 16 bits, which is what whisper-cli reads. */
async function wav(audio: Blob): Promise<Blob> {
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(await audio.arrayBuffer())
  } finally {
    void context.close()
  }
  // Rendered again at 16 kHz into one channel, which mixes the others down.
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const samples = (await offline.startRendering()).getChannelData(0)

  const out = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, said: string): void => {
    for (let one = 0; one < said.length; one += 1) out.setUint8(at + one, said.charCodeAt(one))
  }
  text(0, 'RIFF')
  out.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 1, true)
  out.setUint32(24, RATE, true)
  out.setUint32(28, RATE * 2, true)
  out.setUint16(32, 2, true)
  out.setUint16(34, 16, true)
  text(36, 'data')
  out.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, at) => out.setInt16(44 + at * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true))
  return new Blob([out.buffer], { type: 'audio/wav' })
}

/** What goes to main to be written down, decoded here because whisper-cli reads only WAV. */
export async function toHear(audio: Blob): Promise<TranscribeRequest> {
  return { audio: await base64(await wav(audio)) }
}

export function time(seconds: number): string {
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`
}
