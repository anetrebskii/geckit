import { initializeApp, getApps } from 'firebase/app'
import { collection, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, setDoc, serverTimestamp, Timestamp, where } from 'firebase/firestore/lite'
import { roomOf, seal, unseal } from '../pairing'
import type { RemoteSignal } from './protocol'
export interface IceServer { readonly urls: string | string[]; readonly username?: string; readonly credential?: string }
export interface SignalDescription { readonly sdp: string; readonly at: number }
const firebase = { apiKey: 'AIzaSyC4h8OpyHUFHpQuQvn8vYdRiPXg-lh2mXc', authDomain: 'geckit-signal.firebaseapp.com', projectId: 'geckit-signal', appId: '1:229553514713:web:15dd5a3b6ceb081012b6c8' }
const database = () => getFirestore(getApps()[0] ?? initializeApp(firebase))
const local = (signal: string): boolean => signal.startsWith('http://127.0.0.1:') || signal.startsWith('http://localhost:')
const deadline = (): AbortSignal => AbortSignal.timeout(15_000)
export async function iceFor(pairing: RemoteSignal): Promise<IceServer[]> {
  const room = await roomOf(pairing.key)
  try {
    const answer = await fetch(`${pairing.signal}/ice?room=${room}`, { signal: deadline() })
    const parsed: unknown = await answer.json()
    if (parsed === null || typeof parsed !== 'object' || !('iceServers' in parsed) || !Array.isArray(parsed.iceServers)) throw new Error('No ICE servers')
    return parsed.iceServers.flatMap((one: { urls?: string | string[]; username?: string; credential?: string }) => typeof one.urls === 'string' || Array.isArray(one.urls) && one.urls.every((url) => typeof url === 'string') ? [{ urls: one.urls, ...(typeof one.username === 'string' ? { username: one.username } : {}), ...(typeof one.credential === 'string' ? { credential: one.credential } : {}) }] : [])
  } catch { return local(pairing.signal) ? [] : [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] }
}
export async function presence(pairing: RemoteSignal): Promise<void> {
  const room = await roomOf(pairing.key)
  if (local(pairing.signal)) { await fetch(`${pairing.signal}/rooms/${room}`, { method: 'PUT', body: '{}', signal: deadline() }); return }
  await setDoc(doc(database(), 'rooms', room), { seen: serverTimestamp() })
}
export async function postSignal(pairing: RemoteSignal, kind: 'offers' | 'answers', id: string, description: SignalDescription): Promise<void> {
  const room = await roomOf(pairing.key)
  const box = await seal(pairing.key, description)
  if (local(pairing.signal)) {
    const response = await fetch(`${pairing.signal}/rooms/${room}/${kind}/${id}`, { method: 'PUT', body: JSON.stringify({ box }), signal: deadline() })
    if (!response.ok) throw new Error('Signaling unavailable')
    return
  }
  await setDoc(doc(database(), 'rooms', room, kind, id), { box, at: serverTimestamp(), gone: Timestamp.fromMillis(Date.now() + 3600_000) })
}
export async function offers(pairing: RemoteSignal): Promise<{ readonly id: string; readonly description: SignalDescription }[]> {
  const room = await roomOf(pairing.key)
  const boxes = local(pairing.signal)
    ? await (async () => { const raw: unknown = await (await fetch(`${pairing.signal}/rooms/${room}/offers`, { signal: deadline() })).json(); if (!Array.isArray(raw)) return []; return raw.flatMap((one: { id?: string; box?: string }) => typeof one.id === 'string' && typeof one.box === 'string' ? [{ id: one.id, box: one.box }] : []) })()
    : (await getDocs(query(collection(database(), 'rooms', room, 'offers'), where('at', '>', Timestamp.fromMillis(Date.now() - 60_000)), orderBy('at', 'desc'), limit(64)))).docs.map((one) => ({ id: one.id, box: String(one.get('box') ?? '') }))
  const results = await Promise.all(boxes.slice(-64).map(async (one) => ({ id: one.id, description: await unseal<SignalDescription>(pairing.key, one.box) })))
  return results.flatMap(({ id, description }) => description !== undefined && typeof description.sdp === 'string' && description.sdp.length <= 65536 && typeof description.at === 'number' && Math.abs(Date.now() - description.at) < 60_000 ? [{ id, description }] : [])
}
export async function answer(pairing: RemoteSignal, id: string): Promise<SignalDescription | undefined> {
  const room = await roomOf(pairing.key)
  let box: string
  if (local(pairing.signal)) { const raw: unknown = await (await fetch(`${pairing.signal}/rooms/${room}/answers/${id}`, { signal: deadline() })).json(); if (raw === null || typeof raw !== 'object' || !('box' in raw) || typeof raw.box !== 'string') return undefined; box = raw.box }
  else { const result = await getDoc(doc(database(), 'rooms', room, 'answers', id)); box = String(result.get('box') ?? '') }
  const description = await unseal<SignalDescription>(pairing.key, box)
  return description !== undefined && typeof description.sdp === 'string' && description.sdp.length <= 65536 && Math.abs(Date.now() - description.at) < 60_000 ? description : undefined
}
