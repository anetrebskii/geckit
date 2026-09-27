import type { SessionImage, SessionItem } from './api'

/** What was done on the way to an answer, as opposed to what was said: read, ran, thought, changed, allowed. */
export const isStep = (item: SessionItem): boolean =>
  item.kind === 'did' ||
  item.kind === 'thought' ||
  item.kind === 'wrote' ||
  (item.kind === 'card' && item.card.answered !== undefined)

export const runKey = (first: string): string => `steps:${first}`

/** A conversation with each run of steps as one `steps` item, which is what the phone is sent. */
export function collapse(items: readonly SessionItem[]): SessionItem[] {
  const out: SessionItem[] = []
  let ids: string[] = []
  let latest: string | undefined
  let images: SessionImage[] = []
  const close = (): void => {
    const first = ids[0]
    if (first !== undefined)
      out.push({ kind: 'steps', id: runKey(first), ids, ...(latest === undefined ? {} : { latest }), ...(images.length === 0 ? {} : { images }) })
    ids = []
    latest = undefined
    images = []
  }
  for (const item of items) {
    if (!isStep(item)) {
      close()
      out.push(item)
      continue
    }
    ids.push(item.id)
    if (item.kind === 'did') {
      latest = item.what
      images.push(...(item.images ?? []))
    }
  }
  close()
  return out
}

/** Which picture of which line of which conversation, which the phone asks for once it is looked at. */
export const pictureRef = (session: string, item: string, index: number): string => [session, item, String(index)].join('\n')

export function readPictureRef(ref: string): { readonly session: string; readonly item: string; readonly index: number } | undefined {
  const [session, item, index] = ref.split('\n')
  return session === undefined || item === undefined || index === undefined ? undefined : { session, item, index: Number(index) }
}

/** A line as the phone is sent it: its pictures named rather than carried. */
export function withoutPictures(session: string, item: SessionItem): SessionItem {
  if ((item.kind !== 'mine' && item.kind !== 'did') || item.images === undefined) return item
  return { ...item, images: item.images.map((one, index) => ({ media: one.media, data: '', ref: pictureRef(session, item.id, index) })) }
}
