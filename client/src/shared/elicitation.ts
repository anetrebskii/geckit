export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type JsonObject = Extract<Json, { [key: string]: Json }>
export type ElicitationValue = string | number | boolean | string[]

export interface ElicitationField {
  readonly name: string
  readonly label: string
  readonly description?: string
  readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  readonly required: boolean
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly default?: ElicitationValue
  readonly minimum?: number
  readonly maximum?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly format?: 'email' | 'uri' | 'date' | 'date-time'
}

export interface Elicitation {
  readonly serverName: string
  readonly message: string
  readonly fields: readonly ElicitationField[]
  readonly url?: string
  readonly error?: string
  readonly rememberAllowed?: boolean
}

export interface ElicitationResponse {
  readonly action: 'accept' | 'decline' | 'cancel'
  readonly content: JsonObject | null
  readonly _meta: null
}

export type ElicitationAnswer = ElicitationResponse & { readonly remember?: true }

export function elicitationAccessKey(request: Elicitation, mode: string, schema: Json, meta: Json): string | undefined {
  if (meta === undefined || request.serverName !== 'cua_repl' || request.url !== undefined || request.error !== undefined || request.fields.length !== 0 || !['form', 'openai/form', 'openaiForm'].includes(mode) || !/^Allow Computer Use to use "[^"\r\n]+"\?$(?![\s\S])/.test(request.message)) return undefined
  return JSON.stringify([request.serverName, mode, request.message, schema, meta])
}

export const jsonObject = (value: Json | undefined): JsonObject | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
const string = (value: Json | undefined): string | undefined => typeof value === 'string' ? value : undefined
const number = (value: Json | undefined): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const strings = (value: Json | undefined): string[] | undefined => Array.isArray(value) && value.every((one) => typeof one === 'string') ? value : undefined
const only = (value: JsonObject, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key))
const unsupported = { fields: [], error: 'This form is not supported yet.' } as const
const fieldKeys = ['type', 'title', 'description', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'format', 'enum', 'enumNames', 'oneOf', 'items', 'minItems', 'maxItems']

function choices(schema: JsonObject): ElicitationField['options'] {
  if (schema['enum'] !== undefined) {
    const values = strings(schema['enum'])
    const labels = schema['enumNames'] === undefined ? undefined : strings(schema['enumNames'])
    if (values === undefined || values.length === 0 || (schema['enumNames'] !== undefined && (labels === undefined || labels.length !== values.length))) return undefined
    return values.map((value, at) => ({ value, label: labels?.[at] ?? value }))
  }
  const entries = schema['oneOf'] ?? schema['anyOf']
  if (!Array.isArray(entries) || entries.length === 0) return undefined
  const options: NonNullable<ElicitationField['options']>[number][] = []
  for (const entry of entries) {
    const option = jsonObject(entry)
    if (option === undefined || !only(option, ['const', 'title']) || typeof option['const'] !== 'string' || typeof option['title'] !== 'string') return undefined
    options.push({ value: option['const'], label: option['title'] })
  }
  return options
}

function field(name: string, schema: JsonObject, required: boolean): ElicitationField | undefined {
  if (!only(schema, fieldKeys)) return undefined
  if (['title', 'description'].some((key) => schema[key] !== undefined && typeof schema[key] !== 'string')) return undefined
  const type = schema['type']
  if (type !== 'string' && type !== 'number' && type !== 'integer' && type !== 'boolean' && type !== 'array') return undefined
  const constraints = ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'] as const
  for (const key of constraints) {
    const value = schema[key]
    if (value !== undefined && (number(value) === undefined || (key !== 'minimum' && key !== 'maximum' && (!Number.isInteger(value) || Number(value) < 0)))) return undefined
    if (value !== undefined && (key === 'minimum' || key === 'maximum' ? type !== 'number' && type !== 'integer' : key === 'minLength' || key === 'maxLength' ? type !== 'string' : type !== 'array')) return undefined
  }
  const format = schema['format']
  if (format !== undefined && (type !== 'string' || (format !== 'email' && format !== 'uri' && format !== 'date' && format !== 'date-time'))) return undefined
  if ((schema['enum'] !== undefined || schema['oneOf'] !== undefined || schema['enumNames'] !== undefined) && type !== 'string') return undefined
  if (schema['enum'] !== undefined && schema['oneOf'] !== undefined) return undefined
  if (schema['items'] !== undefined && type !== 'array') return undefined
  const items = jsonObject(schema['items'])
  if (type === 'array' && (items === undefined || !only(items, ['type', 'enum', 'anyOf']) || (items['type'] !== undefined && items['type'] !== 'string'))) return undefined
  const options = type === 'array' && items !== undefined ? choices(items) : schema['enum'] !== undefined || schema['oneOf'] !== undefined ? choices(schema) : undefined
  if ((type === 'array' || schema['enum'] !== undefined || schema['oneOf'] !== undefined) && options === undefined) return undefined
  if (options !== undefined && new Set(options.map((option) => option.value)).size !== options.length) return undefined
  const description = string(schema['description'])
  const value: ElicitationField = {
    name, label: string(schema['title']) ?? name, required, type,
    ...(description === undefined ? {} : { description }),
    ...(options === undefined ? {} : { options }),
    ...(format === undefined ? {} : { format }),
    ...Object.fromEntries(constraints.filter((key) => schema[key] !== undefined).map((key) => [key, schema[key]])),
  }
  if ((value.minimum ?? -Infinity) > (value.maximum ?? Infinity) || (value.minLength ?? 0) > (value.maxLength ?? Infinity) || (value.minItems ?? 0) > (value.maxItems ?? Infinity)) return undefined
  if (schema['default'] !== undefined) {
    const initial = schema['default']
    if (!validField(value, initial)) return undefined
    return { ...value, default: initial }
  }
  return value
}

