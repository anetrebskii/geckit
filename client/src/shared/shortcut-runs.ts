import type { ChatSession, Shortcut } from './api'
import type { ShortcutDestinationReceipt } from './shortcut-destinations'

export interface ShortcutRun {
  readonly id: string
  readonly shortcut: Shortcut & Required<Pick<Shortcut, 'destination'>>
  readonly admitted: number
  readonly managerThread: string
  readonly session?: ChatSession['id']
  readonly state: 'running' | 'completed' | 'failed'
  readonly delivery: 'waiting' | 'sending' | 'sent' | 'failed' | 'uncertain'
  readonly result?: string
  readonly error?: string
  readonly completed?: number
  readonly receipt?: ShortcutDestinationReceipt
}
