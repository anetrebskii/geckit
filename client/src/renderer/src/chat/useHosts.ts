import { useEffect, useRef, useState } from 'react'

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

/**
 * While a host's folders are open on the phone: if the host is gone (removed
 * on the computer it was reached through), or a card there was answered Not
 * now, which always leaves a host Not connected, go back where `onGone` says.
 */
export function useHostBounce(hosts: readonly HostView[], hostId: string | undefined, onGone: () => void): void {
  const host = hostId === undefined ? undefined : hosts.find((one) => one.id === hostId)
  // Set once the host is seen past Not connected, so opening on an already idle host does not bounce at once.
  const seen = useRef(false)
  useEffect(() => {
    if (hostId === undefined) {
      seen.current = false
      return
    }
    if (host === undefined) {
      onGone()
      return
    }
    if (host.state !== 'idle') seen.current = true
    else if (seen.current) onGone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, host?.state, host === undefined])
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
