import type { SessionState } from '../shared/api'
import type { ManagerView } from '../shared/manager'

export function telegramText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift()
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop()
  const kept: string[] = []
  let fence: string | undefined
  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
    }
    if (fence === undefined && line.trim() === '' && kept.at(-1)?.trim() === '') continue
    kept.push(line)
  }
  return kept.join('\n')
}

const STANDS: Record<ManagerView['state'], string> = { off: 'off', idle: 'ready', working: 'working', paused: 'paused', blocked: 'unavailable' }
const WORKER: Record<SessionState, string> = { working: 'working', asks: 'needs an answer', unread: 'has news', idle: 'idle', limit: 'at its limit', failed: 'failed' }
const SHOWN = 8

/** What /status answers: where Manager stands, what its workers are doing, and what waits for Alex. */
export function managerTelegramStatus(view: ManagerView): string {
  const lines = [`**Manager** - ${STANDS[view.state]}`, '']
  if (view.workers.length === 0) lines.push('No workers running.')
  else {
    lines.push(`**Workers** (${String(view.workers.length)})`)
    for (const worker of view.workers.slice(0, SHOWN)) lines.push(`- ${worker.title} - ${WORKER[worker.state]}`)
    if (view.workers.length > SHOWN) lines.push(`- and ${String(view.workers.length - SHOWN)} more`)
  }
  if (view.decisions.length > 0) lines.push('', `**Waiting for your answer:** ${String(view.decisions.length)}`)
  if (view.queued > 0) lines.push('', `Queued instructions: ${String(view.queued)}`)
  if (view.error !== undefined) lines.push('', ...view.error.split('\n').map((one) => `> ${one}`))
  return lines.join('\n')
}
