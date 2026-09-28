import type { Lineup } from '../../../shared/api'

/** "3 of 3 working. This waits until one of them stops.", where a message would wait for a slot. */
export function queueWhy(lineup: Lineup): string {
  return `${String(lineup.working)} of ${String(lineup.limit)} working. This waits until one of them stops.`
}
