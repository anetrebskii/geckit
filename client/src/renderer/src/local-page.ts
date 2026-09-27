/** A page off the Mac's localhost in a view of its own, when the app on the phone lends one; nothing anywhere else. */
export const showLocal = (): ((url: string) => void) | undefined => (window as { geckitLocal?: (url: string) => void }).geckitLocal
