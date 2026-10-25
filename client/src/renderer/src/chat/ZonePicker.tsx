import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'

import { Icon } from '../ui/Icon'

export const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
// The system lists some zones under names their cities no longer use, and a search for the city has to find them.
const RENAMED: { readonly [name: string]: string } = { 'Asia/Calcutta': 'Kolkata', 'Asia/Saigon': 'Ho Chi Minh', 'Asia/Katmandu': 'Kathmandu', 'Asia/Rangoon': 'Yangon', 'Europe/Kiev': 'Kyiv', 'Atlantic/Faeroe': 'Faroe', 'America/Godthab': 'Nuuk', 'Africa/Asmera': 'Asmara', 'Pacific/Ponape': 'Pohnpei', 'Pacific/Truk': 'Chuuk', 'Pacific/Enderbury': 'Kanton' }

interface Zone {
  readonly name: string
  readonly offset: string
  readonly minutes: number
  readonly words: string
  readonly now?: string
  readonly mark?: 'This Mac' | 'Saved'
}

export function zoneOffset(timeZone: string): string | undefined {
  try {
    const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value
    return offset === 'GMT' ? 'GMT+0' : offset
  } catch { return undefined }
}

function zone(name: string, offset: string, mark?: Zone['mark']): Zone {
  const [hours = '0', minutes = '0'] = offset.slice(3).split(':')
  const sign = hours.startsWith('-') ? -1 : 1
  const now = RENAMED[name]
  const words = `${name} ${name.replaceAll('_', ' ')} ${now ?? ''} ${offset} ${offset.slice(3)} ${name === 'UTC' ? 'utc gmt universal' : ''} ${mark ?? ''}`.toLowerCase()
  return { name, offset, minutes: Number(hours) * 60 + sign * Number(minutes), words, ...(now === undefined ? {} : { now }), ...(mark === undefined ? {} : { mark }) }
}

// Read when the list opens, so each offset is the one in force now, summer time included.
function zonesNow(saved: string): readonly Zone[] {
  const names = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
  const pinned: Zone[] = []
  const local = zoneOffset(LOCAL_ZONE)
  if (local !== undefined) pinned.push(zone(LOCAL_ZONE, local, 'This Mac'))
  const kept = zoneOffset(saved)
  if (saved !== LOCAL_ZONE && kept !== undefined && !names.has(saved)) pinned.push(zone(saved, kept, 'Saved'))
  const rest = [...names].filter((name) => name !== LOCAL_ZONE).flatMap((name) => { const offset = zoneOffset(name); return offset === undefined ? [] : [zone(name, offset)] })
  return [...pinned, ...rest.sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name))]
}

