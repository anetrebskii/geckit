import process from 'node:process'
import { setTimeout, clearTimeout } from 'node:timers'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'

const emit = (items, signals) => process.stdout.write(`${JSON.stringify({ items, signals, gone: [] })}\n`)
let timer
const finish = (text) => emit([{ kind: 'theirs', id: randomUUID(), text, done: true }], [{ kind: 'said', text }, { kind: 'ended', how: 'done' }])
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.stop) { clearTimeout(timer); emit([], [{ kind: 'ended', how: 'stopped' }]); return }
  if (request.answer !== undefined) { finish(`approved:${request.answer}`); return }
  if (request.text === 'wait') { emit([], [{ kind: 'asks', ask: 'fixture-approval', wanted: { kind: 'command', command: 'fixture write' } }]); return }
  if (request.text === 'hang') return
  timer = setTimeout(() => finish(`fixture:${request.text}`), request.text === 'slow' ? 500 : 20)
})
