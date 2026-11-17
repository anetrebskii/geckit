import { useEffect, useState } from 'react'
import { CONNECT_STAGES, type ConnectStage, type ConnectSteps } from './client'

// Past this a step is slow enough to say what else could be wrong.
const SLOW = 8000

export const stageSaid = (name: string): Record<ConnectStage, string> => ({
  service: 'Reaching the pairing service',
  answer: `Waiting for ${name} to answer`,
  joining: 'Opening the connection',
  proving: `Checking it is ${name}`,
  snapshot: `Reading ${name}'s state`,
  bootstrap: 'Starting the workspace',
  list: 'Loading your conversations',
})

const seconds = (ms: number): string => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
const amount = (size: number | undefined): string => size === undefined ? '' : size < 1024 * 1024 ? ` · ${String(Math.max(1, Math.round(size / 1024)))} KB` : ` · ${(size / 1024 / 1024).toFixed(1)} MB`

/** The steps of a connect, each done one with how long it took and the one under way counting, so a slow step reads as waited on rather than stuck. */
export function ConnectProgress({ name, steps }: { readonly name: string; readonly steps: ConnectSteps }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [])
  const said = stageSaid(name)
  const last = steps.length - 1
  const current = steps[last]
  const slow = current !== undefined && current.stage !== 'ready' && now - current.at >= SLOW
  return <div className="connect-progress">
    <ol>
      {CONNECT_STAGES.map((stage) => {
        const index = steps.findIndex((one) => one.stage === stage)
        const one = steps[index]
        const done = one !== undefined && index < last
        const under = one !== undefined && !done
        const end = steps[index + 1]?.at ?? now
        return <li key={stage} className={done ? 'done' : under ? 'now' : ''}>
          <i aria-hidden="true" />
          <span>{said[stage]}</span>
          {one === undefined ? null : <small>{seconds(Math.max(0, end - one.at))}{amount(one.size)}</small>}
        </li>
      })}
    </ol>
    {slow && current.stage === 'answer' ? <p className="hint">GeckIt has to be running on {name}.</p> : null}
    {slow && current.stage === 'joining' ? <p className="hint">The two networks have not found a way to each other yet.</p> : null}
  </div>
}
