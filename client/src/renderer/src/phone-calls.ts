import type { Answered, Folders, Recording } from '../../shared/api'
import type { LocalAnswer, LocalAsk } from '../../shared/local'

/** What only the phone asks the Mac for, beside `window.geckit`; nothing on the Mac itself. */
export interface PhoneCalls {
  readonly connected: () => boolean
  readonly onConnection: (said: (connected: boolean) => void) => () => void
  /** The words said, read as orders on the Mac and waiting there for `doOrders`. */
  readonly readOrders: (said: string) => Promise<Answered>
  /** The yes; a conversation an order opens comes back to be opened on the phone. */
  readonly doOrders: () => Promise<Answered & { readonly open?: string }>
  readonly folders: (path?: string) => Promise<Folders>
  readonly version: () => Promise<string>
  /** What was asked first in a conversation, for a shortcut made from it, without opening it. */
  readonly firstAsked: (id: string) => Promise<string>
  /** A new video file on the Mac, by its extension; answers where. */
  readonly startVideo: (ext: string) => Promise<string>
  readonly videoPart: (base64: string) => Promise<void>
  readonly keepVideo: () => void
  readonly dropVideo: () => void
  /** A recording read on the phone, handed to the New task form that is open, as the Mac's capsule hands one. */
  readonly recorded: (recording: Recording) => void
  /** A request from a page off the Mac's localhost, made there. */
  readonly localFetch: (asked: LocalAsk) => Promise<LocalAnswer>
  /** A `localhost` link opened on the phone, in a conversation on a host: carried to this computer, and opened at the port it landed on; or why it could not be. */
  readonly forwardLink: (root: string, href: string) => Promise<{ readonly href: string; readonly moved?: string; readonly problem?: string }>
  /** Where Apple reaches this phone, kept on the Mac to push to while the app is not open. */
  readonly pushToken: (token: string) => void
  /** Sent to the background, or back: while away, what happens comes as a push. */
  readonly away: (on: boolean) => void
}

export const phoneCalls = (): PhoneCalls | undefined => (window as { geckitPhone?: PhoneCalls }).geckitPhone

/** What the phone keeps for itself rather than the Mac: how it looks, which projects it shows, and what it sends. */
export const OWN = ['theme', 'profile', 'chatProjects', 'chatAll', 'analytics', 'analyticsAsked', 'sendErrors', 'client'] as const