export function elicitationForm(schema: Json): Pick<Elicitation, 'fields' | 'error'> {
  const root = jsonObject(schema)
  if (root === undefined || root['type'] !== 'object' || !only(root, ['$schema', 'type', 'properties', 'required', 'title', 'description', 'additionalProperties']) || (root['additionalProperties'] !== undefined && typeof root['additionalProperties'] !== 'boolean')) return unsupported
  const properties = jsonObject(root['properties'])
  const required = root['required'] === undefined ? [] : strings(root['required'])
  if (properties === undefined || required === undefined || required.some((key) => !Object.hasOwn(properties, key))) return unsupported
  const fields: ElicitationField[] = []
  for (const [name, value] of Object.entries(properties)) {
    const schema = jsonObject(value)
    const parsed = schema === undefined ? undefined : field(name, schema, required.includes(name))
    if (parsed === undefined) return unsupported
    fields.push(parsed)
  }
  return { fields }
}

export function validField(field: ElicitationField, value: Json | undefined): value is ElicitationValue {
  if (value === undefined) return !field.required
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'array') return Array.isArray(value) && value.every((one) => typeof one === 'string' && field.options?.some((option) => option.value === one)) && new Set(value).size === value.length && value.length >= (field.minItems ?? 0) && value.length <= (field.maxItems ?? Infinity)
  if (field.type === 'number' || field.type === 'integer') return typeof value === 'number' && Number.isFinite(value) && (field.type !== 'integer' || Number.isInteger(value)) && value >= (field.minimum ?? -Infinity) && value <= (field.maximum ?? Infinity)
  if (typeof value !== 'string' || [...value].length < (field.minLength ?? 0) || [...value].length > (field.maxLength ?? Infinity) || (field.options !== undefined && !field.options.some((option) => option.value === value))) return false
  switch (field.format) {
    case 'email': return /^[^\s@]+@[^\s@]+$/.test(value)
    case 'uri': try { return new URL(value).protocol !== '' } catch { return false }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
    case 'date-time': return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10)
    default: return true
  }
}

export function elicitationAnswer(answer: string, request: Elicitation): ElicitationAnswer | undefined {
  let parsed: Json
  try { parsed = JSON.parse(answer) as Json } catch { return undefined }
  const value = jsonObject(parsed)
  const action = value?.['action']
  const remember = value?.['remember']
  if (remember !== undefined && typeof remember !== 'boolean') return undefined
  if (remember === true && (action !== 'accept' || request.rememberAllowed !== true || request.error !== undefined || request.url !== undefined || request.fields.length !== 0)) return undefined
  if (action === 'decline' || action === 'cancel') return { action, content: null, _meta: null }
  if (action !== 'accept' || request.error !== undefined) return undefined
  const content = jsonObject(value?.['content'])
  if (request.url !== undefined) return { action, content: null, _meta: null }
  if (content === undefined || !only(content, request.fields.map((field) => field.name)) || request.fields.some((field) => !validField(field, Object.hasOwn(content, field.name) ? content[field.name] : undefined))) return undefined
  return { action, content, _meta: null, ...(remember === true ? { remember } : {}) }
}

export function elicitationSummary(answer: string): string {
  let parsed: Json
  try { parsed = JSON.parse(answer) as Json } catch { return 'Cancelled' }
  switch (jsonObject(parsed)?.['action']) {
    case 'accept': return jsonObject(parsed)?.['remember'] === true ? 'Accepted for this conversation' : 'Accepted'
    case 'decline': return 'Declined'
    default: return 'Cancelled'
  }
}

export function elicitationUrl(url: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(url).protocol) } catch { return false }
}
