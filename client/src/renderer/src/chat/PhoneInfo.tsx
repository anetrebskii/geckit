import { useEffect, useRef, useState } from 'react'

import { homeOf, SESSION_MODES } from '../../../shared/api'
import type { ClaudeAccount, CodexLimitWindow, CodexRateLimit, PlanUsage, PlanWindow } from '../../../shared/api'
import { hostOf } from '../../../shared/hosts'
import { shortUrl } from '../../../shared/links'
import type { Link } from '../../../shared/links'
import { Menu } from '../ui/Menu'
import { Cell, Drawer } from './PhoneKit'
import { projectLabel } from './project'
import { childSaid } from './Request'
import { startedFrom } from './started'
import { ago } from './time'
import { dollars, Meter, tokens, until, useGit } from './Status'
import { accountsOf, usageOf } from './plans'
import type { Chat } from './useChat'

/** When a window starts again: the time today, the weekday and time within a week, the date beyond. */
const resetClock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const resetWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const resetDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function resetsAt(at: number, now: number): string {
  const when = new Date(at)
  const time = resetClock.format(when)
  if (when.toDateString() === new Date(now).toDateString()) return `at ${time}`
  if (at - now < 6 * 86_400_000) return `${resetWeekday.format(when)} ${time}`
  return `${resetDate.format(when)} ${time}`
}

/** How much of the plan's window is spent and when it starts again, as a row of a grouped list. */
export function Limit({ name, window, now }: { readonly name: string; readonly window: PlanWindow; readonly now: number }): React.JSX.Element {
  return (
    <Cell
      label={name}
      says={`Resets ${resetsAt(window.resetsAt, now)}, in ${until(window.resetsAt, now)}`}
      value={
        <span className="phone-meter">
          <Meter part={window.part} />
          {Math.round(window.part * 100)}%
        </span>
      }
    />
  )
}

/** The plan's windows, shared by every conversation on the Mac. */
export function Limits({ chat, usage }: { readonly chat: Chat; readonly usage?: PlanUsage | undefined }): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])
  // An account's own windows where one is given, this computer's otherwise.
  const plan = usage ?? chat.plan
  if (plan?.fiveHour === undefined && plan?.sevenDay === undefined) return null
  return (
    <div className="phone-group">
      {plan.fiveHour === undefined ? null : <Limit name="5-hour window" window={plan.fiveHour} now={now} />}
      {plan.sevenDay === undefined ? null : <Limit name="Week" window={plan.sevenDay} now={now} />}
    </div>
  )
}

export function codexWindowName(window: CodexLimitWindow, limit: CodexRateLimit, count: number): string {
  const minutes = window.windowDurationMins
  const duration = minutes === null ? 'Limit' : minutes === 10080 ? 'Week' : minutes % 1440 === 0 ? `${String(minutes / 1440)}-day window` : minutes % 60 === 0 ? `${String(minutes / 60)}-hour window` : `${String(minutes)}-minute window`
  return count === 1 || limit.limitId === 'codex' ? duration : `${limit.limitName ?? limit.limitId ?? 'Codex'} ${duration}`
}

export function CodexLimits({ limits }: { readonly limits: ClaudeAccount['limits'] }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])
  return (
    <div className="phone-group">
      {limits === undefined ? <Cell label="Limits" value="Unavailable" /> : limits.flatMap((limit, index) => [limit.primary, limit.secondary].flatMap((window, at) => window === null ? [] : [
        <Cell key={`${limit.limitId ?? String(index)}:${String(at)}`} label={codexWindowName(window, limit, limits.length)} says={window.resetsAt === null ? undefined : `Resets ${resetsAt(window.resetsAt * 1000, now)}, in ${until(window.resetsAt * 1000, now)}`} value={<span className="phone-meter"><Meter part={window.usedPercent / 100} />{Math.round(window.usedPercent)}%</span>} />,
      ]))}
    </div>
  )
}

/** What a link row says first: what the link was called, or the site a bare address is on. */
const linkLabel = (link: Link): string => link.text ?? shortUrl(link.url).split('/')[0] ?? link.url

