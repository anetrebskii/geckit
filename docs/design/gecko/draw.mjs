// Draws the still poses of spec 016 by hand-placed geometry. Run: node docs/design/gecko/draw.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? import.meta.dirname
mkdirSync(out, { recursive: true })
const f = (n) => Number(n.toFixed(2))
const rad = (d) => (d * Math.PI) / 180

function toes(x, y, deg, r = 1.05, d = 1.35) {
  return [-50, 0, 50].map((s) => `<circle cx="${f(x + d * Math.cos(rad(deg + s)))}" cy="${f(y + d * Math.sin(rad(deg + s)))}" r="${r}" stroke="none"/>`).join('')
}
const leg = (d, x, y, deg, w = 2.4, simple = false) =>
  `<path d="${d}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` + (simple ? `<circle cx="${x}" cy="${y}" r="${w * 0.75}" stroke="none"/>` : toes(x, y, deg))
const tail = (d, widths = [3.8, 2.8, 1.7]) =>
  widths.map((w, i) => `<path d="${d}" pathLength="100" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${[45, 75, 100][i]} 200"/>`).join('')

const eye = (x, y, r, look = [0, 0]) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#f2f7c8" stroke="#0e5a22" stroke-width="0.45"/>` +
  `<rect x="${f(x + look[0] - r * 0.17)}" y="${f(y + look[1] - r * 0.62)}" width="${f(r * 0.34)}" height="${f(r * 1.24)}" rx="${f(r * 0.17)}" fill="#10331a"/>` +
  `<circle cx="${f(x - r * 0.38)}" cy="${f(y - r * 0.4)}" r="${f(r * 0.26)}" fill="#fff"/>`
const shut = (x, y, r) => `<path d="M${f(x - r)} ${y} q${r} ${f(r * 0.8)} ${f(2 * r)} 0" fill="none" stroke="#0e5a22" stroke-width="0.6" stroke-linecap="round"/>`

