export type PlaceId = 'tasks' | 'manager' | 'questions' | 'team' | 'shortcuts' | 'checklists' | 'browsers' | 'secrets' | 'settings'

/** A place the Chat window shows: one of the sidebar's items. */
export type Place = PlaceId

export interface PlaceItem {
  readonly id: PlaceId
  readonly name: string
  readonly icon: string
}

/** The sidebar's first group, with no header. */
export const WORK_PLACES: readonly PlaceItem[] = [
  { id: 'tasks', name: 'Tasks', icon: 'board' },
  { id: 'manager', name: 'Manager', icon: 'manager' },
  { id: 'questions', name: 'Questions', icon: 'chat' },
]

/** The sidebar's second group, under "Workspace". */
export const WORKSPACE_PLACES: readonly PlaceItem[] = [
  { id: 'team', name: 'Team', icon: 'team' },
  { id: 'shortcuts', name: 'Shortcuts', icon: 'bolt' },
  { id: 'checklists', name: 'Checklists', icon: 'checklist' },
  { id: 'browsers', name: 'Browsers', icon: 'globe' },
  { id: 'secrets', name: 'Secrets', icon: 'key' },
]

const PLACE_IDS: readonly string[] = [...WORK_PLACES, ...WORKSPACE_PLACES].map((one) => one.id).concat('settings')

/** Below this width the sidebar folds to its icons: the expanded sidebar (200), the list's sidebar at its default (264) and a conversation at its narrowest (420). */
export const NAMES_FOLD = 884

/** The place kept in the settings, or Tasks when it is no longer one, such as a name a later version dropped. */
export function keptPlace(kept: string): Place {
  return PLACE_IDS.includes(kept) ? (kept as PlaceId) : 'tasks'
}

/** The names show on a wide enough window, unless the person hid them. */
export const namesShown = (width: number, navNames: boolean): boolean => navNames && width >= NAMES_FOLD

/** The count beside Tasks, held to two digits. */
export const waitingCount = (count: number): string => (count > 99 ? '99+' : String(count))

export const waitingSaid = (count: number): string => `${String(count)} ${count === 1 ? 'conversation' : 'conversations'} waiting for you`

export interface KeyLike {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

/** The sidebar's own key: Cmd+Ctrl+S on macOS, Ctrl+Alt+S elsewhere, which shows or hides the names. */
export function togglesNames(event: KeyLike, mac: boolean): boolean {
  if (event.key.toLowerCase() !== 's' || event.shiftKey) return false
  return mac ? event.metaKey && event.ctrlKey && !event.altKey : event.ctrlKey && event.altKey && !event.metaKey
}

/** The dot on the phone's menu button: what the closed menu would show, a conversation waiting before an unread answer. */
export function menuDot(place: Place, waiting: boolean, unread: boolean): 'asks' | 'unread' | undefined {
  if (waiting && place !== 'tasks') return 'asks'
  if (unread && place !== 'questions') return 'unread'
  return undefined
}

export const menuSaid = (dot: 'asks' | 'unread' | undefined): string =>
  dot === 'asks' ? 'Menu, a conversation is waiting for you' : dot === 'unread' ? 'Menu, a question has an answer' : 'Menu'

/** A computer's two letters in the folded sidebar: the first letters of its first two words, or its first two letters. */
export function monogram(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((one) => one !== '')
  const letters = words.length > 1 ? (words[0] ?? '').charAt(0) + (words[1] ?? '').charAt(0) : (words[0] ?? name).slice(0, 2)
  return letters.toUpperCase()
}
