type BoundaryValue = object | string | number | boolean | null | undefined
interface BoundaryResult { readonly value?: BoundaryValue; readonly error?: string }
interface BrowserEvent { readonly name: string; readonly args: BoundaryValue[] }
type Listener = (...args: never[]) => void
const listeners = new Map<string, Map<Listener, (value: BoundaryValue) => void>>()

const events = new EventSource('/api/events')
events.addEventListener('message', (event: MessageEvent<string>) => {
  const packet = JSON.parse(event.data) as BrowserEvent
  for (const listener of listeners.get(packet.name)?.values() ?? []) listener(packet.args[0] ?? undefined)
})

export const contextBridge = {
  exposeInMainWorld(name: string, value: object): void { Object.defineProperty(window, name, { value, configurable: true }) },
}
export const ipcRenderer = {
  async invoke(channel: string, ...args: BoundaryValue[]): Promise<BoundaryValue> {
    const response = await fetch('/api/invoke', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, args: args.map((value) => value === undefined ? { __geckitUndefined: true } : value) }) })
    const result = await response.json() as BoundaryResult
    if (!response.ok || result.error !== undefined) throw new Error(result.error ?? `Browser boundary failed: ${channel}`)
    return result.value ?? undefined
  },
  send(channel: string, ...args: BoundaryValue[]): void {
    if (channel === 'clipboard:write') { if (typeof args[0] === 'string') void navigator.clipboard.writeText(args[0]); return }
    if (channel === 'open:link') { if (typeof args[0] === 'string' && /^https?:\/\//.test(args[0])) window.open(args[0], '_blank', 'noopener'); return }
    void this.invoke(channel, ...args).catch((error: Error) => { console.error(error.message) })
  },
  on<T>(channel: string, listener: (event: Event, value: T) => void): void {
    let group = listeners.get(channel)
    if (group === undefined) { group = new Map(); listeners.set(channel, group) }
    group.set(listener as Listener, (value) => listener(new Event(channel), value as T))
  },
  off<T>(channel: string, listener: (event: Event, value: T) => void): void { listeners.get(channel)?.delete(listener as Listener) },
}
export const webUtils = { getPathForFile: (file: File): string => file.name }