/* Top-down gecko, head to the right, in a 48 x 32 box. Used by direction A (glass) and C (white in a chip). */
const top = {
  working: {
    body: `<ellipse stroke="none" cx="25" cy="16" rx="9.5" ry="4.4" transform="rotate(-3 25 16)"/><ellipse stroke="none" cx="32" cy="15.6" rx="3.6" ry="3.4"/><ellipse stroke="none" cx="38" cy="15" rx="6" ry="4.7" transform="rotate(-7 38 15)"/>`,
    legs: [['M31 13 Q34 9 36 6.6', 36, 6.6, -60], ['M31 18.6 Q31.2 23 30 26', 30, 26, 110], ['M20 13.4 Q17 9.5 14.6 7.4', 14.6, 7.4, -130], ['M20 18.6 Q21.5 23 22.4 26', 22.4, 26, 75]],
    tail: 'M16.5 16.4 C 11 17, 9 21, 5.2 20.6 C 3 20.4, 2.2 18.6, 3 17.2',
    eyes: (s) => (s ? '' : eye(37.4, 10.6, 1.9) + eye(38.6, 19.6, 1.9)),
    shine: 'M19 13.2 Q25 11.4 31 12.6 Q25 12.8 19 14.4 Z M35.5 11.6 Q39 10.6 42 12.2 Q39 11.8 35.6 12.8 Z',
  },
  asleep: {
    body: `<path d="M31.5 21 A 8.2 7.2 0 1 0 16.4 21.4" fill="none" stroke-width="8.6" stroke-linecap="round"/><ellipse stroke="none" cx="31.6" cy="22.6" rx="5.6" ry="4.4" transform="rotate(-150 31.6 22.6)"/>`,
    legs: [['M18 12 Q16 10 14.6 9.6', 14.6, 9.6, -160], ['M30 11.6 Q32 9.6 33.6 9.2', 33.6, 9.2, -20]],
    tail: 'M16.6 21.6 C 17.2 27, 22 28.4, 26.8 27.2',
    eyes: (s) => (s ? '' : `<circle cx="29.8" cy="19.2" r="1.9" fill="#5fd06c" stroke="#0e5a22" stroke-width="0.45"/>`),
    lids: shut(29.8, 19.3, 1.4),
    shine: 'M18 13.4 Q24 7.6 30.4 13 Q24 9.6 18.6 14.6 Z',
  },
  waiting: {
    body: `<ellipse stroke="none" cx="24.5" cy="16" rx="9.5" ry="4.4"/><ellipse stroke="none" cx="32" cy="17" rx="3.6" ry="3.6"/><ellipse stroke="none" cx="35.8" cy="21.6" rx="6" ry="4.7" transform="rotate(58 35.8 21.6)"/>`,
    legs: [['M31 13.2 Q34.6 11 37.6 9.2', 37.6, 9.2, -30], ['M29.4 19.4 Q28.6 23.6 27 26.4', 27, 26.4, 120], ['M19.6 13.4 Q16.6 10.6 13.6 9.4', 13.6, 9.4, -155], ['M19.6 18.6 Q16.8 21.6 14 23', 14, 23, 155]],
    tail: 'M15.4 16 C 10.6 16, 7.6 15.6, 4 16.2 C 2.6 16.4, 2 17.4, 2.6 18.4',
    eyes: (s) => (s ? '' : eye(33, 24.4, 1.9, [0, 0.4]) + eye(40.2, 19.8, 1.9, [0.2, 0.4])),
    shine: 'M18.6 13.4 Q25 11.6 31 13 Q25 13 18.6 14.6 Z M34.6 17 Q37.6 18 39 20.6 Q37 19 34.4 18 Z',
  },
  review: {
    body: `<ellipse stroke="none" cx="25" cy="17" rx="9.5" ry="4.4"/><ellipse stroke="none" cx="32" cy="16.4" rx="3.6" ry="3.4"/><ellipse stroke="none" cx="38" cy="15" rx="6" ry="4.7" transform="rotate(-16 38 15)"/>`,
    legs: [['M31 14 Q34.4 10.6 37 8.4', 37, 8.4, -50], ['M31 19.6 Q34 23.4 36.6 25.4', 36.6, 25.4, 50], ['M20 14.4 Q17 11.6 14.4 10.6', 14.4, 10.6, -150], ['M20 19.6 Q17 22.6 14.4 23.6', 14.4, 23.6, 150]],
    tail: 'M16.2 17 C 9.6 17.4, 5.4 13, 6.6 8.4 C 7.6 4.8, 12.6 4.4, 13.6 7.6 C 14.2 9.8, 12 11, 10.6 9.8',
    eyes: (s) => (s ? '' : eye(36.4, 10.4, 1.9) + eye(39.2, 19.2, 1.9)),
    shine: 'M19 14.2 Q25 12.4 31 13.6 Q25 13.8 19 15.4 Z M35.6 11.2 Q38.6 9.6 41.8 10.4 Q38.6 10.6 35.8 12.2 Z',
  },
}

