/**
 * What is copied out of a conversation, in the two forms a paste chooses from.
 *
 * The HTML is the structure alone: bold, lists, headings, links, code and
 * tables, which Slack, Google Docs and mail all keep. None of this window's
 * look goes with it, so the paste takes the font and colours of wherever it
 * lands, and text copied in dark mode is not pasted white. The plain text is
 * for everywhere else.
 */

export interface Rich {
  readonly html: string
  readonly text: string
}

const KEEP = new Set([
  'P', 'BR', 'DIV', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'CODE', 'PRE', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR',
])

/** The parts of the window that are not what was said. */
const CHROME = 'button, svg, img, .when, .pictures, .did, .thought, .card, .wrote, .note'

const MONO = 'font-family: Menlo, Consolas, monospace'
const CELL = 'border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top'
// Only what a paste would otherwise lose: Docs has no idea code is code, or that a table has lines.
const STYLE: Readonly<Record<string, string>> = {
  PRE: `${MONO}; white-space: pre-wrap`,
  CODE: MONO,
  TABLE: 'border-collapse: collapse',
  TH: CELL,
  TD: CELL,
}

function tidy(box: HTMLElement): void {
  for (const check of box.querySelectorAll('input[type=checkbox]')) {
    check.replaceWith(`${(check as HTMLInputElement).checked ? '[x]' : '[ ]'} `)
  }
  // A message typed with line breaks shows them by its style alone, which does not go with it.
  for (const said of box.querySelectorAll('.mine')) {
    const walk = document.createTreeWalker(said, NodeFilter.SHOW_TEXT)
    const texts: Text[] = []
    while (walk.nextNode() !== null) texts.push(walk.currentNode as Text)
    for (const text of texts) {
      const lines = text.data.split('\n')
      if (lines.length === 1) continue
      text.replaceWith(...lines.flatMap((line, at) => (at === 0 ? [line] : [document.createElement('br'), line])))
    }
  }
  // Deepest first, so what is unwrapped has already been tidied.
  for (const element of [...box.querySelectorAll('*')].reverse()) {
    if (!KEEP.has(element.tagName)) {
      element.replaceWith(...element.childNodes)
      continue
    }
    const href = element.tagName === 'A' ? element.getAttribute('href') : null
    const start = element.tagName === 'OL' ? element.getAttribute('start') : null
    for (const name of element.getAttributeNames()) element.removeAttribute(name)
    if (href !== null && /^(https?:|mailto:)/i.test(href)) element.setAttribute('href', href)
    if (start !== null) element.setAttribute('start', start)
    const style = STYLE[element.tagName]
    if (style !== undefined && !(element.tagName === 'CODE' && element.parentElement?.tagName === 'PRE')) {
      element.setAttribute('style', style)
    }
  }
}

/** The text as it reads, which needs it laid out: line breaks come from what is a block. */
function readText(box: HTMLElement): string {
  const shown = box.cloneNode(true) as HTMLElement
  // Plain text has no bullets of its own, so a list keeps its markers as text.
  for (const item of shown.querySelectorAll('li')) {
    const list = item.parentElement
    let depth = 0
    for (let at = list?.parentElement; at != null && at !== shown; at = at.parentElement) if (at.tagName === 'LI') depth += 1
    const index = list === null ? 0 : [...list.children].filter((one) => one.tagName === 'LI').indexOf(item)
    const from = Number(list?.getAttribute('start') ?? 1)
    item.prepend(`${'    '.repeat(depth)}${list?.tagName === 'OL' ? `${String(from + index)}.` : '-'} `)
  }
  shown.style.cssText = 'position: fixed; left: -100000px; top: 0; width: 800px'
  document.body.append(shown)
  const text = shown.innerText.replace(/\n{3,}/g, '\n\n').trim()
  shown.remove()
  return text
}

function rich(box: HTMLElement): Rich {
  tidy(box)
  const text = readText(box)
  return { html: box.innerHTML, text }
}

/**
 * What is selected inside `within`, with the elements it sits in, so text
 * selected inside a code block is still code and a list item still a list.
 */
export function richSelection(selection: Selection | null, within: HTMLElement): Rich | undefined {
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return undefined
  const range = selection.getRangeAt(0)
  if (!within.contains(range.commonAncestorContainer)) return undefined
  const picked = range.cloneContents()
  for (const chrome of picked.querySelectorAll(CHROME)) chrome.remove()
  let held: Node = picked
  const start = range.commonAncestorContainer
  for (let at = start instanceof Element ? start : start.parentElement; at !== null && at !== within; at = at.parentElement) {
    const shell = at.cloneNode(false)
    shell.appendChild(held)
    held = shell
  }
  const box = document.createElement('div')
  box.append(held)
  return rich(box)
}

/** Whole elements as they are drawn, such as the pieces of one answer. */
export function richOf(elements: readonly Element[]): Rich {
  const box = document.createElement('div')
  for (const element of elements) {
    const copy = element.cloneNode(true) as Element
    for (const chrome of copy.querySelectorAll(CHROME)) chrome.remove()
    box.append(copy)
  }
  return rich(box)
}
