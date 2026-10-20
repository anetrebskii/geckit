import { describe, expect, it } from 'vitest'

import { telegramMessages } from '../src/main/telegram-render'

const weeklyPlan = `**The plan**

| # | Point | Why it appeared | Owner |
| - | ----- | --------------- | ----- |
| 1 | Review [#4069](https://github.com/example/app/pull/4069) and fix the findings yourself | The week's one commitment. It has waited on review for 1 day 16 hours, and nothing else can start | Alex |
| 2 | Get the carrier running on preview 4018 | Planning call: "I will try today, maximum tomorrow." That was yesterday | Alex |
| 3 | Run 5 to 10 latency calls, production against preview | Measured locally over a VPN, so test it here before believing it | Alex, Daniel |
| 4 | Merge [#4076](https://github.com/example/app/pull/4076) | | |`

/** Telegram accepts only these tags, each closed in order; anything else rejects the whole message. */
function balanced(html: string): boolean {
  const open: string[] = []
  for (const [, closing, name] of html.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (!['b', 'i', 's', 'code', 'pre', 'a', 'blockquote'].includes(name ?? '')) return false
    if (closing === '') open.push(name ?? '')
    else if (open.pop() !== name) return false
  }
  return open.length === 0
}

const one = (source: string): string => telegramMessages(source).map((piece) => piece.html).join('\n----\n')

