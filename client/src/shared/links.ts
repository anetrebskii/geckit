import type { SessionItem, WorkItem } from './api'

export interface Link {
  readonly url: string
  /** What the Markdown link said, where it said something other than the address. */
  readonly text?: string
}

const NAMED = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g
const BARE = /https?:\/\/[^\s<>"'`)\]]+/g
const TRAILING = /[.,;:!?]+$/

/** The web links the person or Claude wrote, the newest first and each once, without what tools printed. */
export function linksIn(items: readonly SessionItem[]): Link[] {
  return linksInText(items.flatMap((item) => (item.kind === 'mine' || item.kind === 'theirs' ? [item.text] : [])))
}

/** The same, from what was said as plain text, oldest first. */
export function linksInText(texts: readonly string[]): Link[] {
  const found = new Map<string, Link>()
  for (const said of [...texts].reverse()) {
    for (const [, text = '', url = ''] of said.matchAll(NAMED)) {
      const had = found.get(url)
      if (had === undefined || had.text === undefined) found.set(url, text === url ? { url } : { url, text })
    }
    for (const [bare] of said.matchAll(BARE)) {
      const url = bare.replace(TRAILING, '')
      if (!found.has(url)) found.set(url, { url })
    }
  }
  return [...found.values()]
}

/** An address as short as it can be said: no scheme, no `www.`, no slash at the end. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

const GITHUB = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/
const LINEAR = /https:\/\/linear\.app\/[\w-]+\/issue\/([A-Z][A-Z0-9]*-\d+)[^\s)>\]]*/
const JIRA = /https:\/\/[\w-]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]*-\d+)/

/** The first issue, pull request, Linear or Jira link in a message: what a conversation that begins with it is about. */
export function workItem(text: string): WorkItem | undefined {
  const found = [GITHUB, LINEAR, JIRA]
    .map((pattern) => pattern.exec(text))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((one, other) => one.index - other.index)[0]
  if (found === undefined) return undefined
  const [url, first = '', repo, kind, number] = found
  if (number !== undefined) {
    return { label: `#${number}`, url, says: `${first}/${repo ?? ''} ${kind === 'pull' ? 'pull request' : 'issue'} ${number}` }
  }
  return { label: first, url, says: first }
}
