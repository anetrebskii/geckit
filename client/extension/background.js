const HOST = 'org.geckit.browser'

const PAUSED = 'The person paused GeckIt in Chrome. Ask them to turn on Let GeckIt use Chrome in the GeckIt Browser button.'

// What the toolbar panel shows, kept in session storage so it outlives the service worker but not Chrome.
let state = { connected: false, busy: null, tabs: {}, views: {}, log: [] }
const ready = chrome.storage.session.get('state').then((got) => { if (got.state) state = { ...state, ...got.state } }, () => undefined)
let saving = Promise.resolve()

function save(change) {
  saving = saving.then(async () => { await ready; change(state); await chrome.storage.session.set({ state }) }).catch(() => undefined)
  return saving
}

let port

function connect() {
  if (port !== undefined) return
  try { port = chrome.runtime.connectNative(HOST) } catch { port = undefined; return }
  const mine = port
  setTimeout(() => { if (port === mine) { void save((now) => { now.connected = true }); void announce() } }, 1000)
  port.onMessage.addListener((request) => {
    run(request).then(
      (result) => port?.postMessage({ id: request.id, ok: true, result }),
      (error) => port?.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
    )
  })
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError
    if (port === mine) port = undefined
    void save((now) => { now.connected = false; now.busy = null })
  })
}

const detailOf = (request, result) => request.cmd === 'open' || request.cmd === 'go' ? hostOf(request.url)
  : request.cmd === 'click' ? result?.clicked : request.cmd === 'hover' ? result?.hovered
  : request.cmd === 'upload' || request.cmd === 'drop' ? result?.into ?? result?.onto : request.cmd === 'download' ? result?.name : request.cmd === 'drag' ? result?.dragged
  : request.cmd === 'select' ? result?.typed : request.cmd === 'dialog' ? (request.accept ? 'accept' : 'dismiss') : request.cmd === 'permission' ? request.kind
  : request.cmd === 'read' ? request.find : request.cmd === 'key' ? request.key : request.cmd === 'record' ? request.ms : request.cmd === 'view' && request.reset ? 'reset' : undefined

function hostOf(url) {
  try { return new URL(url).host || url } catch { return url }
}

async function run(request) {
  if (request.cmd === 'ping' || request.cmd === 'reload') return answer(request)
  const open = dialogs.get(request.tab)
  if (open !== undefined && !['dialog', 'pages', 'close'].includes(request.cmd)) throw new Error(`Tab ${request.tab} shows ${open.type === 'alert' ? 'an' : 'a'} ${open.type} dialog: "${open.message}". Answer it first with dialog ${request.tab} accept or dismiss.`)
  const started = Date.now()
  const asked = Number.isInteger(request.tab) ? await chrome.tabs.get(request.tab).catch(() => undefined) : undefined
  const done = (result, error) => save((now) => {
    const id = request.cmd === 'open' ? result?.id : asked?.id
    const detail = detailOf(request, result)
    now.busy = null
    now.log = [{ t: started, cmd: request.cmd, tab: id, title: result?.title || asked?.title || '', detail, error }, ...now.log].slice(0, 30)
    if (id === undefined || error === PAUSED) return
    if (request.cmd === 'close' && error === undefined) { delete now.tabs[id]; delete now.views[id]; return }
    now.tabs[id] = { t: started, cmd: request.cmd, detail, error, opened: request.cmd === 'open' || now.tabs[id]?.opened === true }
  })
  if ((await chrome.storage.local.get('paused')).paused === true) { await done(undefined, PAUSED); throw new Error(PAUSED) }
  await save((now) => { now.busy = { t: started, cmd: request.cmd, tab: asked?.id, title: asked?.title ?? '', detail: detailOf(request) } })
  try {
    let result = await answer(request)
    const opened = dialogs.get(request.tab)
    if (opened !== undefined && request.cmd !== 'dialog' && result && typeof result === 'object') result = { ...result, dialog: opened }
    await done(result)
    return result
  } catch (error) {
    await done(undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

chrome.tabs.onRemoved.addListener((id) => { void save((now) => { delete now.tabs[id]; delete now.views[id] }) })

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.reset === undefined) return false
  answer({ cmd: 'view', tab: message.reset, reset: true }).then(() => reply({ ok: true }), (error) => reply({ ok: false, error: error.message }))
  return true
})

// Which profile this is and which tabs are its own, so the host can tell GeckIt where each tab lives when several profiles have the extension.
let focused = 0
async function announce() {
  if (port === undefined) return
  const who = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }).catch(() => ({ email: '' }))
  const tabs = (await chrome.tabs.query({})).map((one) => one.id)
  if (focused === 0 && (await chrome.windows.getAll()).some((one) => one.focused)) focused = Date.now()
  port?.postMessage({ event: 'profile', label: who.email, tabs, focused })
}
chrome.tabs.onCreated.addListener(() => void announce())
chrome.tabs.onRemoved.addListener(() => void announce())
chrome.windows.onFocusChanged.addListener((id) => { if (id !== chrome.windows.WINDOW_ID_NONE) { focused = Date.now(); void announce() } })

// A background tab GeckIt opened and stopped using is discarded, since its page keeps running after the conversation ends (a stuck Instagram reel held six cores for hours).
const IDLE = 10 * 60 * 1000
async function rest() {
  await ready
  const groups = await chrome.tabGroups.query({ title: GROUP }).catch(() => [])
  for (const group of groups) {
    for (const one of await chrome.tabs.query({ groupId: group.id })) {
      const used = Math.max(state.tabs[one.id]?.t ?? 0, one.lastAccessed ?? 0)
      if (Date.now() - used < IDLE || one.active || one.audible || one.discarded || held.has(one.id) || state.busy?.tab === one.id) continue
      await chrome.tabs.discard(one.id).catch(() => undefined)
    }
  }
}

