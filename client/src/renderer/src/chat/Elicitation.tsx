import { useRef, useState } from 'react'

import type { Elicitation, ElicitationField, Json, JsonObject } from '../../../shared/elicitation'
import { elicitationAnswer, elicitationUrl, validField } from '../../../shared/elicitation'

interface Props {
  readonly request: Elicitation
  readonly onAnswer: (answer: string) => void
}

export function ElicitationForm({ request, onAnswer }: Props): React.JSX.Element {
  const [values, setValues] = useState<JsonObject>(() => Object.fromEntries(request.fields.filter((field) => field.default !== undefined).map((field) => [field.name, field.default ?? null])))
  const [invalid, setInvalid] = useState(false)
  const [sending, setSending] = useState(false)
  const sent = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const valid = request.error === undefined && request.fields.every((field) => validField(field, Object.hasOwn(values, field.name) ? values[field.name] : undefined))
  const answer = (action: 'accept' | 'decline' | 'cancel'): void => {
    if (sent.current) return
    const encoded = JSON.stringify({ action, content: action === 'accept' && request.url === undefined ? values : null })
    if (elicitationAnswer(encoded, request) === undefined || (action === 'accept' && form.current?.reportValidity() === false)) { setInvalid(true); return }
    sent.current = true
    setSending(true)
    onAnswer(encoded)
  }
  const setValue = (field: ElicitationField, value: Json | undefined): void => {
    setValues((before) => {
      const next = { ...before }
      if (value === undefined) delete next[field.name]
      else Object.defineProperty(next, field.name, { value, enumerable: true, configurable: true, writable: true })
      return next
    })
  }
  return <form ref={form} className="elicitation-form" onSubmit={(event) => event.preventDefault()} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); answer('cancel') }
    else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
  }}>
    {request.error === undefined ? request.fields.map((field) => <Field key={field.name} field={field} value={values[field.name]} invalid={(invalid || Object.hasOwn(values, field.name)) && !validField(field, values[field.name])} onChange={(value) => setValue(field, value)} />) : <p className="elicitation-error">{request.error}</p>}
    {request.url === undefined ? null : <div className="elicitation-link">
      <div className="elicitation-destination">{request.url}</div>
      {elicitationUrl(request.url) ? <button type="button" className="quiet" disabled={sending} onClick={() => window.geckit.chat.openLink(request.url ?? '')}>Open link</button> : null}
    </div>}
    {invalid ? <p className="elicitation-error" role="alert">Check the required fields and their limits.</p> : null}
    <div className="card-actions">
      <button type="button" className="quiet" disabled={sending} onClick={() => answer('cancel')}>Cancel</button>
      <button type="button" className="quiet" disabled={sending} onClick={() => answer('decline')}>Decline</button>
      <button type="button" className="primary" disabled={sending || !valid} onClick={() => answer('accept')}>Accept</button>
    </div>
  </form>
}

interface FieldProps {
  readonly field: ElicitationField
  readonly value: Json | undefined
  readonly invalid: boolean
  readonly onChange: (value: Json | undefined) => void
}

function Field({ field, value, invalid, onChange }: FieldProps): React.JSX.Element {
  const label = `${field.label}${field.required ? ' (required)' : ''}`
  const description = field.description === undefined ? null : <span className="elicitation-description">{field.description}</span>
  const limits = [field.minimum === undefined ? '' : `Minimum ${String(field.minimum)}`, field.maximum === undefined ? '' : `Maximum ${String(field.maximum)}`, field.minLength === undefined ? '' : `At least ${String(field.minLength)} characters`, field.maxLength === undefined ? '' : `At most ${String(field.maxLength)} characters`, field.minItems === undefined ? '' : `Choose at least ${String(field.minItems)}`, field.maxItems === undefined ? '' : `Choose at most ${String(field.maxItems)}`, field.format === undefined ? '' : `Format: ${field.format}`].filter(Boolean).join('. ')
  const constraint = limits === '' ? null : <span className="elicitation-description">{limits}</span>
  if (field.type === 'array') return <fieldset className="elicitation-field" aria-invalid={invalid || undefined}>
    <legend>{label}</legend>{description}{constraint}
    {field.options?.map((option) => <label key={option.value} className="elicitation-option">
      <input type="checkbox" checked={Array.isArray(value) && value.includes(option.value)} onChange={(event) => {
        const chosen = Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
        const next = event.target.checked ? [...chosen, option.value] : chosen.filter((one) => one !== option.value)
        onChange(next.length === 0 && !field.required ? undefined : next)
      }} />{option.label}
    </label>)}
  </fieldset>
  const choose = field.type === 'boolean' || field.options !== undefined
  return <label className="elicitation-field">
    <span>{label}</span>{description}{constraint}
    {choose ? <select value={value === undefined ? '' : field.type === 'boolean' ? String(value) : String(field.options?.findIndex((option) => option.value === value))} required={field.required} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value === '' ? undefined : field.type === 'boolean' ? event.target.value === 'true' : field.options?.[Number(event.target.value)]?.value)}>
      <option value="">Choose...</option>
      {field.type === 'boolean' ? <><option value="true">Yes</option><option value="false">No</option></> : field.options?.map((option, index) => <option key={option.value} value={String(index)}>{option.label}</option>)}
    </select> : <input type={field.type === 'number' || field.type === 'integer' ? 'number' : field.format === 'email' ? 'email' : field.format === 'date' ? 'date' : 'text'} value={typeof value === 'string' || typeof value === 'number' ? value : ''} min={field.minimum} max={field.maximum} step="any" aria-invalid={invalid || undefined} onChange={(event) => onChange(field.type === 'number' || field.type === 'integer' ? event.target.value === '' ? undefined : Number(event.target.value) : event.target.value)} />}
  </label>
}
