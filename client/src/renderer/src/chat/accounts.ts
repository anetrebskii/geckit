import type { ClaudeAccount, SessionProvider } from '../../../shared/api'

const requests = new Map<SessionProvider, Promise<ClaudeAccount | undefined>>()

export function readAccount(provider: SessionProvider): Promise<ClaudeAccount | undefined> {
  const held = requests.get(provider)
  if (held !== undefined) return held
  const result = window.geckit.chat.account(provider)
  requests.set(provider, result)
  const clear = (): void => { if (requests.get(provider) === result) requests.delete(provider) }
  void result.then(clear, clear)
  return result
}
