/** The conversation this window was opened for on its own, without the board; undefined in Chat itself. */
export const SOLO: string | undefined = typeof window === 'undefined' ? undefined : new URLSearchParams(window.location?.search).get('conversation') ?? undefined

/** Whether conversations here can have windows of their own: only This computer's, in the desktop Chat window, and only once the preload can open one. */
export const popsOut = (): boolean =>
  SOLO === undefined &&
  'popOut' in window.geckit.chat &&
  !document.documentElement.classList.contains('remote-workspace-page') &&
  !document.documentElement.classList.contains('phone')