chrome.tabs.onReplaced.addListener((added, removed) => {
  void save((now) => {
    if (now.tabs[removed]) { now.tabs[added] = now.tabs[removed]; delete now.tabs[removed] }
  })
  void announce()
})

chrome.alarms.create('connect', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(() => { connect(); void announce(); void rest() })
chrome.runtime.onStartup.addListener(connect)
chrome.runtime.onInstalled.addListener(connect)
connect()

async function tab(id) {
  if (!Number.isInteger(id)) throw new Error('Give the tab id from geckit browser pages.')
  let found
  try { found = await chrome.tabs.get(id) } catch { throw new Error(`No tab ${id}. Run geckit browser pages for the current ids.`) }
  if (!found.discarded) return found
  const back = loaded(id)
  await chrome.tabs.reload(id)
  await back
  return chrome.tabs.get(id)
}

const secretKeys = new Map()
const fromB64url = (text) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (one) => one.charCodeAt(0))
const toB64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

// A one-time key the broker seals a secret to, so only this extension and the page ever hold the value in clear.
async function secretKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const keyId = crypto.randomUUID()
  secretKeys.set(keyId, pair.privateKey)
  setTimeout(() => secretKeys.delete(keyId), 60_000)
  return { keyId, endpointKey: toB64url(await crypto.subtle.exportKey('raw', pair.publicKey)) }
}

async function openSecret(keyId, sealed) {
  const privateKey = secretKeys.get(keyId)
  secretKeys.delete(keyId)
  if (privateKey === undefined) throw new Error('The secret took too long to arrive. Try again.')
  const sender = await crypto.subtle.importKey('raw', fromB64url(sealed.epk), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: sender }, privateKey, 256)
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('geckit-fill-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(sealed.iv) }, key, fromB64url(sealed.data)))
}

function scrubSecrets(value, secrets) {
  if (secrets.length === 0 || value === undefined) return value
  let text = JSON.stringify(value)
  for (const one of secrets) {
    const quoted = JSON.stringify(one).slice(1, -1)
    text = text.split(quoted).join('[secret]')
  }
  return JSON.parse(text)
}

async function inPage(id, func, ...args) { return inFrame(id, 0, func, ...args) }

async function inFrame(id, frameId, func, ...args) {
  const target = await tab(id)
  if (!/^(https?|file):/.test(target.url ?? '')) throw new Error(`Tab ${id} shows ${target.url}, which Chrome does not let extensions read.`)
  let frame
  try { [frame] = await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [frameId] }, func, args }) } catch (error) {
    if (frameId !== 0) throw new Error(`Frame ${frameId} is gone from tab ${id}. Run geckit browser read again.`, { cause: error })
    throw error
  }
  if (frame === undefined) throw new Error(`Tab ${id} did not answer.`)
  if (frame.result && frame.result.error) throw new Error(frame.result.error)
  return frame.result
}

// A ref is "12" for the page itself, or "57.12" for element 12 inside the frame Chrome numbers 57.
function refAt(ref) {
  const text = String(ref)
  const dot = text.indexOf('.')
  return dot < 0 ? { frame: 0, ref: text } : { frame: Number(text.slice(0, dot)), ref: text.slice(dot + 1) }
}

async function inRef(id, ref, func, ...rest) {
  const at = refAt(ref)
  return inFrame(id, at.frame, func, at.ref, ...rest)
}

// Like inRef, with the point it returns moved from its frame's own viewport into the tab's.
async function atRef(id, ref, func, ...rest) {
  const at = refAt(ref)
  const found = await inFrame(id, at.frame, func, at.ref, ...rest)
  if (at.frame === 0) return found
  await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, func: pageFrames }).catch(() => undefined)
  const offset = await inFrame(id, at.frame, pageOffset)
  const top = await inPage(id, pageScrolled)
  return { ...found, x: found.x + offset.x, y: found.y + offset.y, ...(found.scrollX === undefined ? {} : top) }
}

// Every frame that can be read, the page first; a frame Chrome refuses is left out.
async function inFrames(id, func, ...args) {
  const target = await tab(id)
  if (!/^(https?|file):/.test(target.url ?? '')) throw new Error(`Tab ${id} shows ${target.url}, which Chrome does not let extensions read.`)
  const frames = await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, func, args }).catch(() => undefined)
  if (frames === undefined) return [{ frameId: 0, result: await inPage(id, func, ...args) }]
  return frames.filter((one) => one.result && !one.result.error).sort((a, b) => a.frameId - b.frameId)
}

async function readAll(id) {
  const frames = await inFrames(id, pageRead)
  const main = frames.find((one) => one.frameId === 0)?.result
  if (main === undefined) throw new Error(`Tab ${id} did not answer.`)
  const lines = [...main.lines]
  for (const one of frames) {
    if (one.frameId === 0 || one.result.hidden || one.result.lines.length === 0) continue
    lines.push(`--- frame ${one.frameId}: ${(one.result.title || one.result.url).slice(0, 80)} ---`)
    lines.push(...one.result.lines.map((line) => line.replace(/^\[(\d+)\]/, `[${one.frameId}.$1]`)))
  }
  return { title: main.title, url: main.url, lines }
}

// Tabs the debugger stays attached to, because what view emulates lasts only while it does.
const held = new Map()
// A dialog the page opened while GeckIt held its debugger: it stays attached until the dialog is answered.
const dialogs = new Map()
chrome.debugger.onDetach.addListener((source) => {
  held.delete(source.tabId)
  dialogs.delete(source.tabId)
  void save((now) => { delete now.views[source.tabId] })
})
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Page.javascriptDialogOpening') dialogs.set(source.tabId, { type: params.type, message: params.message ?? '', prompt: params.defaultPrompt ?? '' })
  if (method === 'Page.javascriptDialogClosed') dialogs.delete(source.tabId)
})

