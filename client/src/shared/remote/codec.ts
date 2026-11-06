import type { RemoteRequest, RemoteResponse } from './protocol'

type WireValue = object | string | number | boolean | null | undefined
interface BytesEnvelope { readonly $geckitBytes: string; readonly kind: 'bytes' | 'buffer' }

function bytesOf(value: WireValue): BytesEnvelope | undefined {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : undefined
  if (bytes === undefined) return undefined
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return { $geckitBytes: btoa(binary), kind: value instanceof ArrayBuffer ? 'buffer' : 'bytes' }
}

export function stringifyRemote(value: RemoteRequest | RemoteResponse): string {
  return JSON.stringify(value, (_key: string, item: WireValue): WireValue => {
    if (item === undefined) return { $geckitUndefined: true }
    if (item !== null && typeof item === 'object' && 'type' in item && item.type === 'Buffer' && 'data' in item && Array.isArray(item.data) && item.data.every((byte: number) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return bytesOf(new Uint8Array(item.data))
    return bytesOf(item) ?? item
  })
}

export function parseRemote(raw: string): RemoteRequest | RemoteResponse {
  return JSON.parse(raw, (_key: string, item: WireValue): WireValue => {
    if (item !== null && typeof item === 'object' && '$geckitUndefined' in item && item.$geckitUndefined === true && Object.keys(item).length === 1) return undefined
    if (item === null || typeof item !== 'object' || !('$geckitBytes' in item) || typeof item.$geckitBytes !== 'string' || !('kind' in item) || (item.kind !== 'bytes' && item.kind !== 'buffer') || Object.keys(item).length !== 2) return item
    const bytes = Uint8Array.from(atob(item.$geckitBytes), (character) => character.charCodeAt(0))
    return item.kind === 'buffer' ? bytes.buffer : bytes
  }) as RemoteRequest | RemoteResponse
}
