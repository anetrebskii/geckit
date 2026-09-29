import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'

import type { FileShown } from '../shared/api'
import { fileAt } from './open-with'

const MEDIA: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

// What goes over the link to the phone in one answer; a prototype with its pictures is well under it.
const MOST = 8 * 1024 * 1024
const TEXT_MOST = 1024 * 1024

/** A file said in a conversation, read for the phone, which has no application to open it in. */
export async function fileShown(root: string, path: string): Promise<FileShown> {
  const file = fileAt(root, path)
  const found = await stat(file).catch(() => undefined)
  if (found === undefined) return { kind: 'none', why: `${basename(file)} is not on the Mac any more.` }
  if (found.isDirectory()) {
    const inside = (await readdir(file, { withFileTypes: true })).map((one) => ({ name: one.name, folder: one.isDirectory() }))
    return { kind: 'folder', inside: inside.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)) }
  }
  if (found.size > MOST) return { kind: 'none', why: `${basename(file)} is too big to send to the phone.` }
  const kind = extname(file).toLowerCase()
  const media = MEDIA[kind]
  if (media?.startsWith('image/') === true) return { kind: 'picture', image: { media, data: (await readFile(file)).toString('base64') } }
  const bytes = await readFile(file)
  if (bytes.subarray(0, 8000).includes(0)) return { kind: 'none', why: `${basename(file)} is not text the phone can show.` }
  const text = bytes.toString('utf8')
  if (kind === '.html' || kind === '.htm') return { kind: 'page', html: await withinPage(text, dirname(file)) }
  const kept = text.length > TEXT_MOST ? `${text.slice(0, TEXT_MOST)}\n…` : text
  return { kind: kind === '.md' || kind === '.markdown' ? 'markdown' : 'text', text: kept }
}

/** A page's own styles, scripts, pictures and fonts put inside it, since the phone draws it where nothing beside it can be fetched. */
async function withinPage(html: string, folder: string): Promise<string> {
  const said = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)[^"']*["']/gi)].map((one) => one[1] ?? '')
  const local = [...new Set(said)].filter((one) => !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(one) && MEDIA[extname(one).toLowerCase()] !== undefined)
  const inlined = new Map<string, string>()
  for (const one of local) {
    const bytes = await readFile(resolve(folder, decodeURI(one))).catch(() => undefined)
    if (bytes !== undefined) inlined.set(one, `data:${MEDIA[extname(one).toLowerCase()] ?? ''};base64,${bytes.toString('base64')}`)
  }
  return html.replace(/\b(src|href)(\s*=\s*)(["'])([^"'#?]+)([^"']*)\3/gi, (whole, name: string, eq: string, quote: string, path: string) => {
    const data = inlined.get(path)
    return data === undefined ? whole : `${name}${eq}${quote}${data}${quote}`
  })
}
