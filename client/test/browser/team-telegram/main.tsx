import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ManagerTelegram } from '../../../src/renderer/src/chat/ManagerTelegram'
import type { TelegramAction, TelegramView } from '../../../src/shared/telegram'
import '../../../src/renderer/src/styles.css'

const params = new URLSearchParams(location.search)
document.documentElement.dataset['theme'] = params.get('theme') ?? 'light'
const bot = { id: 1, username: 'example_team_bot' }
const account = { id: 81, chatId: -10081, name: 'Example owner', team: { topicId: 42, title: 'Example team with a long name for a narrow window', generation: 'example', approvers: [81], allMembers: false } }
const people = Array.from({ length: params.get('long') === '1' ? 1024 : 2 }, (_, index) => ({ id: `member-${index}`, account: { id: 82 + index, chatId: 82 + index, name: `Participant ${index} with a long name` }, approve: index === 0, active: index < 32, projects: ['E:/example/project'], pending: index === 0 ? 2 : 0, uncertain: index === 1 ? 1 : 0 }))
const initial: TelegramView = params.get('state') === 'members' ? { state: 'connected', bot, account, pendingLate: 0, members: { enabled: true, projects: ['E:/example/project'], people, invites: [] } } : params.get('state') === 'confirming' ? { state: 'confirming', bot, pairing: { url: 'https://t.me/example_team_bot', command: '/geckit_connect@example_team_bot example-code', expiresAt: 1893456000000 }, candidate: account, pendingLate: 0 } : { state: 'disconnected', pendingLate: 0 }
function Fixture(): React.JSX.Element {
  const [view, setView] = useState<TelegramView>(initial)
  const action = async (next: TelegramAction): Promise<TelegramView> => {
    let updated: TelegramView
    const members = view.members
    if (next.kind === 'members-configure') updated = { ...view, members: { enabled: next.enabled, projects: next.projects, people: members?.people ?? [], invites: [] } }
    else if (next.kind === 'members-invite' && members !== undefined) updated = { ...view, members: { ...members, invites: [...members.invites, { id: 'fixture-invite', url: 'https://t.me/example_team_bot?start=fixture-code', expiresAt: 1893456000000, candidate: { id: 9000, chatId: 9000, name: 'Invited participant', username: 'invited' } }] } }
    else if (next.kind === 'members-confirm' && members !== undefined) updated = { ...view, members: { ...members, invites: [], people: [...members.people, { id: 'fixture-admitted', account: { id: next.userId, chatId: next.userId, name: 'Invited participant' }, active: true, approve: next.approve, projects: next.projects ?? members.projects }] } }
    else if (next.kind === 'members-cancel' && members !== undefined) updated = { ...view, members: { ...members, invites: members.invites.filter((one) => one.id !== next.id) } }
    else if (next.kind === 'members-revoke' && members !== undefined) updated = { ...view, members: { ...members, people: members.people.map((one) => one.id === next.id ? { ...one, active: false, detail: 'Access blocked. Worker stop requested.' } : one) } }
    else updated = next.kind === 'connect' ? { state: 'pairing', bot, pairing: { url: 'https://t.me/example_team_bot', ...(next.mode === 'team' ? { command: '/geckit_connect@example_team_bot example-code' } : {}), expiresAt: 1893456000000 }, pendingLate: 0 } : next.kind === 'confirm' ? { state: 'connected', bot, account, pendingLate: 0 } : { state: 'disconnected', pendingLate: 0 }
    setView(updated)
    return updated
  }
  Object.assign(window, { geckit: { telegram: { action }, chat: { openLink: () => undefined } } })
  return <main style={{ maxWidth: 640, padding: 20, margin: 'auto', overflowWrap: 'anywhere' }}><ManagerTelegram view={view} onView={setView} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
