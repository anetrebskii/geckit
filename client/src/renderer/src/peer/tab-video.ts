import { listen } from '../link'
import type { Link } from '../link'
import { SIGNAL } from '../../../shared/pairing'
import type { TabVideoEvent } from '../../../shared/live-view'

export function tabVideoSender(): (event: TabVideoEvent) => void {
  const rooms = new Map<string, { readonly frame: (jpeg: string) => void; readonly stop: () => void }>()
  return (event) => {
    const room = rooms.get(event.key)
    if (event.type === 'stop') { room?.stop(); return }
    if (event.type === 'frame') { room?.frame(event.jpeg); return }
    if (room !== undefined) return

    const canvas = document.createElement('canvas')
    const paint = canvas.getContext('2d', { alpha: false })
    if (paint === null) return
    const stream = canvas.captureStream(0)
    const track = stream.getVideoTracks()[0]
    if (track === undefined) return
    const source = track as CanvasCaptureMediaStreamTrack
    let viewer: Link | undefined
    let hasFrame = false
    let sharing = false
    let active = true
    let drawing = false
    let pending: string | undefined
    const share = (): void => {
      if (viewer === undefined || sharing || !hasFrame) return
      sharing = true
      void viewer.share(track).then(() => {
        if (!active) return
        source.requestFrame()
        paint.drawImage(canvas, 0, 0)
      }, stop)
    }
    const frame = async (): Promise<void> => {
      drawing = true
      try {
        while (active && pending !== undefined) {
          const jpeg = pending
          pending = undefined
          const bytes = Uint8Array.from(atob(jpeg), (byte) => byte.charCodeAt(0))
          const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
          if (active) {
            if (canvas.width !== image.width) canvas.width = image.width
            if (canvas.height !== image.height) canvas.height = image.height
            source.requestFrame()
            paint.drawImage(image, 0, 0)
            hasFrame = true
            share()
          }
          image.close()
        }
      } finally { drawing = false }
    }
    const stop = (): void => {
      if (!rooms.delete(event.key)) return
      active = false
      pending = undefined
      track.stop()
      disconnect()
    }
    const disconnect = listen({ key: event.key, signal: SIGNAL }, (link) => {
      if (viewer !== undefined) { link.close(); return }
      viewer = link
      link.onClose(stop)
      share()
    }, () => undefined)
    rooms.set(event.key, { stop, frame: (jpeg) => { pending = jpeg; if (!drawing) void frame().catch(stop) } })
  }
}