/* Side-view gecko standing on the bar's bottom edge (y 30), head to the right, 48 x 32. Direction B. */
const side = {
  working: {
    far: [['M28 24 Q27.4 27.2 26.2 29.6', 26.2, 29.6, 100], ['M17.6 24.2 Q19.4 27 20.6 29.6', 20.6, 29.6, 70]],
    body: `<ellipse stroke="none" cx="22" cy="22.6" rx="10.6" ry="4.6"/><ellipse stroke="none" cx="31" cy="20.6" rx="4.2" ry="3.9" transform="rotate(-20 31 20.6)"/><ellipse stroke="none" cx="36.6" cy="17.8" rx="6.4" ry="4.5" transform="rotate(-10 36.6 17.8)"/>`,
    near: [['M30 23.6 Q33.2 25.6 34.4 29.6', 34.4, 29.6, 40], ['M15 24.2 Q11.8 26.2 10.6 29.6', 10.6, 29.6, 140]],
    tail: 'M12.4 22.6 C 7.6 23, 4.6 25, 1.8 23.2 C 1 22.6, 1 21.6, 1.8 21.2',
    face: (s) => (s ? '' : eye(37.2, 15.6, 2.6, [0.5, 0]) + `<path d="M39.6 20.2 q1.6 0.6 3.2 -0.2" fill="none" stroke="#0e5a22" stroke-width="0.5" stroke-linecap="round"/>`),
    shine: 'M13 19.4 Q22 16.4 30 18 Q22 18 13.4 20.6 Z M33 15.2 Q37 13 41.4 14.2 Q37.6 14.2 33.4 16.2 Z',
  },
  asleep: {
    far: [],
    body: `<ellipse stroke="none" cx="21.6" cy="24.6" rx="11" ry="5"/><ellipse stroke="none" cx="30.4" cy="24.4" rx="4.4" ry="4.2"/><ellipse stroke="none" cx="35.8" cy="25" rx="6.4" ry="4.6" transform="rotate(6 35.8 25)"/>`,
    near: [['M29.4 28 Q31.2 29.4 33 29.6', 33, 29.6, 10], ['M15 28.4 Q13.2 29.4 11.4 29.6', 11.4, 29.6, 170]],
    tail: 'M11.6 24.2 C 5.4 23.6, 3 19.4, 5.8 16.8 C 7.8 15, 11.2 16, 10.8 18.8',
    face: (s) => (s ? '' : `<circle cx="36.6" cy="22.8" r="2.4" fill="#5fd06c" stroke="#0e5a22" stroke-width="0.45"/>` + shut(36.6, 23, 1.9)),
    shine: 'M13 21.2 Q22 18.4 30 20.2 Q22 20.2 13.4 22.4 Z M32.8 21.8 Q36.8 20.2 40.8 21.6 Q36.8 21.4 33.2 22.8 Z',
  },
  waiting: {
    far: [['M27.4 24 Q27.2 27 27 29.6', 27, 29.6, 90], ['M16.6 24.4 Q16.4 27 16 29.6', 16, 29.6, 90]],
    body: `<ellipse stroke="none" cx="21.4" cy="23" rx="10.4" ry="4.6" transform="rotate(-4 21.4 23)"/><ellipse stroke="none" cx="30.6" cy="19.6" rx="4.2" ry="4.2"/><ellipse stroke="none" cx="35.4" cy="18.8" rx="6.2" ry="4.6" transform="rotate(28 35.4 18.8)"/>`,
    near: [['M30.6 22.6 Q31.4 26 31.8 29.6', 31.8, 29.6, 60], ['M14.6 24.6 Q12.8 27 12 29.6', 12, 29.6, 130]],
    tail: 'M11.6 23.6 C 6.6 24.2, 3.6 26.4, 2 28.4 C 1.6 29, 2.2 29.8, 3 29.6',
    face: (s) => (s ? '' : eye(35.4, 16.4, 2.6, [0.2, 0.9]) + `<path d="M37.4 22.4 q1.2 1.4 2.8 1.4" fill="none" stroke="#0e5a22" stroke-width="0.5" stroke-linecap="round"/>`),
    shine: 'M12.6 20 Q21 17 29 18.4 Q21 18.6 13 21.2 Z M31.6 15.4 Q35 14 38.6 15.8 Q35 15.4 32 16.6 Z',
  },
  review: {
    lift: -3,
    far: [['M28 24 Q29.6 26 31.6 26.6', 31.6, 26.6, 20], ['M17.6 24.2 Q16 26.4 13.8 27', 13.8, 27, 160]],
    body: `<ellipse stroke="none" cx="22" cy="22.6" rx="10.6" ry="4.6"/><ellipse stroke="none" cx="31" cy="20.4" rx="4.2" ry="3.9" transform="rotate(-24 31 20.4)"/><ellipse stroke="none" cx="36.4" cy="16.8" rx="6.4" ry="4.5" transform="rotate(-20 36.4 16.8)"/>`,
    near: [['M30 23.6 Q33 25.8 35.6 26.4', 35.6, 26.4, 15], ['M15 24.2 Q12.4 26.4 9.8 26.8', 9.8, 26.8, 165]],
    tail: 'M12.4 21.6 C 7 21, 4 17, 5.4 12.6 C 6.6 9.2, 11.4 9.2, 12.2 12.4 C 12.6 14.4, 10.8 15.4, 9.6 14.4',
    face: (s) => (s ? '' : eye(36.6, 14.4, 2.6, [0.5, -0.3]) + `<path d="M39 19.4 q1.8 0.8 3.6 -0.6" fill="none" stroke="#0e5a22" stroke-width="0.5" stroke-linecap="round"/>`),
    shine: 'M13 19.4 Q22 16.4 30 18 Q22 18 13.4 20.6 Z M32.6 14.6 Q36.6 11.8 41 12.6 Q37 12.8 33 15.6 Z',
  },
}

