import { useEffect, useState } from 'react'

import { homeOf, SESSION_MODES } from '../../../shared/api'
import type { PlanUsage, PlanWindow } from '../../../shared/api'
import { hostOf } from '../../../shared/hosts'
import { Menu } from '../ui/Menu'
import { Cell, Drawer } from './PhoneKit'
import { projectLabel } from './project'
import { startedLine } from './Request'
import { ago } from './time'
import { dollars, Meter, tokens, until, useGit } from './Status'
import { accountsOf, usageOf } from './plans'
import type { Chat } from './useChat'

/** When a window starts again: the time today, the weekday and time within a week, the date beyond. */
export function resetsAt(at: number, now: number): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (when.toDateString() === new Date(now).toDateString()) return `at ${time}`
  if (at - now < 6 * 86_400_000) return `${when.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${when.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
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
  pulled,
  onClear,
  onClose,
}: {
  readonly chat: Chat
  readonly pulled?: number
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
  if (session === undefined) return null
  const spend = session.spend
  const parent = session.parent === undefined ? undefined : chat.sessions.find((one) => one.id === session.parent)
  const started = startedLine(chat.sessions, session.id)
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
        <Cell label="Mode" value={SESSION_MODES.find((one) => one.mode === session.mode)?.label ?? '-'} />
        <Cell label="Project" value={projectLabel(homeOf(session))} />
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
        {started === undefined ? null : <Cell label="Started" value={started.replace(/^Started /, '')} />}
      </div>
      {spend?.used === undefined ? null : <div className="phone-note">Claude Code summarises the conversation when its context fills.</div>}

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
        {chat.working ? (
          <Cell label="Compact" says="Once Claude has finished" />
        ) : (
          <Cell label="Compact" says="Summarise it so far to free up its context" accent onPress={() => setAsking('compact')} />
        )}
        <Cell label="Clear" says="Start a new task in this project" danger onPress={() => setAsking('clear')} />
      </div>

      {mine?.fiveHour === undefined && mine?.sevenDay === undefined ? null : (
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
