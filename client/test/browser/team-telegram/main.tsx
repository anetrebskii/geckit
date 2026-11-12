import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ManagerTelegram } from '../../../src/renderer/src/chat/ManagerTelegram'
import type { TelegramAction, TelegramView } from '../../../src/shared/telegram'
import '../../../src/renderer/src/styles.css'

const params = new URLSearchParams(location.search)
document.documentElement.dataset['theme'] = params.get('theme') ?? 'light'
const bot = { id: 1, username: 'example_team_bot' }
const account = { id: 81, chatId: -10081, name: 'Example owner', team: { topicId: 42, title: 'Example team with a long name for a narrow window', generation: 'example', approvers: [81], allMembers: false } }
const initial: TelegramView = params.get('state') === 'confirming' ? { state: 'confirming', bot, pairing: { url: 'https://t.me/example_team_bot', command: '/geckit_connect@example_team_bot example-code', expiresAt: 1893456000000 }, candidate: account, pendingLate: 0 } : { state: 'disconnected', pendingLate: 0 }
function Fixture(): React.JSX.Element {
  const [view, setView] = useState<TelegramView>(initial)
  const action = async (next: TelegramAction): Promise<TelegramView> => {
    const updated: TelegramView = next.kind === 'connect' ? { state: 'pairing', bot, pairing: { url: 'https://t.me/example_team_bot', ...(next.mode === 'team' ? { command: '/geckit_connect@example_team_bot example-code' } : {}), expiresAt: 1893456000000 }, pendingLate: 0 } : next.kind === 'confirm' ? { state: 'connected', bot, account, pendingLate: 0 } : { state: 'disconnected', pendingLate: 0 }
    setView(updated)
    return updated
  }
  Object.assign(window, { geckit: { telegram: { action }, chat: { openLink: () => undefined } } })
  return <main style={{ maxWidth: 640, padding: 20, margin: 'auto', overflowWrap: 'anywhere' }}><ManagerTelegram view={view} onView={setView} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
