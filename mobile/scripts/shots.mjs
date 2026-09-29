// The App Store captures, shot from the app rather than drawn; gallery.mjs frames them and puts the words on.
//
// It runs inside the demo copy of GeckIt the README screenshots come from (a patched build on a fake
// home, with a fake claude), as its GECKIT_DEMO_SCRIPT: the Chat window is loaded as the iPhone app
// with phone-demo.js, sized 440x956 and shot at 3x, which is the 1320x2868 Apple asks for. The pairing
// screen is the phone app itself, built with `vite build --outDir <dir>` and served on 127.0.0.1:5611.
//
// Two things are substituted, because a desktop window is not a phone: the Mac's screen, which is a
// canvas drawn from mac.html, and the status bar, which phone-demo.js draws.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.DEMO_OUT
const THEME = process.env.DEMO_THEME ?? 'light'
const SHOTS = (process.env.DEMO_SHOTS ?? 'all').split(',')
const IDS = JSON.parse(readFileSync(process.env.DEMO_IDS, 'utf8'))
const W = 440
const H = 956

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const notes = []
const note = (...said) => notes.push(said.map((one) => (typeof one === 'string' ? one : JSON.stringify(one))).join(' '))
const run = (window, js) => window.webContents.executeJavaScript(js, true)

async function until(window, js, what, timeout = 10_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await run(window, js).catch(() => false)) return true
    await sleep(100)
  }
  note('TIMEOUT waiting for', what)
  return false
}

const find = (selector, text) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find((one) => ${text === undefined ? 'true' : `one.textContent.includes(${JSON.stringify(text)})`} && one.getClientRects().length > 0)`

async function centre(window, selector, text) {
  return run(window, `(() => { const found = ${find(selector, text)}; if (!found) return null; const r = found.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
}

async function leaf(window, text) {
  return run(window, `(() => { const found = [...document.querySelectorAll('body *')].filter((one) => one.children.length === 0 && one.textContent.trim() === ${JSON.stringify(text)} && one.getClientRects().length > 0).at(-1); if (!found) return null; const r = found.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 80), y: r.y + r.height / 2 } })()`)
}

async function mouse(window, type, at, clickCount = 1) {
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount, pointerType: 'mouse' })
}

async function tapAt(window, at) {
  if (at === null) return note('nothing to tap')
  await mouse(window, 'mousePressed', at)
  await sleep(60)
  await mouse(window, 'mouseReleased', at)
  await sleep(300)
}

async function doubleTap(window, at) {
  for (let n = 1; n <= 2; n++) {
    await mouse(window, 'mousePressed', at, n)
    await sleep(40)
    await mouse(window, 'mouseReleased', at, n)
    await sleep(70)
  }
}

async function drag(window, from, to, ms = 700) {
  await mouse(window, 'mousePressed', from)
  const steps = Math.round(ms / 16)
  for (let at = 1; at <= steps; at++) {
    const t = at / steps
    await mouse(window, 'mouseMoved', { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
    await sleep(16)
  }
  await mouse(window, 'mouseReleased', to)
  await sleep(300)
}

async function press(window, selector, text) {
  const ok = await run(window, `(() => { const found = ${find(selector, text)}; if (!found) return false; found.click(); return true })()`)
  if (!ok) note('nothing to press', selector, text)
  await sleep(400)
  return ok
}

async function macPictures(h) {
  const site = new h.BrowserWindow({ width: 1512, height: 982, useContentSize: true, enableLargerThanScreen: true, show: false, webPreferences: { backgroundThrottling: false } })
  site.setContentSize(1512, 982)
  await site.loadFile(join(import.meta.dirname, 'mac.html'))
  await sleep(900)
  const allow = await site.webContents.executeJavaScript(`(() => { const r = document.querySelector('.ask .allow').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } })()`)
  const before = await site.webContents.capturePage()
  await site.webContents.executeJavaScript(`document.body.classList.add('allowed'); true`)
  await sleep(300)
  const after = await site.webContents.capturePage()
  site.destroy()
  const url = (image) => `data:image/png;base64,${image.resize({ width: 1512 }).toPNG().toString('base64')}`
  return { pictures: [url(before), url(after)], allow }
}

async function phoneWindow(h) {
  const renderer = join(h.app.getAppPath(), 'out/renderer')
  const html = readFileSync(join(renderer, 'chat.html'), 'utf8')
    .replace('<html lang="en">', '<html lang="en" class="phone">')
    .replace('<title>GeckIt</title>', '<title>GeckIt</title>\n    <script src="./phone-demo.js"></script>')
  writeFileSync(join(renderer, 'phone.html'), html)
  copyFileSync(join(import.meta.dirname, 'phone-demo.js'), join(renderer, 'phone-demo.js'))
  const chat = h.chatWindow()
  chat.setMinimumSize(300, 500)
  chat.setContentSize(W, H)
  await chat.loadFile(join(renderer, 'phone.html'))
  try {
    chat.webContents.debugger.attach('1.3')
  } catch {
    // Already attached.
  }
  await chat.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: false })
  await chat.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  await run(chat, 'navigator.clipboard.writeText = async () => undefined; true')
  return chat
}

