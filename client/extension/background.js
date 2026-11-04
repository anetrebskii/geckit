const HOST = 'org.geckit.browser'

let port

function connect() {
  if (port !== undefined) return
  try { port = chrome.runtime.connectNative(HOST) } catch { port = undefined; return }
  port.onMessage.addListener((request) => {
    answer(request).then(
      (result) => port?.postMessage({ id: request.id, ok: true, result }),
      (error) => port?.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
  })
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError
    port = undefined
  })
}

chrome.alarms.create('connect', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(connect)
chrome.runtime.onStartup.addListener(connect)
chrome.runtime.onInstalled.addListener(connect)
connect()

async function tab(id) {
  if (!Number.isInteger(id)) throw new Error('Give the tab id from geckit browser pages.')
  try { return await chrome.tabs.get(id) } catch { throw new Error(`No tab ${id}. Run geckit browser pages for the current ids.`) }
}

async function inPage(id, func, ...args) {
  const target = await tab(id)
  if (!/^(https?|file):/.test(target.url ?? '')) throw new Error(`Tab ${id} shows ${target.url}, which Chrome does not let extensions read.`)
  const [frame] = await chrome.scripting.executeScript({ target: { tabId: id }, func, args })
  if (frame === undefined) throw new Error(`Tab ${id} did not answer.`)
  if (frame.result && frame.result.error) throw new Error(frame.result.error)
  return frame.result
}

async function debug(id, steps) {
  await tab(id)
  const target = { tabId: id }
  try { await chrome.debugger.attach(target, '1.3') } catch (error) { throw new Error(`Could not attach to tab ${id}: ${error.message}`, { cause: error }) }
  try { return await steps((method, params) => chrome.debugger.sendCommand(target, method, params)) } finally { await chrome.debugger.detach(target).catch(() => undefined) }
}

function loaded(id) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listen); clearTimeout(timer); resolve() }
    const listen = (changed, info) => { if (changed === id && info.status === 'complete') done() }
    const timer = setTimeout(done, 20000)
    chrome.tabs.onUpdated.addListener(listen)
  })
}

const KEYS = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  PageUp: { code: 'PageUp', keyCode: 33 },
  PageDown: { code: 'PageDown', keyCode: 34 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
  Space: { code: 'Space', keyCode: 32, key: ' ', text: ' ' },
}

async function answer(request) {
  const id = request.tab
  switch (request.cmd) {
    case 'ping': return { version: chrome.runtime.getManifest().version }
    case 'pages': return (await chrome.tabs.query({})).map((one) => ({ id: one.id, window: one.windowId, active: one.active, title: one.title ?? '', url: one.url ?? '' }))
    case 'open': {
      const made = await chrome.tabs.create({ url: request.url, active: false })
      await loaded(made.id)
      const now = await chrome.tabs.get(made.id)
      return { id: now.id, title: now.title ?? '', url: now.url ?? '' }
    }
    case 'go': {
      await tab(id)
      await chrome.tabs.update(id, { url: request.url })
      await loaded(id)
      const now = await chrome.tabs.get(id)
      return { id, title: now.title ?? '', url: now.url ?? '' }
    }
    case 'close': await tab(id); await chrome.tabs.remove(id); return {}
    case 'text': return inPage(id, pageText)
    case 'read': return inPage(id, pageRead)
    case 'click': {
      await inPage(id, pagePointer, request.ref, 'click')
      if (!request.real) return inPage(id, pageClick, request.ref)
      const at = await inPage(id, pageCenter, request.ref)
      return debug(id, async (send) => {
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 })
        return { clicked: at.label }
      })
    }
    case 'type': await inPage(id, pagePointer, request.ref, 'type'); return inPage(id, pageType, request.ref, request.text)
    case 'scroll': await inPage(id, pagePointer, request.ref, 'scroll'); return inPage(id, pageScroll, request.ref, request.by)
    case 'key': {
      await inPage(id, pagePointer, undefined, 'key')
      const key = KEYS[request.key] ?? (request.key.length === 1 ? { key: request.key, text: request.key, code: '', keyCode: request.key.toUpperCase().charCodeAt(0) } : undefined)
      if (key === undefined) throw new Error(`Unknown key ${request.key}. Known: ${Object.keys(KEYS).join(', ')} or one character.`)
      return debug(id, async (send) => {
        const base = { key: key.key ?? request.key, code: key.code, windowsVirtualKeyCode: key.keyCode }
        await send('Input.dispatchKeyEvent', { type: key.text ? 'keyDown' : 'rawKeyDown', ...base, text: key.text })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
        return { pressed: base.key }
      })
    }
    case 'eval': return debug(id, async (send) => {
      const done = await send('Runtime.evaluate', { expression: request.code, awaitPromise: true, returnByValue: true, userGesture: true })
      if (done.exceptionDetails) throw new Error(done.exceptionDetails.exception?.description ?? done.exceptionDetails.text)
      return { value: done.result.value ?? null, type: done.result.type }
    })
    case 'shot': {
      const target = await tab(id)
      if (target.active) {
        const url = await chrome.tabs.captureVisibleTab(target.windowId, { format: 'png' })
        return { png: url.slice(url.indexOf(',') + 1) }
      }
      return debug(id, async (send) => ({ png: (await send('Page.captureScreenshot', { format: 'png' })).data }))
    }
    default: throw new Error(`Unknown command ${request.cmd}.`)
  }
}

