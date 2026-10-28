// The real session list, read from disk the way the app reads it, written out
// for the phone stub to serve.
import { listClaude } from '../../client/src/main/sessions/disk'
import { readFileSync, writeFileSync } from 'node:fs'

const root = '/Users/alex/Projects/mine/geckit'
const found = await listClaude(root)
const notes = JSON.parse(readFileSync('/Users/alex/Library/Application Support/geckit-local/sessions.json', 'utf8')) as Record<string, unknown>

const sessions = found.slice(0, 8).map((one, index) => {
  const note = (notes[one.id] ?? {}) as { readonly title?: string; readonly mode?: string; readonly here?: boolean; readonly hidden?: boolean }
  const title = note.title ?? one.title
  const hidden = note.hidden === true
  return {
    id: one.id,
    root,
    project: root,
    title,
    stands: one.stands,
    state: index === 0 ? 'asks' : index < 3 ? 'working' : 'done',
    status: index === 0 ? 'working' : index < 3 ? 'working' : 'done',
    at: Math.round(one.at),
    here: note.here ?? true,
    mode: note.mode ?? 'auto',
    model: one.model ?? 'claude-opus-5',
    provider: 'claude',
    hidden,
  }
})

// What a conversation holds, read from the session's own file.
const turns: Record<string, unknown> = {}
for (const one of found.slice(0, 3)) {
  const path = `${process.env.HOME}/.claude/projects/-Users-alex-Projects-mine-geckit/${one.id}.jsonl`
  let items: unknown[] = []
  try {
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
    const said: { readonly kind: string; readonly id: string; readonly text: string; readonly at?: number | undefined }[] = []
    for (const line of lines) {
      let entry: Record<string, unknown>
      try {
        entry = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      if (entry.type !== 'user' && entry.type !== 'assistant') continue
      const message = entry.message as { readonly role?: string; readonly content?: unknown } | undefined
      if (message === undefined) continue
      const content = message.content
      const when = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : undefined
      const clock = when === undefined || Number.isNaN(when) ? undefined : when
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((part): part is { readonly type: string; readonly text?: string } => typeof part === 'object' && part !== null && 'type' in part).map((part) => part.text ?? '').join('\n') : ''
      const clean = text.trim()
      if (clean === '' || clean.startsWith('<') || clean.startsWith('<')) continue
      if (clean.startsWith('<')) continue
      said.push({ kind: message.role === 'user' ? 'mine' : 'theirs', id: String(entry.uuid), text: clean.slice(0, 500), at: clock })
    }
    items = said.slice(-8)
  } catch {
    items = []
  }
  turns[one.id] = { items, left: 0 }
}

const data = JSON.parse(readFileSync(new URL('./stub-data.json', import.meta.url), 'utf8')) as Record<string, unknown>
data.sessions = sessions
data.turns = turns
writeFileSync(new URL('./stub-data.json', import.meta.url), JSON.stringify(data, null, 2))
console.log('wrote', sessions.length, 'sessions,', Object.keys(turns).length, 'conversations')
for (const [id, one] of Object.entries(turns as Record<string, { items: unknown[] }>)) console.log('-', id, one.items.length, 'items')
