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
const GITLAB = /https?:\/\/[^\s/<>"'`]+\/[\w./-]+\/-\/(merge_requests|issues)\/(\d+)(?![\w-])/

/** The first tracker link in a message. */
export function workItem(text: string): WorkItem | undefined {
  return workItemsInText(text)[0]
}

/** Canonical tracker URLs: original subject first, related items in last-mention order. */
export function workItemsInText(text: string): WorkItem[] {
  const matches = [GITHUB, LINEAR, JIRA, GITLAB]
    .flatMap((pattern) => [...text.matchAll(new RegExp(pattern.source, 'g'))])
    .sort((one, other) => one.index - other.index)
  const found = new Map<string, WorkItem>()
  for (const match of matches) {
    const [url, first = '', repo, kind, number] = match
    const repeated = found.get(url)
    if (repeated !== undefined) {
      if (url !== found.keys().next().value) {
        found.delete(url)
        found.set(url, repeated)
      }
      continue
    }
    if (number !== undefined) {
      found.set(url, { label: `#${number}`, url, says: `${first}/${repo ?? ''} ${kind === 'pull' ? 'pull request' : 'issue'} ${number}` })
    } else if (first === 'merge_requests' || first === 'issues') {
      let destination: URL
      try { destination = new URL(url) } catch { continue }
      if (destination.username || destination.password) continue
      const path = destination.pathname.split('/-/')[0]?.slice(1) ?? ''
      found.set(url, { label: `${first === 'merge_requests' ? '!' : '#'}${repo ?? ''}`, url, says: `${destination.host}/${path} ${first === 'merge_requests' ? 'merge request' : 'issue'} ${repo ?? ''}` })
    } else found.set(url, { label: first, url, says: first })
  }
  return [...found.values()]
}
