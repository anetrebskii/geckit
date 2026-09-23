import { useEffect, useState } from 'react'

import { ANYWHERE } from '../../../shared/api'
import { useSettings } from '../settings'
import { Icon } from '../ui/Icon'
import { SettingsDialog } from '../ui/SettingsDialog'
import { MOD, said, ShortcutsDialog } from '../ui/Shortcuts'
import { Correct } from './Correct'
import { Transcribe } from './Transcribe'
import { UpdateNotice } from '../ui/UpdateNotice'

type Tab = 'correct' | 'transcribe'

/**
 * The small window: correcting and dictating, one press from anywhere.
 *
 * Chat is not a tab here. It is a window of its own, because a conversation
 * with Claude Code needs the room and this one is meant to stay small.
 */
export function Panel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('correct')
  const [settings, change] = useSettings()
  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState(false)

  // Whatever the shortcut picked up belongs in Correct, so that is the tab.
  useEffect(() => window.geckit.panel.onText(() => setTab('correct')), [])

  // The microphone list is kept so the dictation capsule can name them before
  // it has opened one of its own.
  useEffect(() => {
    const refresh = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) =>
          change({
            audioDevices: devices
              .filter((one) => one.kind === 'audioinput')
              .map((one) => ({ deviceId: one.deviceId, label: one.label })),
          }),
        )
        .catch(() => undefined)
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
    // Run once: `change` is stable and re-running would loop on its own write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && (event.key === ',' || event.key === '/')) {
        event.preventDefault()
        setKeys(event.key === '/')
        setOpen(event.key === ',')
        return
      }
      if (!event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key === '1') {
        event.preventDefault()
        setTab('correct')
      } else if (event.key === '2') {
        event.preventDefault()
        setTab('transcribe')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return (
    <div className="panel">
      <div className="topbar drag">
        <button
          type="button"
          className={`tab no-drag${tab === 'correct' ? ' on' : ''}`}
          onClick={() => setTab('correct')}
          title="Ctrl+1"
        >
          <Icon name="spellcheck" />
          Correct
        </button>
        <button
          type="button"
          className={`tab no-drag${tab === 'transcribe' ? ' on' : ''}`}
          onClick={() => setTab('transcribe')}
          title="Ctrl+2"
        >
          <Icon name="mic" />
          Transcribe
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="tab no-drag"
          onClick={() => window.geckit.voice.orders()}
          title={`Say what GeckIt should do: start a conversation, answer one, mark one (${said(ANYWHERE.orders)})`}
        >
          <Icon name="mic" />
          Say
        </button>
        <button
          type="button"
          className="tab no-drag"
          onClick={() => window.geckit.chat.open()}
          title="Claude Code, in its own window"
        >
          <Icon name="chat" />
          Chat
        </button>
        <button
          type="button"
          className="icon-button no-drag"
          onClick={() => setKeys(true)}
          aria-label="Keyboard shortcuts"
          title={`Keyboard shortcuts (${MOD}+/)`}
        >
          <Icon name="keyboard" size={15} />
        </button>
        <button
          type="button"
          className="icon-button no-drag"
          onClick={() => setOpen(true)}
          aria-label="Settings"
          title={`Settings (${MOD}+,)`}
        >
          <Icon name="settings" size={15} />
        </button>
      </div>

      <div className="panel-body">
        {tab === 'correct' ? (
          <Correct settings={settings} change={change} />
        ) : (
          <Transcribe settings={settings} change={change} />
        )}
      </div>

      {open ? (
        <SettingsDialog
          settings={settings}
          change={change}
          onClose={() => setOpen(false)}
          onShortcuts={() => {
            setOpen(false)
            setKeys(true)
          }}
        />
      ) : null}
      {keys ? <ShortcutsDialog onClose={() => setKeys(false)} /> : null}
      <UpdateNotice />
    </div>
  )
}
