import { sep } from 'node:path'

import { isSite, shareLink, shareMentions } from '../../shared/share'
import type { ShareMention } from '../../shared/share'
import type { Shares } from '../shares'

/** Whether a message names anything that could become a link, so one that names nothing goes out at once, in its order. */
export const namesLocal = (text: string, shares: unknown): boolean => shares !== undefined && shareMentions(text).length > 0

/** The words a message uses for a localhost address, a file or a folder become the link to it; what cannot be shared is left as written, in silence. `within`, when given, keeps files and folders to those roots. */
export async function linkLocal(text: string, shares: Pick<Shares, 'open'> | undefined, link: (words: string, url: string) => string, within?: readonly string[]): Promise<string> {
  if (shares === undefined) return text
  const made: { readonly mention: ShareMention; readonly url: string }[] = []
  for (const mention of shareMentions(text)) {
    if (within !== undefined && !isSite(mention.target) && !within.some((root) => mention.target === root || mention.target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`))) continue
    const opened = await shares.open(mention.target).catch(() => undefined)
    if (opened === undefined || 'why' in opened) continue
    made.push({ mention, url: shareLink(opened.key, opened.expiresAt) })
  }
  let out = text
  for (const { mention, url } of made.reverse()) {
    const words = text.slice(mention.at, mention.at + mention.length).replace(/^`|`$/g, '')
    out = `${out.slice(0, mention.at)}${link(words, url)}${out.slice(mention.at + mention.length)}`
  }
  return out
}
