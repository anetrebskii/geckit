/**
 * Connections a card is up for right now, so a command's own timeout does not
 * cut a person off mid-type: `runOn` reads this before it would give up on
 * its own ssh and, where a prompt is waiting on that very connection, tries
 * again rather than killing it under someone typing a password into a card.
 *
 * Kept by connection id, not by host: two connections to the same host each
 * wait only on their own question, so one that never asked anything is never
 * extended for a card it has nothing to do with.
 */

const asking = new Set<string>()

export function setAsking(conn: string, is: boolean): void {
  if (is) asking.add(conn)
  else asking.delete(conn)
}

export function isAsking(conn: string): boolean {
  return asking.has(conn)
}
