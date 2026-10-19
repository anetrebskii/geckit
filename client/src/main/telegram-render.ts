import { telegramText } from './telegram-text'

/** One Telegram message: the formatted form, and the plain form to fall back on if Telegram rejects the formatting. */
export interface TelegramPiece {
  readonly html: string
  readonly text: string
}

interface Block extends TelegramPiece {
  readonly kind: 'line' | 'pre' | 'quote'
  readonly body?: string
  readonly language?: string
}

const LIMIT = 3500
const QUOTE_LINES = 10

const escape = (text: string): string => text.replace(/[&<>]/g, (one) => one === '&' ? '&amp;' : one === '<' ? '&lt;' : '&gt;')

function marks(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_all, label: string, url: string) => `<a href="${url.replace(/"/g, '%22')}">${label}</a>`)
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w])__(?=\S)([^\n]*?\S)__(?=[^\w]|$)/g, '$1<b>$2</b>')
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, '<s>$1</s>')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?=[^\w*]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?=[^\w_]|$)/g, '$1<i>$2</i>')
}

/** A line of prose: code spans first, so the marks inside one stay as they were written. */
function inline(text: string): string {
  return text.split(/(``[^`\n]+``|`[^`\n]+`)/g).map((part, at) => at % 2 === 0 ? marks(escape(part)) : `<code>${escape(part.replace(/^`+|`+$/g, ''))}</code>`).join('')
}

function line(source: string): string {
  const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(source)
  if (heading !== null) return `<b>${inline(heading[2] ?? '')}</b>`
  const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(source)
  if (bullet !== null) return `${bullet[1] ?? ''}• ${inline((bullet[2] ?? '').replace(/^\[([ xX])\]\s+/, (_all, mark: string) => mark === ' ' ? '☐ ' : '☑ '))}`
  const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(source)
  if (numbered !== null) return `${numbered[1] ?? ''}${numbered[2] ?? ''}. ${inline(numbered[3] ?? '')}`
  return inline(source)
}

const code = (text: string, language?: string): string => language === undefined || language === '' ? `<pre>${escape(text)}</pre>` : `<pre><code class="language-${language}">${escape(text)}</code></pre>`

const quote = (lines: readonly string[]): string => `<blockquote${lines.length > QUOTE_LINES || lines.join('\n').length > 600 ? ' expandable' : ''}>${lines.map((one) => line(one)).join('\n')}</blockquote>`

/** A markdown table, kept readable by padding its columns inside a monospace block. */
function table(rows: readonly string[]): string {
  const cells = rows.map((row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
  const body = cells.filter((_row, at) => at !== 1)
  const widths = body.reduce<number[]>((held, row) => row.map((cell, at) => Math.max(held[at] ?? 0, cell.length)), [])
  return body.map((row) => row.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd()).join('\n')
}

const isTableRow = (source: string | undefined): boolean => source !== undefined && source.includes('|') && source.trim() !== ''
const isTableRule = (source: string | undefined): boolean => source !== undefined && /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(source)

function blocks(source: string): Block[] {
  const lines = telegramText(source).split('\n')
  const out: Block[] = []
  for (let at = 0; at < lines.length; at++) {
    const current = lines[at] ?? ''
    const fence = /^\s{0,3}(`{3,}|~{3,})\s*([A-Za-z0-9+#._-]{0,20}).*$/.exec(current)
    if (fence !== null) {
      const marker = fence[1] ?? '```'
      const language = fence[2] ?? ''
      const held: string[] = []
      let end = at
      for (let scan = at + 1; scan < lines.length; scan++) {
        const closing = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(lines[scan] ?? '')?.[1]
        end = scan
        if (closing !== undefined && closing[0] === marker[0] && closing.length >= marker.length) break
        held.push(lines[scan] ?? '')
      }
      out.push({ kind: 'pre', html: code(held.join('\n'), language), text: lines.slice(at, end + 1).join('\n'), body: held.join('\n'), ...(language === '' ? {} : { language }) })
      at = end
      continue
    }
    if (/^\s{0,3}>/.test(current)) {
      const held: string[] = []
      let end = at
      while (end < lines.length && /^\s{0,3}>/.test(lines[end] ?? '')) { held.push((lines[end] ?? '').replace(/^\s{0,3}>\s?/, '')); end++ }
      out.push({ kind: 'quote', html: quote(held), text: lines.slice(at, end).join('\n'), body: held.join('\n') })
      at = end - 1
      continue
    }
    if (isTableRow(current) && isTableRule(lines[at + 1])) {
      let end = at + 2
      while (end < lines.length && isTableRow(lines[end])) end++
      const body = table(lines.slice(at, end))
      out.push({ kind: 'pre', html: code(body), text: lines.slice(at, end).join('\n'), body })
      at = end - 1
      continue
    }
    if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(current)) { out.push({ kind: 'line', html: '', text: '' }); continue }
    out.push({ kind: 'line', html: line(current), text: current })
  }
  return out
}

const grouped = (lines: readonly string[], room: number): string[][] => lines.reduce<string[][]>((held, one) => {
  const last = held.at(-1)
  if (last === undefined || last.join('\n').length + one.length + 1 > room) held.push([one])
  else last.push(one)
  return held
}, [])

/** A block too long for one message, cut into whole lines, or at a space, so no tag or surrogate pair is split. */
function split(block: Block): TelegramPiece[] {
  if (block.kind === 'pre' && block.body !== undefined) return grouped(block.body.split('\n'), LIMIT - 64).map((held) => ({ html: code(held.join('\n'), block.language), text: held.join('\n') }))
  if (block.kind === 'quote' && block.body !== undefined) return grouped(block.body.split('\n'), LIMIT - 64).map((held) => ({ html: quote(held), text: held.map((one) => `> ${one}`).join('\n') }))
  const out: TelegramPiece[] = []
  let rest = block.text
  while (rest !== '') {
    if (line(rest).length <= LIMIT) { out.push({ html: line(rest), text: rest }); break }
    let take = Math.min(rest.length, LIMIT)
    while (take > 1 && line(rest.slice(0, take)).length > LIMIT) take = Math.floor(take * 0.8)
    const space = rest.slice(0, take).lastIndexOf(' ')
    if (space > take / 2) take = space + 1
    else { const high = rest.charCodeAt(take - 1); if (high >= 0xd800 && high <= 0xdbff) take -= 1 }
    const part = rest.slice(0, take)
    out.push({ html: line(part), text: part })
    rest = rest.slice(take)
  }
  return out
}

/** What to send for one answer: markdown rendered as Telegram HTML, cut into messages Telegram accepts. */
export function telegramMessages(source: string): readonly TelegramPiece[] {
  const out: TelegramPiece[] = []
  let held: Block[] = []
  const flush = (): void => {
    while (held[0]?.html === '') held.shift()
    while (held.at(-1)?.html === '') held.pop()
    if (held.length > 0) out.push({ html: held.map((one) => one.html).join('\n'), text: held.map((one) => one.text).join('\n') })
    held = []
  }
  for (const block of blocks(source)) {
    if (block.html.length > LIMIT) { flush(); out.push(...split(block)); continue }
    if (held.length > 0 && held.reduce((count, one) => count + one.html.length + 1, 0) + block.html.length > LIMIT) flush()
    held.push(block)
  }
  flush()
  return out.filter((one) => one.html.trim() !== '')
}
