import { useEffect, useRef, useState } from 'react'

import type { Recording } from '../../../shared/api'
import { MOST_FRAMES } from '../../../shared/recording'
import { phoneCalls } from '../phone-calls'
import { picking } from '../picked'
import type { PickedVideo } from '../picked'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { tooOld } from './PhoneKit'

/**
 * A video from Photos, a screen recording above all, read into what a New task
 * form takes: iOS hears its words and takes its frames on the phone, and the
 * video goes to the Mac so Claude can look at more of it. See docs/ux/phone-parity.md.
 */

// Past this a phone network takes minutes over it, and the frames and words go without it.
const MOST_BYTES = 200 * 1024 * 1024
// Small enough that the link goes on answering cards between the pieces.
const PIECE = 512 * 1024
// A short upload needs no number.
const COUNT_AFTER = 5000

type Done = 'waiting' | 'going' | 'done' | 'skipped'

const base64 = (blob: Blob): Promise<string> =>
  new Promise((done, failed) => {
    const reader = new FileReader()
    reader.onload = () => done(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => failed(reader.error ?? new Error('The video could not be read'))
    reader.readAsDataURL(blob)
  })

export function PhoneRecord({ language, onClose }: { readonly language: string; readonly onClose: () => void }): React.JSX.Element | null {
  const [video, setVideo] = useState<PickedVideo | undefined>()
  const [steps, setSteps] = useState<{ words: Done; frames: Done; video: Done }>({ words: 'waiting', frames: 'waiting', video: 'waiting' })
  const [share, setShare] = useState<number | undefined>()
  const [trouble, setTrouble] = useState<string | undefined>(() =>
    picking() === undefined || phoneCalls() === undefined ? 'Recordings are read in the GeckIt app on the iPhone.' : undefined,
  )
  const gone = useRef(false)

  useEffect(() => {
    const phone = picking()
    const calls = phoneCalls()
    if (phone === undefined || calls === undefined) return
    let picked: PickedVideo | undefined
    const run = async (): Promise<void> => {
      picked = await phone.pick()
      if (gone.current) return
      if (picked === undefined) {
        onClose()
        return
      }
      const one = picked
      setVideo(one)
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
      tap('done')
      calls.recorded(recording)
      onClose()
    }
    run().catch((error: unknown) => {
      if (picked !== undefined) phone.drop(picked)
      calls.dropVideo()
      setTrouble(tooOld(error))
    })
    return () => {
      gone.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = (): void => {
    gone.current = true
    phoneCalls()?.dropVideo()
    if (video !== undefined) picking()?.drop(video)
    onClose()
  }

  // iOS's own picker is up until a video is chosen; the sheet comes once there is something to read.
  if (video === undefined && trouble === undefined) return null

  const line = (done: Done, words: string, extra?: string): React.JSX.Element => (
    <div className={`sheet-option phone-record-step ${done}`}>
      <span className="label">{words}</span>
      {extra === undefined ? null : <span className="phone-cell-value">{extra}</span>}
      {done === 'going' ? <Icon name="spinner" size={18} /> : done === 'done' ? <Icon name="check" size={18} /> : done === 'skipped' ? <Icon name="minus" size={18} /> : null}
    </div>
  )

  return (
    <Sheet title="Reading the recording" onClose={cancel}>
      {trouble === undefined ? (
        <div className="sheet-list">
          {line(steps.words, 'Listening to it')}
          {line(steps.frames, 'Taking frames')}
          {line(steps.video, 'Sending the video to the Mac', steps.video === 'going' && share !== undefined ? `${String(Math.round(share * 100))}%` : undefined)}
        </div>
      ) : (
        <div className="sheet-note">{trouble}</div>
      )}
    </Sheet>
  )
}