/** Under it: the whole address of a named link, the rest of a bare one's. */
const linkSays = (link: Link): string | undefined => {
  if (link.text !== undefined) return shortUrl(link.url)
  const rest = shortUrl(link.url).split('/').slice(1).join('/')
  return rest === '' ? undefined : rest
}

/** A conversation's context, as the phone's bar says it under the title. */
export const contextLine = (chat: Chat): string | undefined => {
  const spend = chat.session?.spend
  if (spend?.used === undefined || spend.window === undefined) return undefined
  return `${String(Math.round((spend.used / spend.window) * 100))}% context`
}

/**
 * What the Mac's window shows under a conversation and along its bottom, as a
 * drawer: its context, cost, checkout and model, the plan's windows, and
 * Compact and Clear, each asked about first.
 */
export function PhoneInfo({
  chat,
  links,
  pulled,
  atStarted = false,
  onClear,
  onClose,
}: {
  readonly chat: Chat
  readonly links: readonly Link[]
  readonly pulled?: number
  /** Opened from "Started 3" under the title, so it opens scrolled to them. */
  readonly atStarted?: boolean
  readonly onClear: () => void
  readonly onClose: () => void
}): React.JSX.Element | null {
  // The plan this conversation spends is its account's: a host's own where it runs on one.
  const at = chat.session === undefined ? '' : (hostOf(chat.session.root) ?? '')
  const item = accountsOf([at], chat.plans, (place) => place)[0]
  const mine = item === undefined ? chat.plan : usageOf(item, chat.plan)
  const mineName = at === '' ? undefined : (chat.hosts.find((one) => one.id === at)?.name ?? at)
  const [asking, setAsking] = useState<'compact' | 'clear'>()
  const [now] = useState(() => Date.now())
  const session = chat.session
  const git = useGit(session?.root ?? chat.root, session?.state)
  const startedHead = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (atStarted) startedHead.current?.scrollIntoView({ block: 'start' })
  }, [atStarted])
  if (session === undefined) return null
  const spend = session.spend
  const parent = session.parent === undefined ? undefined : chat.sessions.find((one) => one.id === session.parent)
  const started = startedFrom(chat.sessions, session.id)
  const upstream = git?.upstream

  return (
    <Drawer title="Conversation" {...(pulled === undefined ? {} : { pulled })} onClose={onClose}>
      <div className="phone-head">This conversation</div>
      <div className="phone-group">
        {spend?.used === undefined ? null : (
          <Cell
            label="Context"
            says={spend.window === undefined ? undefined : `${tokens(spend.used)} of ${tokens(spend.window)} tokens`}
            value={
              spend.window === undefined ? (
                tokens(spend.used)
              ) : (
                <span className="phone-meter">
                  <Meter part={spend.used / spend.window} />
                  {Math.round((spend.used / spend.window) * 100)}%
                </span>
              )
            }
          />
        )}
        {spend?.cost === undefined ? null : <Cell label="Cost" says="At API prices; the plan covers it" value={dollars(spend.cost)} />}
        {session.model === undefined ? null : <Cell label="Model" value={session.model} />}
        {chat.provider !== 'codex' || session.actualReasoning === undefined ? null : <Cell label="Reasoning" value={session.actualReasoning === 'xhigh' ? 'Extra high' : session.actualReasoning.charAt(0).toUpperCase() + session.actualReasoning.slice(1)} />}
        <Cell label="Mode" value={SESSION_MODES.find((one) => one.mode === session.mode)?.label ?? '-'} />
        <Cell label="Folder" value={projectLabel(homeOf(session))} />
        {parent === undefined ? null : (
          <Cell
            label="From"
            value={parent.title}
            onPress={() => {
              onClose()
              chat.goTo(parent.id)
            }}
          />
        )}
      </div>
      {spend?.used === undefined ? null : <div className="phone-note">{chat.provider === 'codex' ? 'Codex' : 'Claude Code'} summarises the conversation when its context fills.</div>}

      {started.length === 0 ? null : (
        <>
          <div ref={startedHead} className="phone-head">
            Started here
          </div>
          <div className="phone-group">
            {started.map(({ session: child, depth }) => {
              const said = childSaid(child)
              return (
                <div key={child.id} className="phone-started" style={{ '--depth': Math.min(depth, 2) } as React.CSSProperties}>
                  <Cell
                    label={child.title}
                    says={projectLabel(homeOf(child))}
                    value={
                      <span className={`state-said ${said.tone}`}>
                        <span className="state-dot" />
                        {said.words}
                      </span>
                    }
                    onPress={() => {
                      onClose()
                      chat.goTo(child.id)
                    }}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}

      {links.length === 0 ? null : (
        <>
          <div className="phone-head">Links</div>
          <div className="phone-group">
            {links.map((link) => (
              <Cell
                key={link.url}
                icon="link"
                label={<span className="phone-cell-clip">{linkLabel(link)}</span>}
                says={linkSays(link)}
                onPress={() => window.geckit.chat.openLink(link.url)}
              />
            ))}
          </div>
          <div className="phone-note">Written in this conversation, the newest first.</div>
        </>
      )}

      {git === undefined ? null : (
        <>
          <div className="phone-head">Git</div>
          <div className="phone-group">
            <Cell label="Branch" value={git.branch} />
            <Cell label="Changed" says={git.changed === 0 ? undefined : 'Not committed'} value={git.changed === 0 ? 'Nothing' : `${String(git.changed)} ${git.changed === 1 ? 'file' : 'files'}`} />
            {upstream === undefined ? (
              <Cell label="Upstream" says="The branch has no upstream yet" value="Not published" />
            ) : (
              <>
                <Cell label="To pull" says={git.incoming[0]} value={String(git.behind)} />
                <Cell label="To push" says={git.outgoing[0]} value={String(git.ahead)} />
              </>
            )}
          </div>
          {upstream === undefined ? null : (
            <div className="phone-note">
              Against {upstream}
              {git.fetched === undefined ? ', as last fetched.' : `, checked ${ago(git.fetched, now) === 'now' ? 'just now' : `${ago(git.fetched, now)} ago`}.`}
            </div>
          )}
        </>
      )}

      <div className="phone-group phone-form-group">
        {chat.provider === 'codex' ? null : chat.working ? (
          <Cell label="Compact" says="Once Claude has finished" />
        ) : (
          <Cell label="Compact" says="Summarise it so far to free up its context" accent onPress={() => setAsking('compact')} />
        )}
        <Cell label="Clear" says="Start a new task in this folder" danger onPress={() => setAsking('clear')} />
      </div>

      {chat.provider === 'codex' ? <><div className="phone-head">ChatGPT plan</div><CodexLimits limits={chat.account?.limits} /></> : mine?.fiveHour === undefined && mine?.sevenDay === undefined ? null : (
        <>
          <div className="phone-head">{mineName === undefined ? 'Plan' : `Plan on ${mineName}`}</div>
          <Limits chat={chat} usage={mine} />
        </>
      )}

      {asking === 'compact' ? (
        <Menu
          anchor={new DOMRect()}
          title="Compact the conversation?"
          note="Claude writes a summary of it so far and goes on from the summary. Everything stays here to read, but what the summary leaves out Claude no longer has in mind."
          choices={[{ value: 'compact', label: 'Compact' }]}
          onPick={() => {
            chat.say('/compact')
            onClose()
          }}
          onClose={() => setAsking(undefined)}
        />
      ) : asking === 'clear' ? (
        <Menu
          anchor={new DOMRect()}
          title="Clear the conversation?"
          note={`A new task starts in ${projectLabel(homeOf(session))}, with nothing of this one in mind. This one stays on the board.`}
          choices={[{ value: 'clear', label: 'Clear', danger: true }]}
          onPick={() => {
            onClose()
            onClear()
          }}
          onClose={() => setAsking(undefined)}
        />
      ) : null}
    </Drawer>
  )
}
