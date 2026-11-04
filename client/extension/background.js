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

// Tabs the debugger stays attached to, because what view emulates lasts only while it does.
const held = new Map()
chrome.debugger.onDetach.addListener((source) => { held.delete(source.tabId) })

async function debug(id, steps, keep = false) {
  await tab(id)
  const target = { tabId: id }
  const had = held.has(id)
  if (!had) {
    try { await chrome.debugger.attach(target, '1.3') } catch (error) { throw new Error(`Could not attach to tab ${id}: ${error.message}`, { cause: error }) }
  }
  try { return await steps((method, params) => chrome.debugger.sendCommand(target, method, params)) } finally {
    if (!had && !keep && !held.has(id)) await chrome.debugger.detach(target).catch(() => undefined)
  }
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

async function readable(id) {
  return /^(https?|file):/.test((await tab(id)).url ?? '')
}

// Hides GeckIt's own pointer while a picture is taken, so a design check sees the page alone.
async function withoutPointer(id, keep, steps) {
  const hide = !keep && await readable(id)
  if (hide) await inPage(id, pageOverlay, false)
  try { return await steps() } finally { if (hide) await inPage(id, pageOverlay, true).catch(() => undefined) }
}

function base64(bytes) {
  let out = ''
  for (let at = 0; at < bytes.length; at += 0x8000) out += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(out)
}

const bytesOf = (data) => Uint8Array.from(atob(data), (one) => one.charCodeAt(0))

async function press(send, name) {
  const key = KEYS[name] ?? (name.length === 1 ? { key: name, text: name, code: '', keyCode: name.toUpperCase().charCodeAt(0) } : undefined)
  if (key === undefined) throw new Error(`Unknown key ${name}. Known: ${Object.keys(KEYS).join(', ')} or one character.`)
  const base = { key: key.key ?? name, code: key.code, windowsVirtualKeyCode: key.keyCode }
  await send('Input.dispatchKeyEvent', { type: key.text ? 'keyDown' : 'rawKeyDown', ...base, text: key.text })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  return base.key
}

async function mouse(send, at, click) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
  if (!click) return
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
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

const GROUP = 'GeckIt'

// Tabs GeckIt opens go into one green group per window; a tab the person opened stays where it is and gets a green dot on the toolbar icon instead.
async function claim(id, opened) {
  try {
    await chrome.action.setBadgeText({ tabId: id, text: ' ' })
    await chrome.action.setBadgeBackgroundColor({ tabId: id, color: '#1f8031' })
    await chrome.action.setTitle({ tabId: id, title: 'GeckIt has worked in this tab' })
    if (!opened) return
    const target = await chrome.tabs.get(id)
    const [group] = await chrome.tabGroups.query({ windowId: target.windowId, title: GROUP })
    if (group !== undefined) { await chrome.tabs.group({ tabIds: id, groupId: group.id }); return }
    const made = await chrome.tabs.group({ tabIds: id, createProperties: { windowId: target.windowId } })
    await chrome.tabGroups.update(made, { title: GROUP, color: 'green', collapsed: false })
  } catch { /* marking a tab is worth having, never worth failing the request over */ }
}

async function answer(request) {
  const id = request.tab
  if (Number.isInteger(id) && request.cmd !== 'close') await claim(id, false)
  switch (request.cmd) {
    case 'ping': return { version: chrome.runtime.getManifest().version }
    case 'pages': return (await chrome.tabs.query({})).map((one) => ({ id: one.id, window: one.windowId, active: one.active, title: one.title ?? '', url: one.url ?? '' }))
    case 'open': {
      const made = await chrome.tabs.create({ url: request.url, active: false })
      await claim(made.id, true)
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
      return debug(id, async (send) => { await mouse(send, at, true); return { clicked: at.label } })
    }
    case 'hover': {
      await inPage(id, pagePointer, request.ref, 'hover')
      const at = await inPage(id, pageCenter, request.ref)
      return debug(id, async (send) => { await mouse(send, at, false); return { hovered: at.label } })
    }
    case 'type': await inPage(id, pagePointer, request.ref, 'type'); return inPage(id, pageType, request.ref, request.text)
    case 'scroll': await inPage(id, pagePointer, request.ref, 'scroll'); return inPage(id, pageScroll, request.ref, request.by)
    case 'key': {
      await inPage(id, pagePointer, undefined, 'key')
      return debug(id, async (send) => ({ pressed: await press(send, request.key) }))
    }
    case 'eval': return debug(id, async (send) => {
      const done = await send('Runtime.evaluate', { expression: request.code, awaitPromise: true, returnByValue: true, userGesture: true })
      if (done.exceptionDetails) throw new Error(done.exceptionDetails.exception?.description ?? done.exceptionDetails.text)
      return { value: done.result.value ?? null, type: done.result.type }
    })
    case 'shot': return withoutPointer(id, request.pointer, async () => {
      const target = await tab(id)
      if (request.ref !== undefined) {
        const box = await inPage(id, pageBox, request.ref, 8)
        return debug(id, async (send) => ({ png: (await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x + box.scrollX, y: box.y + box.scrollY, width: box.width, height: box.height, scale: 1 } })).data }))
      }
      if (target.active && !held.has(id)) {
        await wait(50)
        const url = await Promise.race([chrome.tabs.captureVisibleTab(target.windowId, { format: 'png' }).catch(() => undefined), wait(1500)])
        if (typeof url === 'string') return { png: url.slice(url.indexOf(',') + 1) }
      }
      return debug(id, async (send) => ({ png: (await send('Page.captureScreenshot', { format: 'png' })).data }))
    })
    case 'style': return inPage(id, pageStyle, request.ref)
    case 'view': {
      if (request.reset) {
        if (held.has(id)) {
          await debug(id, async (send) => {
            await send('Emulation.clearDeviceMetricsOverride')
            await send('Emulation.setEmulatedMedia', { features: [] })
          })
          held.delete(id)
          await chrome.debugger.detach({ tabId: id }).catch(() => undefined)
        }
        return { reset: true }
      }
      const next = { ...(held.get(id) ?? {}), ...request.set }
      return debug(id, async (send) => {
        if (next.width !== undefined) await send('Emulation.setDeviceMetricsOverride', { width: next.width, height: next.height, deviceScaleFactor: next.phone ? 3 : 0, mobile: next.phone === true })
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: next.scheme ?? '' }, { name: 'prefers-reduced-motion', value: next.motion ?? '' }] })
        held.set(id, next)
        const size = await send('Runtime.evaluate', { expression: '[innerWidth, innerHeight, matchMedia("(prefers-color-scheme: dark)").matches, matchMedia("(prefers-reduced-motion: reduce)").matches]', returnByValue: true })
        const [width, height, dark, still] = size.result.value
        return { width, height, dark, still }
      }, true)
    }
    case 'record': return record(id, request)
    default: throw new Error(`Unknown command ${request.cmd}.`)
  }
}

