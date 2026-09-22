import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DEFAULT_SETTINGS, resumeCommand } from '../../../shared/api'
import type { ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'
import { SettingsDialog } from '../ui/SettingsDialog'
import { MOD, ShortcutsDialog } from '../ui/Shortcuts'
import { Composer } from './Composer'
import { NameField } from './NameField'
import { homePath, projectName } from './project'
import { Sidebar } from './Sidebar'
import { Status } from './Status'
import { Notices } from './Notices'
import { Recent } from './Recent'
import { Switcher } from './Switcher'
import type { Seek } from './Switcher'
import { Files } from './Prose'
import type { FileHow } from './Prose'
import { Transcript } from './Transcript'
import { UpdateNotice } from '../ui/UpdateNotice'
import { useChat } from './useChat'

interface Recently {
  readonly list: readonly ChatSession[]
  readonly at: number
}

/** A sidebar as wide as the pointer says, leaving the conversation room to be read. */
const sidebarAt = (x: number): number => Math.round(Math.min(Math.max(x, 220), window.innerWidth - 420))

/**
 * Claude Code, in a window.
 *
 * The projects and their conversations on the left, one conversation on the
 * right. Everything it runs is the person's own `claude`, on their own plan,
 * in the folder they chose.
 */
export function Chat(): React.JSX.Element {
  const chat = useChat()
  const [over, setOver] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [setting, setSetting] = useState(false)
  const [keys, setKeys] = useState(false)
  // Held alone for a moment, the command key shows which number opens which conversation.
  const [holding, setHolding] = useState(false)
  // The conversations in the order the sidebar draws them, which is what Cmd+1 and Ctrl+Tab go by.
  const order = useRef<readonly ChatSession[]>([])
  const [seek, setSeek] = useState<Seek | undefined>()
  // Ctrl+Tab while Ctrl is held: the conversations opened last, and the one it is on.
  const [recent, setRecent] = useState<Recently | undefined>()
  // Read on the key going up, which can come before the list is drawn when Ctrl+Tab is tapped quickly.
  const recentRef = useRef<Recently | undefined>(undefined)
  // The sidebar's width while its edge is dragged, and how far from the edge it was taken.
  const [sizing, setSizing] = useState<number | undefined>()
  // The conversation whose name is being typed over in the header.
  const [naming, setNaming] = useState<string | undefined>()
  const grab = useRef(0)
  const { addFiles, send, root } = chat

  // The transcript is drawn again whenever one of these is, so they are made
  // once rather than on every keystroke in the field below it.
  const again = useCallback((id: string) => send(id), [send])
  // The dialog listens for Escape with this, so it is made once.
  const closeSettings = useCallback(() => setSetting(false), [])
  const closeKeys = useCallback(() => setKeys(false), [])
  const openKeys = useCallback(() => {
    setSetting(false)
    setKeys(true)
  }, [])
  const file = useCallback(
    (path: string, how: FileHow) => {
      if (root === undefined) return
      if (how === 'reveal') window.geckit.chat.reveal(root, path)
      else if (how === 'menu') window.geckit.chat.fileMenu(root, path)
      else window.geckit.chat.openFile(root, path)
    },
    [root],
  )
  const files = useMemo(() => (root === undefined ? undefined : { root, onFile: file }), [root, file])

  useEffect(() => {
    const modifier = MOD === 'Cmd' ? 'Meta' : 'Control'
    let timer: number | undefined
    const letGo = (): void => {
      window.clearTimeout(timer)
      setHolding(false)
    }
    const down = (event: KeyboardEvent): void => {
      if (event.key !== modifier) letGo()
      else if (!event.repeat) timer = window.setTimeout(() => setHolding(true), 400)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', letGo)
    window.addEventListener('blur', letGo)
    return () => {
      letGo()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', letGo)
      window.removeEventListener('blur', letGo)
    }
  }, [])

  useEffect(() => window.geckit.chat.onSpotlight((again) => setSwitching((up) => !(again && up))), [])
  // After every listener here and in useChat, which effects are set up in the order they are written.
  useEffect(() => window.geckit.chat.listening(), [])

  useEffect(() => {
    // The next conversation in the list, wrapping round, so holding the keys walks it.
    const step = (by: number): void => {
      const list = order.current
      if (list.length === 0) return
      const shown = chat.shown
      const now = shown.kind === 'session' ? list.findIndex((one) => one.id === shown.id) : -1
      const next = list[now < 0 ? (by > 0 ? 0 : list.length - 1) : (now + by + list.length) % list.length]
      if (next !== undefined) chat.show(next)
    }

    // This one first, then the rest by when each was last open here.
    const opened = (): ChatSession[] => {
      const shown = chat.shown.kind === 'session' ? chat.shown.id : undefined
      const rank = (one: ChatSession): number => (one.id === shown ? Infinity : (one.seen ?? 0))
      return chat.everyone
        .filter((one) => one.seen !== undefined || one.id === shown)
        .sort((one, other) => rank(other) - rank(one))
        .slice(0, 12)
    }

    const toRecent = (next: Recently | undefined): void => {
      recentRef.current = next
      setRecent(next)
    }

    const key = (event: KeyboardEvent): void => {
      if (switching || setting || keys) return
      const now = recentRef.current
      if (now !== undefined && event.key === 'Escape') {
        event.preventDefault()
        toRecent(undefined)
        return
      }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        const by = event.shiftKey ? -1 : 1
        if (now !== undefined) {
          toRecent({ ...now, at: (now.at + by + now.list.length) % now.list.length })
          return
        }
        const list = opened()
        const from = chat.shown.kind === 'session' && list[0]?.id === chat.shown.id ? 1 : 0
        if (list.length > from) toRecent({ list, at: by > 0 ? from : list.length - 1 })
        return
      }
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key === ',') {
        event.preventDefault()
        setSetting(true)
        return
      }
      if (meta && event.key === '/') {
        event.preventDefault()
        setKeys(true)
        return
      }
      if (meta && event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        step(event.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (meta && !event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault()
        const wanted = order.current[Number(event.key) - 1]
        if (wanted !== undefined) chat.show(wanted)
        return
      }
      if (meta && event.key === 'p') {
        event.preventDefault()
        setSwitching(true)
      }
      if (meta && event.key === 'n') {
        event.preventDefault()
        chat.startNew()
      }
      if (meta && event.key === 'k') {
        event.preventDefault()
        // The button is the control; pressing it is what opens the menu in its place.
        document.querySelector<HTMLButtonElement>('.project')?.click()
      }
      if (event.key === 'F2' && chat.session !== undefined) {
        event.preventDefault()
        setNaming(chat.session.id)
      }
      if (meta && event.key === 'r') {
        event.preventDefault()
        chat.refresh()
      }
      if (event.key === 'Escape' && chat.working) {
        event.preventDefault()
        chat.stop()
      }
    }
    // Letting go of Ctrl is what opens it, as in VS Code.
    const up = (event: KeyboardEvent): void => {
      const now = recentRef.current
      if (now === undefined || event.key !== 'Control') return
      toRecent(undefined)
      const chosen = now.list[now.at]
      if (chosen !== undefined) chat.goTo(chosen.id)
    }
    const away = (): void => toRecent(undefined)

    window.addEventListener('keydown', key)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', away)
    }
  }, [chat, switching, setting, keys])

  const title = chat.session?.title ?? 'New conversation'

  return (
    <div
      className={`chat${over ? ' dropping' : ''}${holding ? ' holding' : ''}${sizing === undefined ? '' : ' sizing'}`}
      style={{ '--side': `${String(sizing ?? chat.settings.sidebarWidth)}px` } as React.CSSProperties}
      // The whole window takes a drop. Anywhere else on the page, a dropped
      // file is a page the window would go to instead.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setOver(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setOver(false)
        addFiles([...event.dataTransfer.files])
      }}
    >
      <Sidebar
        chat={chat}
        orderRef={order}
        onSettings={() => setSetting(true)}
        onSearch={() => setSwitching(true)}
        onKeys={openKeys}
      />
      <div
        className="side-grip"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const edge = event.currentTarget.getBoundingClientRect()
          grab.current = event.clientX - Math.round(edge.left + edge.width / 2)
          setSizing(sidebarAt(event.clientX - grab.current))
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setSizing(sidebarAt(event.clientX - grab.current))
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          chat.change({ sidebarWidth: sidebarAt(event.clientX - grab.current) })
          setSizing(undefined)
        }}
        onLostPointerCapture={() => setSizing(undefined)}
        onDoubleClick={() => chat.change({ sidebarWidth: DEFAULT_SETTINGS.sidebarWidth })}
      />

      <div className="talk">
        <div className="talk-head drag">
          {chat.session === undefined ? (
            <span className="title">{title}</span>
          ) : naming === chat.session.id ? (
            <NameField
              key={chat.session.id}
              name={chat.session.title}
              className="title-field no-drag"
              onDone={(name) => {
                if (name !== undefined && chat.session !== undefined) chat.rename(chat.session.id, name)
                setNaming(undefined)
              }}
            />
          ) : (
            <button
              type="button"
              className="title no-drag"
              title="Rename (F2)"
              onClick={() => setNaming(chat.session?.id)}
            >
              {title}
            </button>
          )}
          {chat.session !== undefined ? (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{projectName(chat.session.root)}</span>
          ) : chat.root === undefined ? null : (
            <Picker
              label={`in ${projectName(chat.root)}`}
              choices={chat.settings.projects.map((one) => ({ value: one, label: projectName(one), says: homePath(one) }))}
              chosen={chat.root}
              title="Start it in"
              tip={homePath(chat.root)}
              className="picker head-project no-drag"
              onPick={chat.setRoot}
            />
          )}
          {chat.session?.model === undefined ? null : (
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{chat.session.model}</span>
          )}
          <div className="spacer" />
          {chat.session === undefined ? null : (
            <>
              <button
                type="button"
                className="icon-button no-drag"
                title={`Continue in a terminal: ${resumeCommand(chat.session.id)}`}
                aria-label="Continue in a terminal"
                onClick={() => chat.session !== undefined && chat.terminal(chat.session.id)}
              >
                <Icon name="terminal" />
              </button>
              <button
                type="button"
                className="icon-button no-drag"
                title={`Refresh (${MOD}+R)`}
                aria-label="Refresh"
                onClick={chat.refresh}
              >
                <Icon name="refresh" />
              </button>
            </>
          )}
        </div>

        {chat.shown.kind === 'new' && chat.items.length === 0 ? (
          <div className="transcript">
            <div className="turn" style={{ paddingTop: 40, color: 'var(--text-dim)' }}>
              {chat.root === undefined
                ? 'Choose a project folder on the left. Everything asked here runs in that folder.'
                : chat.account?.here !== true
                  ? 'Claude Code is not on this machine. Install it, then reopen this window.'
                  : chat.account.signedIn === false
                    ? 'Nobody is signed in. Run claude auth login in a terminal, then reopen this window.'
                    : chat.account.key === true
                      ? 'That claude is signed in with an API key. GeckIt only runs sessions on a plan, so nothing would be started here.'
                      : `Ask anything about ${projectName(chat.root)}. What it may do without asking is under the field.`}
            </div>
          </div>
        ) : (
          <Files value={files}>
            <Transcript
              at={chat.shown.kind === 'session' ? chat.shown.id : 'new'}
              items={chat.items}
              working={chat.working}
              onAnswer={chat.answer}
              onAgain={again}
              onFile={file}
              seek={seek}
            />
          </Files>
        )}

        <Composer chat={chat} />
      </div>

      <Status chat={chat} />

      <Notices chat={chat} />
      <UpdateNotice />
      {recent === undefined ? null : <Recent list={recent.list} at={recent.at} />}
      {switching ? <Switcher chat={chat} onClose={() => setSwitching(false)} onSeek={setSeek} /> : null}
      {setting ? (
        <SettingsDialog settings={chat.settings} change={chat.change} onClose={closeSettings} onShortcuts={openKeys} />
      ) : null}
      {keys ? <ShortcutsDialog onClose={closeKeys} /> : null}
    </div>
  )
}
