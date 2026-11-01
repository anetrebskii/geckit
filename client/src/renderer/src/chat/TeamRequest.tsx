import { useEffect, useRef, useState } from 'react'

import type { SessionItem } from '../../../shared/api'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'

type TeamRequestItem = Extract<SessionItem, { kind: 'team-request' }>

const HERE = ON_PHONE ? 'phone' : 'mac'

/** Changes to the team asked for with `geckit employees`, made only once the person allows them. */
export function TeamRequest({ item, readOnly = false }: { readonly item: TeamRequestItem; readonly readOnly?: boolean }): React.JSX.Element {
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)
  const answer = item.answer
  useEffect(() => { if (answer === undefined && !readOnly) primary.current?.focus({ preventScroll: false }) }, [answer, readOnly])

  const send = (allow: boolean): void => {
    if (sending) return
    setSending(true)
    void window.geckit.chat.answerTeamRequest(item.id, { allow, where: HERE, ...(note.trim() === '' ? {} : { note: note.trim() }) }).catch(() => setSending(false))
  }
  const head = answer === undefined
    ? 'Wants to change the team:'
    : answer.how === 'allowed'
      ? 'Allowed changes to the team'
      : answer.how === 'declined'
        ? 'Declined changes to the team'
        : 'Stopped waiting to change the team'
  const elsewhere = answer?.where !== undefined && answer.where !== HERE ? ` on the ${answer.where === 'mac' ? 'Mac' : 'phone'}` : ''

  return (
    <div className="card request team-request" role="group" aria-label="Wants to change the team">
      <div className="request-head">
        <span className={`request-glyph${answer === undefined ? '' : answer.how === 'allowed' ? ' done' : ' gone'}`}>
          <Icon name={answer === undefined ? 'pencil' : answer.how === 'allowed' ? 'check' : 'close'} size={12} />
        </span>
        <div className="request-heading">
          <div className="card-title">
            {head}
            {elsewhere}
          </div>
          {answer?.how === 'withdrawn' ? <div className="request-sub">Nothing was changed.</div> : null}
        </div>
      </div>
      <ul className="team-request-lines">
        {item.lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      {answer?.note === undefined ? null : <div className="request-replied">You noted: {answer.note}</div>}
      {answer !== undefined || readOnly ? null : (
        <div className="request-foot">
          {noting ? (
            <input
              type="text"
              className="request-reply"
              placeholder="Note for the assistant (optional)"
              value={note}
              autoFocus
              onChange={(event) => setNote(event.target.value)}
            />
          ) : (
            <>
              <button type="button" className="request-reply-add" onClick={() => setNoting(true)}>
                <Icon name="chat" size={11} />
                Add a note
              </button>
              <span className="spacer" />
            </>
          )}
          <button type="button" className="quiet" disabled={sending} onClick={() => send(false)}>
            Decline
          </button>
          <button type="button" className="primary" ref={primary} disabled={sending} onClick={() => send(true)}>
            Allow
          </button>
        </div>
      )}
    </div>
  )
}
