import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DEFAULT_SETTINGS, homeOf, resumeCommand, SESSION_STATUSES, shownProjects } from '../../../shared/api'
import type { ChatSession, CutOff, SessionItem, SessionStatus, ShortcutDraft } from '../../../shared/api'
import { linksIn, shortUrl } from '../../../shared/links'
import { Icon } from '../ui/Icon'
import { Menu, Picker } from '../ui/Menu'
import { SettingsDialog } from '../ui/SettingsDialog'
import { MOD, ShortcutsDialog } from '../ui/Shortcuts'
import { Board, keptTask, NewTask, TopBar } from './Board'
import { CutOffDialog } from './CutOff'
import { PhoneHome } from './PhoneHome'
import { EdgeBack } from './PhoneKit'
import { EdgeInfo, PhoneNav } from './PhoneNav'
import { Screen } from './Screen'
import { FileView } from './FileView'
import { Composer } from './Composer'
import { NameField } from './NameField'
import { projectColor } from '../../../shared/project-color'
import { hostOf, isRemote } from '../../../shared/hosts'
import { HostChip, HostPromptCard, HostTroubleCard } from './HostParts'
import { PhoneHostSheet } from './PhoneHostSheet'
import { Back, RequestChat, StartedMenu } from './Request'
import { startedCount } from './started'
import { computerName, needsComputer } from './PhoneHosts'
import { homePath, projectLabel, projectName, tint } from './project'
import { Sidebar, Tags } from './Sidebar'
import { Status, TalkStatus } from './Status'
import { Notices } from './Notices'
import { Recent } from './Recent'
import { ShortcutList } from './ShortcutList'
import { Switcher } from './Switcher'
import type { Seek } from './Switcher'
import { Files } from './Prose'
import type { FileHow } from './Prose'
import { Transcript } from './Transcript'
import { Welcome } from './Welcome'
import { ON_PHONE } from '../on-phone'
import { Consent } from '../ui/Consent'
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
  // The shortcuts dialog and what it opened on; `at` makes a second ask from the tray open it afresh.
  const [managing, setManaging] = useState<{ readonly edit: string | ShortcutDraft; readonly at: number } | undefined>()
  // Held alone for a moment, the command key shows which number opens which conversation.
  const [holding, setHolding] = useState(false)
  // The conversations in the order the sidebar draws them, which is what Cmd+1 and Ctrl+Tab go by.
  const order = useRef<readonly ChatSession[]>([])
  const [seek, setSeek] = useState<Seek | undefined>()
  // Finding in the conversation shown, asked for at a moment; another conversation opened puts the field away.
  const [finding, setFinding] = useState<{ readonly id: string; readonly at: number } | undefined>()
  const find = (): void => {
    if (chat.shown.kind === 'session') setFinding({ id: chat.shown.id, at: Date.now() })
  }
  // Ctrl+Tab while Ctrl is held: the conversations opened last, and the one it is on.
  const [recent, setRecent] = useState<Recently | undefined>()
  // Read on the key going up, which can come before the list is drawn when Ctrl+Tab is tapped quickly.
  const recentRef = useRef<Recently | undefined>(undefined)
  // The sidebar's width while its edge is dragged, and how far from the edge it was taken.
  const [sizing, setSizing] = useState<number | undefined>()
  // The conversation whose name is being typed over in the header.
  const [naming, setNaming] = useState<string | undefined>()
  // Asking whether to leave this conversation for a new one about something else.
  const [clearing, setClearing] = useState(false)
  // The Remote Control menu, the conversation it is being switched for, and why the tool would not.
  const [remoting, setRemoting] = useState<DOMRect | undefined>()
  const [remoteBusy, setRemoteBusy] = useState<string | undefined>()
  const [remoteTrouble, setRemoteTrouble] = useState<string | undefined>()
  // The conversation whose terminal command was just copied, for the check that says so.
  const [copied, setCopied] = useState<string | undefined>()
  // The board's New task form is open.
  const [making, setMaking] = useState(() => keptTask(false) !== undefined)
  const [infoing, setInfoing] = useState(false)
  const [kids, setKids] = useState<DOMRect | undefined>()
  const [pulled, setPulled] = useState<number>()
  // On the phone, New task opened to be filled from a recording.
  const [recordFirst, setRecordFirst] = useState(false)
  const [asking, setAsking] = useState(() => keptTask(true) !== undefined)
  const [cut, setCut] = useState<readonly CutOff[] | undefined>()
  useEffect(() => {
    if (ON_PHONE) return
    void window.geckit.chat.cutOff().then((list) => {
      if (list.length > 0) setCut(list)
    })
  }, [])
  // The Mac's own screen, shown on the phone.
  const [screening, setScreening] = useState(false)
  const grab = useRef(0)
  const { addFiles, send, root } = chat
  // The host the open conversation, or the one about to start, runs on.
  const host = root === undefined ? undefined : chat.hosts.find((one) => one.id === hostOf(root))

  // The transcript is drawn again whenever one of these is, so they are made
  // once rather than on every keystroke in the field below it.
  const again = useCallback((id: string) => send(id), [send])
  const proceed = useCallback(() => send(undefined, 'continue'), [send])
  // The dialog listens for Escape with this, so it is made once.
  const closeSettings = useCallback(() => setSetting(false), [])
  const closeKeys = useCallback(() => setKeys(false), [])
  const closeShortcuts = useCallback(() => setManaging(undefined), [])
  const shortcutFrom = useCallback(
    (session: ChatSession) => {
      const said = (items: readonly SessionItem[]): void => {
        const first = items.find((item) => item.kind === 'mine')
        setManaging({
          edit: {
            name: session.title,
            root: session.root,
            prompt: first?.kind === 'mine' ? first.text : '',
            mode: session.mode,
            ...(session.chosen === undefined || session.chosen === '' ? {} : { model: session.chosen }),
            on: true,
          },
          at: Date.now(),
        })
      }
      if (chat.shown.kind === 'session' && chat.shown.id === session.id) said(chat.items)
      else void window.geckit.chat.items(session.id).then(said)
    },
    [chat.shown, chat.items],
  )
  const openKeys = useCallback(() => {
    setSetting(false)
    setKeys(true)
  }, [])
  // A file pressed on the phone, shown here since the phone has nothing to open it in.
  const [viewing, setViewing] = useState<{ readonly root: string; readonly path: string } | undefined>()
  const file = useCallback(
    (path: string, how: FileHow) => {
      if (root === undefined) return
      // A file on a host is not on this computer to open in an application, so it is shown here.
      if (ON_PHONE || isRemote(root)) setViewing({ root, path })
      else if (how === 'reveal') window.geckit.chat.reveal(root, path)
      else if (how === 'menu') window.geckit.chat.fileMenu(root, path)
      else window.geckit.chat.openFile(root, path)
    },
    [root],
  )
  // What `#123` in an answer means, where the project pushes to GitHub. Kept with the project it was read for, so another project's is not used for it.
  const [repo, setRepo] = useState<{ readonly root: string; readonly name?: string } | undefined>()
  useEffect(() => {
    if (root === undefined) return
    let here = true
    // Asked through a promise, so a window drawn against an older main process is left without a repository rather than broken.
    void Promise.resolve()
      .then(() => window.geckit.chat.repo(root))
      .then((found) => {
        if (here) setRepo({ root, ...(found === undefined ? {} : { name: found }) })
      })
      .catch(() => undefined)
    return () => {
      here = false
    }
  }, [root])
  const named = repo !== undefined && repo.root === root ? repo.name : undefined
  const files = useMemo(
    () => (root === undefined ? undefined : { root, onFile: file, ...(named === undefined ? {} : { repo: named }) }),
    [root, file, named],
  )
  const links = useMemo(() => linksIn(chat.items), [chat.items])

  // What Copy the terminal command puts on the clipboard: a local `cd` and resume, known at once; a host's own terminal line, asked for.
  const sessionRoot = chat.session?.root
  const sessionId = chat.session?.id
  const localLine =
    sessionRoot === undefined || sessionId === undefined || isRemote(sessionRoot)
      ? undefined
      : `cd ${JSON.stringify(sessionRoot)} && ${resumeCommand(sessionId)}`
  const [hostLine, setHostLine] = useState<{ readonly id: string; readonly line: string | undefined } | undefined>()
  useEffect(() => {
    if (sessionRoot === undefined || sessionId === undefined || !isRemote(sessionRoot)) return
    let here = true
    void window.geckit.hosts.resumeLine(sessionRoot, sessionId).then((said) => {
      if (here) setHostLine({ id: sessionId, line: said })
    })
    return () => {
      here = false
    }
  }, [sessionRoot, sessionId, host?.state])
  const terminalLine = localLine ?? (sessionId !== undefined && hostLine?.id === sessionId ? hostLine.line : undefined)

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
  useEffect(() => window.geckit.shortcuts.onManage((edit) => setManaging({ edit, at: Date.now() })), [])
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
      if (clearing || remoteTrouble !== undefined || chat.compacting !== undefined) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setClearing(false)
          chat.setCompacting(undefined)
          setRemoteTrouble(undefined)
        }
        return
      }
      if (making || asking) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setMaking(false)
          setAsking(false)
        }
        return
      }
      if (switching || setting || keys || managing !== undefined || cut !== undefined) return
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
      // As in a terminal: the command Claude is waiting on goes on in the background, and the turn goes on without it.
      if (event.ctrlKey && !event.metaKey && event.key === 'b') {
        const lasting = chat.items.findLast((one) => one.kind === 'did' && one.live === true && one.lasting === true)
        if (lasting !== undefined) {
          event.preventDefault()
          chat.toBackground(lasting.id)
          return
        }
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
      if (meta && !event.shiftKey && event.key === 'f' && chat.shown.kind === 'session') {
        event.preventDefault()
        setFinding({ id: chat.shown.id, at: Date.now() })
        return
      }
      if (meta && event.key === 'j') {
        event.preventDefault()
        setManaging({ edit: 'list', at: Date.now() })
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
        // The board has the search as a field of its own; the key goes to it rather than opening a second one over it.
        const inBoard = document.querySelector<HTMLInputElement>('.board-search-field')
        if (inBoard === null) setSwitching(true)
        else inBoard.focus()
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setAsking(true)
        return
      }
      if (meta && event.key === 'n') {
        event.preventDefault()
        setMaking(true)
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
      if (meta && event.key === '.' && chat.working) {
        event.preventDefault()
        chat.stop()
        return
      }
      // Over the board the conversation is a popup: Escape puts it away rather than stopping what it is doing.
      if (event.key === 'Escape' && (chat.settings.chatView === 'board' || ON_PHONE) && chat.shown.kind === 'session') {
        event.preventDefault()
        chat.open({ kind: 'new' })
        return
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
  }, [chat, switching, setting, keys, managing, clearing, remoteTrouble, making, asking, cut])

  const title = chat.session?.title ?? 'New conversation'

  const remote = (value: string): void => {
    const session = chat.session
    if (session === undefined) return
    if (value === 'open' && session.remote !== undefined) window.geckit.chat.openLink(session.remote)
    if (value === 'copy' && session.remote !== undefined) void navigator.clipboard.writeText(session.remote)
    if (value !== 'on' && value !== 'off') return
    setRemoteBusy(session.id)
    void window.geckit.chat.remote(session.id, value === 'on').then((said) => {
      setRemoteBusy(undefined)
      if (said.error !== undefined) setRemoteTrouble(said.error)
    })
  }

  // The board stands where the list does, and a conversation opened from it
  // comes up over it rather than beside it.
  // The phone has no list, whichever view the Mac is on.
  const board = chat.settings.chatView === 'board' || ON_PHONE
  const overBoard = board && chat.shown.kind === 'session'

  return (
    <div
      className={`chat${board ? ' boarded' : ''}${ON_PHONE ? '' : ' topped'}${over ? ' dropping' : ''}${holding ? ' holding' : ''}${sizing === undefined ? '' : ' sizing'}`}
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
      {ON_PHONE ? null : (
        <TopBar
          chat={chat}
          onNew={() => setMaking(true)}
          onAsk={() => setAsking(true)}
          onSeek={setSeek}
          onSettings={() => setSetting(true)}
          onKeys={openKeys}
          onShortcuts={() => setManaging({ edit: 'list', at: Date.now() })}
        />
      )}
      {board && ON_PHONE ? (
        <PhoneHome
          chat={chat}
          onNew={(how) => {
            setRecordFirst(how === 'record')
            setMaking(true)
          }}
          onAsk={() => setAsking(true)}
          onScreen={() => setScreening(true)}
          onSeek={setSeek}
        />
      ) : board ? (
        <Board chat={chat} onShortcutFrom={shortcutFrom} />
      ) : (
        <Sidebar
          chat={chat}
          orderRef={order}
          onShortcutFrom={shortcutFrom}
        />
      )}
      {overBoard && !making && !asking ? <div className="talk-scrim" onMouseDown={() => chat.open({ kind: 'new' })} /> : null}
      {making ? (
        <>
          <div className="talk-scrim" onMouseDown={() => setMaking(false)} />
          <NewTask chat={chat} record={recordFirst} onClose={() => setMaking(false)} />
        </>
      ) : null}
      {cut === undefined ? null : <CutOffDialog list={cut} onClose={() => setCut(undefined)} />}
      {asking ? (
        <>
          <div className="talk-scrim" onMouseDown={() => setAsking(false)} />
          <NewTask question chat={chat} onClose={() => setAsking(false)} />
        </>
      ) : null}
      {/* There is no sidebar to make wider on the board. */}
      <div
        className="side-grip"
        hidden={board}
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

      <div className={`talk${board ? ' over' : ''}${chat.session?.state === 'asks' ? ' asks' : ''}`} hidden={board && !overBoard}>
        {ON_PHONE && overBoard ? <EdgeBack onBack={() => chat.open({ kind: 'new' })} /> : null}
        {ON_PHONE && overBoard && chat.session !== undefined ? <EdgeInfo onPull={setPulled} onOpen={() => setInfoing(true)} /> : null}
        {ON_PHONE && overBoard && host?.state === 'lost' ? (
          <div className="phone-offline phone-host-away" role="status">
            <span className="phone-spin" />
            Reconnecting to {host.name}
          </div>
        ) : null}
        {ON_PHONE ? (
          <PhoneNav
            chat={chat}
            links={links}
            onScreen={() => setScreening(true)}
            info={infoing}
            pulled={pulled}
            onInfo={setInfoing}
            onFind={find}
            onClear={() => {
              if (chat.session !== undefined) chat.setRoot(homeOf(chat.session))
              chat.startNew()
              setMaking(true)
            }}
          />
        ) : (
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
              <>
                <span className="tinted" style={{ fontSize: 12, ...tint(projectColor(homeOf(chat.session), chat.settings)) }}>
                  {projectName(homeOf(chat.session))}
                </span>
                {host === undefined ? null : <HostChip host={host} onTerminal={() => window.geckit.hosts.terminal(host.id)} />}
                <Tags session={chat.session} marked={false} />
              </>
            ) : chat.root === undefined ? null : (
              <Picker
                label={`in ${projectLabel(chat.root)}`}
                choices={shownProjects(chat.settings).map((one) => ({ value: one, label: projectLabel(one), says: homePath(one) }))}
                chosen={chat.root}
                title="Start it in"
                tip={homePath(chat.root)}
                className="picker head-project no-drag"
                onPick={chat.setRoot}
              />
            )}
            {chat.session?.model === undefined ? null : (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{chat.session.model}</span>
            )}
            <div className="spacer" />
            {chat.session === undefined ? null : <Back chat={chat} session={chat.session} />}
            {chat.session === undefined || startedCount(chat.sessions, chat.session.id) === 0 ? null : (
              <button
                type="button"
                className="picker no-drag"
                title="Conversations started from this one"
                onClick={(event) => setKids(event.currentTarget.getBoundingClientRect())}
              >
                Started {startedCount(chat.sessions, chat.session.id)}
                <Icon name="down" size={11} />
              </button>
            )}
            {kids === undefined || chat.session === undefined ? null : (
              <StartedMenu chat={chat} id={chat.session.id} anchor={kids} onClose={() => setKids(undefined)} />
            )}
            {links.length === 0 ? null : (
              <Picker
                label="Links"
                choices={links.map((link) => ({
                  value: link.url,
                  label: link.text ?? shortUrl(link.url),
                  ...(link.text === undefined ? {} : { says: shortUrl(link.url) }),
                }))}
                title="Links in this conversation"
                tip={`${String(links.length)} ${links.length === 1 ? 'link' : 'links'} in this conversation, the newest first`}
                className="picker no-drag"
                onPick={(url) => window.geckit.chat.openLink(url)}
              />
            )}
            {chat.session === undefined ? null : (
              <>
                <Picker
                  label={SESSION_STATUSES.find((one) => one.status === chat.session?.status)?.label ?? 'Status'}
                  choices={[
                    ...SESSION_STATUSES.map((one) => ({ value: one.status, label: one.label, says: one.why })),
                    ...(chat.session.status === undefined ? [] : [{ value: '', label: 'No status', says: 'Take the mark off' }]),
                  ]}
                  chosen={chat.session.status ?? ''}
                  title="Where it stands"
                  explained
                  note="Saying anything more in it takes the mark off."
                  tip="Mark it in review, blocked or done"
                  className={`picker no-drag${chat.session.status === undefined ? '' : ` marked ${chat.session.status}`}`}
                  onPick={(value) => {
                    if (chat.session !== undefined) chat.mark(chat.session.id, value === '' ? undefined : (value as SessionStatus))
                  }}
                />
                <button
                  type="button"
                  className={`picker no-drag${chat.session.remote === undefined ? '' : ' remote-on'}`}
                  disabled={remoteBusy === chat.session.id}
                  title={
                    chat.session.remote === undefined
                      ? 'Remote Control: continue this conversation from claude.ai or the Claude app'
                      : 'Remote Control is on'
                  }
                  onClick={(event) => setRemoting(event.currentTarget.getBoundingClientRect())}
                >
                  {chat.session.remote === undefined ? null : <span className="remote-dot" />}
                  {remoteBusy === chat.session.id ? 'Remote...' : 'Remote'}
                </button>
                <button
                  type="button"
                  className="icon-button no-drag"
                  title={
                    copied === chat.session.id
                      ? 'Copied'
                      : terminalLine === undefined
                        ? 'Copy the command that continues it in a terminal'
                        : `Copy the command that continues it in a terminal: ${terminalLine}`
                  }
                  aria-label="Copy the terminal command"
                  onClick={() => {
                    if (chat.session === undefined) return
                    const id = chat.session.id
                    void chat.copyTerminal(id).then((done) => {
                      if (!done) return
                      setCopied(id)
                      setTimeout(() => setCopied((now) => (now === id ? undefined : now)), 1500)
                    })
                  }}
                >
                  <Icon name={copied === chat.session.id ? 'check' : 'terminal'} />
                </button>
                <button
                  type="button"
                  className="icon-button no-drag"
                  title={`Find in this conversation (${MOD}+F)`}
                  aria-label="Find in this conversation"
                  onClick={find}
                >
                  <Icon name="search" />
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
            {overBoard ? (
              <button
                type="button"
                className="icon-button no-drag"
                title="Back to the board (Esc)"
                aria-label="Back to the board"
                onClick={() => chat.open({ kind: 'new' })}
              >
                <Icon name="close" />
              </button>
            ) : null}
          </div>
        )}

        {chat.shown.kind === 'new' && chat.items.length === 0 ? (
          <div className="transcript">
            <div className="turn" style={{ paddingTop: 40, color: 'var(--text-dim)' }}>
              {chat.root === undefined
                ? 'Choose a project folder on the left. Everything asked here runs in that folder.'
                : host !== undefined
                  ? host.state === 'lost'
                    ? `Reconnecting to ${host.name}`
                    : host.state === 'connecting'
                      ? `Connecting to ${host.name}`
                      : host.state === 'needs' || host.state === 'missing' || host.state === 'signin'
                        ? ON_PHONE
                          ? needsComputer(host, chat.prompts)
                            ? `${host.name} needs you on ${computerName()}${host.problem === undefined ? '.' : `: ${host.problem}`}`
                            : `${host.name} needs you`
                          : `${host.name} needs you, above`
                        : `Ask anything about ${projectLabel(chat.root)}. What it may do without asking is under the field.`
                  : chat.account?.here !== true
                    ? 'Claude Code is not on this computer. Install it, then reopen this window.'
                    : chat.account.signedIn === false
                      ? 'Nobody is signed in. Run claude auth login in a terminal, then reopen this window.'
                      : chat.account.key === true
                        ? 'That claude is signed in with an API key. GeckIt only runs sessions on a plan, so nothing would be started here.'
                        : `Ask anything about ${projectLabel(chat.root)}. What it may do without asking is under the field.`}
            </div>
          </div>
        ) : chat.shown.kind === 'session' && chat.itemsFor !== chat.shown.id && chat.items.length === 0 ? (
          <div className="transcript" aria-busy="true" aria-label="Reading the conversation">
            <div className="turn">
              <div className="skeleton-bubble" />
            </div>
            <div className="turn">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          </div>
        ) : (
          <Files value={files}>
            <RequestChat value={chat}>
            <Transcript
              at={chat.itemsFor}
              items={chat.items}
              working={chat.working}
              onAnswer={chat.answer}
              onAgain={again}
              onFile={file}
              onStopShell={chat.stopShell}
              onTypeShell={chat.typeShell}
              onBackground={chat.toBackground}
              onContinue={proceed}
              tasks={chat.session?.tasks}
              onTasks={chat.showTasks}
              seek={seek}
              earlier={chat.earlier}
              onEarlier={chat.showEarlier}
              onSteps={chat.loadSteps}
              find={finding?.id === chat.itemsFor ? finding.at : undefined}
              onFindClose={() => setFinding(undefined)}
            />
            </RequestChat>
          </Files>
        )}

        <Composer chat={chat} />
        {ON_PHONE ? null : <TalkStatus chat={chat} onClear={() => setClearing(true)} />}
      </div>

      <Status chat={chat} />

      <Notices chat={chat} />
      {/* On the phone a host's question is a sheet over whatever is open, one at a time, the oldest first; what stands in the way of a host is on its page in Settings, since only the computer can fix it. */}
      {ON_PHONE ? (
        chat.prompts[0] === undefined ? null : (
          <PhoneHostSheet key={chat.prompts[0].id} prompt={chat.prompts[0]} host={chat.hosts.find((one) => one.id === chat.prompts[0]?.host)} />
        )
      ) : chat.prompts.length === 0 && (host === undefined || !['missing', 'signin', 'needs'].includes(host.state)) ? null : (
        <div className="host-prompts">
          {chat.prompts.map((prompt) => (
            <HostPromptCard
              key={prompt.id}
              prompt={prompt}
              hostName={chat.hosts.find((one) => one.id === prompt.host)?.name ?? prompt.host}
              canRemember={chat.hosts.find((one) => one.id === prompt.host)?.canRemember ?? false}
            />
          ))}
          {host === undefined || chat.prompts.some((one) => one.host === host.id) ? null : <HostTroubleCard host={host} />}
        </div>
      )}
      {screening ? <Screen onClose={() => setScreening(false)} /> : null}
      {viewing === undefined ? null : <FileView root={viewing.root} path={viewing.path} onClose={() => setViewing(undefined)} />}
      <Consent settings={chat.settings} change={chat.change} />
      {recent === undefined ? null : (
        <Recent
          list={recent.list}
          at={recent.at}
          colors={chat.settings}
          onAt={(index) => {
            const next = { list: recent.list, at: index }
            recentRef.current = next
            setRecent(next)
          }}
          onPick={(index) => {
            recentRef.current = undefined
            setRecent(undefined)
            const chosen = recent.list[index]
            if (chosen !== undefined) chat.goTo(chosen.id)
          }}
        />
      )}
      {switching ? <Switcher chat={chat} onClose={() => setSwitching(false)} onSeek={setSeek} /> : null}
      {setting ? (
        <SettingsDialog settings={chat.settings} change={chat.change} onClose={closeSettings} onShortcuts={openKeys} />
      ) : null}
      {keys ? <ShortcutsDialog onClose={closeKeys} /> : null}
      {chat.settings.welcomed || ON_PHONE ? null : <Welcome chat={chat} />}
      {managing === undefined ? null : (
        <ShortcutList key={managing.at} chat={chat} start={managing.edit} onClose={closeShortcuts} />
      )}
      {remoting === undefined || chat.session === undefined ? null : (
        <Menu
          anchor={remoting}
          title="Remote Control"
          explained
          choices={
            chat.session.remote === undefined
              ? [
                  {
                    value: 'on',
                    label: 'Turn on',
                    says: 'Continue this conversation from claude.ai or the Claude app. It is kept running here until it is turned off.',
                  },
                ]
              : [
                  ...(chat.session.remote === ''
                    ? []
                    : [
                        { value: 'open', label: 'Open on claude.ai' },
                        { value: 'copy', label: 'Copy the link' },
                      ]),
                  { value: 'off', label: 'Turn off' },
                ]
          }
          onPick={remote}
          onClose={() => setRemoting(undefined)}
        />
      )}
      {remoteTrouble === undefined ? null : (
        <div className="dialog-scrim" onMouseDown={() => setRemoteTrouble(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Remote Control did not start</h2>
            <p>{remoteTrouble}</p>
            <div className="dialog-actions">
              <button type="button" className="primary" autoFocus onClick={() => setRemoteTrouble(undefined)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {chat.compacting !== undefined && chat.session !== undefined ? (
        <div className="dialog-scrim" onMouseDown={() => chat.setCompacting(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Compact the conversation?</h2>
            <p>
              Claude writes a summary of it so far and goes on from the summary, to free up its context. Everything stays here to read, but what the summary leaves out Claude no longer has in mind.
            </p>
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => chat.setCompacting(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => {
                  if (chat.compacting === 'typed') chat.send()
                  else chat.say('/compact')
                  chat.setCompacting(undefined)
                }}
              >
                Compact
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {clearing && chat.session !== undefined ? (
        <div className="dialog-scrim" onMouseDown={() => setClearing(false)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Clear the conversation?</h2>
            <p>
              The next message starts a new conversation in {projectLabel(homeOf(chat.session))}, with nothing of this one
              in mind. This one stays in the list.
            </p>
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setClearing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => {
                  if (chat.session !== undefined) chat.setRoot(homeOf(chat.session))
                  chat.startNew()
                  setClearing(false)
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