// Takes pictures of a tab as fast as Chrome takes screenshots while something on it moves; screenshots, unlike a screencast, come from a tab in the background or a window behind others too.
async function record(id, request) {
  const slow = request.slow ?? 1
  const box = request.ref === undefined ? undefined : await inPage(id, pageBox, request.ref, 16)
  const at = request.then?.ref === undefined ? undefined : await inPage(id, pageCenter, request.then.ref)
  return withoutPointer(id, request.pointer, () => debug(id, async (send) => {
    const frames = []
    if (slow !== 1) await inPage(id, pageSlow, slow)
    let polling = true
    const poll = (async () => {
      while (polling) {
        const asked = Date.now()
        const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
        frames.push({ data: shot.data, t: (asked + Date.now()) / 2 })
      }
    })()
    try {
      if (request.then?.cmd === 'hover') await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
      await wait(200)
      const start = Date.now()
      let did = 'nothing'
      if (request.pointer && at !== undefined) { await inPage(id, pageOverlay, true); await inPage(id, pagePointer, request.then.ref, request.then.cmd) }
      if (request.then?.cmd === 'click') { await mouse(send, at, true); did = `clicked ${at.label}` }
      if (request.then?.cmd === 'hover') { await mouse(send, at, false); did = `hovered ${at.label}` }
      if (request.then?.cmd === 'key') did = `pressed ${await press(send, request.then.key)}`
      await wait(request.ms * slow)
      polling = false
      await poll
      const before = frames.filter((one) => one.t < start).at(-1)
      const after = frames.filter((one) => one.t >= start && one.t <= start + request.ms * slow + 100)
      const kept = (before === undefined ? after : [{ ...before, t: start }, ...after]).map((one) => ({ ms: Math.round((one.t - start) / slow), data: one.data }))
      if (kept.length === 0) throw new Error('Chrome drew nothing while recording.')
      const step = Math.max(1, Math.ceil(kept.length / 90))
      const sent = kept.filter((_one, at) => at % step === 0 || at === kept.length - 1)
      const sheet = await contactSheet(sent, box)
      const gif = await animation(sent, box)
      return { did, slow, frames: sent, sheet, gif, total: kept.length }
    } finally {
      polling = false
      if (slow !== 1) await inPage(id, pageSlow, 1).catch(() => undefined)
    }
  }))
}