function pageText() {
  const root = document.querySelector('main, [role="main"], article') ?? document.body
  const text = (root?.innerText ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { title: document.title, url: location.href, text }
}

function pageRead() {
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), textarea, select, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="textbox"], [role="combobox"], [role="searchbox"], [contenteditable=""], [contenteditable="true"], h1, h2, h3'
  const all = []
  const walk = (root) => {
    for (const one of root.querySelectorAll(INTERACTIVE)) all.push(one)
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) walk(host.shadowRoot)
  }
  walk(document)
  const shown = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    const box = el.getBoundingClientRect()
    return box.width > 0 && box.height > 0
  }
  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim()
  const name = (el) => {
    const labelled = el.getAttribute('aria-labelledby')
    const byId = labelled ? clean(labelled.split(/\s+/).map((one) => document.getElementById(one)?.innerText ?? '').join(' ')) : ''
    const label = el.labels?.[0] ? clean(el.labels[0].innerText) : ''
    const before = el.previousSibling?.nodeType === Node.TEXT_NODE ? clean(el.previousSibling.textContent) : clean(el.previousElementSibling?.innerText)
    return clean(el.getAttribute('aria-label')) || byId || label || clean(el.getAttribute('alt')) || clean(el.innerText) || clean(el.getAttribute('title')) || clean(el.getAttribute('placeholder')) || clean(el.querySelector('img[alt]')?.getAttribute('alt')) || clean(el.querySelector('[title], [aria-label]')?.getAttribute('title') ?? el.querySelector('[aria-label]')?.getAttribute('aria-label')) || (role(el) === 'textbox' && before.length <= 40 ? before : '') || clean(el.getAttribute('name'))
  }
  const role = (el) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return tag
    if (el.getAttribute('role')) return el.getAttribute('role')
    if (el.isContentEditable) return 'textbox'
    if (tag === 'a') return 'link'
    if (tag === 'input') return el.type === 'checkbox' || el.type === 'radio' ? el.type : el.type === 'submit' || el.type === 'button' ? 'button' : 'textbox'
    return tag
  }
  const counter = document.documentElement
  let next = Number(counter.dataset.geckitNext ?? '1')
  const lines = []
  const seen = new Set()
  const items = new Map()
  let inside = null
  for (const el of all) {
    if (seen.has(el) || !shown(el)) continue
    seen.add(el)
    const item = el.closest('article, [role="article"]')
    if (item !== inside) {
      inside = item
      if (item !== null) {
        if (!items.has(item)) items.set(item, items.size + 1)
        lines.push(`--- item ${items.get(item)} ---`)
      }
    }
    if (el.closest('a[href], button, [role="button"], [role="link"]') !== el && el.parentElement?.closest('a[href], button, [role="button"], [role="link"]') && !/^H[1-3]$/.test(el.tagName)) continue
    const kind = role(el)
    let said = name(el).slice(0, 100)
    if (kind.startsWith('h')) { if (said) lines.push(`${'#'.repeat(Number(kind[1]))} ${said}`); continue }
    if (el.dataset.geckitRef === undefined) el.dataset.geckitRef = String(next++)
    const extra = []
    if ('value' in el && el.value && kind === 'textbox') extra.push(`value="${clean(el.value).slice(0, 60)}"`)
    if (el.isContentEditable && clean(el.innerText)) { extra.push(`text="${clean(el.innerText).slice(0, 60)}"`); said = clean(el.getAttribute('aria-label')) || clean(el.getAttribute('aria-placeholder')) }
    if (el.checked) extra.push('checked')
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') extra.push('disabled')
    if (kind === 'link') { const href = el.getAttribute('href'); if (href && !href.startsWith('javascript:')) extra.push(href.length > 80 ? `${href.slice(0, 80)}...` : href) }
    lines.push(`[${el.dataset.geckitRef}] ${kind} "${said}"${extra.length ? ` ${extra.join(' ')}` : ''}`)
  }
  counter.dataset.geckitNext = String(next)
  return { title: document.title, url: location.href, lines }
}

