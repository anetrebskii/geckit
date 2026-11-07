import { AsyncLocalStorage } from 'node:async_hooks'
import type { SessionProvider, Settings } from '../shared/api'

const starting = new Set<{ readonly provider: SessionProvider }>()
const owner = new AsyncLocalStorage<symbol>()
let held: { readonly provider: SessionProvider | undefined; readonly token: symbol } | undefined

export async function providerChange<T>(provider: SessionProvider | undefined, action: () => Promise<T>): Promise<T> {
  if ([...starting].some((one) => provider === undefined || one.provider === provider)) throw new Error('A provider runtime is being prepared. Wait for it to finish before changing its library.')
  if (held !== undefined) throw new Error('A provider library is changing. Wait for it to finish and read state again.')
  const token = Symbol(provider)
  held = { provider, token }
  try { return await owner.run(token, action) }
  finally { if (held?.token === token) held = undefined }
}

export function assertProviderAvailable(provider: SessionProvider): void {
  if (held !== undefined && (held.provider === undefined || held.provider === provider) && owner.getStore() !== held.token) throw new Error('This provider library is changing. No new runtime was started.')
}

export function assertProviderSettingsWritable(change: Partial<Settings>): void {
  if (held === undefined || owner.getStore() === held.token) return
  if (['chatProviders', 'providerPlugins', 'chatProvider', 'correctProvider', 'projectAssistants', 'shortcuts'].some((key) => Object.hasOwn(change, key))) throw new Error('A provider library is changing. Read provider state after it finishes before changing dependencies.')
}

export async function prepareProvider<T>(provider: SessionProvider, action: () => Promise<T>): Promise<T> {
  assertProviderAvailable(provider)
  const pending = { provider }
  starting.add(pending)
  try { return await action() }
  finally { starting.delete(pending) }
}

export function providerPreparing(provider: SessionProvider): boolean {
  return [...starting].some((one) => one.provider === provider)
}