// The next event of one of the methods on a tab that passes the check, or undefined after ms.
function nextEvent(id, methods, ms, check = () => true) {
  const wanted = [methods].flat()
  return new Promise((done) => {
    const listen = (source, method, params) => { if (source.tabId === id && wanted.includes(method) && check(params)) finish(params) }
    const finish = (value) => { chrome.debugger.onEvent.removeListener(listen); clearTimeout(timer); done(value) }
    const timer = setTimeout(() => finish(undefined), ms)
    chrome.debugger.onEvent.addListener(listen)
  })
}

// A command the page answers only after a dialog it opens is closed: stop waiting when the dialog appears.
async function orDialog(id, work) {
  if (dialogs.has(id)) return {}
  work.catch(() => undefined)
  let stop
  const opened = new Promise((done) => {
    const listen = (source, method) => { if (source.tabId === id && method === 'Page.javascriptDialogOpening') done({}) }
    chrome.debugger.onEvent.addListener(listen)
    stop = () => chrome.debugger.onEvent.removeListener(listen)
  })
  try { return await Promise.race([work, opened]) } finally { stop() }
}

async function debug(id, steps, keep = false) {
  await tab(id)
  const target = { tabId: id }
  const had = held.has(id) || dialogs.has(id)
  if (!had) {
    try { await chrome.debugger.attach(target, '1.3') } catch (error) { throw new Error(`Could not attach to tab ${id}: ${error.message}`, { cause: error }) }
    await chrome.debugger.sendCommand(target, 'Page.enable').catch(() => undefined)
  }
  // A background tab draws no frames, and Chrome holds input, mouse moves above all, until the next frame; a one-pixel capture draws one.
  const paint = () => chrome.debugger.sendCommand(target, 'Page.captureScreenshot', { format: 'jpeg', quality: 1, clip: { x: 0, y: 0, width: 1, height: 1, scale: 1 } }).catch(() => undefined)
  let painted = false
  const send = async (method, params) => {
    if (!method.startsWith('Input.')) return chrome.debugger.sendCommand(target, method, params)
    if (!painted) { painted = true; await paint() }
    const sent = chrome.debugger.sendCommand(target, method, params)
    if (method === 'Input.dispatchDragEvent' || params?.type === 'mouseMoved') await paint()
    return orDialog(id, sent)
  }
  try { return await steps(send) } finally {
    if (!had && !keep && !held.has(id) && !dialogs.has(id)) await chrome.debugger.detach(target).catch(() => undefined)
  }
}

const MAC = navigator.userAgent.includes('Mac')
const FILE_ACCESS = 'Chrome lets GeckIt Browser give files to a page only with Allow access to file URLs on. Ask the person to turn it on in chrome://extensions, GeckIt Browser, Details.'

// Notes the tabs a page opens while an action runs, such as a sign-in popup.
async function noteOpened(steps) {
  const made = []
  const listen = (one) => made.push(one.id)
  chrome.tabs.onCreated.addListener(listen)
  try {
    const result = await steps()
    await wait(made.length > 0 ? 300 : 150)
    if (made.length === 0) return result
    const opened = (await Promise.all(made.map((one) => chrome.tabs.get(one).catch(() => undefined)))).filter((one) => one !== undefined).map((one) => ({ id: one.id, title: one.title ?? '', url: one.pendingUrl || one.url || '' }))
    return opened.length === 0 ? result : { ...result, opened }
  } finally { chrome.tabs.onCreated.removeListener(listen) }
}

async function upload(id, ref, files) {
  await inRef(id, ref, pagePointer, 'click')
  const at = await atRef(id, ref, pageCenter)
  return debug(id, async (send) => {
    await send('Page.setInterceptFileChooserDialog', { enabled: true })
    try {
      const chosen = nextEvent(id, 'Page.fileChooserOpened', 5000)
      await mouse(send, at, true)
      const chooser = await chosen
      if (chooser === undefined) throw new Error(`Clicking ${at.label} opened no file chooser. Give the button or field that opens one.`)
      if (chooser.mode === 'selectSingle' && files.length > 1) throw new Error(`${at.label} takes one file.`)
      await send('DOM.setFileInputFiles', { files, backendNodeId: chooser.backendNodeId }).catch((error) => { throw /not allowed/i.test(error.message) ? new Error(FILE_ACCESS) : error })
    } finally { await send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined) }
    return { chosen: files.length, into: at.label }
  })
}

async function dropFiles(id, ref, files) {
  await inRef(id, ref, pagePointer, 'hover')
  const at = await atRef(id, ref, pageGrab)
  return debug(id, async (send) => {
    const data = { items: [], files, dragOperationsMask: 1 }
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
    for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data }).catch((error) => { throw /not allowed/i.test(error.message) ? new Error(FILE_ACCESS) : error })
    return { dropped: files.length, onto: at.label }
  })
}

// Clicks and waits for the download it starts, saved under a name of Chrome's choosing in the folder GeckIt gave.
async function download(id, ref, folder) {
  await inRef(id, ref, pagePointer, 'click')
  const at = await atRef(id, ref, pageCenter)
  return debug(id, async (send) => {
    const behave = async (params) => {
      try { await send('Browser.setDownloadBehavior', { ...params, eventsEnabled: true }) } catch { await send('Page.setDownloadBehavior', params) }
    }
    await behave({ behavior: 'allowAndName', downloadPath: folder })
    try {
      const begun = nextEvent(id, ['Browser.downloadWillBegin', 'Page.downloadWillBegin'], 15000)
      await mouse(send, at, true)
      const started = await begun
      if (started === undefined) throw new Error(`Clicking ${at.label} started no download within 15 seconds.`)
      const ended = await nextEvent(id, ['Browser.downloadProgress', 'Page.downloadProgress'], 50000, (one) => one.guid === started.guid && one.state !== 'inProgress')
      if (ended === undefined) throw new Error(`${started.suggestedFilename} was still downloading after 50 seconds.`)
      if (ended.state !== 'completed') throw new Error(`The download of ${started.suggestedFilename} was canceled.`)
      return { guid: started.guid, name: started.suggestedFilename, url: started.url.startsWith('data:') ? 'data:' : started.url, bytes: ended.receivedBytes }
    } finally { await behave({ behavior: 'default' }).catch(() => undefined) }
  })
}

