import { useEffect, useMemo, useState } from 'react'
import type { Settings, Shortcut } from '../../../shared/api'
import type { ShortcutDestination, ShortcutDestinationChannel } from '../../../shared/shortcut-destinations'
import type { ShortcutRun } from '../../../shared/shortcut-runs'
import { Menu, Picker } from '../ui/Menu'
import { Cell } from './PhoneKit'

type DestinationSettings = Pick<Settings, 'shortcutDestinationsVersion'>
type DestinationEditor = ReturnType<typeof useShortcutDestination>

export const destinationSummary = (destination: ShortcutDestination): string => `${destination.channel.replace(/^channel:/, '')} · ${destination.label ?? destination.destination}`

export function useShortcutDestination(settings: DestinationSettings, destination: Shortcut['destination'], change: (destination: Shortcut['destination']) => void) {
  const supported = settings.shortcutDestinationsVersion === 1
  const [channel, setChannel] = useState(destination?.channel ?? '')
  const [channels, setChannels] = useState<readonly ShortcutDestinationChannel[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, retry] = useState(0)
  useEffect(() => {
    if (!supported) return
    let current = true
    void window.geckit.shortcuts.destinations().then((list) => { if (current) { setChannels(list); setState('ready') } }).catch(() => { if (current) setState('error') })
    return () => { current = false }
  }, [supported, attempt])
  const selected = channels.find((one) => one.id === channel)
  const choices = selected?.destinations
  const transport = useMemo(() => {
    const list = [{ value: '', label: 'GeckIt' }, ...channels.map((one) => ({ value: one.id, label: one.name }))]
    if (channel !== '' && selected === undefined) list.push({ value: channel, label: channel.replace(/^channel:/, '') })
    return list
  }, [channels, channel, selected])
  const destinations = useMemo(() => {
    const counts = new Map<string, number>()
    for (const one of choices ?? []) counts.set(one.name, (counts.get(one.name) ?? 0) + 1)
    const list = (choices ?? []).map((one) => ({ value: one.id, label: (counts.get(one.name) ?? 0) > 1 ? `${one.name} (${one.id})` : one.name }))
    if (destination !== undefined && !choices?.some((one) => one.id === destination.destination)) list.unshift({ value: destination.destination, label: destination.label ?? destination.destination })
    return list
  }, [choices, destination])
  const message = !supported ? 'This host does not support shortcut result destinations. Update GeckIt on the host.' : state === 'loading' ? 'Loading destinations...' : state === 'error' ? "Couldn't load destinations. Try again." : channel === '' ? '' : selected?.supported === false ? 'This channel does not support shortcut result destinations.' : selected === undefined || selected.error !== undefined || destination !== undefined && !choices?.some((one) => one.id === destination.destination) ? 'Destination unavailable. Check this channel in Settings > Channels.' : (choices?.length ?? 0) === 0 ? 'No destinations available. Check this channel in Settings > Channels.' : ''
  const pickChannel = (value: string): void => { setChannel(value); change(undefined) }
  const pickDestination = (value: string): void => {
    const picked = choices?.find((one) => one.id === value)
    if (selected !== undefined && picked !== undefined) change({ channel: selected.id, destination: picked.id, label: picked.name })
  }
  return { channel, destination, transport, destinations, pickChannel, pickDestination, message, loading: supported && state === 'loading', retry: () => { setState('loading'); retry((value) => value + 1) }, failed: state === 'error', valid: channel === '' || destination !== undefined && supported, label: transport.find((one) => one.value === channel)?.label ?? channel }
}

