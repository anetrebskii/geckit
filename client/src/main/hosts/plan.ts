import { createInterface } from 'node:readline'

import type { PlanUsage } from '../../shared/api'
import { hostOf, pathOf } from '../../shared/hosts'
import type { HostConfig } from '../../shared/hosts'
import { planOf } from '../sessions/claude-read'
import { ASK_ONLY, controlResponse } from '../sessions/usage'
import { claudeHereScript } from './run-script'
import { spawnOn } from './ssh'
import type { Routes } from './route'

/**
 * How much of a host's own plan is spent, asked the same way this computer's
 * is in `sessions/usage.ts`'s `readUsage`, over the connection instead of a
 * child process here. Nothing where the host is not up, so a place with no
 * account to speak of is not shown a wrong one.
 *
 * Kept for a few minutes for the same reason a host's models are, in
 * `route.ts`'s `hostModels`: starting `claude` there for this is not free,
 * and the windows and phone can ask again and again.
 */

/** How long a host's own claude is waited on for its plan's usage. */
const USAGE_PATIENCE = 20_000

/** How long a host's plan usage is kept before it is asked for again, as long as this computer's own is (`MEASURED_FOR` in `sessions/index.ts`). */
const USAGE_FRESH = 10 * 60_000

/** How long a host that did not say is left before it is asked again, so a host whose claude cannot answer is not started again at every glance. */
const UNSAID_FRESH = 60_000

/** What was last asked of a host's own claude for its plan: when, and its answer, so two callers at once share the one call in flight. */
const usageAsked = new Map<string, { readonly at: number; readonly fresh: number; readonly usage: Promise<PlanUsage | undefined> }>()

export function hostPlan(routes: Routes, root: string): Promise<PlanUsage | undefined> {
  const id = hostOf(root)
  const host = id === undefined ? undefined : routes.hosts.config(id)
  if (host === undefined || routes.hosts.state(host.id) !== 'up') return Promise.resolve(undefined)
  const kept = usageAsked.get(host.id)
  if (kept !== undefined && Date.now() - kept.at < kept.fresh) return kept.usage
  const usage = askHostPlan(routes, host, root)
  usageAsked.set(host.id, { at: Date.now(), fresh: USAGE_FRESH, usage })
  void usage.then((said) => {
    const now = usageAsked.get(host.id)
    if (said === undefined && now?.usage === usage) usageAsked.set(host.id, { ...now, fresh: UNSAID_FRESH })
  })
  return usage
}

function askHostPlan(routes: Routes, host: HostConfig, root: string): Promise<PlanUsage | undefined> {
  const child = spawnOn(
    host,
    routes.hosts.setup(),
    claudeHereScript(pathOf(root), ['claude', ...ASK_ONLY]),
  )
  child.stderr.resume()
  return new Promise((done) => {
    let over = false
    const finish = (plan: PlanUsage | undefined): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      child.stdin.end()
      child.kill()
      done(plan)
    }
    const patience = setTimeout(() => finish(undefined), USAGE_PATIENCE)
    createInterface({ input: child.stdout }).on('line', (line) => {
      const read = controlResponse(line)
      if (read === undefined) return
      finish(read.ok ? planOf(read.answer) : undefined)
    })
    child.on('error', () => finish(undefined))
    child.on('close', () => finish(undefined))
    child.stdin.on('error', () => undefined)
    child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: 'usage', request: { subtype: 'get_usage', skip_behaviors: true } })}\n`)
  })
}