async function bitmaps(frames, box) {
  return Promise.all(frames.map(async (one) => {
    const whole = await createImageBitmap(new Blob([bytesOf(one.data)], { type: 'image/jpeg' }))
    if (box === undefined) return whole
    const ratio = whole.width / box.viewport
    const cut = await createImageBitmap(whole, Math.round(box.x * ratio), Math.round(box.y * ratio), Math.max(1, Math.round(box.width * ratio)), Math.max(1, Math.round(box.height * ratio)))
    whole.close()
    return cut
  }))
}

// One picture with up to twelve frames picked evenly in time and the time of each, which costs a look at one image instead of dozens.
async function contactSheet(frames, box) {
  const count = Math.min(12, frames.length)
  const picked = Array.from({ length: count }, (_one, at) => frames[count === 1 ? 0 : Math.round((at * (frames.length - 1)) / (count - 1))])
  const images = await bitmaps(picked, box)
  const columns = count <= 4 ? count : count <= 9 ? 3 : 4
  const rows = Math.ceil(count / columns)
  const cell = Math.min(480, images[0].width)
  const scale = cell / images[0].width
  const high = Math.round(images[0].height * scale)
  const gap = 8
  const label = 20
  const canvas = new OffscreenCanvas(columns * cell + (columns + 1) * gap, rows * (high + label) + (rows + 1) * gap)
  const draw = canvas.getContext('2d')
  draw.fillStyle = '#d9d9d9'
  draw.fillRect(0, 0, canvas.width, canvas.height)
  draw.font = '13px -apple-system, system-ui, sans-serif'
  images.forEach((image, at) => {
    const x = gap + (at % columns) * (cell + gap)
    const y = gap + Math.floor(at / columns) * (high + label + gap)
    draw.fillStyle = '#111111'
    draw.fillText(`${picked[at].ms} ms`, x + 2, y + 14)
    draw.drawImage(image, x, y + label, cell, high)
    image.close()
  })
  return base64(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()))
}