describe('what Manager writes, drawn with Telegram’s own formatting', () => {
  it('carries bold, italic, strikethrough, code, links and headings into Telegram HTML', () => {
    expect(one('## Done\n\n**Shipped** the *fix* in `useChat.ts`, ~~not~~ in [the panel](https://example.com/a?b=1).')).toBe('<b>Done</b>\n\n<b>Shipped</b> the <i>fix</i> in <code>useChat.ts</code>, <s>not</s> in <a href="https://example.com/a?b=1">the panel</a>.')
  })

  it('leaves the marks inside a code span alone and escapes what would be read as markup', () => {
    expect(one('Run `npm run **build**` on <main> & wait')).toBe('Run <code>npm run **build**</code> on &lt;main&gt; &amp; wait')
  })

  it('turns lists into bullets, checkboxes and kept numbers', () => {
    expect(one('- first\n- [ ] open\n- [x] closed\n1. one\n2. two')).toBe('• first\n• ☐ open\n• ☑ closed\n1. one\n2. two')
  })

  it('keeps a fenced block as code with its language, and the lines inside it as they were written', () => {
    expect(one('Look:\n\n```ts\n  const value = 1 < 2\n```')).toBe('Look:\n\n<pre><code class="language-ts">  const value = 1 &lt; 2</code></pre>')
  })

  it('pads a markdown table into a monospace block so its columns line up', () => {
    expect(one('| Worker | State |\n| --- | --- |\n| chat | working |\n| docs | idle |')).toBe('<pre>Worker  State\nchat    working\ndocs    idle</pre>')
  })

  it('turns a weekly plan table into one numbered entry per row, each value named by its column, with links kept', () => {
    expect(one(weeklyPlan)).toBe([
      '<b>The plan</b>',
      '',
      '1. <b>Review <a href="https://github.com/example/app/pull/4069">#4069</a> and fix the findings yourself</b>',
      'Why it appeared: The week\'s one commitment. It has waited on review for 1 day 16 hours, and nothing else can start',
      'Owner: Alex',
      '',
      '2. <b>Get the carrier running on preview 4018</b>',
      'Why it appeared: Planning call: "I will try today, maximum tomorrow." That was yesterday',
      'Owner: Alex',
      '',
      '3. <b>Run 5 to 10 latency calls, production against preview</b>',
      'Why it appeared: Measured locally over a VPN, so test it here before believing it',
      'Owner: Alex, Daniel',
      '',
      '4. <b>Merge <a href="https://github.com/example/app/pull/4076">#4076</a></b>',
    ].join('\n'))
    const [piece] = telegramMessages(weeklyPlan)
    expect(piece?.text).not.toContain('|')
    expect(balanced(piece?.html ?? '')).toBe(true)
  })

  it('reads a table only where a header meets a matching rule, and never inside code or a shell pipeline', () => {
    const mixed = ['Counted with `grep -c x | wc -l` and:', '', 'cat log | sort | uniq', '', '```sh', '| a | b |', '|---|---|', 'ps aux | grep node', '```', '', '| Step | Result |', '|---|---|', '| Build `a|b` | passed \\| twice |', '', 'Then **done**.'].join('\n')
    expect(one(mixed)).toBe([
      'Counted with <code>grep -c x | wc -l</code> and:',
      '',
      'cat log | sort | uniq',
      '',
      '<pre><code class="language-sh">| a | b |\n|---|---|\nps aux | grep node</code></pre>',
      '',
      '<b>Build <code>a|b</code></b>',
      'Result: passed | twice',
      '',
      'Then <b>done</b>.',
    ].join('\n'))
    expect(one('a | b\n--- | --- | ---\nc | d')).toBe('a | b\n--- | --- | ---\nc | d')
  })

  it('keeps a narrow table a grid unless a cell needs formatting, and names a column with no header by its value alone', () => {
    expect(one('| Worker | State |\n|:--|--:|\n| docs |\n| chat | idle |')).toBe('<pre>Worker  State\ndocs\nchat    idle</pre>')
    expect(one('| Worker | State |\n|---|---|\n| [docs](https://example.com/d) | idle |')).toBe('<b><a href="https://example.com/d">docs</a></b>\nState: idle')
    expect(one('| Task | |\n|---|---|\n| Release notes for the October build | waiting on QA |')).toBe('<b>Release notes for the October build</b>\nwaiting on QA')
  })

  it('splits a long table between its rows, inside Telegram’s limit, every message well formed', () => {
    const rows = Array.from({ length: 40 }, (_value, at) => `| ${String(at + 1)} | Task ${String(at + 1)} with [a link](https://example.com/${String(at)}) | ${'Context that runs long. '.repeat(10)} | Alex |`)
    const pieces = telegramMessages(['| # | Point | Why | Owner |', '|---|---|---|---|', ...rows].join('\n'))
    expect(pieces.length).toBeGreaterThan(2)
    expect(pieces.every((piece) => piece.html.length <= 4096 && balanced(piece.html) && /^\d+\. <b>/.test(piece.html))).toBe(true)
    expect(pieces.flatMap((piece) => piece.html.match(/^\d+\. <b>/gm) ?? [])).toHaveLength(40)
    expect(pieces.some((piece) => piece.text.includes('|'))).toBe(false)
  })

  it('keeps approval diagnostics, local links and code beside a wide table in one answer', () => {
    const source = [
      '| Task | Guide | Result |', '|---|---|---|',
      '| Read the browser instructions before continuing | [local guide](~/.claude/skills/browser/SKILL.md) | `a|b` and escaped \\| |',
      '', '│ Hook requires confirmation:', '│ FLAG  report  waiting', '│ ok    scope   current',
      '', '```sh', 'cat report | tee output', '```',
    ].join('\n')
    const pieces = telegramMessages(source)
    expect(one(source)).toBe([
      '<b>Read the browser instructions before continuing</b>',
      'Guide: local guide (<code>~/.claude/skills/browser/SKILL.md</code>)',
      'Result: <code>a|b</code> and escaped |', '',
      '<blockquote>Hook requires confirmation:</blockquote>',
      '<pre>FLAG  report  waiting\nok    scope   current</pre>', '',
      '<pre><code class="language-sh">cat report | tee output</code></pre>',
    ].join('\n'))
    expect(pieces.every((piece) => balanced(piece.html) && piece.html.length <= 3500)).toBe(true)
    expect(pieces.map((piece) => piece.text).join('\n')).toContain('│ FLAG  report  waiting')
  })

  it('quotes with a blockquote, and folds a long one so it does not fill the screen', () => {
    expect(one('> short one')).toBe('<blockquote>short one</blockquote>')
    expect(one(Array.from({ length: 12 }, (_value, at) => `> line ${String(at)}`).join('\n'))).toContain('<blockquote expandable>')
  })

  it.each(['│', '|'])('formats terminal %s rails as quotes and keeps aligned diagnostics in monospace', (rail) => {
    const source = `Approval\n\n${rail} Hook requires confirmation:\n${rail}\n${rail} FLAG  contractions  1 in 35 sentences\n${rail} ok    vocabulary    clean\n${rail}\n${rail} Read [the skill](~/.claude/skills/own-english/SKILL.md).\n\nDo you want to proceed?`
    expect(one(source)).toBe('Approval\n\n<blockquote>Hook requires confirmation:\n</blockquote>\n<pre>FLAG  contractions  1 in 35 sentences\nok    vocabulary    clean</pre>\n<blockquote>\nRead the skill (<code>~/.claude/skills/own-english/SKILL.md</code>).</blockquote>\n\nDo you want to proceed?')
    expect(telegramMessages(source)[0]?.text).toBe(source)
  })

  it('keeps literal pipes and terminal rails inside fenced code unchanged', () => {
    expect(one('A | B\n\n```text\n│ original\n│ output\n```\n\n| left | right |\n| keep | pipes |')).toBe('A | B\n\n<pre><code class="language-text">│ original\n│ output</code></pre>\n\n| left | right |\n| keep | pipes |')
  })

  it('bounds long terminal diagnostics after escaping and preserves Unicode at splits', () => {
    const source = `│ Hook output:\n│\n│ FLAG  report  ${'<&😀'.repeat(1500)}\n│ ok    status  clean\n│\n│ ${'More <&😀 '.repeat(1000)}`
    const pieces = telegramMessages(source)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((piece) => piece.html.length <= 3500 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(piece.text))).toBe(true)
    expect(pieces.filter((piece) => piece.html.startsWith('<pre>')).every((piece) => piece.html.endsWith('</pre>'))).toBe(true)
    expect(pieces.filter((piece) => piece.html.startsWith('<blockquote')).every((piece) => piece.html.endsWith('</blockquote>'))).toBe(true)
    const expected = source.replace(/^│ ?/gm, '').replace(/\n/g, '')
    expect(pieces.map((piece) => piece.html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&amp;/g, '&')).join('').replace(/\n/g, '')).toBe(expected)
    expect(pieces.map((piece) => piece.text.replace(/^[│>] ?/gm, '')).join('').replace(/\n/g, '')).toBe(expected)
  })

  it('splits a long answer into messages Telegram accepts without cutting a tag or a surrogate pair', () => {
    const pieces = telegramMessages(`**${'A'.repeat(4000)}**\n\n😀`.replace('😀', '😀'.repeat(2000)))
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.every((piece) => piece.html.length <= 3500)).toBe(true)
    expect(pieces.every((piece) => !/<[a-z/]*$/.test(piece.html) && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(piece.html))).toBe(true)
  })

  it('keeps the plain form of every message for the fallback send', () => {
    const [piece] = telegramMessages('**Shipped** it')
    expect(piece).toEqual({ html: '<b>Shipped</b> it', text: '**Shipped** it' })
  })
})
