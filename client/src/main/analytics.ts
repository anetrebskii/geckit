import { randomUUID } from 'node:crypto'

import { app } from 'electron'

import { countEvent } from '../shared/counting'
import type { EventName } from '../shared/counting'
import { getSettings, setSettings } from './store'

function who(): string {
  const kept = getSettings().client
  if (kept !== '') return kept
  const client = randomUUID()
  setSettings({ client })
  return client
}

/** Nothing until the question on start was answered Yes, or the switch in Settings is on. */
export default function track(name: EventName): void {
  const { analytics, analyticsAsked } = getSettings()
  if (!app.isPackaged || !analytics || !analyticsAsked) return
  countEvent(who(), name, app.getVersion())
}
