import { randomUUID } from 'node:crypto'

import { app } from 'electron'

import { countDecline, countEvent } from '../shared/counting'
import type { EventName } from '../shared/counting'
import { getSettings, setSettings } from './store'

function who(): string {
  const kept = getSettings().client
  if (kept !== '') return kept
  const client = randomUUID()
  setSettings({ client })
  return client
}

const send = (name: EventName): void => countEvent(who(), name, app.getVersion(), process.platform)

/** Nothing until the question on start was answered Yes, or the switch in Settings is on. */
export default function track(name: EventName): void {
  const { analytics, analyticsAsked } = getSettings()
  if (!app.isPackaged || !analytics || !analyticsAsked) return
  send(name)
}

let activeOn = ''

/** Once a local day per installation, at start and when a window comes to the front, so a GeckIt left open still counts as used. */
export function countActive(): void {
  const today = new Date().toDateString()
  const { analytics, analyticsAsked } = getSettings()
  if (today === activeOn || !app.isPackaged || !analytics || !analyticsAsked) return
  activeOn = today
  send('appActive')
}

/** The first answer to the question, from the card or the switch in Settings. */
export function countAnswer(yes: boolean): void {
  if (!app.isPackaged) return
  if (!yes) return countDecline(app.getVersion(), process.platform)
  send('countingAccepted')
  activeOn = new Date().toDateString()
  send('appActive')
}
