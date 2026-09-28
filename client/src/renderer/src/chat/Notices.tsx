import { useEffect, useRef, useState } from 'react'
import { homeOf } from '../../../shared/api'
import type { SessionNotice } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { ON_PHONE } from '../on-phone'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { projectLabel } from './project'
import type { Chat } from './useChat'

/** What another conversation said while this window was in front, each one a way into it. */
export function Notices({ chat }: { readonly chat: Chat }): React.JSX.Element | null {
  if (chat.notices.length === 0) return null
  if (ON_PHONE)
    return (
      <div className="notices" aria-live="polite">
        {[...chat.notices].reverse().map((notice) => (
          <Banner key={notice.session} chat={chat} notice={notice} />
        ))}
      </div>
    )
  return (
    <div className="notices no-drag" aria-live="polite">
      {chat.notices.map((notice) => (
        <div
          key={notice.session}
          className={`notice${notice.asks ? ' asks' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => chat.goTo(notice.session)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') chat.goTo(notice.session)
          }}
        >
          <span className="state" />
          <span className="lines">
            <span className="title">{notice.title}</span>
            {notice.subtitle === '' ? null : <span className="subtitle">{notice.subtitle}</span>}
            <span className="body">{notice.body}</span>
            {notice.request === undefined ? null : (
              <span className="notice-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (notice.request !== undefined) void window.geckit.chat.startAll(notice.request, 'mac')
                    chat.dismiss(notice.session)
                  }}
                >
                  Start all
                </button>
              </span>
            )}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss"
            onClick={(event) => {
              event.stopPropagation()
              chat.dismiss(notice.session)
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

const GLYPH: Readonly<Record<string, string>> = { Finished: 'check', 'Needs an answer': 'more', 'Plan limit reached': 'blocked' }

/** Far enough up, or flicked, and it goes, as the system's banners do. */
const AWAY = -36
const FLICK = -0.4

/** One banner on the phone: the project and what happened on top, the conversation, then what it said; pushed up to put it away. */
function Banner({ chat, notice }: { readonly chat: Chat; readonly notice: SessionNotice }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const [leaving, setLeaving] = useState(false)
  const session = chat.everyone.find((one) => one.id === notice.session) ?? chat.questions.find((one) => one.id === notice.session)
  const cut = notice.title.lastIndexOf(' - ')
  const what = cut < 0 ? notice.title : notice.title.slice(0, cut)
  const project = session === undefined ? (cut < 0 ? '' : notice.title.slice(cut + 3)) : projectLabel(homeOf(session))
  const color = session === undefined ? undefined : `var(--project-${String(projectColor(homeOf(session), chat.settings))})`
  const tone = notice.asks ? 'asks' : what === 'Finished' ? 'done' : 'plain'

  // Touch rather than pointer events, as the board's rows do: the web view takes a vertical pan for itself and cancels the pointer, and only a non-passive touchmove keeps it.
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    let from = 0
    let by = 0
    let last = { y: 0, t: 0, v: 0 }
    const place = (y: number, settle: boolean): void => {
      el.style.transition = settle ? '' : 'none'
      el.style.transform = y === 0 ? '' : `translateY(${String(y)}px)`
    }
    const start = (event: TouchEvent): void => {
      const y = event.touches[0]?.clientY ?? 0
      from = y
      by = 0
      last = { y, t: event.timeStamp, v: 0 }
      moved.current = false
    }
    const move = (event: TouchEvent): void => {
      event.preventDefault()
      const y = event.touches[0]?.clientY ?? from
      by = y - from
      if (event.timeStamp > last.t) last = { y, t: event.timeStamp, v: (y - last.y) / (event.timeStamp - last.t) }
      if (Math.abs(by) > 6) moved.current = true
      if (moved.current) place(by < 0 ? by : Math.sqrt(by) * 3, false)
    }
    const end = (): void => {
      if (!moved.current) return
      if (by < AWAY || last.v < FLICK) {
        setLeaving(true)
        place(0, true)
        el.style.transform = 'translateY(-160%)'
        tap('light')
      } else place(0, true)
    }
    const cancel = (): void => place(0, true)
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', cancel)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', cancel)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`notice banner ${tone}${leaving ? ' leaving' : ''}`}
      role="button"
      tabIndex={0}
      onTransitionEnd={() => {
        if (leaving) chat.dismiss(notice.session)
      }}
      onClick={() => {
        if (!moved.current) chat.goTo(notice.session)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') chat.goTo(notice.session)
      }}
    >
      <span className="banner-icon" style={color === undefined ? undefined : { background: color }}>
        <Icon name={notice.request === undefined ? (GLYPH[what] ?? 'chat') : 'plus'} size={18} />
      </span>
      <span className="lines">
        <span className="banner-head">
          <span className="banner-what">
            {what}
            {project === '' ? null : <span className="banner-project"> in {project}</span>}
          </span>
          <span className="banner-when">now</span>
        </span>
        {notice.subtitle === '' ? null : <span className="title">{notice.subtitle}</span>}
        <span className="body">{notice.body}</span>
      </span>
    </div>
  )
}