// An animated GIF at the page's own speed, for a person to watch; colours are cut to 252 with ordered dithering.
async function animation(all, box) {
  const frames = all.filter((one, at) => at === 0 || at === all.length - 1 || one.data !== all[at - 1].data)
  const images = await bitmaps(frames, box)
  const scale = Math.min(1, 480 / images[0].width)
  const width = Math.max(1, Math.round(images[0].width * scale))
  const height = Math.max(1, Math.round(images[0].height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const draw = canvas.getContext('2d', { willReadFrequently: true })
  const parts = []
  const head = [...[...'GIF89a'].map((one) => one.charCodeAt(0)), width & 255, width >> 8, height & 255, height >> 8, 0xf7, 0, 0]
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) head.push(Math.round((r * 255) / 5), Math.round((g * 255) / 6), Math.round((b * 255) / 5))
  for (let rest = 252; rest < 256; rest++) head.push(0, 0, 0)
  head.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((one) => one.charCodeAt(0)), 3, 1, 0, 0, 0)
  parts.push(Uint8Array.from(head))
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((one) => one / 16 - 0.5)
  const indexes = new Uint8Array(width * height)
  images.forEach((image, at) => {
    draw.drawImage(image, 0, 0, width, height)
    image.close()
    const pixels = draw.getImageData(0, 0, width, height).data
    for (let y = 0, i = 0; y < height; y++) {
      const row = (y & 3) * 4
      for (let x = 0; x < width; x++, i++) {
        const d = bayer[row + (x & 3)]
        const p = i * 4
        const r = Math.min(5, Math.max(0, Math.round(pixels[p] * 0.0196078 + d)))
        const g = Math.min(6, Math.max(0, Math.round(pixels[p + 1] * 0.0235294 + d)))
        const b = Math.min(5, Math.max(0, Math.round(pixels[p + 2] * 0.0196078 + d)))
        indexes[i] = r * 42 + g * 6 + b
      }
    }
    const next = frames[at + 1]
    const delay = Math.max(2, Math.round((next === undefined ? 600 : next.ms - frames[at].ms) / 10))
    parts.push(Uint8Array.from([0x21, 0xf9, 4, 0, delay & 255, delay >> 8, 0, 0, 0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0, 8]))
    const data = lzw(indexes)
    const blocks = new Uint8Array(data.length + Math.ceil(data.length / 255) + 1)
    let to = 0
    for (let from = 0; from < data.length; from += 255) {
      const piece = data.subarray(from, from + 255)
      blocks[to++] = piece.length
      blocks.set(piece, to)
      to += piece.length
    }
    blocks[to] = 0
    parts.push(blocks)
  })
  parts.push(Uint8Array.of(0x3b))
  return base64(new Uint8Array(await new Blob(parts).arrayBuffer()))
}

// Codes are found through one table per run, stamped with the generation since the last clear, so a clear costs nothing.
const LZW_CODES = new Int32Array(4096 * 256)
const LZW_STAMPS = new Int32Array(4096 * 256)
let lzwGeneration = 0

function lzw(indexes) {
  const clear = 256
  const end = 257
  const bytes = new Uint8Array(indexes.length * 2 + 16)
  let length = 0
  let bits = 0
  let held = 0
  let size = 9
  const emit = (code) => {
    held |= code << bits
    bits += size
    while (bits >= 8) { bytes[length++] = held & 255; held >>>= 8; bits -= 8 }
  }
  let next = 258
  lzwGeneration++
  emit(clear)
  let prefix = indexes[0]
  for (let at = 1; at < indexes.length; at++) {
    const one = indexes[at]
    const key = prefix * 256 + one
    if (LZW_STAMPS[key] === lzwGeneration) { prefix = LZW_CODES[key]; continue }
    emit(prefix)
    if (next < 4096) {
      LZW_STAMPS[key] = lzwGeneration
      LZW_CODES[key] = next++
      if (next > (1 << size) && size < 12) size++
    } else {
      emit(clear)
      lzwGeneration++
      next = 258
      size = 9
    }
    prefix = one
  }
  emit(prefix)
  emit(end)
  if (bits > 0) bytes[length++] = held & 255
  return bytes.subarray(0, length)
}

