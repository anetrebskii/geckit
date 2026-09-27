import { useEffect, useRef, useState } from 'react'

import type { Planned } from '../../../shared/api'
import { dictate } from '../dictate'
import { phoneCalls } from '../phone-calls'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { tooOld } from './PhoneKit'
import type { Chat } from './useChat'

/**
 * Say it: what is said to GeckIt rather than typed into a conversation, heard
 * by iOS, read into orders on the Mac, shown, and carried out only on Do it.
 * See docs/ux/phone-parity.md.
 */

type Step =
  | { readonly kind: 'listening' }
  | { readonly kind: 'refused'; readonly why: string }
  | { readonly kind: 'reading' }
  | { readonly kind: 'plan'; readonly lines: readonly Planned[] }
  | { readonly kind: 'nothing'; readonly why: string }
  | { readonly kind: 'doing' }
  | { readonly kind: 'done'; readonly lines: readonly string[]; readonly open?: string }

export function PhoneSay({ chat, onClose }: { readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'listening' })
  const [words, setWords] = useState('')
  const [hearing, setHearing] = useState(false)
  const [empty, setEmpty] = useState(false)
  const said = useRef('')

  const listen = (): void => {
    const ear = dictate()
    setStep({ kind: 'listening' })
    setEmpty(false)
    if (ear === undefined) {
      setStep({ kind: 'refused', why: 'Dictation is not available here.' })
      return
    }
    setHearing(true)
    ear
      .start(
        chat.settings.nativeLanguage,
        (text) => {
          said.current = text
          setWords(text)
        },
        () => setHearing(false),
      )
      .catch((error: unknown) => {
        setHearing(false)
        setStep({ kind: 'refused', why: error instanceof Error ? error.message : String(error) })
      })
  }
  useEffect(() => {
    void Promise.resolve().then(listen)
    return () => dictate()?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const read = (): void => {
    const text = said.current.trim()
    if (text === '') {
      setEmpty(true)
      return
    }
    dictate()?.stop()
    setHearing(false)
    const calls = phoneCalls()
    if (calls === undefined) return
    setStep({ kind: 'reading' })
    calls
      .readOrders(text)
      .then((answer) => {
        if (answer.ok && answer.plan !== undefined) {
          tap('light')
          setStep({ kind: 'plan', lines: answer.plan })
        } else setStep({ kind: 'nothing', why: answer.error ?? 'Nothing to do in that.' })
      })
      .catch((error: unknown) => setStep({ kind: 'nothing', why: tooOld(error) }))
  }

  const go = (): void => {
    const calls = phoneCalls()
    if (calls === undefined) return
    setStep({ kind: 'doing' })
    calls
      .doOrders()
      .then((answer) => {
        if (!answer.ok) {
          setStep({ kind: 'nothing', why: answer.error ?? 'None of that could be done' })
          return
        }
        tap('done')
        setStep({ kind: 'done', lines: (answer.text ?? '').split('\n').filter((one) => one !== ''), ...(answer.open === undefined ? {} : { open: answer.open }) })
      })
      .catch((error: unknown) => setStep({ kind: 'nothing', why: tooOld(error) }))
  }

  const close = (): void => {
    onClose()
    if (step.kind === 'done' && step.open !== undefined) chat.goTo(step.open)
  }

  const again = (): void => {
    said.current = ''
    setWords('')
    listen()
  }

  const title = step.kind === 'plan' ? 'This will be done' : step.kind === 'done' ? 'Done' : 'Say it'

  return (
    <Sheet title={title} onClose={close} cancel={false} className="phone-say">
      {step.kind === 'listening' || step.kind === 'refused' ? (
        <>
          <div className={`phone-say-mic${hearing ? ' on' : ''}`}>
            <Icon name="mic" size={34} />
          </div>
          <div className="phone-say-words">{words === '' ? (step.kind === 'refused' ? step.why : 'Listening') : words}</div>
          <div className="sheet-note">{empty ? 'Nothing heard yet.' : 'Start a task, say something in one, stop, mark or open one.'}</div>
          <div className="phone-say-actions">
            <button type="button" className="phone-button grey" onClick={close}>
              Cancel
            </button>
            {step.kind === 'refused' || (!hearing && words === '') ? (
              <button type="button" className="phone-button fill" onClick={again}>
                Try again
              </button>
            ) : (
              <button type="button" className="phone-button fill" onClick={read}>
                Done
              </button>
            )}
          </div>
        </>
      ) : step.kind === 'reading' || step.kind === 'doing' ? (
        <div className="phone-say-wait">
          <Icon name="spinner" size={22} />
          {step.kind === 'reading' ? 'Reading what you said' : 'Doing it'}
        </div>
      ) : step.kind === 'plan' ? (
        <>
          <div className="phone-say-heard">"{words}"</div>
          <div className="sheet-list">
            {step.lines.map((line, at) => (
              <div key={at} className="sheet-option phone-say-line">
                <Icon name={line.icon} size={18} />
                <span className="sheet-words">
                  <span className="label">{line.head}</span>
                  {line.text === undefined ? null : <span className="says">{line.text}</span>}
                  {line.goal === undefined ? null : <span className="says">Until: {line.goal}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="phone-say-actions">
            <button type="button" className="phone-button grey" onClick={close}>
              Cancel
            </button>
            <button type="button" className="phone-button fill" onClick={go}>
              Do it
            </button>
          </div>
        </>
      ) : step.kind === 'nothing' ? (
        <>
          {words === '' ? null : <div className="phone-say-heard">"{words}"</div>}
          <div className="phone-say-words">{step.why}</div>
          <div className="phone-say-actions">
            <button type="button" className="phone-button grey" onClick={close}>
              Cancel
            </button>
            <button type="button" className="phone-button fill" onClick={again}>
              Try again
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sheet-list">
            {step.lines.map((line, at) => (
              <div key={at} className="sheet-option phone-say-line">
                <Icon name="check" size={18} />
                <span className="label">{line}</span>
              </div>
            ))}
          </div>
          <div className="phone-say-actions">
            <button type="button" className="phone-button fill" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
