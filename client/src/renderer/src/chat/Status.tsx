import { useEffect, useState } from 'react'

import { isCodexProvider, llmProviderInfo } from '../../../shared/providers'
import { money } from '../../../shared/provider-usage'
import { Meter } from './UsageMeter'
export { Meter, until } from './UsageMeter'
import type { GitState } from '../../../shared/api'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { ago } from './time'
import { AssistantStatus } from './AssistantStatus'
import type { AssistantStatusChat } from './AssistantStatus'
import type { Chat } from './useChat'

/**
 * Where a terminal keeps its status line. Under the conversation, what belongs
 * to it: where its project's checkout stands, how full its context is, and what
 * it has cost. Along the bottom of the window, what belongs to the whole
 * account: whose plan it is, and how much of its five-hour and weekly windows
 * is spent. Those are measured when the window opens and every few minutes
 * after, without waiting for a turn.
 */

export const tokens = (count: number): string =>
  count >= 1_000_000 ? `${String(Math.round(count / 100_000) / 10)}M` : `${String(Math.round(count / 1000))}k`

export const dollars = (cost: number): string => `$${cost < 10 ? cost.toFixed(2) : String(Math.round(cost))}`

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

/** Where the project's checkout stands, looked at again when the project changes, when a turn starts or ends, and when the window comes back to the front, which is when a commit made in a terminal would have happened. */
export function useGit(root: string | undefined, state: unknown): GitState | undefined {
  const [git, setGit] = useState<{ readonly root: string; readonly state: GitState | undefined }>()
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
  return git !== undefined && git.root === root ? git.state : undefined
}

export function TalkStatus({ chat, onClear }: { readonly chat: Chat; readonly onClear: () => void }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const spend = chat.session?.spend
  const model = chat.session?.model
  const modelLabel = model === undefined ? undefined : Array.isArray(chat.models) ? chat.models.find((one) => one.value === model || one.id === model)?.name ?? model : model
  const shownGit = useGit(chat.session?.root ?? chat.root, chat.session?.state)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div className="talk-status">
      {shownGit === undefined ? null : <Git git={shownGit} now={now} />}
      {model === undefined ? null : <span className="stat" title={`Model reported by ${llmProviderInfo(chat.provider).name} for this conversation: ${model}. The composer selects the model for the next message.`}><span>Model</span><span className="value">{modelLabel}</span></span>}
      {!isCodexProvider(chat.provider) || chat.session?.actualReasoning === undefined ? null : <span className="stat" title="Reasoning level reported by Codex for this conversation. The composer selects the level for the next message."><span>Reasoning</span><span className="value">{chat.session.actualReasoning === 'xhigh' ? 'Extra high' : chat.session.actualReasoning.charAt(0).toUpperCase() + chat.session.actualReasoning.slice(1)}</span></span>}
      {spend?.used === undefined ? null : (
        <span
          className="stat"
          title={
            spend.window === undefined
              ? `${spend.used.toLocaleString()} tokens in this conversation`
              : `${spend.used.toLocaleString()} of ${spend.window.toLocaleString()} tokens in this conversation. ${llmProviderInfo(chat.provider).name} summarises it when it fills.`
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
      {chat.session === undefined ? null : (
        <>
          <button
            type="button"
            className="act"
            disabled={chat.working}
            title="Summarise the conversation so far and go on from the summary, to free up its context, as /compact does"
            onClick={() => chat.setCompacting('clicked')}
          >
            Compact
          </button>
          <button type="button" className="act" title="Start a new conversation in this folder, for another task" onClick={onClear}>
            Clear
          </button>
        </>
      )}
      {spend?.cost === undefined ? null : (
        <span
          className="stat"
          title={spend.costKind === 'billed' ? 'Cost reported as billed by the provider.' : 'Conversation cost at API prices, reported by the provider. This is not a subscription charge.'}
        >
          <span>{spend.costKind === 'billed' ? 'Billed cost' : 'API equivalent'}</span>
          <span className="value">{money(spend.cost, spend.currency)}</span>
        </span>
      )}
    </div>
  )
}

export function Status({ chat }: { readonly chat: AssistantStatusChat }): React.JSX.Element | null {
  return ON_PHONE ? null : <AssistantStatus chat={chat} />
}
