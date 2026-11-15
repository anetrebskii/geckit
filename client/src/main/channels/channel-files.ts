import type { ChannelId } from '../../shared/channels'
import type { FileRoute } from '../../shared/channel-files'
import { ATTACHMENT_LIMIT } from '../../shared/channel-files'

export interface ChannelFileReceipt {
  readonly channel: ChannelId
  readonly destination: string
  readonly messageId?: string
  readonly fileId: string
}

export type ChannelFileSender = (...args: Parameters<FileRoute>) => Promise<ChannelFileReceipt>

export async function channelDownload(fetcher: typeof fetch, url: string, trusted: (url: URL) => boolean, size?: number, token?: string): Promise<Buffer> {
  let address: URL
  try { address = new URL(url) } catch { throw new Error('The bot returned an invalid attachment location.') }
  if (address.protocol !== 'https:' || address.username !== '' || address.password !== '' || address.port !== '' || !trusted(address)) throw new Error('The bot returned an untrusted attachment location.')
  if (size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > ATTACHMENT_LIMIT)) throw new Error('Attachments must be between 1 byte and 20 MiB.')
  try {
    const response = await fetcher(address, { redirect: 'error', signal: AbortSignal.timeout(30_000), ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }) })
    if (!response.ok || response.body === null) throw new Error('Rejected')
    const length = response.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > ATTACHMENT_LIMIT)) { await response.body.cancel(); throw new Error('Too large') }
    const reader = response.body.getReader()
    const parts: Buffer[] = []
    let total = 0
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > ATTACHMENT_LIMIT) { await reader.cancel(); throw new Error('Too large') }
      parts.push(Buffer.from(part.value))
    }
    if (total === 0 || size !== undefined && size !== total || length !== null && Number(length) !== total) throw new Error('Truncated')
    return Buffer.concat(parts, total)
  } catch { throw new Error('Attachment download failed, was incomplete or exceeded 20 MiB. Check bot access and resend.') }
}
