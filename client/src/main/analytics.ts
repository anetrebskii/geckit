import { randomUUID } from 'node:crypto'

import { app } from 'electron'

import { getSettings, setSettings } from './store'

/**
 * How often each thing is used, and nothing else.
 *
 * One POST to Google's measurement endpoint with the name of what happened.
 * No text, no path, no key: nothing anybody writes or corrects goes anywhere
 * near it. A machine that is offline simply does not report, and nor does
 * one where it is turned off in Settings.
 */

const MEASUREMENT = 'G-297Y3KYMG4'
const SECRET = 'KpNXmpFVRtmT1FIFt8EjuQ'

export type EventName =
  | 'correct'
  | 'transcribe'
  | 'dictate'
  | 'chatSent'
  | 'chatAnswered'
  | 'settingsSaved'
  | 'shortcutPressed'
  | 'orders'

function who(): string {
  const kept = getSettings().client
  if (kept !== '') return kept
  const client = randomUUID()
  setSettings({ client })
  return client
}

export default function track(name: EventName): void {
  if (!app.isPackaged || !getSettings().analytics) return
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT}&api_secret=${SECRET}`
  void fetch(url, {
    method: 'POST',
    body: JSON.stringify({ client_id: who(), events: [{ name, params: { version: app.getVersion() } }] }),
  }).catch(() => undefined)
}
