/**
 * Hosts a card is up for right now, so a command's own timeout does not cut a
 * person off mid-type: `runOn` reads this before it would give up on a host
 * and, where a prompt is waiting on that host, tries again rather than
 * killing the connection under someone typing a password into a card.
 */

const asking = new Set<string>()

export function setAsking(id: string, is: boolean): void {
  if (is) asking.add(id)
  else asking.delete(id)
}

export function isAsking(id: string): boolean {
  return asking.has(id)
}
