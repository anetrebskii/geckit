import type { SessionItem } from '../../shared/api'
import type { CodexItem, Json } from './codex-protocol'
import { claudeLine, firstLine } from './wording'

type Reply = Extract<CodexItem, { type: 'agentMessage' }>
type Step = Extract<SessionItem, { kind: 'did' }>
type Input = Exclude<Extract<Json, object>, Json[]>

const RECORD = /^[ \t]*(`{3,}|~{3,})[^\r\n]*$|^[ \t]*\[external_agent_tool_call: ([^\]\r\n]+)\]\r?\n([\s\S]*?)\r?\n\[\/external_agent_tool_call\][ \t]*$|^[ \t]*\[external_agent_tool_result\]\r?\n([\s\S]*?)\r?\n\[\/external_agent_tool_result\][ \t]*$|^[ \t]*<EXTERNAL SESSION IMPORTED>[ \t]*$/gm

function object(value: Json | undefined): Input {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function inputOf(body: string): Input {
  const json = /^input: ([\s\S]*)$/m.exec(body)?.[1]
  if (json !== undefined) {
    try {
      return object(JSON.parse(json) as Json)
    } catch {
      return {}
    }
  }
  const field = (name: string): string => new RegExp(`^${name}: (.*)$`, 'm').exec(body)?.[1] ?? ''
  return { file_path: field('file'), command: field('command'), description: field('description') }
}

function questionDetail(input: ReturnType<typeof inputOf>): string {
  if (!Array.isArray(input['questions'])) return ''
  return input['questions'].flatMap((raw) => {
    const question = object(raw)
    if (typeof question['question'] !== 'string') return []
    const options = Array.isArray(question['options']) ? question['options'] : []
    return [[question['question'], ...options.flatMap((rawOption) => {
      const option = object(rawOption)
      return typeof option['label'] === 'string'
        ? [`- ${option['label']}${typeof option['description'] === 'string' && option['description'] !== '' ? `: ${option['description']}` : ''}`]
        : []
    })].join('\n')]
  }).join('\n\n')
}

export function importedReply(item: Reply, root: string): SessionItem[] {
  const original: Extract<SessionItem, { kind: 'theirs' }> = { kind: 'theirs', id: `codex:${item.id}`, text: item.text, ...(item.phase == null ? {} : { phase: item.phase }) }
  if (!item.text.includes('[external_agent_tool_') && !item.text.includes('<EXTERNAL SESSION IMPORTED>')) return [original]
  const items: SessionItem[] = []
  let from = 0
  let fence: string | undefined
  const prose = (end: number): void => {
    const text = item.text.slice(from, end).trim()
    if (text !== '') items.push({ kind: 'theirs', id: `codex:${item.id}:prose:${String(from)}`, text, ...(item.phase == null ? {} : { phase: item.phase }) })
  }
  for (const match of item.text.matchAll(RECORD)) {
    const marker = match[1]
    if (marker !== undefined) {
      if (fence === undefined) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length && match[0].trim() === marker) fence = undefined
      continue
    }
    if (fence !== undefined) continue
    if (match[3] !== undefined && /^\[external_agent_tool_call:/m.test(match[3])) continue
    prose(match.index)
    from = match.index + match[0].length
    const tool = match[2]
    const body = match[3]
    const result = match[4]
    const id = `codex:${item.id}:imported:${String(match.index)}`
    if (tool !== undefined && body !== undefined) {
      const input = inputOf(body)
      const questions = tool === 'AskUserQuestion' ? questionDetail(input) : ''
      const what = tool === 'AskUserQuestion'
        ? questions === '' ? 'Asked you a question' : `Asked: ${firstLine(questions)}`
        : claudeLine(tool, input, root)?.done ?? `Used ${tool}`
      items.push({ kind: 'did', id: `${id}:call`, what, detail: questions || body })
    } else if (result !== undefined) {
      items.push({ kind: 'did', id: `${id}:result`, what: 'Imported tool result', detail: result })
    }
  }
  if (from === 0) return [original]
  prose(item.text.length)
  return items
}

export function pairImportedResults(items: readonly SessionItem[]): SessionItem[] {
  const paired: SessionItem[] = []
  for (const item of items) {
    const before = paired.at(-1)
    if (item.kind === 'did' && item.id.endsWith(':result') && item.id.includes(':imported:') && before?.kind === 'did' && before.id.endsWith(':call') && before.id.includes(':imported:')) {
      const call: Step = { ...before, detail: `${before.detail ?? ''}\n\n${item.detail ?? ''}` }
      paired[paired.length - 1] = call
    } else paired.push(item)
  }
  return paired
}