export function ShortcutDestinationFields({ editor, phone = false }: { readonly editor: DestinationEditor; readonly phone?: boolean }): React.JSX.Element {
  const [picking, setPicking] = useState<'channel' | 'destination'>()
  const destinationChoices = useMemo(() => editor.destinations.map((one) => ({ ...one, label: <span className="shortcut-destination-choice">{one.label}</span> })), [editor.destinations])
  const help = editor.channel === 'channel:discord' ? 'Each completed run starts a new Discord thread. Reply there to continue that run with Manager.' : editor.channel === 'channel:slack' ? 'Each completed run starts a new Slack thread. Reply there to continue that run with Manager.' : ''
  const note = <>{editor.message === '' ? null : <span role="status">{editor.message}</span>}{editor.failed ? <button type="button" className="quiet" onClick={editor.retry}>Try again</button> : null}{help === '' ? null : <span>{help}</span>}</>
  if (phone) return <><div className="phone-group phone-form-group shortcut-destinations">
    <Cell label="Send result" value={editor.label} onPress={() => setPicking('channel')} />
    {editor.channel === '' ? null : <Cell label="Destination" value={editor.destination?.label ?? editor.destination?.destination ?? 'Choose a destination'} {...(editor.loading || editor.destinations.length === 0 ? {} : { onPress: () => setPicking('destination') })} />}
  </div><div className="phone-note shortcut-destination-note">{note}</div>{picking === undefined ? null : <Menu anchor={new DOMRect()} title={picking === 'channel' ? 'Send result' : 'Destination'} chosen={picking === 'channel' ? editor.channel : editor.destination?.destination ?? ''} choices={picking === 'channel' ? editor.transport : destinationChoices} onPick={picking === 'channel' ? editor.pickChannel : editor.pickDestination} onClose={() => setPicking(undefined)} />}</>
  return <><div className="shortcut-setting"><span>Send result</span><Picker className="select" label={editor.label} chosen={editor.channel} choices={editor.transport} onPick={editor.pickChannel} /></div>
    {editor.channel === '' ? null : <div className="shortcut-setting shortcut-destination-control"><span>Destination</span><Picker className="select" label={<span className="shortcut-destination-choice">{editor.destination?.label ?? editor.destination?.destination ?? 'Choose a destination'}</span>} chosen={editor.destination?.destination ?? ''} choices={destinationChoices} disabled={editor.loading || editor.destinations.length === 0} onPick={editor.pickDestination} /></div>}
    <div className="shortcut-next shortcut-destination-note">{note}</div></>
}

export function useShortcutRuns(settings: Pick<Settings, 'shortcuts' | 'shortcutDestinationsVersion'>): ReadonlyMap<string, ShortcutRun> {
  const [runs, setRuns] = useState<readonly ShortcutRun[]>([])
  useEffect(() => {
    if (settings.shortcutDestinationsVersion !== 1 || !settings.shortcuts.some((one) => one.destination !== undefined)) return
    let current = true
    const updated = new Map<ShortcutRun['id'], ShortcutRun>()
    const stop = window.geckit.shortcuts.onRun((run) => {
      updated.set(run.id, run)
      if (current) setRuns((previous) => [...previous.filter((one) => one.id !== run.id), run])
    })
    void window.geckit.shortcuts.runs().then((list) => { if (current) setRuns([...list.filter((run) => !updated.has(run.id)), ...updated.values()]) }).catch(() => { if (current) setRuns([...updated.values()]) })
    return () => { current = false; stop() }
  }, [settings.shortcuts, settings.shortcutDestinationsVersion])
  return useMemo(() => {
    const latest = new Map<string, ShortcutRun>()
    for (const run of runs) if ((latest.get(run.shortcut.id)?.admitted ?? -Infinity) < run.admitted) latest.set(run.shortcut.id, run)
    return latest
  }, [runs])
}

export function ShortcutDelivery({ run }: { readonly run: ShortcutRun | undefined }): React.JSX.Element | null {
  if (run === undefined) return null
  const message = run.delivery === 'uncertain' ? 'Result delivery is uncertain. Check the destination before retrying.' : run.delivery === 'failed' ? `Result delivery failed: ${run.error ?? 'Destination unavailable'}` : run.state === 'failed' ? `Run failed: ${run.error ?? 'Source unavailable'}` : run.delivery === 'sending' ? 'Sending result...' : run.delivery === 'waiting' ? run.error ?? 'Result waiting for the run to finish.' : ''
  return <span className="shortcut-delivery">{message === '' ? null : <span>{message}</span>}{run.receipt?.link === undefined ? null : <a href={run.receipt.link} target="_blank" rel="noreferrer">Open result thread</a>}</span>
}
