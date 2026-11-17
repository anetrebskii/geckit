import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ChannelAttachments } from '../src/main/channel-attachments'
import type { ChannelVault } from '../src/main/channels/channels'
import type { ChannelSealed } from '../src/main/channels/channel-api'
import type { TelegramFiles } from '../src/main/telegram'

/** What the channel context gives Telegram as `sealed`, kept in one file so tests can read what was written. */
export function sealedAt(directory: string, vault: ChannelVault): ChannelSealed {
  const path = join(directory, 'manager-telegram.sealed')
  return {
    available: () => vault.available(),
    read: () => existsSync(path) ? vault.decrypt(readFileSync(path)) : undefined,
    write: (text) => {
      if (text === undefined) { rmSync(path, { force: true }); return }
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      writeFileSync(`${path}.new`, vault.encrypt(text), { mode: 0o600 })
      renameSync(`${path}.new`, path)
    },
  }
}

/** What the channel context gives Telegram as `files`, bound to one scope, with the files it holds. */
export function filesIn(attachments: ChannelAttachments, scope: () => string | undefined = () => undefined): TelegramFiles & { held: readonly string[] } {
  const files = {
    held: [] as readonly string[],
    keep: (bytes: Buffer, name: string, media: string) => attachments.put(bytes, name, media, scope()).id,
    has: (id: string) => { try { attachments.read(id, scope()); return true } catch { return false } },
    hold: (ids: readonly string[]) => { files.held = ids; attachments.pin('channel:telegram', ids) },
  }
  return files
}
