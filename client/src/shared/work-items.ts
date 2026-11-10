import type { SessionItem, WorkItem } from './api'
import { workItemsInText } from './links'

/** The first subject stays visible beside the most recently mentioned related item. */
export function visibleWork(items: readonly WorkItem[]): readonly WorkItem[] {
  const first = items[0]
  const last = items.findLast((one) => one.url !== first?.url)
  return first === undefined ? [] : last === undefined ? [first] : [first, last]
}

export function sameWork(one: readonly WorkItem[], other: readonly WorkItem[]): boolean {
  return one.length === other.length && one.every((item, at) => item.url === other[at]?.url && item.label === other[at]?.label && item.says === other[at]?.says)
}

/** Index only changed messages; listing the board never scans a transcript. */
export class ConversationItems extends Map<string, SessionItem> {
  readonly #links = new Map<string, readonly WorkItem[]>()
  #shown: readonly WorkItem[] = []
  #dirty = false
  /** Keep listed/saved links until a complete transcript can replace them. */
  #fallback: readonly WorkItem[]

  constructor(entries: Iterable<readonly [string, SessionItem]> = [], fallback: readonly WorkItem[] = []) {
    super()
    this.#fallback = fallback
    this.#shown = visibleWork(fallback)
    for (const [id, item] of entries) this.set(id, item)
  }

  override set(id: string, item: SessionItem): this {
    const before = this.get(id)
    super.set(id, item)
    if ((item.kind === 'mine' && item.unsent !== true) || item.kind === 'theirs') {
      if (before?.kind === item.kind && before.text === item.text && (before.kind !== 'mine' || before.unsent !== true)) return this
      const links = workItemsInText(item.text)
      const changed = !sameWork(this.#links.get(id) ?? [], links)
      this.#links.set(id, links)
      if (changed) this.#dirty = true
    } else if (this.#links.delete(id)) this.#dirty = true
    return this
  }

  override delete(id: string): boolean {
    if (this.#links.delete(id)) this.#dirty = true
    return super.delete(id)
  }

  override clear(): void {
    super.clear()
    this.#links.clear()
    this.#shown = []
    this.#fallback = []
    this.#dirty = false
  }

  get workItems(): readonly WorkItem[] {
    if (this.#dirty) {
      const next = visibleWork([...this.#fallback, ...this.#links.values()].flat())
      if (!sameWork(this.#shown, next)) this.#shown = next
      this.#dirty = false
    }
    return this.#shown
  }
}
