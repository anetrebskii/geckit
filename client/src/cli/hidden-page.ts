/** Refs and secret fields kept in Camoufox's isolated world, where page scripts cannot see them; the extension's page functions use it whenever it exists. */
export const HIDDEN_SCRIPT = `globalThis.geckitHidden ??= (() => {
  const refs = new Map()
  const of = new WeakMap()
  return {
    next: 1,
    of,
    secrets: new Set(),
    find: (ref) => { const el = refs.get(String(ref))?.deref(); return el && el.isConnected ? el : null },
    mark: (el, ref) => { of.set(el, ref); refs.set(ref, new WeakRef(el)) },
  }
})()`

export interface PictureJob {
  readonly data: string
  readonly type: 'image/png' | 'image/jpeg'
  readonly clip?: { readonly x: number; readonly y: number; readonly width: number } | undefined
  readonly pointer?: { readonly x: number; readonly y: number } | undefined
}

/** Draws on a picture what GeckIt no longer puts in the page: its pointer, and a cover over every field filled with a secret. */
export const PAINT_SCRIPT = `async (jobs) => {
  const secrets = [...(globalThis.geckitHidden?.secrets ?? [])].filter((one) => one.isConnected).map((one) => ({ box: one.getBoundingClientRect(), fill: getComputedStyle(one).backgroundColor }))
  const arrow = new Path2D('M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z')
  const out = []
  for (const job of jobs) {
    if (secrets.length === 0 && !job.pointer) { out.push(job.data); continue }
    const bytes = Uint8Array.from(atob(job.data), (c) => c.charCodeAt(0))
    const picture = await createImageBitmap(new Blob([bytes], { type: job.type }))
    const left = job.clip ? job.clip.x : 0
    const top = job.clip ? job.clip.y : 0
    const scale = picture.width / (job.clip ? job.clip.width : innerWidth)
    const canvas = new OffscreenCanvas(picture.width, picture.height)
    const g = canvas.getContext('2d')
    g.drawImage(picture, 0, 0)
    for (const one of secrets) {
      const x = (one.box.left - left) * scale
      const y = (one.box.top - top) * scale
      const w = one.box.width * scale
      const h = one.box.height * scale
      g.fillStyle = /rgba\\(0, 0, 0, 0\\)|transparent/.test(one.fill) ? '#ffffff' : one.fill
      g.fillRect(x + scale, y + scale, Math.max(0, w - 2 * scale), Math.max(0, h - 2 * scale))
      g.fillStyle = '#6b6b6b'
      for (let dot = 0; dot < 6; dot++) { g.beginPath(); g.arc(x + (10 + dot * 9) * scale, y + h / 2, 2.5 * scale, 0, Math.PI * 2); g.fill() }
    }
    if (job.pointer) {
      g.save()
      g.translate((job.pointer.x - left - 2) * scale, (job.pointer.y - top - 2) * scale)
      g.scale(scale, scale)
      g.lineJoin = 'round'
      g.lineWidth = 1.5
      g.strokeStyle = 'white'
      g.fillStyle = 'black'
      g.fill(arrow)
      g.stroke(arrow)
      g.restore()
    }
    const blob = await canvas.convertToBlob({ type: job.type, quality: 0.85 })
    const url = await new Promise((done, fail) => { const reader = new FileReader(); reader.onload = () => done(reader.result); reader.onerror = () => fail(reader.error); reader.readAsDataURL(blob) })
    out.push(url.slice(url.indexOf(',') + 1))
  }
  return out
}`
