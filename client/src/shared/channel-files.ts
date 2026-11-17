import type { SessionImage, SessionMessage } from './api'
import type { ManagerReplyOrigin } from './manager'

export class AttachmentFailure extends Error {}

export const ATTACHMENT_LIMIT = 20 * 1024 * 1024
export const ATTACHMENT_CACHE_FILES = 256
export const ATTACHMENT_CACHE_LIMIT = 200 * 1024 * 1024
export const ATTACHMENT_RETENTION = 24 * 60 * 60_000

export type ChannelAttachment = Pick<SessionImage, 'media'> & {
  readonly id: string
  readonly name: string
  readonly size: number
  readonly created: number
  readonly image: boolean
  readonly scope?: string
}

export type FileRoute = (bytes: Buffer, name: string, media: string, caption: string, as: 'photo' | 'document', origin: ManagerReplyOrigin, beforeSend?: () => Promise<void>) => Promise<number>

export type AttachmentInput = Pick<SessionMessage, 'images' | 'text'>

export const attachmentFilename = (name: string): string => [...name.normalize('NFKC')].map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character).join('').replace(/[\\/<>:"|?*]/g, '_').replace(/^\.+/, '_').slice(0, 120).replace(/[. ]+$/, '').replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/i, '_$1').trim() || 'attachment'

export function attachmentImage(bytes: Buffer): SessionImage['media'] | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