// Plays the page's CSS transitions, CSS animations and Web Animations slower, each as it starts, since the debugger's Animation domain is closed to extensions.
function pageSlow(slow) {
  const state = window.geckitSlow ?? (window.geckitSlow = { slowed: new Set(), listen: undefined })
  if (state.listen) {
    for (const name of ['transitionrun', 'animationstart']) removeEventListener(name, state.listen, true)
    clearInterval(state.timer)
    state.listen = undefined
  }
  for (const one of state.slowed) one.updatePlaybackRate(1)
  state.slowed.clear()
  if (slow === 1) return {}
  const catchUp = () => {
    for (const one of document.getAnimations()) {
      if (state.slowed.has(one)) continue
      state.slowed.add(one)
      one.updatePlaybackRate(1 / slow)
    }
  }
  state.listen = catchUp
  for (const name of ['transitionrun', 'animationstart']) addEventListener(name, catchUp, true)
  state.timer = setInterval(catchUp, 16)
  catchUp()
  return {}
}

function pageOverlay(shown) {
  const overlay = window.geckitPointer
  if (overlay && overlay.host.isConnected) overlay.host.style.visibility = shown ? '' : 'hidden'
  return {}
}

function pageBox(ref, pad) {
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
  const x = Math.max(0, box.left - pad)
  const y = Math.max(0, box.top - pad)
  return { x, y, width: Math.max(1, Math.min(innerWidth, box.right + pad) - x), height: Math.max(1, Math.min(innerHeight, box.bottom + pad) - y), scrollX, scrollY, viewport: innerWidth }
}

// The computed style of an element without the values every element has, so a design check reads a dozen lines.
function pageStyle(ref) {
  const find = (root) => {
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  const s = getComputedStyle(el)
  const box = el.getBoundingClientRect()
  const lines = [`size: ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.left)},${Math.round(box.top)}`]
  const add = (name, value, ...plain) => { if (value && !plain.includes(value)) lines.push(`${name}: ${value}`) }
  const sides = (name) => {
    const [top, right, bottom, left] = ['top', 'right', 'bottom', 'left'].map((side) => s.getPropertyValue(`${name}-${side}`))
    if (left !== right) return `${top} ${right} ${bottom} ${left}`
    if (top !== bottom) return `${top} ${right} ${bottom}`
    return top === right ? top : `${top} ${right}`
  }
  add('display', s.display)
  add('position', s.position, 'static')
  add('font', `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0].trim()}`)
  add('letter-spacing', s.letterSpacing, 'normal')
  add('text-transform', s.textTransform, 'none')
  add('color', s.color)
  add('background', s.backgroundColor, 'rgba(0, 0, 0, 0)')
  add('background-image', s.backgroundImage, 'none')
  const border = ['top', 'right', 'bottom', 'left'].map((side) => `${s.getPropertyValue(`border-${side}-width`)} ${s.getPropertyValue(`border-${side}-style`)} ${s.getPropertyValue(`border-${side}-color`)}`)
  if (border.some((one) => !one.includes(' none '))) add('border', border.every((one) => one === border[0]) ? border[0] : border.join(', '))
  add('border-radius', s.borderRadius, '0px')
  add('padding', sides('padding'), '0px')
  add('margin', sides('margin'), '0px')
  add('gap', s.gap, 'normal')
  add('box-shadow', s.boxShadow, 'none')
  add('outline', s.outlineStyle === 'none' ? '' : `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`)
  add('opacity', s.opacity, '1')
  add('transform', s.transform, 'none')
  add('filter', s.filter, 'none')
  add('backdrop-filter', s.backdropFilter, 'none')
  add('z-index', s.zIndex, 'auto')
  add('cursor', s.cursor, 'auto')
  add('transition', s.transition, 'all 0s ease 0s', 'all')
  add('animation', s.animationName === 'none' ? '' : `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction} ${s.animationIterationCount}`)
  return { name: (el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60), lines }
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
