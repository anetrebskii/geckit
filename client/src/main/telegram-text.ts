import type { ManagerView } from '../shared/manager'
import { say } from './manager-voice'
import type { Speech } from './manager-voice'

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

const SHOWN = 8

/** What /status answers, in the person's language: where Manager stands, what its workers are doing, and what waits for Alex. */
export function managerTelegramStatus(view: ManagerView, speech?: Speech): string {
  const words = say(speech)
  const lines = [words.stands[view.state], '']
  if (view.workers.length === 0) lines.push(words.noWorkers)
  else {
    lines.push(`**${words.workers}** (${String(view.workers.length)})`)
    for (const worker of view.workers.slice(0, SHOWN)) lines.push(`- ${worker.title} - ${words.workerState[worker.state]}`)
    if (view.workers.length > SHOWN) lines.push(`- ${words.more(view.workers.length - SHOWN)}`)
  }
  if (view.decisions.length > 0) lines.push('', `**${words.waiting}:** ${String(view.decisions.length)}`)
  if (view.queued > 0) lines.push('', `${words.queued}: ${String(view.queued)}`)
  if (view.error !== undefined) lines.push('', ...view.error.split('\n').map((one) => `> ${one}`))
  return lines.join('\n')
}