// Presses on one element and moves to another or by an offset, as a hand drags; a page's own drag and drop gets Chrome's drag events.
async function drag(id, request) {
  await inRef(id, request.ref, pagePointer, 'hover')
  let from = await atRef(id, request.ref, pageGrab)
  const target = request.to === undefined ? undefined : await atRef(id, request.to, pageGrab)
  if (target !== undefined) from = await atRef(id, request.ref, pageGrab)
  const to = target ?? { x: from.x + request.offset.x, y: from.y + request.offset.y, label: `${request.offset.x},${request.offset.y}` }
  return debug(id, async (send) => {
    let data
    const listen = (source, method, params) => { if (source.tabId === id && method === 'Input.dragIntercepted') data = params.data }
    chrome.debugger.onEvent.addListener(listen)
    await send('Input.setInterceptDrags', { enabled: true })
    try {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
      let entered = false
      const steps = 12
      for (let step = 1; step <= steps; step++) {
        const x = from.x + ((to.x - from.x) * step) / steps
        const y = from.y + ((to.y - from.y) * step) / steps
        if (data === undefined) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
        else { await send('Input.dispatchDragEvent', { type: entered ? 'dragOver' : 'dragEnter', x, y, data }); entered = true }
        await wait(20)
      }
      if (data !== undefined) {
        await send('Input.dispatchDragEvent', { type: 'dragOver', x: to.x, y: to.y, data })
        await send('Input.dispatchDragEvent', { type: 'drop', x: to.x, y: to.y, data })
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 })
    } finally {
      chrome.debugger.onEvent.removeListener(listen)
      await send('Input.setInterceptDrags', { enabled: false }).catch(() => undefined)
    }
    return { dragged: from.label, to: to.label }
  })
}

// Waits for the page to finish loading, a text to appear or go, or the address to change, checking four times a second.
async function waitFor(id, request) {
  const started = Date.now()
  for (;;) {
    const now = await tab(id)
    let ok = !request.load || now.status === 'complete'
    if (ok && request.url !== undefined) ok = (now.url ?? '').includes(request.url)
    if (ok && (request.text !== undefined || request.gone !== undefined)) {
      const seen = (await inFrames(id, pageHas, request.text ?? request.gone).catch(() => [])).some((one) => one.result === true)
      ok = request.text !== undefined ? seen : !seen
    }
    if (ok) return { waited: Date.now() - started, title: now.title ?? '', url: now.url ?? '' }
    if (Date.now() - started >= request.ms) throw new Error(`Still not there after ${Math.round(request.ms / 1000)} s: ${request.text !== undefined ? `no "${request.text}" on the page` : request.gone !== undefined ? `"${request.gone}" is still on the page` : request.url !== undefined ? `the address is ${now.url}` : 'the page is still loading'}.`)
    await wait(250)
  }
}

async function answerDialog(id, request) {
  if (!dialogs.has(id)) {
    await debug(id, async () => { await wait(300) })
  }
  const open = dialogs.get(id)
  if (open === undefined) throw new Error(`No dialog is open on tab ${id}.`)
  const target = { tabId: id }
  await chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', { accept: request.accept, ...(request.text === undefined ? {} : { promptText: request.text }) })
  dialogs.delete(id)
  const next = await nextEvent(id, 'Page.javascriptDialogOpening', 300)
  if (next === undefined && !held.has(id)) await chrome.debugger.detach(target).catch(() => undefined)
  return { answered: open, accept: request.accept }
}

const PERMISSIONS = { notifications: 'notifications', geolocation: 'geolocation', camera: 'camera', microphone: 'microphone', clipboard: 'clipboard-read' }

async function permission(id, request) {
  const name = PERMISSIONS[request.kind]
  const origin = new URL((await tab(id)).url ?? '').origin
  return debug(id, async (send) => {
    try { await send('Browser.setPermission', { permission: { name }, setting: request.setting === 'allow' ? 'granted' : request.setting === 'block' ? 'denied' : 'prompt', origin }) } catch (error) {
      throw new Error(`Chrome did not let GeckIt Browser change ${request.kind} for ${origin}: ${error.message}. Ask the person to change it in the site's settings, the icon left of the address.`, { cause: error })
    }
    return { kind: request.kind, setting: request.setting, origin }
  })
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms))

async function readable(id) {
  return /^(https?|file):/.test((await tab(id)).url ?? '')
}

// Hides GeckIt's own pointer and any secret field while a picture is taken.
async function withoutPointer(id, keep, steps) {
  const page = await readable(id)
  const hide = !keep && page
  if (hide) await inPage(id, pageOverlay, false)
  if (page) await inPage(id, pageSecrets, 'hide').catch(() => undefined)
  try { return await steps() } finally {
    if (hide) await inPage(id, pageOverlay, true).catch(() => undefined)
    if (page) await inPage(id, pageSecrets, 'show').catch(() => undefined)
  }
}

function base64(bytes) {
  let out = ''
  for (let at = 0; at < bytes.length; at += 0x8000) out += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(out)
}

const bytesOf = (data) => Uint8Array.from(atob(data), (one) => one.charCodeAt(0))

