import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { PNG } from 'pngjs'
import { askTest } from '../../cli/browser'
import type { TabHandoffTarget } from '../../cli/live-view'
import type { ViewFrame } from '../../shared/api'
import { TAB_HANDOFF_TTL, tabHandoffRequest, tabHandoffUrl } from '../../shared/live-view'
import type { TabHandoffPngFrame, TabHandoffReply, TabVideoEvent } from '../../shared/live-view'
import { newKey, SIGNAL } from '../../shared/pairing'
import type { RemoteChannel } from '../../shared/remote/protocol'
import { nodeListen } from './transport'
import { framePatch } from './frame-patch'
import { tabVideo } from './tab-video'

const UNAVAILABLE = 'This browser tab is unavailable. Ask for a new link.'
const USED = 'This browser link was already used. Ask for a new link.'
const EXPIRED = 'This browser link expired. Ask for a new link.'

export function tabHandoffs(computer = hostname, video?: (event: TabVideoEvent) => boolean) {
  const pending = new Set<() => void>()

  const issue = async ({ name, tab, conversation }: TabHandoffTarget, onDone?: () => void): Promise<{ readonly link: string; readonly expires: number }> => {
    const target = { tab, conversation }
    const checked = await askTest(name, { cmd: 'handoff-check', ...target })
    if (!checked.ok) throw new Error(checked.error ?? UNAVAILABLE)
    if (pending.size >= 12) throw new Error('Too many browser links are open. Wait for them to expire.')

    const key = newKey()
    const expires = Date.now() + TAB_HANDOFF_TTL
    let used = false
    const stop = (): void => { pending.delete(stop); clearTimeout(timer); disconnect() }
    const serve = (channel: RemoteChannel): void => {
      const session = randomUUID()
      let closed = false
      let ending = false
      let opened: Promise<boolean> | undefined
      let stopVideo: (() => void) | undefined
      let lastFrame: string | undefined
      let lastPng: { readonly frame: TabHandoffPngFrame; readonly pixels?: PNG } | undefined
      let queued = 0
      let queue = Promise.resolve()
      const send = (reply: TabHandoffReply): void => { if (!closed) channel.send(JSON.stringify(reply)) }
      const release = async (): Promise<boolean> => {
        stopVideo?.()
        const active = opened
        opened = undefined
        if (!(await active)) return false
        return (await askTest(name, { cmd: 'view-close', key: session })).ok
      }
      channel.onClose(() => {
        closed = true
        void queue.then(release).catch(() => undefined)
      })
      channel.onMessage((raw) => {
        if (closed || ending) return
        let request: ReturnType<typeof tabHandoffRequest>
        try { request = tabHandoffRequest(raw) } catch { channel.close(); return }
        if (request === undefined || queued >= 16) { channel.close(); return }
        const { id, type } = request
        if (type === 'open') {
          if (used || Date.now() >= expires) { send({ id, ok: false, error: used ? USED : EXPIRED }); return }
          used = true
          opened = askTest(name, { cmd: 'view-handoff', ...target, key: session }).then((answer) => answer.ok)
          void opened.then(async (ok) => {
            if (!ok) { send({ id, ok: false, error: UNAVAILABLE }); return }
            if (!closed && !ending && request.type === 'open' && request.acceptVideo && video !== undefined) {
              const stream = await tabVideo(video)
              if (stream !== undefined) {
                if (closed || ending) { stream.stop(); return }
                stopVideo = stream.stop
                send({ id, ok: true, profile: name, computer: computer(), videoKey: stream.key })
                void askTest(name, { cmd: 'view-video', key: session, url: stream.endpoint }).then((reply) => { if (!reply.ok) stream.stop() }, stream.stop)
                return
              }
            }
            send({ id, ok: true, profile: name, computer: computer() })
          }).catch(() => send({ id, ok: false, error: UNAVAILABLE }))
          return
        }
        if (opened === undefined) { channel.close(); return }
        if (request.type === 'video-stop') {
          stopVideo?.()
          send({ id, ok: true })
          return
        }
        if (type === 'end') {
          if (Date.now() >= expires) { channel.close(); return }
          ending = true
          queue = queue.then(async () => {
            if (!(await release())) { send({ id, ok: false, error: UNAVAILABLE }); return }
            onDone?.()
            send({ id, ok: true })
          }).catch(() => send({ id, ok: false, error: UNAVAILABLE }))
          return
        }
        const command = request.type === 'input' ? { cmd: 'view-input', key: session, input: request.input } : { cmd: request.type === 'metadata' ? 'view-metadata' : 'view-frame', key: session, ...(request.type === 'frame' && request.acceptPatches ? { patches: true } : {}) }
        queued++
        queue = queue.then(async () => {
          if (closed || Date.now() >= expires || !(await opened)) return
          const reply = await askTest(name, command)
          if (!reply.ok) { send({ id, ok: false, error: UNAVAILABLE }); return }
          if (request.type === 'input') { send({ id, ok: true }); return }
          if (reply.result === undefined) { send({ id, ok: false, error: UNAVAILABLE }); return }
          const frame = reply.result as ViewFrame | TabHandoffPngFrame
          if (request.type === 'metadata') { send({ id, ok: true, frame }); return }
          const signature = JSON.stringify(frame)
          if (request.acceptUnchanged && lastFrame === signature) { send({ id, ok: true, unchanged: true }); return }
          lastFrame = signature
          const previous = lastPng
          lastPng = undefined
          if ('png' in frame) {
            lastPng = { frame }
            if (previous !== undefined && previous.frame.url === frame.url) {
              if (previous.frame.png === frame.png) {
                lastPng = previous
                send({ id, ok: true, frame: { ...frame, png: '' } }); return
              }
              const pixels = PNG.sync.read(Buffer.from(frame.png, 'base64'))
              lastPng = { frame, pixels }
              const patch = framePatch(previous.pixels ?? PNG.sync.read(Buffer.from(previous.frame.png, 'base64')), pixels)
              if (patch === null || (patch !== undefined && patch.png.length + 32 < frame.png.length)) {
                send({ id, ok: true, frame: { ...frame, png: '' }, ...(patch === null ? {} : { patch }) }); return
              }
            }
          }
          send({ id, ok: true, frame })
        }).catch(() => send({ id, ok: false, error: UNAVAILABLE })).finally(() => { queued-- })
      })
    }
    const disconnect = nodeListen({ key, signal: SIGNAL }, serve, () => undefined)
    const timer = setTimeout(stop, TAB_HANDOFF_TTL)
    timer.unref()
    pending.add(stop)
    return { link: tabHandoffUrl(key, expires, randomUUID()), expires }
  }
  return { issue, dispose: () => { for (const stop of pending) stop() } }
}