async function still(window, name) {
  await sleep(500)
  const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'))
  note('saved', name)
}

async function dump(window, label) {
  note(label, 'text', await run(window, `document.body.innerText.slice(0, 1200)`))
  note(label, 'buttons', await run(window, `[...document.querySelectorAll('button, [role=link], .file-link')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()).slice(0, 40) + ' .' + b.className)`))
}

const hideNotices = (chat) =>
  run(chat, `(() => { const s = document.createElement('style'); s.textContent = '.notices, .notice, [class*="notice"] { display: none !important }'; document.head.append(s); return true })()`)

async function home(chat) {
  await press(chat, 'button', 'Board')
  await sleep(600)
}

export default async function shoot(h) {
  mkdirSync(OUT, { recursive: true })
  h.setSettings({ theme: THEME })
  h.nativeTheme.themeSource = THEME
  try {
    const mac = await macPictures(h)
    const chat = await phoneWindow(h)
    await until(chat, `document.body.innerText.includes('Offline trail pages')`, 'board', 15_000)
    await run(chat, `window.__macSetup(${JSON.stringify(mac.pictures)}, ${JSON.stringify(mac.allow)}); true`)
    await hideNotices(chat)
    const live = h.sessions()
    await live.send({ session: IDS.ids['Offline trail pages'], root: IDS.web, mode: 'auto', text: 'Carry on with the offline pages' })
    await live.send({ session: IDS.ids['Trail difficulty ratings'], root: IDS.web, mode: 'manual', text: 'Go ahead with the difficulty migration' })
    await until(chat, `document.body.innerText.includes('Wants to')`, 'asking card', 20_000)
    await sleep(4000)
    const all = SHOTS.includes('all')

    if (all || SHOTS.includes('board')) {
      await still(chat, 'board')
      await dump(chat, 'board')
    }

    if (all || SHOTS.includes('ask')) {
      await tapAt(chat, await leaf(chat, 'Trail difficulty ratings'))
      await sleep(2200)
      await still(chat, 'ask')
      await dump(chat, 'ask')
      await home(chat)
    }

    if (all || SHOTS.includes('file')) {
      await tapAt(chat, await leaf(chat, 'Add --max-width flag'))
      await sleep(2200)
      await still(chat, 'file-convo')
      await dump(chat, 'file-convo')
      await tapAt(chat, await centre(chat, '.file-link', 'README.md'))
      await sleep(2000)
      await still(chat, 'file')
      await dump(chat, 'file')
      await tapAt(chat, await leaf(chat, 'Done'))
      await sleep(800)
      await home(chat)
    }

    if (all || SHOTS.includes('convo')) {
      await tapAt(chat, await leaf(chat, 'Offline trail pages'))
      await sleep(2500)
      await still(chat, 'convo')
      await dump(chat, 'convo')
    }

    if (all || SHOTS.includes('screen')) {
      await run(chat, `localStorage.setItem('geckit.screenMode', 'look'); true`)
      await press(chat, `button[aria-label="The host's screen"]`)
      await until(chat, `document.querySelector('.phone-screen-video')?.readyState >= 2`, 'screen video', 10_000)
      await sleep(1500)
      const pic = await run(chat, `(() => { const v = document.querySelector('.phone-screen-video'); const r = v.getBoundingClientRect(); const k = Math.min(r.width / v.videoWidth, r.height / v.videoHeight); const w = v.videoWidth * k, hh = v.videoHeight * k; return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - hh) / 2, w, h: hh } })()`)
      const target = await run(chat, `window.__macTarget()`)
      await doubleTap(chat, { x: pic.x + pic.w * (target.x + 0.04), y: pic.y + pic.h * target.y })
      await sleep(1600)
      await press(chat, '.phone-screen-seg button', 'Control')
      await sleep(1200)
      const stage = await run(chat, `(() => { const r = document.querySelector('.phone-screen-stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
      let from = { x: stage.x + stage.w * 0.8, y: stage.y + stage.h * 0.66 }
      let gain = 560
      for (let tries = 0; tries < 8; tries++) {
        const now = await run(chat, 'window.__mac()')
        const gx = target.x - now.x
        const gy = target.y - now.y
        if (Math.abs(gx) < 0.01 && Math.abs(gy) < 0.01) break
        let fx = gx * gain
        let fy = gy * gain
        const long = Math.hypot(fx, fy)
        const most = stage.w * 0.6
        if (long > most) {
          fx = (fx * most) / long
          fy = (fy * most) / long
        }
        await drag(chat, from, { x: from.x + fx, y: from.y + fy })
        const after = await run(chat, 'window.__mac()')
        const moved = Math.hypot(after.x - now.x, after.y - now.y)
        if (moved > 0.001) gain = (Math.hypot(fx, fy) / moved) * 0.95
        from = { x: stage.x + stage.w * 0.78, y: stage.y + stage.h * 0.64 }
      }
      await sleep(800)
      await run(chat, `(() => { const s = document.getElementById('demo-status'); s.style.color = '#fff'; s.querySelectorAll('svg').forEach((one) => one.setAttribute('fill', '#fff')); document.getElementById('demo-home').style.background = '#fff'; return true })()`)
      await still(chat, 'screen')
      await run(chat, `(() => { const s = document.getElementById('demo-status'); s.style.color = ''; s.querySelectorAll('svg').forEach((one) => one.setAttribute('fill', 'currentColor')); document.getElementById('demo-home').style.background = ''; return true })()`)
      await dump(chat, 'screen')
      await press(chat, '.phone-screen-done', 'Done')
      await sleep(1200)
    }

    if (all || SHOTS.includes('task')) {
      await home(chat)
      await press(chat, 'button[aria-label="New task"]')
      await sleep(1500)
      await run(chat, `(() => { const field = document.querySelector('textarea'); const proto = Object.getPrototypeOf(field); field.spellcheck = false; Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, 'Show the weather at the trailhead for the next three days on every trail page, from Open-Meteo, cached with the rest of the page for offline use.'); field.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
      await sleep(600)
      await still(chat, 'task')
      await dump(chat, 'task')
    }

    if (all || SHOTS.includes('pair')) {
      const pair = new h.BrowserWindow({ width: W, height: H, useContentSize: true, show: false, webPreferences: { backgroundThrottling: false } })
      await pair.loadURL('http://127.0.0.1:5611/')
      pair.webContents.debugger.attach('1.3')
      await pair.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: false })
      await sleep(1500)
      const bar = readFileSync(join(import.meta.dirname, 'phone-demo.js'), 'utf8').match(/const statusBar = \(\) => \{[\s\S]*?\n  \}\n/)[0]
      await run(pair, `(() => { ${bar}; statusBar(); const s = document.createElement('style'); s.textContent = 'body { padding-top: 62px !important; padding-bottom: 34px !important; box-sizing: border-box }'; document.head.append(s); return true })()`)
      await sleep(600)
      await still(pair, 'pair')
      await dump(pair, 'pair')
      pair.destroy()
    }
  } catch (error) {
    note('FAILED', String(error?.stack ?? error))
  }
  writeFileSync(join(OUT, `notes-${THEME}.txt`), `${notes.join('\n')}\n`)
}
