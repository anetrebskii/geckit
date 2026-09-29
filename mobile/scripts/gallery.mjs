// The App Store gallery, framed: each capture from shots.mjs becomes a panel
// with a line saying what it is and the phone it was taken on.
//
//   client/node_modules/.bin/electron mobile/scripts/gallery.mjs <raw dir> mobile/store
//
// The panel is 1320x2868, the 6.9 inch size Apple asks for and the size of the
// capture inside it, so the shot is drawn at about three quarters with room
// above it for the words. The colours are the app's own tokens, and the
// captures carry their own status bar, so only the bezel is drawn here.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import electron from 'electron'

const { app, BrowserWindow } = electron

const [IN, OUT] = process.argv.slice(-2)

// green is the app's --accent, mint its --accent-soft, ink its --text.
const GREEN = { from: '#258a38', to: '#155c23', ink: '#ffffff', dim: 'rgba(255,255,255,.8)' }
const MINT = { from: '#eef8f0', to: '#cfe8d4', ink: '#10210f', dim: 'rgba(16,33,15,.7)' }
const INK = { from: '#2a2a2d', to: '#141415', ink: '#f2f2f4', dim: 'rgba(242,242,244,.72)' }

// The headings and the lines under them are cut from the listing's description,
// in my-workspace/geckit/gtm/snapshot/app-store.md; when one changes there, the panel changes with it.
const PANELS = [
  { file: 'board.png', out: '1-board.png', theme: GREEN, head: 'See which session is waiting for you', sub: 'Which one is working, which one waits for you and which one is done.' },
  { file: 'ask.png', out: '2-answer.png', theme: INK, head: 'Answer Claude from your iPhone', sub: 'Every conversation, with full control over it.' },
  { file: 'screen.png', out: '3-remote-control.png', theme: MINT, head: 'Control your Mac from the phone', sub: 'A finger moves the pointer, a tap clicks, two fingers scroll.' },
  { file: 'file.png', out: '4-files.png', theme: GREEN, head: 'Open the files Claude names', sub: 'Markdown as it reads, a picture in the viewer, a folder as what is in it.' },
  { file: 'convo.png', out: '5-fast.png', theme: INK, head: 'Made for a slow network', sub: 'It opens on what it already has and loads only the end of a conversation.' },
  { file: 'task.png', out: '6-task.png', theme: MINT, head: 'Start a task with a goal', sub: 'Claude keeps working until the goal holds, then the card moves to In review by itself.' },
  { file: 'pair.png', out: '7-private.png', theme: GREEN, head: 'No server in between', sub: 'The phone connects to your computer directly, encrypted end to end.' },
]

const page = (shot, theme, head, sub) => `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  body {
    width:1320px; height:2868px; overflow:hidden;
    background:linear-gradient(168deg, ${theme.from} 0%, ${theme.to} 100%);
    font-family:-apple-system, "SF Pro Display", system-ui, sans-serif;
    color:${theme.ink};
    display:flex; flex-direction:column; align-items:center;
    -webkit-font-smoothing:antialiased;
  }
  h1 {
    margin:150px 96px 0; max-width:1130px;
    font-size:92px; font-weight:700; line-height:1.06; letter-spacing:-.03em;
    text-align:center; text-wrap:balance;
  }
  p {
    margin:36px 120px 0; max-width:1040px;
    font-size:44px; font-weight:400; line-height:1.34; letter-spacing:-.012em;
    text-align:center; text-wrap:balance; color:${theme.dim};
  }
  .phone {
    position:relative; margin-top:auto; margin-bottom:96px; width:1012px; padding:13px;
    border-radius:88px; background:#0b0b0a;
    box-shadow:0 0 0 3px rgba(255,255,255,.10), 0 60px 90px -40px rgba(0,0,0,.55);
  }
  .screen { border-radius:76px; overflow:hidden; aspect-ratio:1320/2868 }
  .screen img { display:block; width:100% }
</style>
<h1>${head}</h1>
<p>${sub}</p>
<div class="phone"><div class="screen"><img src="${shot}"></div></div>
`

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true })
  const window = new BrowserWindow({ width: 660, height: 1434, show: false })
  await window.loadURL('about:blank')
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1320, height: 2868, deviceScaleFactor: 1, mobile: false })
  for (const panel of PANELS) {
    const shot = `data:image/png;base64,${readFileSync(path.join(IN, panel.file)).toString('base64')}`
    await window.webContents.executeJavaScript(`document.open(); document.write(${JSON.stringify(page(shot, panel.theme, panel.head, panel.sub))}); document.close(); new Promise((done) => (document.images[0].complete ? done() : document.images[0].addEventListener('load', done)))`)
    await new Promise((done) => setTimeout(done, 300))
    const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(path.join(OUT, panel.out), Buffer.from(data, 'base64'))
    console.log(panel.out)
  }
  app.quit()
})
