const b64url = (bytes: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const unb64url = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (one) => one.charCodeAt(0))

export interface SealedValue { readonly epk: string; readonly iv: string; readonly data: string }

/** The first 16 bytes of SHA-256 over the broker's raw public key, carried in the link so the relay cannot swap the key. */
export async function keyHashOf(publicKey: string): Promise<string> {
  return b64url((await crypto.subtle.digest('SHA-256', unb64url(publicKey))).slice(0, 16))
}

async function aesKey(privateKey: CryptoKey, publicKey: CryptoKey, info: string): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** Seals a value for a P-256 public key: ephemeral ECDH, HKDF-SHA256 with an empty salt, AES-256-GCM. */
export async function sealFor(publicKey: string, value: string, info: string): Promise<SealedValue> {
  const recipient = await crypto.subtle.importKey('raw', unb64url(publicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const key = await aesKey(pair.privateKey, recipient, info)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value))
  return { epk: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)), iv: b64url(iv), data: b64url(data) }
}

/** A key pair for receiving one sealed value; the private half stays in memory. */
export async function receiver(): Promise<{ readonly publicKey: string; readonly open: (sealed: SealedValue, info: string) => Promise<string> }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  return {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    open: async (sealed, info) => {
      const sender = await crypto.subtle.importKey('raw', unb64url(sealed.epk), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      const key = await aesKey(pair.privateKey, sender, info)
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(sealed.iv) }, key, unb64url(sealed.data)))
    },
  }
}