function pageCenter(ref) {
  const find = (root) => {
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, label: (el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60) }
}

function pageClick(ref) {
  const find = (root) => {
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const box = el.getBoundingClientRect()
  const at = { bubbles: true, cancelable: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 0, view: window }
  el.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mousedown', at))
  if (typeof el.focus === 'function') el.focus()
  el.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mouseup', at))
  el.click()
  return { clicked: (el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60) }
}

function pageType(ref, text) {
  const find = (root) => {
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  el.scrollIntoView({ block: 'center' })
  el.focus()
  if (el.isContentEditable) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.execCommand(text === '' ? 'delete' : 'insertText', false, text)
    return { typed: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 100) }
  }
  if (!('value' in el)) return { error: `Element ${ref} is not a field you can type into.` }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  return { typed: String(el.value).slice(0, 100) }
}

function pageScroll(ref, by) {
  if (ref !== undefined) {
    const find = (root) => {
      const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
      if (hit) return hit
      for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
      return null
    }
    const el = find(document)
    if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
    el.scrollIntoView({ block: 'center' })
  } else {
    window.scrollBy(0, by * window.innerHeight * 0.8)
  }
  return { y: Math.round(window.scrollY), height: document.documentElement.scrollHeight, viewport: window.innerHeight }
}

async function pagePointer(ref, kind) {
  const SETTLE = 180
  const TRAVEL = 360
  const REST = 3000
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let overlay = window.geckitPointer
  if (!overlay || !overlay.host.isConnected) {
    const host = document.createElement('geckit-pointer')
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;'
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `<style>
      :host { --accent: #1f8031; --ease: cubic-bezier(0.2, 0.8, 0.3, 1); --settle: ${SETTLE}ms; --travel: ${TRAVEL}ms; }
      .edge { position: fixed; inset: 0; box-shadow: inset 0 0 0 2px var(--accent); opacity: 0; transition: opacity var(--settle) var(--ease); }
      .pointer { position: fixed; left: 0; top: 0; width: 20px; height: 24px; margin: -2px 0 0 -2px; opacity: 0; transition: transform var(--travel) var(--ease), opacity var(--settle) var(--ease); }
      .ring { position: fixed; left: 0; top: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 2px solid var(--accent); border-radius: 50%; opacity: 0; }
      .on { opacity: 1; }
      :host(.still) .pointer { transition: opacity var(--settle) var(--ease); }
      @keyframes ring { from { opacity: 0.9; transform: var(--at) scale(0.4); } to { opacity: 0; transform: var(--at) scale(1.4); } }
      @keyframes ring-still { from { opacity: 0.9; transform: var(--at); } to { opacity: 0; transform: var(--at); } }
    </style>
    <div class="edge"></div><div class="ring"></div>
    <svg class="pointer" viewBox="0 0 20 24" aria-hidden="true"><path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    document.documentElement.append(host)
    overlay = { host, root, x: innerWidth / 2, y: innerHeight - 40, timer: 0 }
    window.geckitPointer = overlay
  }
  const { root } = overlay
  root.host.classList.toggle('still', still)
  const edge = root.querySelector('.edge')
  const pointer = root.querySelector('.pointer')
  const ring = root.querySelector('.ring')
  clearTimeout(overlay.timer)
  edge.classList.add('on')
  const rest = () => { overlay.timer = setTimeout(() => { edge.classList.remove('on'); pointer.classList.remove('on') }, REST) }
  if (ref === undefined) { rest(); return {} }
  const find = (where) => {
    const hit = where.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const one of where.querySelectorAll('*')) if (one.shadowRoot) { const inner = find(one.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) { rest(); return {} }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  const box = el.getBoundingClientRect()
  const x = kind === 'type' ? box.left + Math.min(12, box.width / 2) : box.left + box.width / 2
  const y = box.top + box.height / 2
  const wasShown = pointer.classList.contains('on')
  if (!wasShown || still) {
    pointer.style.transition = 'none'
    pointer.style.transform = `translate(${still ? x : overlay.x}px, ${still ? y : overlay.y}px)`
    pointer.getBoundingClientRect()
    pointer.style.transition = ''
  }
  pointer.classList.add('on')
  pointer.style.transform = `translate(${x}px, ${y}px)`
  overlay.x = x
  overlay.y = y
  await new Promise((done) => setTimeout(done, still ? SETTLE : TRAVEL))
  if (kind === 'click') {
    ring.style.setProperty('--at', `translate(${x}px, ${y}px)`)
    ring.style.animation = 'none'
    ring.getBoundingClientRect()
    ring.style.animation = `${still ? 'ring-still' : 'ring'} ${SETTLE}ms cubic-bezier(0.2, 0.8, 0.3, 1)`
  }
  rest()
  return {}
}
