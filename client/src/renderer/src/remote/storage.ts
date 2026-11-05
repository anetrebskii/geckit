import type { RemoteTrust } from '../../../shared/remote/protocol'
interface KeptDevice { readonly publicKey: string; readonly privateKey: CryptoKey; readonly wrapping: CryptoKey; readonly servers: readonly string[] }
const encode = (raw: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(raw)))
const decode = (raw: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(raw), (one) => one.charCodeAt(0))
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('geckit-remote-device', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('device')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Device storage unavailable.'))
  })
}
async function load(): Promise<KeptDevice | undefined> {
  const db = await database()
  try { return await new Promise((resolve, reject) => { const request = db.transaction('device').objectStore('device').get('identity'); request.onsuccess = () => resolve(request.result as KeptDevice | undefined); request.onerror = () => reject(request.error) }) }
  finally { db.close() }
}
async function save(value: KeptDevice): Promise<void> {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('device', 'readwrite'); tx.objectStore('device').put(value, 'identity'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
  finally { db.close() }
}
let opening: Promise<KeptDevice> | undefined
export const deviceIdentity = (): Promise<KeptDevice> => opening ??= (async () => {
  const previous = await load()
  if (previous !== undefined) return previous
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const device: KeptDevice = { publicKey: encode(await crypto.subtle.exportKey('spki', keys.publicKey)), privateKey: keys.privateKey, wrapping: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), servers: [] }
  await save(device)
  return device
})()
export async function savedServers(): Promise<RemoteTrust[]> {
  const device = await deviceIdentity()
  const found = await load() ?? device
  return Promise.all(found.servers.map(async (box) => {
    const raw = decode(box)
    const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, device.wrapping, raw.slice(12))
    return JSON.parse(new TextDecoder().decode(text)) as RemoteTrust
  }))
}
export async function rememberServer(trust: RemoteTrust): Promise<void> {
  const device = await deviceIdentity()
  const previous = await savedServers()
  const servers = [...previous.filter((one) => one.server.id !== trust.server.id), trust]
  await writeServers(device, servers)
}
async function writeServers(device: KeptDevice, servers: readonly RemoteTrust[]): Promise<void> {
  const boxes = await Promise.all(servers.map(async (one) => {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, device.wrapping, new TextEncoder().encode(JSON.stringify(one))))
    const raw = new Uint8Array(12 + encrypted.length); raw.set(iv); raw.set(encrypted, 12)
    return encode(raw.buffer)
  }))
  await save({ ...device, servers: boxes })
}
export const forgetServer = async (id: string): Promise<void> => writeServers(await deviceIdentity(), (await savedServers()).filter((one) => one.server.id !== id))
