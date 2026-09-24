/** The Taptic Engine, when the app on the phone lends it; nothing anywhere else. */
export type Tap = 'light' | 'firm' | 'warning' | 'done'

export const tap = (kind: Tap): void => (window as { geckitTap?: (kind: Tap) => void }).geckitTap?.(kind)