export function ZonePicker({ value, disabled, labelledBy, onPick }: {
  readonly value: string
  readonly disabled: boolean
  readonly labelledBy: string
  readonly onPick: (zone: string) => void
}): React.JSX.Element {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [anchor, setAnchor] = useState<DOMRect>()
  const [query, setQuery] = useState('')
  const [lit, setLit] = useState<number>()
  const [at, setAt] = useState<{ readonly left: number; readonly top: number; readonly width: number; readonly height: number }>()
  const open = anchor !== undefined
  const placed = at !== undefined
  const zones = useMemo(() => open ? zonesNow(value) : [], [open, value])
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== '')
  const shown = words.length === 0 ? zones : zones.filter((one) => words.every((word) => one.words.includes(word)))
  const pinned = shown.filter((one) => one.mark !== undefined).length
  const active = lit ?? Math.max(0, shown.findIndex((one) => one.name === value))
  const offset = zoneOffset(value)
  const close = (focus: boolean): void => { setAnchor(undefined); setAt(undefined); setQuery(''); setLit(undefined); if (focus) button.current?.focus() }
  const show = (): void => { if (!disabled && button.current !== null) setAnchor(button.current.getBoundingClientRect()) }
  const pick = (one: Zone | undefined): void => { if (one === undefined) return; close(true); if (one.name !== value) onPick(one.name) }

  useLayoutEffect(() => {
    if (anchor === undefined || panel.current === null) return
    const width = Math.min(Math.max(anchor.width, 320), window.innerWidth - 16)
    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)
    const below = window.innerHeight - anchor.bottom - 12
    const above = anchor.top - 12
    const under = below >= 240 || below >= above
    const height = Math.min(380, under ? below : above)
    setAt({ left, width, height, top: under ? anchor.bottom + 4 : anchor.top - height - 4 })
  }, [anchor])

  useLayoutEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [open, active, id, at])

  // The list is measured hidden first, and a hidden field cannot take focus.
  useEffect(() => { if (placed) search.current?.focus() }, [placed])

  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open])

  const keys = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const last = shown.length - 1
    if (event.key === 'ArrowDown') setLit(Math.min(last, active + 1))
    else if (event.key === 'ArrowUp') setLit(Math.max(0, active - 1))
    else if (event.key === 'Home') setLit(0)
    else if (event.key === 'End') setLit(Math.max(0, last))
    else if (event.key === 'Enter') pick(shown[active])
    else if (event.key === 'Tab') close(true)
    else return
    event.preventDefault()
  }

  const option = (one: Zone, index: number): React.JSX.Element => <div key={`${one.mark ?? ''}${one.name}`} id={`${id}-${index}`} role="option" aria-selected={one.name === value} className={`menu-item zone-option${index === active ? ' lit' : ''}${one.name === value ? ' on' : ''}`}
    onMouseEnter={() => flushSync(() => setLit(index))} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(one)}>
    <span className="zone-check">{one.name === value ? <Icon name="check" size={13} /> : null}</span>
    <span className="label">{one.name.replaceAll('_', ' ')}{one.now === undefined ? null : <small> {one.now}</small>}</span>
    {one.mark === undefined ? null : <span className="zone-mark">{one.mark}</span>}
    <span className="says">{one.offset}</span>
  </div>

  return <>
    <button ref={button} type="button" id={`${id}-button`} className={offset === undefined ? 'zone-picker unknown' : 'zone-picker'} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${labelledBy} ${id}-button`} disabled={disabled}
      onClick={() => { if (open) close(false); else show() }}
      onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); show() } }}>
      <span>{value}</span>
      <small>{offset ?? 'Unknown time zone'}</small>
      <Icon name="down" size={12} />
    </button>
    {anchor === undefined ? null : createPortal(<>
      <div className="scrim menu-scrim" onMouseDown={() => close(false)} />
      <div ref={panel} className="floating menu zone-menu" style={{ left: at?.left ?? -9999, top: at?.top ?? -9999, width: at?.width, maxHeight: at?.height, visibility: at === undefined ? 'hidden' : 'visible' }}>
        <div className="zone-search">
          <Icon name="search" size={12} />
          <input ref={search} type="text" role="combobox" spellCheck={false} autoComplete="off" aria-label="Search time zones" placeholder="City, region or GMT offset" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" {...(shown[active] === undefined ? {} : { 'aria-activedescendant': `${id}-${active}` })} value={query} onKeyDown={keys} onChange={(event) => { setQuery(event.target.value); setLit(0) }} />
        </div>
        <div id={`${id}-list`} className="zone-list" role="listbox" aria-label="Time zones">
          {shown.length === 0 ? <p className="zone-empty">No time zones match “{query.trim()}”.</p> : <>
            {pinned === 0 ? null : <div className="zone-pinned" role="group" aria-label="Suggested">{shown.slice(0, pinned).map((one, index) => option(one, index))}</div>}
            {shown.length === pinned ? null : <div className="zone-all" role="group" aria-label="All time zones">{shown.slice(pinned).map((one, index) => option(one, pinned + index))}</div>}
          </>}
        </div>
      </div>
    </>, document.body)}
  </>
}
