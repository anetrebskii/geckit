import '../../client/src/renderer/src/styles.css'
import { installGeckit } from '../../client/src/renderer/src/phone'
import type { Link } from '../../client/src/renderer/src/link'

/**
 * The phone's own renderer with the Mac's data served over a link that does not
 * go over a network. For filming the phone's screens where WebRTC cannot
 * gather a single candidate: the renderer is the phone's real one, the data is
 * the Mac's real session list.
 */

// What this phone answers for itself, so it does not ask about the errors or
// the counting.
localStorage.setItem('own', JSON.stringify({ analytics: false, analyticsAsked: true, sendErrors: false, client: '' }))
localStorage.removeItem('errors')

// Written by real-list.ts and kept out of git, since it is the Mac's real conversations; without it the stub serves an empty list.
const data = (Object.values(import.meta.glob('./stub-data.json', { eager: true, import: 'default' }))[0] ?? { sessions: [] }) as Record<string, unknown>

const answers: Record<string, unknown> = {  'chat.list': data.sessions,
  'chat.plan': data.plan,
  'settings.get': data.settings,
  'lineup.state': data.lineup,
  'mac.version': '1.114',
  'chat.folders': data.folders,
  'chat.plans': [],
  'accounts.list': [],
  'orders.read': [],
  'chat.hidden': [],
  'chat.questions': [],
  'hosts.list': [],
  'hosts.prompts': [],
  'chat.projects': [],
  'chat.recent': [],
  'chat.favorites': [],
  'profile.list': [],
  'guides': {},
  'analytics.count': undefined,
  'manager.view': undefined,
  'order.read': undefined,
  'host.prompts': [],
}

const heard = new Set<(message: { t: 'tell'; channel: string; value: unknown } | { t: 'reply'; id: number; value: unknown }) => void>()

const link: Link = {
  send: (message) => {
    if (message.t !== 'call') return
    let value = answers[message.name] ?? (message.name.endsWith('list') ? [] : undefined)
    if (message.name === 'chat.turns' || message.name === 'chat.turnsBefore') {
      const turns = (data.turns ?? {}) as Record<string, unknown>
      value = turns[String(message.args[0])] ?? { items: [], left: 0 }
    }
    window.setTimeout(() => {
      for (const one of heard) one({ t: 'reply', id: message.id, value })
    }, 10)
  },
  onMessage: (listener) => {
    const one = listener as (message: { t: 'tell'; channel: string; value: unknown } | { t: 'reply'; id: number; value: unknown }) => void
    heard.add(one)
    // What the Mac pushes on a fresh link.
    window.setTimeout(() => {
      one({ t: 'tell', channel: 'chat:sessions', value: data.sessions })
      one({ t: 'tell', channel: 'settings:changed', value: data.settings })
      one({ t: 'tell', channel: 'chat:plan', value: data.plan })
      one({ t: 'tell', channel: 'lineup:changed', value: data.lineup })
    }, 60)
  },
  onClose: () => {},
  close: () => {},
  screen: () => undefined,
  share: async () => {},
  compress: () => {},
}

installGeckit(link, { home: '/Users/alex', platform: 'darwin', name: 'MacBook Pro' }, 'MacBook Pro')

await import('../../client/src/renderer/src/chat/main')
