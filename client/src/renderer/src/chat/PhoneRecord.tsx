import { useEffect, useRef, useState } from 'react'

import type { Recording } from '../../../shared/api'
import { clock, MOST_FRAMES } from '../../../shared/recording'
import { phoneCalls } from '../phone-calls'
import { picking } from '../picked'
import type { PickedVideo } from '../picked'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { tooOld } from './PhoneKit'

/**
 * A screen recording, read into what a New task form takes: the sheet says how
 * to start one from Control Center, and the one made after that is offered when
 * GeckIt is back; any video can be chosen from Photos instead. iOS hears its words
 * and takes its frames on the phone, and the video goes to the Mac so Claude can
 * look at more of it. See docs/ux/phone-parity.md.
 */

// Past this a phone network takes minutes over it, and the frames and words go without it.
const MOST_BYTES = 200 * 1024 * 1024
// Small enough that the link goes on answering cards between the pieces.
const PIECE = 512 * 1024
// A short upload needs no number.
const COUNT_AFTER = 5000

type Done = 'waiting' | 'going' | 'done' | 'skipped'
type Stage = 'waiting' | 'found' | 'reading'
type Found = PickedVideo & { readonly made: number; readonly thumb: string }

const base64 = (blob: Blob): Promise<string> =>
  new Promise((done, failed) => {
    const reader = new FileReader()
    reader.onload = () => done(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => failed(reader.error ?? new Error('The video could not be read'))
    reader.readAsDataURL(blob)
  })

export function PhoneRecord({ language, onClose }: { readonly language: string; readonly onClose: () => void }): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('waiting')
  const [found, setFound] = useState<Found | undefined>()
  const [steps, setSteps] = useState<{ words: Done; frames: Done; video: Done }>({ words: 'waiting', frames: 'waiting', video: 'waiting' })
  const [share, setShare] = useState<number | undefined>()
  const [trouble, setTrouble] = useState<string | undefined>(() =>
    picking() === undefined || phoneCalls() === undefined ? 'Recordings are read in the GeckIt app on the iPhone.' : undefined,
  )
  const [photos, setPhotos] = useState<string | undefined>()
  const gone = useRef(false)
  const now = useRef<Stage>('waiting')
  const held = useRef<PickedVideo | undefined>(undefined)
  const since = useRef(0)

  const to = (next: Stage): void => {
    now.current = next
    setStage(next)
  }

  // Once at the start, which asks for Photos before the person leaves, then each time GeckIt is back in front.
  useEffect(() => {
    const phone = picking()
    if (phone === undefined || phoneCalls() === undefined) return
    since.current = Date.now()
    let looking = false
    const look = (): void => {
      if (looking || document.visibilityState !== 'visible' || now.current !== 'waiting') return
      looking = true
      phone
        .latest(since.current)
        .then((one) => {
          if (one === undefined) return
          if (gone.current || now.current !== 'waiting') {
            phone.drop(one)
            return
          }
          held.current = one
          setFound(one)
          setPhotos(undefined)
          to('found')
          tap('firm')
        })
        .catch((error: unknown) => setPhotos(tooOld(error)))
        .finally(() => {
          looking = false
        })
    }
    look()
    document.addEventListener('visibilitychange', look)
    return () => {
      gone.current = true
      document.removeEventListener('visibilitychange', look)
    }
  }, [])

  const read = async (one: PickedVideo): Promise<void> => {
    const phone = picking()
    const calls = phoneCalls()
    if (phone === undefined || calls === undefined) return
    held.current = one
    to('reading')
    setSteps({ words: 'going', frames: 'going', video: one.bytes > MOST_BYTES ? 'skipped' : 'going' })
    const words = phone.words(one, language).then((text) => {
      setSteps((was) => ({ ...was, words: 'done' }))
      return text
    })
    const frames = phone.frames(one, MOST_FRAMES).then((taken) => {
      setSteps((was) => ({ ...was, frames: 'done' }))
      return taken
    })
    const sent =
      one.bytes > MOST_BYTES
        ? Promise.resolve(undefined)
        : (async (): Promise<string | undefined> => {
            const began = Date.now()
            const path = await calls.startVideo(one.ext)
            for (let at = 0; at < one.bytes; at += PIECE) {
              if (gone.current) return undefined
              const part = await phone.piece(one, at, Math.min(one.bytes, at + PIECE))
              // A reader that ignores the range hands the whole file back, which would be sent again with every piece.
              if (part.size > PIECE) throw new Error('The video could not be read in pieces')
              await calls.videoPart(await base64(part))
              if (Date.now() - began > COUNT_AFTER) setShare(Math.min(1, (at + PIECE) / one.bytes))
            }
            setSteps((was) => ({ ...was, video: 'done' }))
            return path
          })().catch(() => {
            calls.dropVideo()
            setSteps((was) => ({ ...was, video: 'skipped' }))
            return undefined
          })
    const [text, taken, path] = await Promise.all([words, frames, sent])
    if (gone.current) return
    const recording: Recording = {
      text: text.trim(),
      seconds: one.seconds,
      frames: taken.map((frame) => ({ at: frame.at, image: { media: 'image/jpeg', data: frame.data } })),
      ...(path === undefined ? {} : { video: path }),
    }
    if (path !== undefined) calls.keepVideo()
    phone.drop(one)
    held.current = undefined
    tap('done')
    calls.recorded(recording)
    onClose()
  }

  const reading = (one: PickedVideo): void => {
    read(one).catch((error: unknown) => {
      picking()?.drop(one)
      held.current = undefined
      phoneCalls()?.dropVideo()
      setTrouble(tooOld(error))
    })
  }

  const choose = async (): Promise<void> => {
    const phone = picking()
    if (phone === undefined) return
    // Not looked for while iOS's picker is up.
    now.current = 'reading'
    const one = await phone.pick().catch((error: unknown) => {
      setTrouble(tooOld(error))
      return undefined
    })
    if (gone.current) {
      if (one !== undefined) phone.drop(one)
      return
    }
    if (one === undefined) {
      now.current = 'waiting'
      return
    }
    reading(one)
  }

  const skip = (): void => {
    if (found === undefined) return
    picking()?.drop(found)
    held.current = undefined
    since.current = found.made
    setFound(undefined)
    to('waiting')
  }

  const cancel = (): void => {
    gone.current = true
    phoneCalls()?.dropVideo()
    if (held.current !== undefined) picking()?.drop(held.current)
    onClose()
  }

  const line = (done: Done, words: string, extra?: string): React.JSX.Element => (
    <div className={`sheet-option phone-record-step ${done}`}>
      <span className="label">{words}</span>
      {extra === undefined ? null : <span className="phone-cell-value">{extra}</span>}
      {done === 'going' ? <Icon name="spinner" size={18} /> : done === 'done' ? <Icon name="check" size={18} /> : done === 'skipped' ? <Icon name="minus" size={18} /> : null}
    </div>
  )

  if (trouble !== undefined)
    return (
      <Sheet title="Record the screen" onClose={cancel}>
        <div className="sheet-note">{trouble}</div>
      </Sheet>
    )

  if (stage === 'found' && found !== undefined)
    return (
      <Sheet title="Use this recording?" onClose={cancel} cancel={false}>
        {found.thumb === '' ? null : <img className="phone-record-thumb" src={`data:image/jpeg;base64,${found.thumb}`} alt="" />}
        <div className="sheet-note phone-record-length">Screen recording, {clock(found.seconds)}</div>
        <div className="phone-say-actions">
          <button type="button" className="phone-button grey" onClick={skip}>
            Not this one
          </button>
          <button type="button" className="phone-button fill" onClick={() => reading(found)}>
            Use it
          </button>
        </div>
      </Sheet>
    )

  if (stage === 'reading')
    return (
      <Sheet title="Reading the recording" onClose={cancel}>
        <div className="sheet-list">
          {line(steps.words, 'Listening to it')}
          {line(steps.frames, 'Taking frames')}
          {line(steps.video, 'Sending the video to the host', steps.video === 'going' && share !== undefined ? `${String(Math.round(share * 100))}%` : undefined)}
        </div>
      </Sheet>
    )

  return (
    <Sheet title="Record the screen" onClose={cancel}>
      <div className="sheet-list">
        <div className="sheet-option phone-record-how">
          <span className="phone-record-num">1</span>
          <span className="label">Swipe down from the top right corner</span>
        </div>
        <div className="sheet-option phone-record-how">
          <span className="phone-record-num">2</span>
          <span className="label">Hold Screen Recording, turn the Microphone on, tap Start Recording</span>
        </div>
        <div className="sheet-option phone-record-how">
          <span className="phone-record-num">3</span>
          <span className="label">Show it and talk, then tap the red pill to stop</span>
        </div>
        <div className="sheet-option phone-record-how">
          <span className="phone-record-num">4</span>
          <span className="label">Come back to GeckIt, and the recording is offered here</span>
        </div>
      </div>
      <div className="sheet-note">{photos ?? 'No Screen Recording in Control Center? Hold an empty spot there to add it.'}</div>
      <div className="phone-say-actions">
        <button type="button" className="phone-button grey" onClick={() => void choose()}>
          Choose a video instead
        </button>
      </div>
    </Sheet>
  )
}
