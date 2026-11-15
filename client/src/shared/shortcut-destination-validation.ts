import type { ChannelJson } from './channels'
import type { Shortcut } from './api'

export function shortcutDestinationError(destination: ChannelJson | Shortcut['destination']): string | undefined {
  if (destination === undefined) return undefined
  const invalid = 'Choose a valid result channel and destination.'
  if (destination === null || typeof destination !== 'object' || Array.isArray(destination)) return invalid
  const fields = destination as Partial<NonNullable<Shortcut['destination']>>
  if (Object.keys(fields).some((key) => !['channel', 'destination', 'label'].includes(key)) || typeof fields.channel !== 'string' || !/^channel:[a-z0-9][a-z0-9-]*$/.test(fields.channel) || typeof fields.destination !== 'string' || fields.destination.trim() === '' || fields.destination.length > 300 || fields.label !== undefined && (typeof fields.label !== 'string' || fields.label.length > 300)) return invalid
  return undefined
}
