import type { PlaceUsage, PlanUsage } from '../shared/api'
import { hostOf } from '../shared/hosts'
import type { HostView } from '../shared/hosts'
import { hostPlan } from './hosts/plan'
import type { Routes } from './hosts/route'
import type { Sessions } from './sessions'

/**
 * Every place a plan is measured on: this computer, and each host with a
 * project that runs there, since a plan is an account's and a host may be on
 * one of its own. The Chat window's status bar and the phone both read the
 * list `chat:plans` answers.
 */

/** A host worth a line of its own: it stands whether it is up (a fresh account and plan) or not (its last), so long as a project of the person's is on it. */
export interface HostPlace {
  readonly id: string
  readonly state: HostView['state']
  readonly who?: string
  readonly plan?: string
}

/** A host with at least one project on it, in the order Settings lists hosts. */
export function hostsWithProjects(hosts: readonly HostPlace[], projects: readonly string[]): readonly HostPlace[] {
  const withProjects = new Set(projects.map((root) => hostOf(root)).filter((id): id is string => id !== undefined))
  return hosts.filter((host) => withProjects.has(host.id))
}

/** One host's line, its usage folded in where it has been measured. */
export function placeFor(host: HostPlace, usage: PlanUsage | undefined): PlaceUsage {
  return {
    place: host.id,
    ...(host.who === undefined ? {} : { account: host.who }),
    ...(host.plan === undefined ? {} : { plan: host.plan }),
    ...(usage === undefined ? {} : { usage }),
  }
}

/** Whether two windows into the same plan say the same thing, so a host is not told about for nothing. */
function samePlan(one: PlanUsage | undefined, other: PlanUsage | undefined): boolean {
  return JSON.stringify(one ?? null) === JSON.stringify(other ?? null)
}

export interface PlansDeps {
  readonly sessions: () => Pick<Sessions, 'plan' | 'knownAccount' | 'measure'> | undefined
  readonly routes: () => Routes | undefined
  /** Every project's root, Settings' own list, for which hosts belong in the list at all. */
  readonly projects: () => readonly string[]
  readonly changed: (places: readonly PlaceUsage[]) => void
}

/**
 * Nothing here runs on a timer: every plan is measured when a window or the
 * phone asks, which is when a person opens one or brings it to the front, and
 * each place keeps its own answer for a while. What Claude Code sees from
 * GeckIt is then what a person did, never a beat of its own.
 */

export class Plans {
  readonly #deps: PlansDeps
  /** A host's usage as it was last measured, kept once it is up so a drop keeps showing it, greyed. */
  readonly #usage = new Map<string, PlanUsage | undefined>()

  constructor(deps: PlansDeps) {
    this.#deps = deps
  }

  #hostPlaces(): readonly HostPlace[] {
    const routes = this.#deps.routes()
    if (routes === undefined) return []
    return hostsWithProjects(
      routes.hosts.views().map((view) => ({ id: view.id, state: view.state, ...(view.who === undefined ? {} : { who: view.who }), ...(view.plan === undefined ? {} : { plan: view.plan }) })),
      this.#deps.projects(),
    )
  }

  /** Every place with a plan, as it stands right now: this computer's last measurement, and each host's. */
  async list(): Promise<PlaceUsage[]> {
    const sessions = this.#deps.sessions()
    const account = await sessions?.knownAccount()
    const usage = sessions?.plan()
    const local: PlaceUsage = {
      place: '',
      ...(account?.who === undefined ? {} : { account: account.who }),
      ...(account?.plan === undefined ? {} : { plan: account.plan }),
      ...(usage === undefined ? {} : { usage }),
    }
    return [local, ...this.#hostPlaces().map((host) => placeFor(host, this.#usage.get(host.id)))]
  }

  /** The list at once, and everything it can measure asked again, each place no sooner than it keeps its last answer. */
  async asked(): Promise<PlaceUsage[]> {
    const list = await this.list()
    void this.#deps.sessions()?.measure()
    void this.#measureHosts()
    return list
  }

  /** A host just came up: what it was showing while it was not connected may be another account's plan by now. */
  hostUp(id: string): void {
    if (this.#hostPlaces().some((host) => host.id === id)) void this.#measureHosts()
  }

  async #measureHosts(): Promise<void> {
    const routes = this.#deps.routes()
    if (routes === undefined) return
    const projects = this.#deps.projects()
    let changed = false
    await Promise.all(
      this.#hostPlaces()
        .filter((host) => host.state === 'up')
        .map(async (host) => {
          const root = projects.find((one) => hostOf(one) === host.id)
          if (root === undefined) return
          const usage = await hostPlan(routes, root)
          if (usage !== undefined && !samePlan(this.#usage.get(host.id), usage)) changed = true
          if (usage !== undefined) this.#usage.set(host.id, usage)
        }),
    )
    if (changed) this.#deps.changed(await this.list())
  }
}
