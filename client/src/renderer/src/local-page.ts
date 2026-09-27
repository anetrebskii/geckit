/**
 * A page off the Mac's localhost in a view of its own, when the app on the
 * phone lends one; nothing anywhere else. `note` says where a port that moved
 * landed, for a link that was carried here from a host's own localhost.
 */
export const showLocal = (): ((url: string, note?: string) => void) | undefined =>
  (window as { geckitLocal?: (url: string, note?: string) => void }).geckitLocal
