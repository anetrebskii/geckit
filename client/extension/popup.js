const $ = (id) => document.getElementById(id)

const quoted = (text) => (text ? ` "${text}"` : '')
const DONE = {
  open: (d) => `Opened ${d ?? 'a tab'}`,
  go: (d) => `Went to ${d ?? 'a page'}`,
  read: (d) => (d ? `Looked for "${d}"` : 'Read the page'),
  text: () => 'Read the text',
  click: (d) => `Clicked${quoted(d)}`,
  hover: (d) => `Hovered${quoted(d)}`,
  type: () => 'Typed into a field',
  scroll: () => 'Scrolled',
  key: (d) => `Pressed ${d}`,
  eval: () => 'Ran a script',
  shot: () => 'Took a screenshot',
  style: () => 'Read the style',
  view: (d) => (d === 'reset' ? 'Reset the view' : 'Changed the view'),
  record: (d) => `Recorded ${((d ?? 1500) / 1000).toFixed(1)} s`,
  close: () => 'Closed the tab',
  pages: () => 'Listed tabs',
}
const DOING = {
  open: (d) => `Opening ${d ?? 'a tab'}`,
  go: (d) => `Going to ${d ?? 'a page'}`,
  read: (d) => (d ? `Looking for "${d}"` : 'Reading the page'),
  text: () => 'Reading the text',
  click: () => 'Clicking',
  hover: () => 'Hovering',
  type: () => 'Typing into a field',
  scroll: () => 'Scrolling',
  key: (d) => `Pressing ${d}`,
  eval: () => 'Running a script',
  shot: () => 'Taking a screenshot',
  style: () => 'Reading the style',
  view: (d) => (d === 'reset' ? 'Resetting the view' : 'Changing the view'),
  record: () => 'Recording',
  close: () => 'Closing the tab',
  pages: () => 'Listing tabs',
}
const say = (table, cmd, detail) => (table[cmd] ?? (() => cmd))(detail)
const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1)

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)} h ago`
}

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function hostOf(url) {
  try { return new URL(url).host || url } catch { return url ?? '' }
}

function viewText(view) {
  const parts = []
  if (view.width !== undefined) parts.push(`${view.width}x${view.height}${view.phone ? ' phone' : ''}`)
  if (view.scheme) parts.push(view.scheme)
  if (view.motion === 'reduce') parts.push('reduced motion')
  return parts.length === 0 ? 'Changed view' : `Changed view: ${parts.join(', ')}`
}

function el(tag, props = {}, ...children) {
  const made = Object.assign(document.createElement(tag), props)
  made.append(...children.filter((one) => one !== undefined))
  return made
}

async function show(id) {
  const tab = await chrome.tabs.get(id).catch(() => undefined)
  if (tab === undefined) return
  await chrome.tabs.update(id, { active: true })
  await chrome.windows.update(tab.windowId, { focused: true })
  window.close()
}

let state = { connected: false, busy: null, tabs: {}, views: {}, log: [] }
let paused = false

async function draw() {
  const status = $('status')
  status.className = `status ${paused ? 'paused' : state.connected ? 'on' : ''}`
  $('status-text').textContent = paused ? 'Paused' : state.connected ? 'Connected to GeckIt' : 'Not connected'
  const hint = $('hint')
  hint.hidden = !paused && state.connected
  hint.className = paused ? 'hint paused-hint' : 'hint'
  hint.textContent = paused ? 'GeckIt cannot read or use your tabs until you turn this back on.' : 'Turn on Chrome through GeckIt in GeckIt Settings > Assistants.'
  $('allow').checked = !paused
  $('allow-note').textContent = paused ? 'Off: every request is refused.' : 'Conversations in GeckIt can read and use your tabs.'

  const busy = paused ? null : state.busy
  $('now').hidden = busy === null
  if (busy !== null) {
    $('now-what').textContent = say(DOING, busy.cmd, busy.detail)
    $('now-tab').textContent = busy.title || (busy.tab === undefined ? '' : `Tab ${busy.tab}`)
    $('now').onclick = () => { if (busy.tab !== undefined) void show(busy.tab) }
  }

  const ids = Object.keys(state.tabs).map(Number).sort((a, b) => state.tabs[b].t - state.tabs[a].t)
  const live = (await Promise.all(ids.map((id) => chrome.tabs.get(id).catch(() => undefined)))).filter((one) => one !== undefined)
  $('tabs').replaceChildren(...live.map((tab) => {
    const seen = state.tabs[tab.id]
    const icon = tab.favIconUrl && /^(https?|data):/.test(tab.favIconUrl) ? el('img', { src: tab.favIconUrl, alt: '' }) : el('span', { className: 'blank' })
    icon.onerror = () => icon.replaceWith(el('span', { className: 'blank' }))
    const row = el('button', { className: 'tab', title: tab.url ?? '' }, icon,
      el('span', { className: 'lines' },
        el('span', { className: 'title', textContent: tab.title || hostOf(tab.url) }),
        el('span', { className: 'sub', textContent: `${hostOf(tab.url)}, ${lower(say(DONE, seen.cmd, seen.cmd === 'open' || seen.cmd === 'go' ? undefined : seen.detail))}, ${ago(seen.t)}` })),
      seen.opened ? el('span', { className: 'mark', title: 'In the GeckIt group' }) : undefined)
    row.onclick = () => void show(tab.id)
    const view = state.views[tab.id]
    if (view === undefined) return el('li', {}, row)
    const reset = el('button', { textContent: 'Reset' })
    reset.onclick = async () => { reset.disabled = true; await chrome.runtime.sendMessage({ reset: tab.id }) }
    return el('li', {}, row, el('span', { className: 'chip', textContent: viewText(view) }, reset))
  }))
  $('tabs-empty').hidden = live.length > 0

  $('log').replaceChildren(...state.log.map((one) => el('li', {},
    el('time', { textContent: clock(one.t), dateTime: new Date(one.t).toISOString() }),
    el('span', { className: 'what' },
      el('span', { textContent: say(DONE, one.cmd, one.detail) }),
      one.title ? el('span', { className: 'where', textContent: one.title }) : undefined,
      one.error ? el('span', { className: 'error', textContent: one.error.startsWith('The person paused') ? 'Refused: paused' : one.error }) : undefined))))
  $('log-empty').hidden = state.log.length > 0
}

$('version').textContent = chrome.runtime.getManifest().version
$('allow').onchange = (event) => { void chrome.storage.local.set({ paused: !event.target.checked }) }

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.state) state = { ...state, ...changes.state.newValue }
  if (area === 'local' && changes.paused) paused = changes.paused.newValue === true
  void draw()
})

Promise.all([chrome.storage.session.get('state'), chrome.storage.local.get('paused')]).then(([session, local]) => {
  if (session.state) state = { ...state, ...session.state }
  paused = local.paused === true
  void draw()
})
setInterval(() => void draw(), 10_000)
