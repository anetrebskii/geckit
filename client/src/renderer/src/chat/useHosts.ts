import { useEffect, useState } from 'react'

import type { HostPrompt, HostView } from '../../../shared/hosts'
import { knowHosts } from './project'

export interface HostsState {
  readonly hosts: readonly HostView[]
  /** What hosts are asking now, oldest first. */
  readonly prompts: readonly HostPrompt[]
}

/** The time, moved on once a minute: enough for "connected for 2 h". */
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])
  return now
}

/** The hosts as main keeps saying they stand, and what they ask. */
export function useHosts(): HostsState {
  const [hosts, setHosts] = useState<readonly HostView[]>([])
  const [prompts, setPrompts] = useState<readonly HostPrompt[]>([])
  useEffect(() => {
    const api = window.geckit.hosts
    void api.list().then(setHosts)
    void api.prompts().then(setPrompts)
    const offChanged = api.onChanged(setHosts)
    const offPrompt = api.onPrompt((prompt) => setPrompts((all) => [...all.filter((one) => one.id !== prompt.id), prompt]))
    const offAnswered = api.onAnswered((id) => setPrompts((all) => all.filter((one) => one.id !== id)))
    return () => {
      offChanged()
      offPrompt()
      offAnswered()
    }
  }, [])
  useEffect(() => knowHosts(hosts), [hosts])
  return { hosts, prompts }
}

/** Escape closes this dialog alone, not the one it was opened over. */
export function useEscape(close: () => void): void {
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [close])
}
