import type { ChannelId } from '../../shared/channels'
import type { TelegramFileSender } from '../telegram-attachments'
import { TELEGRAM_DOWNLOAD_LIMIT } from '../telegram-attachments'

export interface ChannelFileReceipt {
  readonly channel: ChannelId
  readonly destination: string
  readonly messageId?: string
  readonly fileId: string
}

export type ChannelFileSender = (...args: Parameters<TelegramFileSender>) => Promise<ChannelFileReceipt>

export async function channelDownload(fetcher: typeof fetch, url: string, trusted: (url: URL) => boolean, size?: number, token?: string): Promise<Buffer> {
  let address: URL
  try { address = new URL(url) } catch { throw new Error('The bot returned an invalid attachment location.') }
  if (address.protocol !== 'https:' || address.username !== '' || address.password !== '' || address.port !== '' || !trusted(address)) throw new Error('The bot returned an untrusted attachment location.')
  if (size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > TELEGRAM_DOWNLOAD_LIMIT)) throw new Error('Attachments must be between 1 byte and 20 MiB.')
  try {
    const response = await fetcher(address, { redirect: 'error', signal: AbortSignal.timeout(30_000), ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }) })
    if (!response.ok || response.body === null) throw new Error('Rejected')
    const length = response.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > TELEGRAM_DOWNLOAD_LIMIT)) { await response.body.cancel(); throw new Error('Too large') }
    const reader = response.body.getReader()
    const parts: Buffer[] = []
    let total = 0
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > TELEGRAM_DOWNLOAD_LIMIT) { await reader.cancel(); throw new Error('Too large') }
      parts.push(Buffer.from(part.value))
    }
    if (total === 0 || size !== undefined && size !== total || length !== null && Number(length) !== total) throw new Error('Truncated')
    return Buffer.concat(parts, total)
  } catch { throw new Error('Attachment download failed, was incomplete or exceeded 20 MiB. Check bot access and resend.') }
}