const MODIFIERS = { Alt: { bit: 1, keyCode: 18 }, Control: { bit: 2, keyCode: 17 }, Meta: { bit: 4, keyCode: 91 }, Shift: { bit: 8, keyCode: 16 } }
const KEY_NAMES = { cmd: 'Meta', command: 'Meta', meta: 'Meta', win: 'Meta', ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', opt: 'Alt', shift: 'Shift', esc: 'Escape', return: 'Enter', del: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
// What Chrome does for an editing shortcut, which a key event from the debugger does not do by itself on a Mac.
const EDITING = { a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: 'undo' }

function keyOf(name) {
  const known = KEYS[name] ?? KEYS[name[0].toUpperCase() + name.slice(1)]
  if (known !== undefined) return { key: known.key ?? (KEYS[name] ? name : name[0].toUpperCase() + name.slice(1)), ...known }
  if (/^F([1-9]|1[0-2])$/i.test(name)) return { key: name.toUpperCase(), code: name.toUpperCase(), keyCode: 111 + Number(name.slice(1)) }
  if ([...name].length !== 1) return undefined
  const upper = name.toUpperCase()
  return { key: name, text: name, code: /^[A-Z]$/.test(upper) ? `Key${upper}` : /^\d$/.test(name) ? `Digit${name}` : '', keyCode: upper.charCodeAt(0) }
}

// One key or a combination such as Meta+Enter or Shift+Tab, pressed with its modifiers held as a keyboard does.
async function press(send, combo) {
  const parts = combo.length > 1 && combo.endsWith('+') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+')
  const name = parts.pop()
  const held = parts.map((one) => KEY_NAMES[one.toLowerCase()] ?? one)
  const unknown = held.find((one) => MODIFIERS[one] === undefined)
  if (unknown !== undefined) throw new Error(`Unknown modifier ${unknown}. Use Meta (Cmd), Control (Ctrl), Alt (Option) or Shift.`)
  const alone = KEY_NAMES[name.toLowerCase()] ?? name
  if (MODIFIERS[alone] !== undefined && held.length === 0) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: alone, code: `${alone}Left`, windowsVirtualKeyCode: MODIFIERS[alone].keyCode, modifiers: MODIFIERS[alone].bit })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: alone, code: `${alone}Left`, windowsVirtualKeyCode: MODIFIERS[alone].keyCode })
    return alone
  }
  const key = keyOf(alone)
  if (key === undefined) throw new Error(`Unknown key ${name}. Known: ${Object.keys(KEYS).join(', ')}, F1 to F12 or one character, with Meta+, Control+, Alt+ or Shift+ before it.`)
  let modifiers = 0
  for (const one of held) {
    modifiers |= MODIFIERS[one].bit
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: one, code: `${one}Left`, windowsVirtualKeyCode: MODIFIERS[one].keyCode, modifiers })
  }
  const chord = (modifiers & 7) !== 0
  const shifted = (modifiers & 8) !== 0 && key.text?.length === 1 ? key.text.toUpperCase() : key.text
  const text = chord ? undefined : shifted
  const shortcut = (modifiers & 7) === (MAC ? 4 : 2) ? (name.toLowerCase() === 'z' && (modifiers & 8) !== 0 ? 'redo' : EDITING[name.toLowerCase()]) : undefined
  const base = { key: text ?? key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers }
  await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text, unmodifiedText: text, ...(shortcut === undefined ? {} : { commands: [shortcut] }) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  for (const one of [...held].reverse()) {
    modifiers &= ~MODIFIERS[one].bit
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: one, code: `${one}Left`, windowsVirtualKeyCode: MODIFIERS[one].keyCode, modifiers })
  }
  return [...held, key.key].join('+')
}

async function mouse(send, at, click, how = {}) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
  if (!click) return
  const button = how.button ?? 'left'
  for (let count = 1; count <= (how.count ?? 1); count++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button, buttons: button === 'right' ? 2 : 1, clickCount: count })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button, buttons: 0, clickCount: count })
  }
}

