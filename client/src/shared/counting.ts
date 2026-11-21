/**
 * How often each thing is used, and nothing else: one POST to Google's measurement endpoint with the name of what
 * happened, the version, the platform, and an id this installation made and deletes when counting goes off. No text,
 * no path, no key. The Mac and the phone send the same way.
 */

const MEASUREMENT = 'G-297Y3KYMG4'
const SECRET = 'KpNXmpFVRtmT1FIFt8EjuQ'

export type EventName =
  | 'appActive'
  | 'countingAccepted'
  | 'countingDeclined'
  | 'correct'
  | 'correctShortcut'
  | 'transcribe'
  | 'dictate'
  | 'orders'
  | 'record'
  | 'screenshot'
  | 'chatSent'
  | 'taskDelegated'
  | 'managerSent'
  | 'employeeSaved'
  | 'shortcutSaved'
  | 'shortcutRun'
  | 'channelInstalled'
  | 'hostConnected'
  | 'secretSaved'
  | 'phoneOpened'

// GA4 counts a Measurement Protocol event toward active users only with a session id and some engagement time.
const SESSION = Math.floor(Date.now() / 1000)

export function countEvent(client: string, name: EventName, version: string, platform: string): void {
  void fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT}&api_secret=${SECRET}`, {
    method: 'POST',
    body: JSON.stringify({ client_id: client, events: [{ name, params: { version, platform, session_id: SESSION, engagement_time_msec: 1 } }] }),
  }).catch(() => undefined)
}

/** A No is counted once, under an id made for it and kept nowhere, so nothing after it can be tied to it. */
export function countDecline(version: string, platform: string): void {
  countEvent(crypto.randomUUID(), 'countingDeclined', version, platform)
}
