import type { ChatSession, SessionItem } from '../api'
import type { ManagerThread, ManagerView } from '../manager'
import type { CoreMethods } from '../../core/application'
import type { CoreEvent } from '../../core/events'
import { SIGNAL } from '../pairing'
import { parseRemote } from './codec'

export const REMOTE_PROTOCOL = 2
export const CODE_TTL = 5 * 60_000
export interface RemoteIdentity { readonly publicKey: string; readonly privateKey: string }
export interface RemoteServer { readonly id: string; readonly name: string; readonly publicKey: string }
export interface RemoteTrust { readonly server: RemoteServer; readonly device: string; readonly key: string; readonly signal: string; readonly projects: readonly string[]; readonly manager: boolean; readonly full?: true }
export type RemoteCall = { [K in keyof CoreMethods]: { readonly method: K; readonly args: Parameters<CoreMethods[K]> } }[keyof CoreMethods]
export type RemoteResult = Awaited<ReturnType<CoreMethods[keyof CoreMethods]>>
export type RemoteSession = Pick<ChatSession, 'id' | 'title' | 'stands' | 'state' | 'at' | 'provider' | 'status'> & { readonly project: string }
export interface RemoteProject { readonly id: string; readonly path: string }
export type RemoteManager = Pick<ManagerView, 'state' | 'queued'> & { readonly threads: readonly Pick<ManagerThread, 'id' | 'title' | 'state'>[] }
export interface RemoteSnapshot { readonly server: RemoteServer; readonly epoch: string; readonly seq: number; readonly projects: readonly RemoteProject[]; readonly sessions: readonly RemoteSession[]; readonly manager: RemoteManager }
export type RemoteItem = Pick<SessionItem, 'id' | 'kind'> & { readonly text: string }
export interface RemoteHistory { readonly session: string; readonly items: readonly RemoteItem[]; readonly before: number; readonly revision: number }
export type RemoteRequest =
  | { readonly type: 'hello'; readonly protocol: number; readonly publicKey: string; readonly name: string; readonly nonce: string; readonly proof: string }
  | { readonly type: 'snapshot'; readonly id: number }
  | { readonly type: 'history'; readonly id: number; readonly session: string; readonly before: number }
  | { readonly type: 'core-call'; readonly id: number; readonly call: RemoteCall }
export type RemoteResponse =
  | { readonly type: 'challenge'; readonly server: RemoteServer; readonly nonce: string; readonly protocol: number; readonly expires: number }
  | { readonly type: 'pending'; readonly request: string; readonly phrase: string }
  | { readonly type: 'trusted'; readonly trust: RemoteTrust; readonly proof: string }
  | { readonly type: 'snapshot'; readonly id: number; readonly snapshot: RemoteSnapshot }
  | { readonly type: 'history'; readonly id: number; readonly history: RemoteHistory }
  | { readonly type: 'changed'; readonly epoch: string; readonly seq: number }
  | { readonly type: 'core-result'; readonly id: number; readonly value: RemoteResult }
  | { readonly type: 'core-failure'; readonly id: number; readonly message: string }
  | { readonly type: 'core-event'; readonly event: CoreEvent }
  | { readonly type: 'error'; readonly code: 'expired' | 'reused' | 'revoked' | 'incompatible' | 'denied' | 'error'; readonly message: string }
export interface RemoteChannel { readonly binding: Promise<string>; send(text: string): void; onMessage(heard: (text: string) => void): void; onClose(closed: () => void): void; close(): void }
export interface RemoteSignal { readonly key: string; readonly signal: string }
export const remoteRef = (server: string, kind: string, id: string): string => `geckit-remote:${encodeURIComponent(server)}:${kind}:${encodeURIComponent(id)}`
export const invitationLink = (key: string, signal: string): string => `geckit://server?code=${key}&signal=${encodeURIComponent(signal)}`
export function readInvitation(text: string): RemoteSignal | undefined {
  if (/^[A-Za-z0-9_-]{43}$/.test(text.trim())) return { key: text.trim(), signal: 'https://europe-west1-geckit-signal.cloudfunctions.net' }
  try {
    const url = new URL(text.trim())
    if (url.protocol !== 'geckit:' || url.hostname !== 'server') return undefined
    const key = url.searchParams.get('code') ?? ''
    const signal = url.searchParams.get('signal') ?? ''
    if (!/^[A-Za-z0-9_-]{43}$/.test(key) || !validSignal(signal)) return undefined
    return { key, signal }
  } catch { return undefined }
}
export const validSignal = (signal: string): boolean => signal === SIGNAL || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(signal)
export function requestOf(text: string): RemoteRequest {
  const value: unknown = parseRemote(text)
  if (value === null || typeof value !== 'object' || !('type' in value)) throw new Error('Invalid remote request.')
  if (value.type === 'hello' && 'protocol' in value && typeof value.protocol === 'number' && 'publicKey' in value && typeof value.publicKey === 'string' && value.publicKey.length < 512 && 'name' in value && typeof value.name === 'string' && value.name.length <= 80 && 'nonce' in value && typeof value.nonce === 'string' && value.nonce.length <= 128 && 'proof' in value && typeof value.proof === 'string' && value.proof.length <= 256) return { type: 'hello', protocol: value.protocol, publicKey: value.publicKey, name: value.name, nonce: value.nonce, proof: value.proof }
  if (!('id' in value) || !Number.isSafeInteger(value.id) || typeof value.id !== 'number') throw new Error('Invalid request ID.')
  if (value.type === 'snapshot') return { type: 'snapshot', id: value.id }
  if (value.type === 'core-call' && 'call' in value && value.call !== null && typeof value.call === 'object' && 'method' in value.call && typeof value.call.method === 'string' && 'args' in value.call && Array.isArray(value.call.args)) return { type: 'core-call', id: value.id, call: value.call as RemoteCall }
  if (value.type === 'history' && 'session' in value && typeof value.session === 'string' && value.session.length < 2048 && 'before' in value && typeof value.before === 'number' && Number.isSafeInteger(value.before) && value.before >= 0) return { type: 'history', id: value.id, session: value.session, before: value.before }
  throw new Error('Remote operation denied.')
}
