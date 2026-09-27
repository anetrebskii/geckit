import { useState } from 'react'

import type { ChatSession, ShortcutDraft } from '../../../shared/api'
import { phoneCalls } from '../phone-calls'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { PhoneBoard } from './PhoneBoard'
import { PhoneQuestions } from './PhoneQuestions'
import { PhoneSay } from './PhoneSay'
import { PhoneSearch } from './PhoneSearch'
import { PhoneSettings } from './PhoneSettings'
import { PhoneShortcuts, ShortcutSheet } from './PhoneShortcuts'
import type { Seek } from './Switcher'
import type { Chat } from './useChat'
import './phone-home.css'

/**
 * The phone's top level: the board and what the Mac's board head holds, each
 * a tab, as an iPhone app keeps its places. The conversation comes up over all
 * of it. See docs/ux/phone-parity.md.
 */

type Tab = 'tasks' | 'questions' | 'search' | 'settings'

const TABS: readonly { readonly tab: Tab; readonly label: string; readonly icon: string }[] = [
  { tab: 'tasks', label: 'Tasks', icon: 'board' },
  { tab: 'questions', label: 'Questions', icon: 'chat' },
  { tab: 'search', label: 'Search', icon: 'search' },
  { tab: 'settings', label: 'Settings', icon: 'settings' },
]

export function PhoneHome({
  chat,
  onNew,
  onAsk,
  onScreen,
  onSeek,
}: {
  readonly chat: Chat
  readonly onNew: (how?: 'record') => void
  readonly onAsk: () => void
  readonly onScreen: () => void
  readonly onSeek: (seek: Seek) => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(() => {
    const kept = localStorage.getItem('phoneTab')
    return TABS.some((one) => one.tab === kept) ? (kept as Tab) : 'tasks'
  })
  const [saying, setSaying] = useState(false)
  // Shortcuts opened over the board, from its bolt or from All shortcuts on the New task sheet.
  const [shortcuts, setShortcuts] = useState(false)
  const [editing, setEditing] = useState<{ readonly draft: ShortcutDraft; readonly at: number } | undefined>()

  const choose = (next: Tab): void => {
    tap('light')
    if (next === tab) setShortcuts(false)
    setTab(next)
    localStorage.setItem('phoneTab', next)
  }
  const edit = (draft: ShortcutDraft): void => setEditing({ draft, at: Date.now() })

  // A shortcut made from a conversation starts with what was asked in it first, as the Mac's menu makes one.
  const shortcutFrom = (session: ChatSession): void =>
    void (phoneCalls()?.firstAsked(session.id) ?? Promise.resolve('')).catch(() => '').then((prompt) => {
      edit({
        name: session.title,
        root: session.root,
        prompt,
        mode: session.mode,
        ...(session.chosen === undefined || session.chosen === '' ? {} : { model: session.chosen }),
        on: true,
      })
    })

  // A question waiting on an answer is amber, as on Tasks; one with an answer not read yet is the accent.
  const questionBadge = chat.questions.some((one) => one.state === 'asks') ? 'asks' : chat.questions.some((one) => one.state === 'unread') ? 'unread' : undefined

  return (
    <div className="phone-home">
      <div className="phone-tab" hidden={tab !== 'tasks' || shortcuts}>
        <PhoneBoard
          chat={chat}
          onNew={onNew}
          onScreen={onScreen}
          onSay={() => setSaying(true)}
          onShortcut={shortcutFrom}
          onShortcuts={() => setShortcuts(true)}
        />
      </div>
      {tab === 'tasks' && shortcuts ? (
        <div className="phone-tab">
          <PhoneShortcuts chat={chat} back="Tasks" onBack={() => setShortcuts(false)} onEdit={edit} />
        </div>
      ) : null}
      <div className="phone-tab" hidden={tab !== 'questions'}>
        <PhoneQuestions chat={chat} onAsk={onAsk} />
      </div>
      <div className="phone-tab" hidden={tab !== 'search'}>
        <PhoneSearch chat={chat} shown={tab === 'search' && chat.shown.kind !== 'session'} onSeek={onSeek} />
      </div>
      <div className="phone-tab" hidden={tab !== 'settings'}>
        <PhoneSettings chat={chat} onEdit={edit} />
      </div>
      <nav className="phone-tabs" role="tablist">
        {TABS.map((one) => (
          <button
            key={one.tab}
            type="button"
            role="tab"
            aria-selected={tab === one.tab}
            className={tab === one.tab ? 'on' : ''}
            onClick={() => choose(one.tab)}
          >
            <Icon name={one.icon} size={24} />
            <span>{one.label}</span>
            {one.tab === 'tasks' && tab !== 'tasks' && chat.sessions.some((session) => session.state === 'asks') ? <i className="phone-tab-badge" /> : null}
            {one.tab === 'questions' && tab !== 'questions' && questionBadge !== undefined ? <i className={`phone-tab-badge ${questionBadge}`} /> : null}
          </button>
        ))}
      </nav>
      {saying ? <PhoneSay chat={chat} onClose={() => setSaying(false)} /> : null}
      {editing === undefined ? null : <ShortcutSheet key={editing.at} chat={chat} given={editing.draft} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