// Clicks into the field and types it key by key, as a person would, after clearing what it held, or after its end with append.
async function typeKeys(id, ref, text, secret, append = false) {
  const field = await atRef(id, ref, pageField, secret)
  if (field.select) return inRef(id, ref, pageChoose, text)
  await debug(id, async (send) => {
    await mouse(send, field, true)
    if (append) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, modifiers: MAC ? 4 : 2, commands: ['moveToEndOfDocument'] })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 })
    } else if (field.filled) {
      const all = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: navigator.userAgent.includes('Mac') ? 4 : 2 }
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...all, commands: ['selectAll'] })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...all })
      await press(send, 'Backspace')
    }
    const pause = Math.min(140, 30000 / Math.max(1, text.length))
    for (const one of text) {
      if (one === '\n') await press(send, 'Enter')
      else {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: one, text: one, unmodifiedText: one })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: one })
      }
      await wait(pause * (0.4 + Math.random() * 0.8))
    }
  })
  return inRef(id, ref, pageTyped)
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
  if ((request.cmd === 'open' || request.cmd === 'go') && /^\s*file:/i.test(request.url) && !await chrome.extension.isAllowedFileSchemeAccess()) {
    throw new Error('Couldn\'t open the local file. In this Chrome profile, go to chrome://extensions > GeckIt Browser > Details, turn on Allow access to file URLs, then try again.')
  }
  const id = request.tab
  if (Number.isInteger(id) && request.cmd !== 'close') await claim(id, false)
  switch (request.cmd) {
    case 'ping': return { version: chrome.runtime.getManifest().version, id: chrome.runtime.id }
    case 'reload': setTimeout(() => chrome.runtime.reload(), 100); return {}
    case 'pages': return (await chrome.tabs.query({})).map((one) => ({ id: one.id, window: one.windowId, active: one.active, title: one.title ?? '', url: one.url ?? '', ...(one.openerTabId === undefined ? {} : { opener: one.openerTabId }) }))
    case 'open': {
      const made = await chrome.tabs.create({ url: request.url, active: false })
      await claim(made.id, true)
      await loaded(made.id)
      const now = await chrome.tabs.get(made.id)
      return { id: now.id, title: now.title ?? '', url: now.url ?? '' }
    }
    case 'go': {
      await tab(id)
      return debug(id, async () => {
        const back = loaded(id)
        await chrome.tabs.update(id, { url: request.url })
        await orDialog(id, back)
        const now = await chrome.tabs.get(id)
        return { id, title: now.title ?? '', url: now.url ?? '' }
      })
    }
    case 'close': await tab(id); await chrome.tabs.remove(id); return {}
    case 'text': return inPage(id, pageText)
    case 'read': return readAll(id)
    case 'click': {
      await inRef(id, request.ref, pagePointer, 'click')
      const at = await atRef(id, request.ref, pageCenter)
      const how = { button: request.button, count: request.count }
      return noteOpened(() => debug(id, async (send) => { await mouse(send, at, true, how); return { clicked: at.label } }))
    }
    case 'hover': {
      await inRef(id, request.ref, pagePointer, 'hover')
      const at = await atRef(id, request.ref, pageCenter)
      return debug(id, async (send) => { await mouse(send, at, false); return { hovered: at.label } })
    }
    case 'type': await inRef(id, request.ref, pagePointer, 'type'); return typeKeys(id, request.ref, request.text, false, request.append === true)
    case 'select': await inRef(id, request.ref, pagePointer, 'click'); return inRef(id, request.ref, pageChoose, request.text)
    case 'secret-key': {
      const field = await inRef(id, request.ref, pageSecretField)
      return { ...field, ...await secretKey() }
    }
    case 'type-secret': {
      await inRef(id, request.ref, pagePointer, 'type')
      return typeKeys(id, request.ref, await openSecret(request.keyId, request.sealed), true)
    }
    case 'scroll': {
      if (request.ref == null) { await inPage(id, pagePointer, null, 'scroll'); return inPage(id, pageScroll, null, request.by) }
      await inRef(id, request.ref, pagePointer, 'scroll')
      await inRef(id, request.ref, pageScroll, request.by)
      return inPage(id, pageScroll, null, 0)
    }
    case 'key': {
      await inPage(id, pagePointer, null, 'key')
      return noteOpened(() => debug(id, async (send) => ({ pressed: await press(send, request.key) })))
    }
    case 'paste': {
      if (request.ref != null) {
        await inRef(id, request.ref, pagePointer, 'type')
        const field = await atRef(id, request.ref, pageField, false)
        await debug(id, async (send) => {
          await mouse(send, field, true)
          await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, modifiers: MAC ? 4 : 2, commands: ['moveToEndOfDocument'] })
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 })
        })
      } else await inPage(id, pagePointer, null, 'key')
      await debug(id, async (send) => { await press(send, MAC ? 'Meta+v' : 'Control+v') })
      return request.ref == null ? { pasted: true } : inRef(id, request.ref, pageTyped)
    }
    case 'upload': return upload(id, request.ref, request.files)
    case 'drop': return dropFiles(id, request.ref, request.files)
    case 'download': return download(id, request.ref, request.folder)
    case 'drag': return drag(id, request)
    case 'wait': return waitFor(id, request)
    case 'dialog': return answerDialog(id, request)
    case 'permission': return permission(id, request)
    case 'eval': return debug(id, async (send) => {
      const done = await send('Runtime.evaluate', { expression: request.code, awaitPromise: true, returnByValue: true, userGesture: true })
      const { values } = await inPage(id, pageSecrets, 'values')
      if (done.exceptionDetails) throw new Error(scrubSecrets(done.exceptionDetails.exception?.description ?? done.exceptionDetails.text, values))
      return { value: scrubSecrets(done.result.value ?? null, values), type: done.result.type }
    })
    case 'shot': return withoutPointer(id, request.pointer, async () => {
      const target = await tab(id)
      if (request.ref !== undefined) {
        const box = await atRef(id, request.ref, pageBox, 8)
        return debug(id, async (send) => ({ png: (await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x + box.scrollX, y: box.y + box.scrollY, width: box.width, height: box.height, scale: 1 } })).data }))
      }
      if (target.active && !held.has(id)) {
        await wait(50)
        const url = await Promise.race([chrome.tabs.captureVisibleTab(target.windowId, { format: 'png' }).catch(() => undefined), wait(1500)])
        if (typeof url === 'string') return { png: url.slice(url.indexOf(',') + 1) }
      }
      return debug(id, async (send) => ({ png: (await send('Page.captureScreenshot', { format: 'png' })).data }))
    })
    case 'style': return inRef(id, request.ref, pageStyle)
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
        await save((now) => { delete now.views[id] })
        return { reset: true }
      }
      const next = { ...(held.get(id) ?? {}), ...request.set }
      return debug(id, async (send) => {
        if (next.width !== undefined) await send('Emulation.setDeviceMetricsOverride', { width: next.width, height: next.height, deviceScaleFactor: next.phone ? 3 : 0, mobile: next.phone === true })
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: next.scheme ?? '' }, { name: 'prefers-reduced-motion', value: next.motion ?? '' }] })
        held.set(id, next)
        await save((now) => { now.views[id] = next })
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
  const box = request.ref === undefined ? undefined : await atRef(id, request.ref, pageBox, 16)
  const at = request.then?.ref === undefined ? undefined : await atRef(id, request.then.ref, pageCenter)
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
      if (request.pointer && at !== undefined) { await inPage(id, pageOverlay, true); await inRef(id, request.then.ref, pagePointer, request.then.cmd) }
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
  if (globalThis.geckitHidden) return {}
  const overlay = window.geckitPointer
  if (overlay && overlay.host.isConnected) overlay.host.style.visibility = shown ? '' : 'hidden'
  return {}
}

function pageBox(ref, pad) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
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
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
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

