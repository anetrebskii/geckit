/** View Channels, Send Messages, Read Message History, Create Public Threads and Send Messages in Threads: what the bot needs to answer in a thread of its own. */
export const DISCORD_INVITE_PERMISSIONS = String((1n << 10n) | (1n << 11n) | (1n << 16n) | (1n << 35n) | (1n << 38n))

export const DISCORD_PORTAL = 'https://discord.com/developers/applications'

export interface DiscordInspect {
  /** IDs typed in Settings and not saved yet, to show who they are. */
  readonly people?: readonly string[]
  /** A token pasted in Set up, checked before it is saved and never stored by the check. */
  readonly token?: string
}

export interface DiscordChannelChoice {
  readonly id: string
  readonly name: string
  readonly kind: 'text' | 'announcement' | 'forum'
}

export interface DiscordServer {
  readonly id: string
  readonly name: string
  readonly icon?: string
  /** The bot may not list this server's channels. */
  readonly unreadable?: true
  readonly channels: readonly DiscordChannelChoice[]
}

export type DiscordPerson =
  | { readonly id: string; readonly found: true; readonly name: string; readonly handle?: string; readonly avatar?: string; readonly bot?: true }
  | { readonly id: string; readonly found: false }

export type DiscordSetupView =
  | { readonly token: 'missing' | 'refused' }
  | {
    readonly token: 'ok'
    readonly bot: { readonly id: string; readonly name: string; readonly avatar?: string }
    readonly application: string
    readonly invite: string
    /** Message Content Intent is on for the bot in the Developer Portal. */
    readonly messageContent: boolean
    readonly servers: readonly DiscordServer[]
    readonly people: readonly DiscordPerson[]
  }

export const discordId = (text: string): string | undefined => {
  const trimmed = text.trim().replace(/^<@!?(\d+)>$/, '$1')
  return /^\d{15,22}$/.test(trimmed) ? trimmed : undefined
}
