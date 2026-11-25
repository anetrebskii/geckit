import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import type { BrowserCoordinates, BrowserLocationOverrides, BrowserLocationSettings } from '../../../shared/api'

const WorldMap = lazy(() => import('./BrowserLocationMap'))
const languageNames = new Intl.DisplayNames('en', { type: 'language' })
const regionNames = new Intl.DisplayNames('en', { type: 'region' })
const languages = 'ar bg bn ca cs da de el en es et fa fi fr he hi hr hu id it ja ko lt lv ms nb nl pl pt ro ru sk sl sr sv ta th tr uk ur vi zh zh-Hans zh-Hant'.split(' ').map((code) => <option key={code} value={code} label={languageNames.of(code)} />)
const regions = 'AE AR AT AU BE BR CA CH CL CN CO CZ DE DK EG ES FI FR GB GR HK HU ID IE IL IN IT JP KR MX MY NG NL NO NZ PH PK PL PT RO RU SA SE SG TH TR TW UA US VN ZA'.split(' ').map((code) => <option key={code} value={code} label={regionNames.of(code)} />)
const timezones = Array.from(new Set(['UTC', ...(Intl.supportedValuesOf?.('timeZone') ?? [])]), (zone) => <option key={zone} value={zone} />)

interface Props {
  readonly name: string | null
  readonly open: boolean
  readonly settings: BrowserLocationSettings
  readonly onClose: () => void
  readonly onSaved: () => Promise<void>
}

const coordinates = (latitude: string, longitude: string): BrowserCoordinates | undefined => {
  if (latitude.trim() === '' || longitude.trim() === '') return undefined
  const lat = Number(latitude.replace(',', '.'))
  const lon = Number(longitude.replace(',', '.'))
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 ? { latitude: lat, longitude: lon } : undefined
}

const defaultLabel = (value?: string): string => value === undefined ? 'Browser default' : `Default: ${value}`

