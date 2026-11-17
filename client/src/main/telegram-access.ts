import type { TelegramView } from '../shared/telegram'

export function phoneTelegramView(view: TelegramView): TelegramView {
  const { pairing: _pairing, candidate: _candidate, links: _links, ...safe } = view
  return safe
}
