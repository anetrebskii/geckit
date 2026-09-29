/**
 * How often each thing is used, and nothing else: one POST to Google's measurement endpoint with the name of what
 * happened, the version, and an id this installation made and deletes when counting goes off. No text, no path,
 * no key. The Mac and the phone send the same way.
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
  | 'record'
  | 'phoneOpened'

export function countEvent(client: string, name: EventName, version: string): void {
  void fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT}&api_secret=${SECRET}`, {
    method: 'POST',
    body: JSON.stringify({ client_id: client, events: [{ name, params: { version } }] }),
  }).catch(() => undefined)
}
