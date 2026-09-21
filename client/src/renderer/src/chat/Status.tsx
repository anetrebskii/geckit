import { useEffect, useState } from 'react'

import { planLine } from '../../../shared/api'
import type { GitState, PlanWindow } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { ago } from './time'
import type { Chat } from './useChat'

/**
 * The bar along the bottom of the window, where a terminal keeps its status line.
 *
 * On the left, what belongs to the conversation in front: where its project's
 * checkout stands, how full its context is, and what it has cost. On the right,
 * what belongs to the whole account: whose plan it is, and how much of its
 * five-hour and weekly windows is spent. Those are measured when the window
 * opens and every few minutes after, without waiting for a turn.
 */

const tokens = (count: number): string =>
  count >= 1_000_000 ? `${String(Math.round(count / 100_000) / 10)}M` : `${String(Math.round(count / 1000))}k`

const dollars = (cost: number): string => `$${cost < 10 ? cost.toFixed(2) : String(Math.round(cost))}`

function until(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${String(days)}d ${String(hours)}h`
  if (hours > 0) return `${String(hours)}h ${String(minutes % 60)}m`
  return `${String(minutes)}m`
}

/** The same thresholds a terminal status line uses: fine, getting there, nearly out. */
const tone = (part: number): string => (part >= 0.9 ? 'high' : part >= 0.7 ? 'mid' : 'low')

function Meter({ part }: { readonly part: number }): React.JSX.Element {
  return (
    <span className={`meter ${tone(part)}`}>
      <span style={{ width: `${String(Math.min(100, Math.round(part * 100)))}%` }} />
    </span>
  )
}

function Window({ name, window, now }: { readonly name: string; readonly window: PlanWindow; readonly now: number }): React.JSX.Element {
  const at = new Date(window.resetsAt)
  return (
    <span className="stat" title={`${name} window: ${String(Math.round(window.part * 100))}% used, starts again ${at.toLocaleString()}`}>
      <span>{name}</span>
      <Meter part={window.part} />
      <span className="value">
        {Math.round(window.part * 100)}%<span className="resets">, resets in {until(window.resetsAt, now)}</span>
      </span>
    </span>
  )
}

/** A count of commits, and the first lines of the ones named, for the tooltip. */
function commits(count: number, named: readonly string[], where: string): string[] {
  if (count === 0) return [`Nothing ${where}`]
  return [
    `${String(count)} ${count === 1 ? 'commit' : 'commits'} ${where}:`,
    ...named.map((line) => `    ${line}`),
    ...(count > named.length ? [`    and ${String(count - named.length)} more`] : []),
  ]
}

function Git({ git, now }: { readonly git: GitState; readonly now: number }): React.JSX.Element {
  const upstream = git.upstream
  const tip = [
    `On ${git.branch}, ${git.changed === 0 ? 'nothing changed' : `${String(git.changed)} ${git.changed === 1 ? 'file' : 'files'} changed and not committed`}`,
    '',
    ...(upstream === undefined
      ? ['Not pushed anywhere yet: the branch has no upstream.']
      : [
          ...commits(git.behind, git.incoming, `to pull from ${upstream}`),
          '',
          ...commits(git.ahead, git.outgoing, `to push to ${upstream}`),
          '',
          git.fetched === undefined
            ? `${upstream} as last fetched here or in a terminal.`
            : `${upstream} checked for new commits ${ago(git.fetched, now) === 'now' ? 'just now' : `${ago(git.fetched, now)} ago`}.`,
        ]),
  ].join('\n')
  return (
    <span className="stat" title={tip}>
      <Icon name="branch" size={12} />
      <span className="value branch">{git.branch}</span>
      {git.changed === 0 ? null : <span>{git.changed} changed</span>}
      {upstream === undefined ? (
        <span>not published</span>
      ) : (
        <>
          <span className={`count${git.behind === 0 ? '' : ' some'}`} aria-label={`${String(git.behind)} to pull`}>
            <Icon name="behind" size={11} />
            {git.behind}
          </span>
          <span className={`count${git.ahead === 0 ? '' : ' some'}`} aria-label={`${String(git.ahead)} to push`}>
            <Icon name="ahead" size={11} />
            {git.ahead}
          </span>
        </>
      )}
    </span>
  )
}

export function Status({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [git, setGit] = useState<{ readonly root: string; readonly state: GitState | undefined }>()
  const root = chat.session?.root ?? chat.root
  const state = chat.session?.state
  const spend = chat.session?.spend
  const plan = chat.plan

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  // Looked at again when the project changes, when a turn starts or ends, and
  // when the window comes back to the front, which is when a commit made in a
  // terminal would have happened.
  useEffect(() => {
    if (root === undefined) return
    let current = true
    const look = (): void => {
      void window.geckit.chat.git(root).then((found) => {
        if (current) setGit({ root, state: found })
      })
    }
    look()
    window.addEventListener('focus', look)
    const off = window.geckit.chat.onGit((said) => {
      if (current && said.root === root) setGit({ root, state: said.state })
    })
    return () => {
      current = false
      window.removeEventListener('focus', look)
      off()
    }
  }, [root, state])

  const shownGit = git !== undefined && git.root === root ? git.state : undefined

  return (
    <div className="status-bar">
      {shownGit === undefined ? null : <Git git={shownGit} now={now} />}
      {spend?.used === undefined ? null : (
        <span
          className="stat"
          title={
            spend.window === undefined
              ? `${spend.used.toLocaleString()} tokens in this conversation`
              : `${spend.used.toLocaleString()} of ${spend.window.toLocaleString()} tokens in this conversation. Claude Code summarises it when it fills.`
          }
        >
          <span>Context</span>
          {spend.window === undefined ? null : <Meter part={spend.used / spend.window} />}
          <span className="value">
            {tokens(spend.used)}
            {spend.window === undefined ? '' : ` of ${tokens(spend.window)}`}
          </span>
        </span>
      )}
      {spend?.cost === undefined ? null : (
        <span
          className="stat"
          title="What this conversation would have cost at API prices, as Claude Code counts it. The plan covers it."
        >
          <span>Cost</span>
          <span className="value">{dollars(spend.cost)}</span>
        </span>
      )}
      <span className="spacer" />
      <span className={`lead${chat.trouble === '' ? '' : ' trouble'}`}>
        {chat.trouble === '' ? planLine(chat.account) : chat.trouble}
      </span>
      {plan?.fiveHour === undefined ? null : <Window name="5h" window={plan.fiveHour} now={now} />}
      {plan?.sevenDay === undefined ? null : <Window name="Week" window={plan.sevenDay} now={now} />}
    </div>
  )
}