// Lets each frame ask the one around it where it sits, up to the top, since a cross-origin frame cannot measure that itself.
function pageFrames() {
  if (window.geckitFrames) return {}
  const ask = () => new Promise((done, fail) => {
    if (window === window.top) { done({ x: 0, y: 0 }); return }
    const nonce = Math.random().toString(36).slice(2)
    const back = (event) => {
      if (event.source !== window.parent || event.data?.geckitHere !== nonce) return
      clearTimeout(timer)
      removeEventListener('message', back)
      done({ x: event.data.x, y: event.data.y })
    }
    const timer = setTimeout(() => { removeEventListener('message', back); fail(new Error('A frame did not say where it sits on the page.')) }, 2000)
    addEventListener('message', back)
    window.parent.postMessage({ geckitWhere: nonce }, '*')
  })
  addEventListener('message', (event) => {
    const nonce = event.data?.geckitWhere
    if (typeof nonce !== 'string') return
    const owner = [...document.querySelectorAll('iframe, frame')].find((one) => one.contentWindow === event.source)
    if (!owner) return
    void ask().then((mine) => {
      const box = owner.getBoundingClientRect()
      const style = getComputedStyle(owner)
      event.source.postMessage({ geckitHere: nonce, x: mine.x + box.left + owner.clientLeft + parseFloat(style.paddingLeft), y: mine.y + box.top + owner.clientTop + parseFloat(style.paddingTop) }, '*')
    }, () => undefined)
  })
  window.geckitFrames = ask
  return {}
}

async function pageOffset() {
  if (!window.geckitFrames) return { error: 'This frame cannot say where it sits on the page.' }
  try { return await window.geckitFrames() } catch (error) { return { error: error.message } }
}

function pageScrolled() {
  return { scrollX, scrollY, viewport: innerWidth }
}

// Where a hand takes hold of an element: its middle, or a slider's thumb; scrolled into view only when it is not.
function pageGrab(ref) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const box = el.getBoundingClientRect()
  const label = (el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 60)
  if (el instanceof HTMLInputElement && el.type === 'range') {
    const min = Number(el.min || 0)
    const max = Number(el.max || 100)
    const share = max === min ? 0 : (Number(el.value) - min) / (max - min)
    const thumb = Math.min(16, box.height, box.width)
    return { x: box.left + thumb / 2 + share * (box.width - thumb), y: box.top + box.height / 2, label }
  }
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, label }
}

function pageHas(text) {
  const wanted = text.toLowerCase()
  if ((document.body?.innerText ?? '').toLowerCase().includes(wanted)) return true
  return [...document.querySelectorAll('input, textarea')].some((one) => one.type !== 'password' && String(one.value).toLowerCase().includes(wanted))
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
    if (tag === 'input') return el.type === 'checkbox' || el.type === 'radio' ? el.type : el.type === 'submit' || el.type === 'button' ? 'button' : el.type === 'file' ? 'file' : el.type === 'range' ? 'slider' : 'textbox'
    return tag
  }
  const hidden = globalThis.geckitHidden
  const counter = document.documentElement
  let next = hidden ? hidden.next : Number(counter.dataset.geckitNext ?? '1')
  const refOf = (el) => (hidden ? hidden.of.get(el) : el.dataset.geckitRef)
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
    if (refOf(el) === undefined) { if (hidden) hidden.mark(el, String(next++)); else el.dataset.geckitRef = String(next++) }
    const extra = []
    const secret = el.type === 'password' || (hidden ? hidden.secrets.has(el) : el.dataset.geckitSecret !== undefined)
    if (secret && kind === 'textbox') extra.push(el.value ? 'secret, filled' : 'secret')
    else if ('value' in el && el.value && kind === 'textbox') extra.push(`value="${clean(el.value).slice(0, 60)}"`)
    if (el.isContentEditable && clean(el.innerText)) { extra.push(`text="${clean(el.innerText).slice(0, 60)}"`); said = clean(el.getAttribute('aria-label')) || clean(el.getAttribute('aria-placeholder')) }
    if (kind === 'select' && el.selectedOptions?.[0]) extra.push(`value="${clean(el.selectedOptions[0].text).slice(0, 60)}"`)
    if (kind === 'slider') extra.push(`value="${el.value}" of ${el.min || 0}-${el.max || 100}`)
    if (el.checked) extra.push('checked')
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') extra.push('disabled')
    if (kind === 'link') { const href = el.getAttribute('href'); if (href && !href.startsWith('javascript:')) extra.push(href.length > 80 ? `${href.slice(0, 80)}...` : href) }
    lines.push(`[${refOf(el)}] ${kind} "${said}"${extra.length ? ` ${extra.join(' ')}` : ''}`)
  }
  if (hidden) hidden.next = next
  else counter.dataset.geckitNext = String(next)
  return { title: document.title, url: location.href, lines, hidden: innerWidth === 0 || innerHeight === 0 }
}

function pageCenter(ref) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
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

function pageSecretField(ref) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { error: `Element ${ref} is not a field a secret can be typed into.` }
  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim()
  const field = clean(el.getAttribute('aria-label')) || clean(el.labels?.[0]?.innerText) || clean(el.getAttribute('placeholder')) || clean(el.getAttribute('name'))
  return { origin: location.origin, password: el.type === 'password', field: el.type === 'password' ? 'password' : field }
}

function pageField(ref, secret) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  el.scrollIntoView({ block: 'center', inline: 'center' })
  if (el instanceof HTMLSelectElement) return { select: true }
  if (!el.isContentEditable && !('value' in el)) return { error: `Element ${ref} is not a field you can type into.` }
  if (globalThis.geckitHidden) globalThis.geckitHidden.secrets[secret ? 'add' : 'delete'](el)
  else if (secret) el.dataset.geckitSecret = ''
  else delete el.dataset.geckitSecret
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, filled: el.isContentEditable ? el.innerText.trim() !== '' : el.value !== '' }
}

function pageChoose(ref, text) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  if (!(el instanceof HTMLSelectElement)) return { error: `Element ${ref} is not a list to choose from. Click it and then the option instead.` }
  const options = [...el.options]
  const wanted = text.trim().toLowerCase()
  const said = (one) => one.text.replace(/\s+/g, ' ').trim()
  const option = options.find((one) => said(one) === text.trim()) ?? options.find((one) => one.value === text) ?? options.find((one) => said(one).toLowerCase() === wanted) ?? options.find((one) => said(one).toLowerCase().includes(wanted))
  if (!option) return { error: `No option "${text}" in it. Options: ${options.map((one) => said(one)).join(', ').slice(0, 600)}.` }
  el.focus()
  el.value = option.value
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  return { typed: said(option).slice(0, 100) }
}

