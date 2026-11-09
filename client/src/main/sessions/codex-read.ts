import type { SessionImage, SessionItem } from '../../shared/api'
import type { CodexItem, CodexTurn, Json } from './codex-protocol'
import { importedReply, pairImportedResults } from './imported-read'
import { filesAmong } from './rule'

/** Strip image bytes from tool details while handing supported MCP images to the transcript. */
function toolResult(result: Json, budget: { left: number }): { detail: string; images: SessionImage[] } {
  const images: SessionImage[] = []
  let left = 8 * 1024 * 1024
  const detail = JSON.stringify(result, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    const block = value as Record<string, unknown>
    if (block['type'] !== 'image' || typeof block['data'] !== 'string') return value
    const media = block['mimeType']
    const data = block['data']
    if (typeof media === 'string' && /^image\/(png|jpeg|gif|webp)$/.test(media) && data.length <= Math.min(left, budget.left) && /^[a-z\d+/=\s]+$/i.test(data)) {
      images.push({ media, data })
      left -= data.length
      budget.left -= data.length
    }
    return { ...block, data: '[image]' }
  }, 2)
  return { detail, images }
}

export function codexItem(item: CodexItem, root: string, live = false, budget = { left: 24 * 1024 * 1024 }): SessionItem[] {
  const id = `codex:${item.id}`
  switch (item.type) {
    case 'userMessage': {
      const images = item.content.flatMap((input) => {
        if (input.type !== 'image') return []
        const parts = /^data:([^;]+);base64,([\s\S]+)$/.exec(input.url)
        return parts?.[1] === undefined || parts[2] === undefined ? [] : [{ media: parts[1], data: parts[2] }]
      })
      return [{ kind: 'mine', id, text: item.content.flatMap((input) => input.type === 'text' ? [input.text] : []).join('\n\n'), ...(images.length === 0 ? {} : { images }) }]
    }
    case 'agentMessage':
      return [{ kind: 'theirs', id, text: item.text, ...(item.phase == null ? {} : { phase: item.phase }) }]
    case 'plan':
      return [{ kind: 'theirs', id, text: item.text }]
    case 'reasoning':
      return [{ kind: 'thought', id, text: (item.summary.length > 0 ? item.summary : item.content).join('\n\n') }]
    case 'commandExecution':
      return [{ kind: 'did', id, what: `${live ? 'Running' : 'Ran'} ${item.command}`, detail: [item.command, item.aggregatedOutput, item.exitCode == null || item.exitCode === 0 ? undefined : `Exit code: ${String(item.exitCode)}`].filter((one) => one != null).join('\n\n'), ...(live ? { live: true } : {}) }]
    case 'fileChange': {
      const paths = filesAmong(root, item.changes.map((change) => change.path))
      return [{ kind: 'did', id, what: `${live ? 'Changing' : item.status === 'completed' ? 'Changed' : 'Could not change'} ${paths.join(', ') || item.changes.map((change) => change.path).join(', ')}`, detail: item.changes.map((change) => `${change.path}\n${change.diff}`).join('\n\n'), ...(live ? { live: true } : {}) }, ...(!live && item.status === 'completed' && paths.length > 0 ? [{ kind: 'wrote' as const, id: `${id}:wrote`, paths }] : [])]
    }
    case 'mcpToolCall': {
      const result = toolResult(item.result ?? item.arguments, budget)
      return [{ kind: 'did', id, what: `${live ? 'Using' : 'Used'} ${item.server}: ${item.tool}`, detail: item.error?.message ?? result.detail, ...(result.images.length === 0 ? {} : { images: result.images }), ...(live ? { live: true } : {}) }]
    }
    case 'webSearch':
      return [{ kind: 'did', id, what: `Searched ${item.query}` }]
    case 'contextCompaction':
      return live ? [] : [{ kind: 'note', id, note: 'summarised', text: 'Conversation summarised' }]
    default:
      return []
  }
}

export function codexHistory(turns: readonly CodexTurn[], root: string): SessionItem[] {
  const budget = { left: 24 * 1024 * 1024 }
  return turns.flatMap((turn) => pairImportedResults(turn.items.flatMap((item) =>
    (item.type === 'agentMessage' ? importedReply(item, root) : codexItem(item, root, false, budget))
      .map((one) => one.kind === 'mine' && turn.startedAt != null ? { ...one, at: turn.startedAt * 1000 } : one),
  )))
}
