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
  return text.split(/(``[^`\n]+``|`[^`\n]+`|\[[^\]\n]+\]\((?:~\/|\/|\.\.?\/)[^\n)]+\))/g).map((part, at) => {
    if (at % 2 === 0) return marks(escape(part))
    const local = /^\[([^\]\n]+)\]\(([^\n)]+)\)$/.exec(part)
    return local === null ? `<code>${escape(part.replace(/^`+|`+$/g, ''))}</code>` : `${escape(local[1] ?? '')} (<code>${escape(local[2] ?? '')}</code>)`
  }).join('')
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

// What a phone held upright shows of a monospace line without wrapping it.
const NARROW = 36

/** A table row's cells: cut at its pipes, but not at one written \| or one inside a code span. */
function cellsOf(row: string): string[] {
  const text = row.trim().replace(/^\|/, '')
  const cells: string[] = []
  let cell = ''
  let span = ''
  for (let at = 0; at < text.length; at++) {
    const one = text[at] ?? ''
    if (one === '\\' && text[at + 1] === '|') { cell += '|'; at++; continue }
    if (one === '`') {
      const run = /^`+/.exec(text.slice(at))?.[0] ?? '`'
      if (span === '' ? text.indexOf(run, at + run.length) !== -1 : run === span) span = span === '' ? run : ''
      cell += run
      at += run.length - 1
      continue
    }
    if (one === '|' && span === '') { cells.push(cell.trim()); cell = ''; continue }
    cell += one
  }
  if (cell.trim() !== '') cells.push(cell.trim())
  return cells
}

const isTableRow = (source: string | undefined): boolean => source !== undefined && source.includes('|') && source.trim() !== '' && !/^\s{0,3}(`{3,}|~{3,})/.test(source)
const isTableRule = (source: string | undefined, count: number): boolean => {
  if (source === undefined || !source.includes('-')) return false
  const cells = cellsOf(source)
  return cells.length === count && cells.every((cell) => /^:?-+:?$/.test(cell))
}
const MARKUP = /[`*_~]|\[[^\]\n]*\]\(/

/**
 * A markdown table, which Telegram has no form of. A narrow one stays a grid in a monospace block;
 * anything wider becomes one entry per row, its first cell in bold and a "Header: value" line for each other cell.
 */
function table(rows: readonly string[]): Block[] {
  const headers = cellsOf(rows[0] ?? '')
  const body = rows.slice(2).map(cellsOf).map((row) => row.length < headers.length ? [...row, ...Array.from({ length: headers.length - row.length }, () => '')] : row)
  const grid = [headers, ...body]
  const widths = grid.reduce<number[]>((held, row) => row.map((cell, at) => Math.max(held[at] ?? 0, cell.length)), [])
  const padded = grid.map((row) => row.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join('  ').trimEnd()).join('\n')
  if (padded.split('\n').every((one) => one.length <= NARROW) && !grid.flat().some((cell) => MARKUP.test(cell))) return [{ kind: 'pre', html: code(padded), text: padded, body: padded }]
  const numbered = /^(#|№|no\.?|n)?$/i.test(headers[0] ?? '') && body.length > 0 && body.every((row) => /^\d+\.?$/.test(row[0] ?? ''))
  const first = numbered ? 1 : 0
  const out: Block[] = []
  for (const [at, row] of body.entries()) {
    const title = row[first] ?? ''
    const number = numbered ? `${(row[0] ?? '').replace(/\.$/, '')}. ` : ''
    const lines: TelegramPiece[] = title === '' && number === '' ? [] : [{ text: `${number}${title === '' || title.includes('**') ? title : `**${title}**`}`, html: `${number}${title === '' || title.includes('**') ? inline(title) : `<b>${inline(title)}</b>`}` }]
    for (const [column, cell] of row.entries()) {
      if (column === first || (numbered && column === 0) || cell === '') continue
      const label = headers[column] ?? ''
      lines.push(label === '' ? { text: cell, html: inline(cell) } : { text: `${label}: ${cell}`, html: `${inline(label)}: ${inline(cell)}` })
    }
    if (at > 0) out.push({ kind: 'line', html: '', text: '' })
    const html = lines.map((one) => one.html).join('\n')
    if (html.length <= LIMIT) out.push({ kind: 'line', html, text: lines.map((one) => one.text).join('\n') })
    else out.push(...lines.map((one): Block => ({ kind: 'line', ...one })))
  }
  return out
}

const terminalLine = (source: string): string | undefined => /^\s{0,3}[│|] ?(.*)$/.exec(source)?.[1]
const aligned = (source: string | undefined): boolean => source !== undefined && /\S {2,}\S/.test(source)

function terminal(lines: readonly string[], original: readonly string[]): Block[] {
  const out: Block[] = []
  for (let at = 0; at < lines.length;) {
    const pre = aligned(lines[at]) && aligned(lines[at + 1])
    let end = at + 1
    if (pre) while (aligned(lines[end])) end++
    else while (end < lines.length && !(aligned(lines[end]) && aligned(lines[end + 1]))) end++
    const held = lines.slice(at, end)
    const body = held.join('\n')
    out.push({ kind: pre ? 'pre' : 'quote', html: pre ? code(body) : quote(held), text: original.slice(at, end).join('\n'), body })
    at = end
  }
  return out
}

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
    if (isTableRow(current) && isTableRule(lines[at + 1], cellsOf(current).length)) {
      let end = at + 2
      while (end < lines.length && isTableRow(lines[end])) end++
      out.push(...table(lines.slice(at, end)))
      at = end - 1
      continue
    }
    if (terminalLine(current) !== undefined && terminalLine(lines[at + 1] ?? '') !== undefined) {
      let end = at + 2
      while (end < lines.length && terminalLine(lines[end] ?? '') !== undefined) end++
      const original = lines.slice(at, end)
      if (!original.every((one) => /^\s{0,3}\|.*\|/.test(one))) {
        out.push(...terminal(original.map((one) => terminalLine(one) ?? ''), original))
        at = end - 1
        continue
      }
    }
    if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(current)) { out.push({ kind: 'line', html: '', text: '' }); continue }
    out.push({ kind: 'line', html: line(current), text: current })
  }
  return out
}

function grouped(lines: readonly string[], render: (text: string) => string): string[][] {
  const held: string[][] = []
  for (const line of lines) {
    let rest = line
    do {
      let take = rest.length
      while (take > 1 && render(rest.slice(0, take)).length > LIMIT) take = Math.floor(take * 0.8)
      const high = rest.charCodeAt(take - 1)
      if (take < rest.length && high >= 0xd800 && high <= 0xdbff) take -= 1
      const part = rest.slice(0, take)
      const last = held.at(-1)
      if (last === undefined || render([...last, part].join('\n')).length > LIMIT) held.push([part])
      else last.push(part)
      rest = rest.slice(take)
    } while (rest !== '')
  }
  return held
}

/** A block too long for one message, cut into whole lines, or at a space, so no tag or surrogate pair is split. */
function split(block: Block): TelegramPiece[] {
  if (block.kind === 'pre' && block.body !== undefined) return grouped(block.body.split('\n'), (text) => code(text, block.language)).map((held) => ({ html: code(held.join('\n'), block.language), text: held.join('\n') }))
  if (block.kind === 'quote' && block.body !== undefined) return grouped(block.body.split('\n'), (text) => quote(text.split('\n'))).map((held) => ({ html: quote(held), text: held.map((one) => `> ${one}`).join('\n') }))
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
