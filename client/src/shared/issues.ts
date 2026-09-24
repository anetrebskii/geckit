/** A sentence cut where an issue number stands, so each piece can be drawn on its own. */
export interface Said {
  readonly text: string
  readonly issue: boolean
}

/**
 * `#123` as Claude Code and GitHub write it: not `##`, not part of a word, and
 * not a colour, which is why it stops at six digits and wants nothing but
 * digits.
 */
const NUMBER = /(?<![\w#])#\d{1,6}\b/g

export function issuesIn(text: string): Said[] {
  const parts: Said[] = []
  let at = 0
  for (const found of text.matchAll(NUMBER)) {
    if (found.index > at) parts.push({ text: text.slice(at, found.index), issue: false })
    parts.push({ text: found[0], issue: true })
    at = found.index + found[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at), issue: false })
  return parts
}
