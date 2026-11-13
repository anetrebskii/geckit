import '../renderer/src/styles.css'
import './secret.css'

import { sealFor, keyHashOf } from '../shared/secret-seal'

interface Card { readonly name: string; readonly kind: 'website' | 'http' | 'command' | 'ssh'; readonly places: readonly string[]; readonly note: string; readonly field: string; readonly computer: string; readonly task: string; readonly brokerKey: string }

const KINDS: Record<Card['kind'], string> = { website: 'Website', http: 'HTTP API', command: 'Command', ssh: 'SSH key' }
const KEEP = [['task', 'This task'], ['once', 'One use'], ['15m', '15 minutes'], ['1h', '1 hour'], ['1d', '1 day'], ['keep', 'Keep']] as const
const stage = document.getElementById('secret') as HTMLElement

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const made = Object.assign(document.createElement(tag), props)
  made.append(...children)
  return made
}

function show(...children: Node[]): void { stage.replaceChildren(...children) }

function check(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'secret-done')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5')
  svg.append(path)
  return svg
}

function message(title: string, line: string, done = false): void {
  show(...(done ? [check()] : []), el('h1', {}, title), el('p', { className: 'secret-note' }, line))
}

async function call(body: object): Promise<{ status: number; json: Record<string, unknown> }> {
  const answer = await fetch('/api/secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', referrerPolicy: 'no-referrer' })
  return { status: answer.status, json: await answer.json().catch(() => ({})) as Record<string, unknown> }
}

function refused(error: unknown): void {
  if (error === 'already-used') message('This link was already used.', 'Ask the agent for a new one if you need to change the secret.')
  else if (error === 'expired') message('This link has expired.', 'Nothing was saved from it. Ask the agent for a new link.')
  else message('This link is not valid.', 'Check that the whole link was copied, or ask the agent for a new one.')
}

function placesOf(card: Card): string {
  const places = card.kind === 'website' ? card.places.map((one) => one.replace(/^https:\/\//, '')) : card.places
  return `Used for: ${KINDS[card.kind]} on ${places.join(', ')}`
}

function form(card: Card, id: string, linkKey: string): void {
  const multiline = card.kind === 'ssh'
  const value = multiline ? el('textarea', { id: 'value', autocomplete: 'off', spellcheck: false, required: true }) : el('input', { id: 'value', type: 'password', autocomplete: 'off', spellcheck: false, required: true })
  value.setAttribute('autocapitalize', 'off')
  const eye = el('button', { type: 'button', className: 'secret-eye' }, 'Show')
  eye.hidden = multiline
  eye.setAttribute('aria-pressed', 'false')
  eye.addEventListener('click', () => {
    if (!(value instanceof HTMLInputElement)) return
    const showing = value.type === 'text'
    value.type = showing ? 'password' : 'text'
    eye.textContent = showing ? 'Show' : 'Hide'
    eye.setAttribute('aria-pressed', String(!showing))
  })
  const keep = el('fieldset', { className: 'secret-keep' }, el('legend', {}, 'Keep it'))
  for (const [key, label] of KEEP) {
    const radio = el('input', { type: 'radio', name: 'keep', value: key, checked: key === 'task' })
    keep.append(el('label', {}, radio, el('span', {}, label)))
  }
  const save = el('button', { type: 'submit', className: 'secret-save', disabled: true }, 'Save')
  const error = el('p', { className: 'secret-error', role: 'alert' })
  error.hidden = true
  value.addEventListener('input', () => { save.disabled = value.value === '' })
  const shape = el('form', { className: 'secret', noValidate: true },
    el('h1', {}, 'Enter a secret for GeckIt'),
    el('p', { className: 'secret-note' }, 'Do not forward this link.'),
    el('div', { className: 'secret-card' },
      el('div', { className: 'secret-name' }, card.name),
      ...(card.note === '' ? [] : [el('p', { className: 'secret-what' }, card.note)]),
      el('p', {}, card.task === '' ? `Asked by ${card.computer}` : `Asked by ${card.computer} for ${card.task}`),
      el('p', {}, placesOf(card)),
    ),
    el('label', { htmlFor: 'value' }, 'Value'),
    el('div', { className: 'secret-value' }, value, eye),
    keep,
    error,
    save,
    el('p', { className: 'secret-foot' }, `The value is encrypted for ${card.computer} on this page. GeckIt's AI never sees it.`),
  )
  shape.style.padding = '0'
  shape.addEventListener('submit', (event) => {
    event.preventDefault()
    if (value.value === '') return
    const lifetime = (shape.querySelector('input[name="keep"]:checked') as HTMLInputElement | null)?.value ?? 'task'
    for (const one of shape.querySelectorAll('input, textarea, button')) (one as HTMLInputElement).disabled = true
    save.textContent = 'Saving...'
    error.hidden = true
    void (async () => {
      try {
        const ciphertext = await sealFor(card.brokerKey, value.value, 'geckit-secret-v1')
        const answer = await call({ action: 'save', id, linkKey, ciphertext, lifetime })
        if (answer.status === 200) { value.value = ''; message(`Saved for ${card.computer}`, 'You can close this page.', true); return }
        refused(answer.json['error'])
      } catch {
        for (const one of shape.querySelectorAll('input, textarea, button')) (one as HTMLInputElement).disabled = false
        save.textContent = 'Try again'
        error.textContent = 'No connection. Your value was not sent.'
        error.hidden = false
      }
    })()
  })
  show(shape)
  value.focus()
}

async function start(): Promise<void> {
  const [id, linkKey, keyHash] = location.hash.slice(1).split('.')
  if (!id || !linkKey || !keyHash) { refused('not-valid'); return }
  let answer: Awaited<ReturnType<typeof call>>
  try { answer = await call({ action: 'card', id, linkKey }) } catch { message('No connection.', 'Check the connection and open the link again.'); return }
  if (answer.status !== 200) { refused(answer.json['error']); return }
  const card = answer.json['card'] as Card
  if (await keyHashOf(card.brokerKey) !== keyHash) { refused('not-valid'); return }
  form(card, id, linkKey)
}

void start()