const GLASS_DEFS = (y1, y2) => `<defs>
<linearGradient id="body" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="#86e690"/><stop offset="0.45" stop-color="#47c257"/><stop offset="1" stop-color="#1c8c33"/></linearGradient>
<linearGradient id="far" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}"><stop offset="0" stop-color="#3aa94a"/><stop offset="1" stop-color="#156e28"/></linearGradient>
<filter id="glass" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB">
<feMorphology in="SourceAlpha" operator="dilate" radius="0.5" result="grown"/>
<feGaussianBlur in="grown" stdDeviation="0.8" result="soft"/><feOffset in="soft" dy="0.9" result="drop"/><feFlood flood-color="#06280f" flood-opacity="0.28"/><feComposite in2="drop" operator="in" result="shadow"/>
<feFlood flood-color="#0e5a22"/><feComposite in2="grown" operator="in" result="rim"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="blur"/><feComposite in="SourceAlpha" in2="blur" operator="arithmetic" k2="1" k3="-1" result="edge"/>
<feFlood flood-color="#e4ffe6" flood-opacity="0.85"/><feComposite in2="edge" operator="in" result="glow"/>
<feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/><feMergeNode in="glow"/></feMerge>
</filter>
<linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0.2"/></linearGradient>
</defs>`

function badge(x, y, n, r = 6.8) {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#e0952a" stroke="#fff" stroke-width="1.2"/><text x="${x}" y="${f(y + r * 0.47)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Inter, sans-serif" font-size="${f(r * 1.38)}" font-weight="700" fill="#fff">${n}</text></g>`
}

const svg = (w, h, inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 4}" height="${h * 4}" role="img" aria-label="${label}">\n${inner}\n</svg>\n`

function glassTop(name) {
  const p = top[name]
  const parts = `<g fill="url(#body)" stroke="url(#body)">${p.legs.map((l) => leg(...l)).join('')}${tail(p.tail)}${p.body}</g>`
  let inner = `${GLASS_DEFS(4, 28)}<g filter="url(#glass)">${parts}</g><path d="${p.shine}" fill="url(#shine)"/>${p.eyes(false)}${p.lids ?? ''}`
  if (name === 'waiting') inner += badge(40.8, 7.4, 2)
  return svg(48, 32, inner, `GeckIt gecko, ${name}`)
}

function glassSide(name) {
  const p = side[name]
  const lift = p.lift ?? 0
  const farLegs = `<g fill="url(#far)" stroke="url(#far)">${p.far.map((l) => leg(...l)).join('')}</g>`
  const near = `<g fill="url(#body)" stroke="url(#body)">${tail(p.tail)}${p.near.map((l) => leg(...l)).join('')}${p.body}</g>`
  const ground = lift === 0 ? '' : `<ellipse stroke="none" cx="22" cy="30.4" rx="12" ry="1.1" fill="#06280f" opacity="0.18"/>`
  let inner = `${GLASS_DEFS(12, 31)}<g transform="translate(0 -1.8)">${ground}<g transform="translate(0 ${lift})"><g filter="url(#glass)">${farLegs}${near}</g><path d="${p.shine}" fill="url(#shine)"/>${p.face(false)}</g></g>`
  if (name === 'waiting') inner += badge(40.8, 7.4, 2)
  return svg(48, 32, inner, `GeckIt gecko, ${name}`)
}

const chipGecko = (name) => {
  const p = top[name]
  return `<g transform="translate(16.4 17) rotate(-90) scale(0.47) translate(-24 -16)"><g fill="url(#white)" stroke="url(#white)" filter="url(#lift)">${p.legs.map((l) => leg(...l)).join('')}${tail(p.tail)}${p.body}</g>${name === 'asleep' ? '' : eyesDots(name)}</g>`
}

