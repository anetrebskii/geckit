import type { RemoteIdentity, RemoteTrust } from './protocol'
const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)
const encoded = (raw: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(raw)))
const decoded = (raw: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(raw), (one) => one.charCodeAt(0))
export async function identity(): Promise<RemoteIdentity> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return { publicKey: encoded(await crypto.subtle.exportKey('spki', pair.publicKey)), privateKey: encoded(await crypto.subtle.exportKey('pkcs8', pair.privateKey)) }
}
export async function sign(key: RemoteIdentity, text: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey('pkcs8', decoded(key.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return encoded(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes(text)))
}
export async function verify(publicKey: string, text: string, proof: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('spki', decoded(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, decoded(proof), bytes(text))
  } catch { return false }
}
export const transcript = (server: string, challenge: string, client: string, nonce: string, binding: string): string => JSON.stringify(['geckit-observe', 2, server, challenge, client, nonce, binding])
export async function phraseOf(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(text)))].slice(0, 6).map((one) => one.toString(16).padStart(2, '0')).join('-')
}

export const trustProof = (text: string, trust: RemoteTrust): string => JSON.stringify(['geckit trust', text, trust])
export async function transportBinding(offer: string, answer: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(JSON.stringify([offer, answer]))))].map((one) => one.toString(16).padStart(2, '0')).join('') }