function pageTyped(ref) {
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
    const hit = root.querySelector(`[data-geckit-ref="${ref}"]`)
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: `No element ${ref} on this page now. Run geckit browser read again.` }
  if (el.isContentEditable) return { typed: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 100) }
  if (el.type === 'password' || (globalThis.geckitHidden ? globalThis.geckitHidden.secrets.has(el) : 'geckitSecret' in el.dataset)) return { typed: el.value ? 'secret, filled' : '' }
  return { typed: String(el.value).slice(0, 100) }
}

function pageSecrets(mode) {
  const found = []
  const walk = (root) => {
    for (const one of root.querySelectorAll('input[type="password"], [data-geckit-secret]')) found.push(one)
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) walk(host.shadowRoot)
  }
  walk(document)
  for (const one of globalThis.geckitHidden?.secrets ?? []) if (one.isConnected) found.push(one)
  if (mode === 'values') return { values: found.map((el) => ('value' in el ? String(el.value) : el.innerText ?? '')).filter((one) => one.length >= 4) }
  if (globalThis.geckitHidden) return {}
  const old = document.getElementById('geckit-secret-hide')
  if (mode === 'show') { old?.remove(); return {} }
  if (old === null && found.length > 0) {
    const style = document.createElement('style')
    style.id = 'geckit-secret-hide'
    style.textContent = '[data-geckit-secret], input[type="password"] { color: transparent !important; text-shadow: none !important; -webkit-text-security: disc !important; }'
    document.documentElement.append(style)
  }
  return {}
}

function pageScroll(ref, by) {
  if (ref != null) {
    const find = (root) => {
      if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
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

async function pagePointer(ref, kind, position) {
  if (globalThis.geckitHidden) return {}
  const SETTLE = 180
  const TRAVEL = 360
  const REST = 3000
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let overlay = window.geckitPointer
  if (!overlay || !overlay.host.isConnected) {
    const host = document.createElement('geckit-pointer')
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;'
    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = `
      :host { --accent: #1f8031; --ease: cubic-bezier(0.2, 0.8, 0.3, 1); --settle: ${SETTLE}ms; --travel: ${TRAVEL}ms; }
      .edge { position: fixed; inset: 0; box-shadow: inset 0 0 0 2px var(--accent); opacity: 0; transition: opacity var(--settle) var(--ease); }
      .pointer { position: fixed; left: 0; top: 0; width: 20px; height: 24px; margin: -2px 0 0 -2px; opacity: 0; transition: transform var(--travel) var(--ease), opacity var(--settle) var(--ease); }
      .ring { position: fixed; left: 0; top: 0; width: 28px; height: 28px; margin: -14px 0 0 -14px; border: 2px solid var(--accent); border-radius: 50%; opacity: 0; }
      .on { opacity: 1; }
      :host(.still) .pointer, :host(.native) .pointer { transition: opacity var(--settle) var(--ease); }
      @keyframes ring { from { opacity: 0.9; transform: var(--at) scale(0.4); } to { opacity: 0; transform: var(--at) scale(1.4); } }
      @keyframes ring-still { from { opacity: 0.9; transform: var(--at); } to { opacity: 0; transform: var(--at); } }
    `
    const edgeLayer = document.createElement('div')
    edgeLayer.className = 'edge'
    const ringLayer = document.createElement('div')
    ringLayer.className = 'ring'
    const SVG = 'http://www.w3.org/2000/svg'
    const arrow = document.createElementNS(SVG, 'svg')
    for (const [name, value] of [['class', 'pointer'], ['viewBox', '0 0 20 24'], ['aria-hidden', 'true']]) arrow.setAttribute(name, value)
    const path = document.createElementNS(SVG, 'path')
    for (const [name, value] of [['d', 'M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z'], ['fill', 'black'], ['stroke', 'white'], ['stroke-width', '1.5'], ['stroke-linejoin', 'round']]) path.setAttribute(name, value)
    arrow.append(path)
    root.append(style, edgeLayer, ringLayer, arrow)
    document.documentElement.append(host)
    overlay = { host, root, x: innerWidth / 2, y: innerHeight - 40, timer: 0 }
    window.geckitPointer = overlay
    document.addEventListener('mousemove', (event) => {
      if (!overlay.tracking || !overlay.host.isConnected) return
      overlay.x = event.clientX
      overlay.y = event.clientY
      root.querySelector('.pointer').style.transform = `translate(${overlay.x}px, ${overlay.y}px)`
    }, { capture: true, passive: true })
  }
  const { root } = overlay
  root.host.classList.toggle('still', still)
  root.host.classList.toggle('native', position !== undefined)
  overlay.tracking = position !== undefined
  const edge = root.querySelector('.edge')
  const pointer = root.querySelector('.pointer')
  const ring = root.querySelector('.ring')
  clearTimeout(overlay.timer)
  edge.classList.add('on')
  const rest = () => { overlay.timer = setTimeout(() => { edge.classList.remove('on'); pointer.classList.remove('on') }, REST) }
  if (position !== undefined) {
    overlay.x = position.x
    overlay.y = position.y
    pointer.classList.add('on')
    pointer.style.transform = `translate(${position.x}px, ${position.y}px)`
    if (kind === 'click') {
      ring.style.setProperty('--at', `translate(${position.x}px, ${position.y}px)`)
      ring.style.animation = 'none'
      ring.getBoundingClientRect()
      ring.style.animation = `${still ? 'ring-still' : 'ring'} ${SETTLE}ms cubic-bezier(0.2, 0.8, 0.3, 1)`
    }
    rest()
    return {}
  }
  if (ref == null) { rest(); return {} }
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