function chip(name) {
  const g = chipGecko(name)
  let inner = `<defs>
<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6edb7a"/><stop offset="0.55" stop-color="#3fb551"/><stop offset="1" stop-color="#1c8c33"/></linearGradient>
<linearGradient id="white" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="28"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dff3e2"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.8" stdDeviation="0.6" flood-color="#06280f" flood-opacity="0.35"/></filter>
<filter id="tileglass" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="blur"/><feComposite in="SourceAlpha" in2="blur" operator="arithmetic" k2="1" k3="-1" result="edge"/>
<feFlood flood-color="#e4ffe6" flood-opacity="0.8"/><feComposite in2="edge" operator="in" result="glow"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="0.9" result="s"/><feOffset in="s" dy="1" result="d"/><feFlood flood-color="#06280f" flood-opacity="0.3"/><feComposite in2="d" operator="in" result="shadow"/>
<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/><feMergeNode in="glow"/></feMerge>
</filter>
</defs>
<rect x="2.5" y="2.5" width="28" height="28" rx="8.4" fill="url(#tile)" stroke="#16782b" stroke-width="0.6" filter="url(#tileglass)"/>
<path d="M4 10 Q4 3.6 10.6 3.6 L22.4 3.6 Q29 3.6 29 10 Q16.5 7.4 4 10 Z" fill="url(#sheen)"/>
${g}`
  if (name === 'waiting') inner += badge(29.6, 6, 2, 5.8)
  return svg(36, 33, inner, `GeckIt gecko, ${name}`)
}

function eyesDots(name) {
  const at = { working: [[37.4, 10.6], [38.6, 19.6]], waiting: [[33, 24.4], [40.2, 19.8]], review: [[36.4, 10.4], [39.2, 19.2]] }[name]
  return at.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#1c8c33"/>`).join('')
}

/* Tray: black template silhouettes. Feet are round pads, no toes or eyes; a waiting dot replaces the count. */
function trayTop(name, kind) {
  const p = top[name]
  const shape = `<g fill="#000" stroke="#000">${p.legs.map((l) => leg(l[0], l[1], l[2], l[3], 3.4, true)).join('')}${tail(p.tail, [4.6, 3.6, 2.6])}${p.body}</g>`
  const placed = `<g transform="translate(8 8) rotate(-52) scale(0.34) translate(-24 -16)">${shape}</g>`
  const dot = name === 'waiting' ? `<circle cx="13.2" cy="3" r="2.6" fill="#000"/>` : ''
  if (kind === 'a') return svg(16, 16, placed + dot, `tray ${name}`)
  const knocked = `<defs><mask id="m"><rect width="16" height="16" fill="#fff"/><g transform="translate(8 8.2) rotate(-52) scale(0.27) translate(-24 -16)"><g fill="#000" stroke="#000">${p.legs.map((l) => leg(l[0], l[1], l[2], l[3], 3.4, true)).join('')}${tail(p.tail, [5, 4, 3])}${p.body}</g></g>${name === 'waiting' ? '<circle cx="13.4" cy="2.6" r="3.8" fill="#000"/>' : ''}</mask></defs><rect x="1" y="1" width="14" height="14" rx="4" fill="#000" mask="url(#m)"/>`
  return svg(16, 16, knocked + (name === 'waiting' ? '<circle cx="13.4" cy="2.6" r="2.4" fill="#000"/>' : ''), `tray ${name}`)
}

function traySide(name) {
  const p = side[name]
  const lift = p.lift ?? 0
  const shape = `<g fill="#000" stroke="#000"><g transform="translate(0 ${lift})">${tail(p.tail, [4.4, 3.4, 2.4])}${[...p.far, ...p.near].map((l) => leg(l[0], l[1], l[2], l[3], 3, true)).join('')}${p.body}</g></g>`
  const placed = `<g transform="translate(0 -0.6) scale(0.5)">${shape}</g>`
  const dot = name === 'waiting' ? `<circle cx="21.4" cy="3" r="2.6" fill="#000"/>` : ''
  return svg(24, 16, placed + dot, `tray ${name}`)
}

const poses = ['asleep', 'working', 'waiting', 'review']
for (const pose of poses) {
  writeFileSync(join(out, `a-${pose}.svg`), glassTop(pose))
  writeFileSync(join(out, `b-${pose}.svg`), glassSide(pose))
  writeFileSync(join(out, `c-${pose}.svg`), chip(pose))
}
for (const pose of ['asleep', 'working', 'waiting']) {
  writeFileSync(join(out, `tray-a-${pose}.svg`), trayTop(pose, 'a'))
  writeFileSync(join(out, `tray-b-${pose}.svg`), traySide(pose))
  writeFileSync(join(out, `tray-c-${pose}.svg`), trayTop(pose, 'c'))
}