export function BrowserLocationEditor({ name, open, settings, onClose, onSaved }: Props): React.JSX.Element {
  const prefix = useId()
  const form = useRef<HTMLFormElement>(null)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const { overrides, defaults } = settings
  const shared = name === null
  const savedCustom = Object.keys(overrides).length > 0
  const [custom, setCustom] = useState(savedCustom)
  const showFields = !shared || custom
  const title = shared ? 'Camoufox defaults' : 'Location and language'
  const [latitude, setLatitude] = useState(overrides.geolocation?.latitude.toString() ?? '')
  const [longitude, setLongitude] = useState(overrides.geolocation?.longitude.toString() ?? '')
  const [language, setLanguage] = useState(overrides.language ?? '')
  const [region, setRegion] = useState(overrides.region ?? '')
  const [timezone, setTimezone] = useState(overrides.timezone ?? '')
  useEffect(() => { form.current?.focus() }, [])
  const point = coordinates(latitude, longitude)
  const hasLocation = latitude.trim() !== '' || longitude.trim() !== ''
  const invalid = showFields && hasLocation && point === undefined
  const nextLanguage = language.trim()
  const nextRegion = region.trim().toUpperCase()
  const nextTimezone = timezone.trim()
  const changed = showFields ? point?.latitude !== overrides.geolocation?.latitude || point?.longitude !== overrides.geolocation?.longitude || nextLanguage !== (overrides.language ?? '') || nextRegion !== (overrides.region ?? '') || nextTimezone !== (overrides.timezone ?? '') : savedCustom
  const ready = changed && !invalid
  const update = (setter: (value: string) => void, value: string): void => { setter(value); setProblem('') }
  const pick = (next: BrowserCoordinates | undefined): void => {
    setLatitude(next?.latitude.toString() ?? '')
    setLongitude(next?.longitude.toString() ?? '')
    setProblem('')
  }
  const save = async (): Promise<void> => {
    if (saving.current || !ready) return
    saving.current = true
    setBusy(true)
    setProblem('')
    const location: BrowserLocationOverrides = !showFields ? {} : {
      ...(point === undefined ? {} : { geolocation: point }),
      ...(nextLanguage === '' ? {} : { language: nextLanguage }),
      ...(nextRegion === '' ? {} : { region: nextRegion }),
      ...(nextTimezone === '' ? {} : { timezone: nextTimezone }),
    }
    try {
      await window.geckit.browser.locationSettings(name, location)
      await onSaved()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const close = (): void => { if (!saving.current) onClose() }
  return <form ref={form} tabIndex={-1} className="browser-location-editor" aria-label={shared ? title : `${title} for geckit:${name}`} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void save() }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    <div className="browser-location-heading">
      <h4>{title}</h4>
      <p className="browser-profiles-hint">{shared ? 'Applies to Camoufox profiles on this computer. Profiles can override these settings.' : `geckit:${name} · Your public IP stays the same.`}</p>
    </div>
    {shared ? <fieldset className="browser-location-fields" disabled={busy}>
      <label>Defaults source<select value={custom ? 'custom' : 'system'} onChange={(event) => { setCustom(event.target.value === 'custom'); setProblem('') }}>
        <option value="system">Use system settings</option>
        <option value="custom">Set custom defaults</option>
      </select></label>
    </fieldset> : null}
    {!showFields ? <dl className="browser-location-summary browser-location-pair">
      <div><dt>Geolocation</dt><dd>Browser default</dd></div>
      <div><dt>Time zone</dt><dd>{defaults.timezone ?? 'Browser default'}</dd></div>
      <div><dt>Language</dt><dd>{defaults.language ?? 'Browser default'}</dd></div>
      <div><dt>Region</dt><dd>{defaults.region ?? 'Browser default'}</dd></div>
    </dl> : <>
    <fieldset className="browser-location-fields" disabled={busy}>
      <legend>Geolocation</legend>
      <Suspense fallback={<div className="browser-location-map-loading" role="status">Loading map…</div>}>
        <WorldMap point={point ?? (hasLocation ? undefined : defaults.geolocation)} disabled={busy} onPick={pick} />
      </Suspense>
      <div className="browser-location-pair">
        <label>Latitude<input inputMode="decimal" value={latitude} placeholder={defaultLabel(defaults.geolocation?.latitude.toString())} aria-invalid={invalid || undefined} onChange={(event) => update(setLatitude, event.target.value)} /></label>
        <label>Longitude<input inputMode="decimal" value={longitude} placeholder={defaultLabel(defaults.geolocation?.longitude.toString())} aria-invalid={invalid || undefined} onChange={(event) => update(setLongitude, event.target.value)} /></label>
      </div>
      {invalid ? <p className="browser-profile-error" role="alert">Enter latitude from −90 to 90 and longitude from −180 to 180.</p> : null}
      {hasLocation ? <button type="button" className="quiet browser-location-clear" onClick={() => pick(undefined)}>Clear location</button> : null}
    </fieldset>
    <fieldset className="browser-location-fields" disabled={busy}>
      <div className="browser-location-pair">
        <label>Language<input list={`${prefix}-languages`} value={language} placeholder={defaultLabel(defaults.language)} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(event) => update(setLanguage, event.target.value)} /></label>
        <datalist id={`${prefix}-languages`}>{languages}</datalist>
        <label>Region<input list={`${prefix}-regions`} value={region} placeholder={defaultLabel(defaults.region)} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(event) => update(setRegion, event.target.value)} /></label>
        <datalist id={`${prefix}-regions`}>{regions}</datalist>
      </div>
      <label>Time zone<input list={`${prefix}-timezones`} value={timezone} placeholder={defaultLabel(defaults.timezone)} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(event) => update(setTimezone, event.target.value)} /></label>
      <datalist id={`${prefix}-timezones`}>{timezones}</datalist>
      <p className="browser-profiles-hint">{shared ? 'Blank fields use system and browser defaults.' : 'Clear any field to inherit its default.'}</p>
    </fieldset>
    </>}
    {shared || open ? <p className="browser-profiles-hint">{shared ? 'Changes apply the next time each profile starts.' : 'Changes apply the next time this profile starts.'}</p> : null}
    {problem === '' ? null : <p className="browser-profile-error" role="alert">{problem}</p>}
    <div className="browser-profiles-form-actions">
      <button type="button" className="quiet browser-location-cancel" disabled={busy} onClick={close}>Cancel</button>
      <button type="submit" className="primary" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  </form>
}
