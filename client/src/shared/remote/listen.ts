import { getApps, initializeApp } from 'firebase/app'
import { collection, doc, getFirestore, onSnapshot, query, Timestamp, where } from 'firebase/firestore'

import { roomOf } from '../pairing'
import type { RemoteSignal } from './protocol'
import { answer, isLocalSignal, offers, opened, openedAnswer } from './signaling'
import type { SignalDescription } from './signaling'

type Offer = { readonly id: string; readonly description: SignalDescription }

const firebase = { apiKey: 'AIzaSyC4h8OpyHUFHpQuQvn8vYdRiPXg-lh2mXc', authDomain: 'geckit-signal.firebaseapp.com', projectId: 'geckit-signal', appId: '1:229553514713:web:15dd5a3b6ceb081012b6c8' }
// Its own app, since the lite SDK the rest of the service uses keeps the default one.
const NAME = 'geckit-listen'
const database = () => getFirestore(getApps().find((one) => one.name === NAME) ?? initializeApp(firebase, NAME))

/** New offers in a room as they arrive. Firestore bills a listener only for what changes, where asking every few seconds is billed every time, found or not. */
export function watchOffers(pairing: RemoteSignal, heard: (offers: readonly Offer[]) => void, failed: (error: Error) => void): () => void {
  let stopped = false
  if (isLocalSignal(pairing.signal)) {
    const tick = (): void => void offers(pairing).then((found) => { if (!stopped) heard(found) }, (error: unknown) => { if (!stopped) failed(error instanceof Error ? error : new Error(String(error))) })
    tick()
    const timer = setInterval(tick, 2000)
    return () => { stopped = true; clearInterval(timer) }
  }
  let stop: (() => void) | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  // Since one minute before it started, so an offer made just before is not missed.
  const since = Timestamp.fromMillis(Date.now() - 60_000)
  const listen = (room: string): void => {
    if (stopped) return
    const fresh = query(collection(database(), 'rooms', room, 'offers'), where('at', '>=', since))
    stop = onSnapshot(fresh, (found) => {
      const added = found.docChanges().filter((change) => change.type === 'added').map((change) => ({ id: change.doc.id, box: String(change.doc.get('box') ?? '') }))
      if (added.length === 0) return
      void opened(pairing, added).then((offered) => { if (!stopped && offered.length > 0) heard(offered) })
    }, (error) => {
      // An error ends a listener for good; network drops are retried by Firestore itself.
      if (stopped) return
      failed(error)
      retry = setTimeout(() => listen(room), 30_000)
      retry.unref()
    })
  }
  void roomOf(pairing.key).then(listen, (error: unknown) => failed(error instanceof Error ? error : new Error(String(error))))
  return () => { stopped = true; clearTimeout(retry); stop?.() }
}

/** Told once a secret link's value was saved, by the note the function leaves where only the owner token leads; stopped by the returned function. */
export function watchSecretReady(owner: string, saved: () => void, failed: (error: Error) => void): () => void {
  let stopped = false
  let stop: (() => void) | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  const hex = async (text: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((one) => one.toString(16).padStart(2, '0')).join('')
  const listen = (id: string): void => {
    if (stopped) return
    stop = onSnapshot(doc(database(), 'secretReady', id), (found) => { if (found.exists() && !stopped) saved() }, (error) => {
      if (stopped) return
      failed(error)
      retry = setTimeout(() => listen(id), 30_000)
      retry.unref?.()
    })
  }
  void hex(owner).then((ownerHash) => hex(`ready:${ownerHash}`)).then(listen, (error: unknown) => failed(error instanceof Error ? error : new Error(String(error))))
  return () => { stopped = true; clearTimeout(retry); stop?.() }
}

/** The answer to one offer, as soon as it is left, or nothing at `until` or on `cancel`; listened for rather than asked for every second. */
export async function waitAnswer(pairing: RemoteSignal, id: string, until: number, cancel?: AbortSignal, localPollMs = 1000): Promise<SignalDescription | undefined> {
  if (isLocalSignal(pairing.signal)) {
    let found = await answer(pairing, id)
    while (found === undefined && Date.now() < until && cancel?.aborted !== true) {
      await new Promise((done) => setTimeout(done, localPollMs))
      found = await answer(pairing, id)
    }
    return found
  }
  const room = await roomOf(pairing.key)
  return new Promise((done, fail) => {
    const finish = (): void => { clearTimeout(timer); cancel?.removeEventListener('abort', gone); stop() }
    const gone = (): void => { finish(); done(undefined) }
    const timer = setTimeout(gone, Math.max(0, until - Date.now()))
    cancel?.addEventListener('abort', gone, { once: true })
    const stop = onSnapshot(doc(database(), 'rooms', room, 'answers', id), (found) => {
      const box: unknown = found.get('box')
      if (typeof box !== 'string') return
      finish()
      void openedAnswer(pairing, box).then(done, fail)
    }, (error) => { finish(); fail(error) })
    if (cancel?.aborted === true) gone()
  })
}
