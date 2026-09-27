import type { Answered, Folders, Recording } from '../../shared/api'

/** What only the phone asks the Mac for, beside `window.geckit`; nothing on the Mac itself. */
export interface PhoneCalls {
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
}

export const phoneCalls = (): PhoneCalls | undefined => (window as { geckitPhone?: PhoneCalls }).geckitPhone

/** What the phone keeps for itself rather than the Mac: how it looks and which projects it shows. */
export const OWN = ['theme', 'profile', 'chatProjects', 'chatAll'] as const
