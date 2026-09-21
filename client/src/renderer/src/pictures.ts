import type { SessionImage } from '../../shared/api'

/**
 * A pasted or dropped picture, ready to be sent.
 *
 * Anything bigger than the assistant reads at full detail is drawn smaller
 * first: a screenshot of a retina screen is four times the pixels it will be
 * looked at, and every one of them would be carried through the process, the
 * session file and back again.
 */

const KINDS = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** The long edge above which detail is no longer read. */
const EDGE = 1568

/** More base64 than this is refused rather than sent and rejected. */
const MOST = 5_000_000

export const canShow = (file: File): boolean => KINDS.has(file.type)

const dataUrl = (file: File): Promise<string> =>
  new Promise((ok, fail) => {
    const reader = new FileReader()
    reader.onload = () => ok(String(reader.result))
    reader.onerror = () => fail(new Error('The picture could not be read'))
    reader.readAsDataURL(file)
  })

const loaded = (url: string): Promise<HTMLImageElement> =>
  new Promise((ok, fail) => {
    const picture = new Image()
    picture.onload = () => ok(picture)
    picture.onerror = () => fail(new Error('The picture could not be opened'))
    picture.src = url
  })

const within = (media: string, url: string): SessionImage | undefined => {
  const data = url.slice(url.indexOf(',') + 1)
  return data.length > MOST ? undefined : { media, data }
}

export async function asImage(file: File): Promise<SessionImage | undefined> {
  const url = await dataUrl(file)
  // A gif is left alone: drawing it smaller would keep only its first frame.
  if (file.type === 'image/gif') return within(file.type, url)

  const picture = await loaded(url)
  const edge = Math.max(picture.width, picture.height)
  if (edge <= EDGE) return within(file.type, url)

  const scale = EDGE / edge
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(picture.width * scale)
  canvas.height = Math.round(picture.height * scale)
  const brush = canvas.getContext('2d')
  if (brush === null) return within(file.type, url)
  brush.drawImage(picture, 0, 0, canvas.width, canvas.height)
  return within(file.type, canvas.toDataURL(file.type, 0.9))
}
