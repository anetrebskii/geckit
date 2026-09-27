import { useEffect, useState } from 'react'

import type { Folders as FolderList } from '../../../shared/api'
import { forHowLong, remoteRoot, stateLine, targetLine } from '../../../shared/hosts'
import type { HostState, HostView } from '../../../shared/hosts'
import { macs } from '../macs'
import { tap } from '../tap'
import { HostDot } from './HostParts'
import { Cell, Page } from './PhoneKit'
import { useMinute } from './useHosts'
import type { Chat } from './useChat'

/**
 * Hosts on the phone. Every other machine is a host, reached one of two ways:
 * paired with the phone, where GeckIt runs and the phone switches between
 * them, or over SSH from the host it works through, which holds the keys and
 * is on their network. So these are seen, connected and their folders added
 * here, and added and changed there. The host worked through goes by its own
 * name: on the phone nothing is Local. See docs/ux/remote-hosts-phone.md.
 */

/** How a host stands in a word or two, for a row with room for no more; since when is a row of its own. */
const STATE_WORD: Readonly<Record<HostState, string>> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  up: 'Connected',
  lost: 'Out of reach',
  needs: 'Needs you',
  missing: 'No Claude Code',
  signin: 'Not signed in',
}

/** The name of the host this phone is working through now, where it has one. */
export const pairedName = (): string | undefined => macs()?.list().find((one) => one.current)?.name

/** What the phone calls the host it works through, in a sentence. */
export const computerName = (): string => pairedName() ?? 'the host'

/**
 * The paired host a host over SSH is, where GeckIt runs on it too: known by
 * the name it gives itself, which both the pairing and the SSH check read.
 */
export function pairedAs(host: HostView): { readonly name: string; readonly at: number; readonly current: boolean } | undefined {
  if (host.machine === undefined) return undefined
  const at = (macs()?.list() ?? []).findIndex((one) => (one.told ?? one.name) === host.machine)
  const one = macs()?.list()[at]
  return one === undefined ? undefined : { name: one.name, at, current: one.current }
}

/** A host as a row: its dot, its name, and who it signs in as or how it stands when that is not connected. */
function HostCell({ host, now, onPress }: { readonly host: HostView; readonly now: number; readonly onPress: () => void }): React.JSX.Element {
  const paired = pairedAs(host)
  return (
    <Cell
      label={
        <span className="phone-host-name">
          <HostDot state={host.state} />
          {host.name}
        </span>
      }
      says={paired !== undefined && !paired.current ? 'Also paired with this phone' : host.state === 'up' ? targetLine(host) : stateLine(host, now)}
      onPress={onPress}
    />
  )
}

/** Settings, Hosts: the computer first, then each host. */
export function PhoneHostList({
  chat,
  back,
  onBack,
  onOpen,
}: {
  readonly chat: Chat
  readonly back: string
  readonly onBack: () => void
  readonly onOpen: (id: string) => void
}): React.JSX.Element {
  const now = useMinute()
  const computer = computerName()
  const program = chat.account?.program?.version
  return (
    <Page title="Over SSH" back={back} onBack={onBack}>
      <div className="phone-head">Through</div>
      <div className="phone-group">
        <Cell
          label={computer}
          icon="display"
          says={[program === undefined ? undefined : `Claude Code ${program}`, chat.account?.plan === undefined ? undefined : `Claude ${chat.account.plan}`]
            .filter((one) => one !== undefined)
            .join(' · ')}
        />
      </div>
      <div className="phone-head">Reached over SSH</div>
      <div className="phone-group">
        {chat.hosts.map((host) => (
          <HostCell key={host.id} host={host} now={now} onPress={() => onOpen(host.id)} />
        ))}
      </div>
      <div className="phone-note">Hosts over SSH are added on {computer}, where the SSH keys are.</div>
    </Page>
  )
}

/** One host: how it stands and since when, what it runs, and Connect or Reconnect and Disconnect. */
export function PhoneHost({ chat, id, back, onBack }: { readonly chat: Chat; readonly id: string; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const now = useMinute()
  const host = chat.hosts.find((one) => one.id === id)
  const computer = computerName()
  if (host === undefined) return <Page title="Host" back={back} onBack={onBack}>{null}</Page>
  const paired = pairedAs(host)
  const down = host.state === 'idle' || host.state === 'needs' || host.state === 'missing' || host.state === 'signin'
  const trouble = host.state === 'missing' || host.state === 'signin'
  return (
    <Page title={host.name} back={back} onBack={onBack}>
      <div className="phone-group">
        <Cell
          label="Status"
          value={
            <span className="phone-host-name">
              <HostDot state={host.state} />
              {STATE_WORD[host.state]}
            </span>
          }
        />
        {host.state === 'up' && host.since !== undefined ? <Cell label="Connected for" value={forHowLong(now - host.since)} /> : null}
        <Cell label="Address" value={targetLine(host)} />
        <Cell label="Claude Code" value={host.version ?? '-'} />
        {host.plan === undefined ? null : <Cell label="Plan" value={`Claude ${host.plan}`} />}
      </div>
      {(trouble || host.state === 'needs') && host.problem !== undefined ? (
        <div className="phone-note">
          {host.problem}
          {host.state === 'missing' ? ` Install it from ${computer}.` : host.state === 'signin' ? ` Sign in on ${host.name} from ${computer}.` : ''}
        </div>
      ) : null}
      <div className="phone-group phone-form-group">
        {down ? (
          <Cell
            label="Connect"
            accent
            onPress={() => {
              tap('light')
              window.geckit.hosts.reconnect(host.id)
            }}
          />
        ) : (
          <>
            <Cell
              label="Reconnect"
              accent
              onPress={() => {
                tap('light')
                window.geckit.hosts.reconnect(host.id)
              }}
            />
            <Cell
              label="Disconnect"
              accent
              onPress={() => {
                tap('light')
                window.geckit.hosts.disconnect(host.id)
              }}
            />
          </>
        )}
      </div>
      <div className="phone-note">Conversations on {host.name} run there and keep working while this phone or {computer} is away.</div>
      {paired === undefined || paired.current ? null : (
        <>
          <div className="phone-group phone-form-group">
            <Cell
              label={`Switch to ${paired.name}`}
              accent
              onPress={() => {
                tap('light')
                macs()?.switchTo(paired.at)
              }}
            />
          </div>
          <div className="phone-note">GeckIt runs on {host.name} too, and this phone is paired with it: switched to, its own board is here, without {computer} in between.</div>
        </>
      )}
    </Page>
  )
}

/** Where a new project is: the computer by its name, then each host with how it stands. */
export function PhoneWhere({ chat, onComputer, onHost }: { readonly chat: Chat; readonly onComputer: () => void; readonly onHost: (id: string) => void }): React.JSX.Element {
  const now = useMinute()
  return (
    <>
      <div className="phone-group">
        <Cell label={computerName()} icon="display" says="Its folders" onPress={onComputer} />
        {chat.hosts.map((host) => (
          <HostCell key={host.id} host={host} now={now} onPress={() => onHost(host.id)} />
        ))}
      </div>
      <div className="phone-note">Folders on hosts are read over their connection.</div>
    </>
  )
}

/**
 * A host's folders one level at a time, from its home, read over the computer's
 * connection; the one shown is added as a project at the bottom, or picked from
 * the bar of a sheet that asks for it. A host that asks for a password while
 * its folders are read asks in the sheet over this page.
 */
export function PhoneHostFolders({
  chat,
  host,
  onShown,
  onAdded,
}: {
  readonly chat: Chat
  readonly host: HostView
  readonly onShown?: (folder: FolderList) => void
  readonly onAdded?: (root: string) => void
}): React.JSX.Element {
  const [at, setAt] = useState<string | undefined>()
  const [shown, setShown] = useState<FolderList | undefined>()
  const [trouble, setTrouble] = useState<string | undefined>()
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    let here = true
    void window.geckit.hosts.folders(host.id, at).then(
      (read) => {
        if (!here) return
        if (read === undefined) {
          setTrouble(`Could not read ${at ?? 'the home folder'} on ${host.name}.`)
          return
        }
        setTrouble(undefined)
        setShown(read)
        onShown?.(read)
      },
      () => {
        if (here) setTrouble(`Could not read ${at ?? 'the home folder'} on ${host.name}.`)
      },
    )
    return () => {
      here = false
    }
  }, [at, host.id, host.name, onShown])
  const had = shown !== undefined && chat.settings.projects.includes(remoteRoot(host.id, shown.path))

  if (shown === undefined) return <div className="phone-empty">{trouble ?? `Reading ${host.name}...`}</div>
  return (
    <>
      <div className="phone-head phone-path phone-host-path">
        <HostDot state={host.state} />
        <b>{host.name}</b>
        {shown.path}
      </div>
      {trouble === undefined ? null : <div className="phone-note phone-lead">{trouble}</div>}
      <div className="phone-group">
        {shown.up === undefined ? null : <Cell label=".." icon="left" onPress={() => setAt(shown.up)} />}
        {shown.folders
          .filter((one) => !one.name.startsWith('.'))
          .map((one) => (
            <Cell key={one.path} label={one.name} icon="folder" {...(one.git ? { says: 'Git repository' } : {})} onPress={() => setAt(one.path)} />
          ))}
        {shown.folders.every((one) => one.name.startsWith('.')) ? <Cell label="No folders in it" /> : null}
      </div>
      {onShown !== undefined ? null : (
        <div className="phone-group phone-form-group">
          <Cell
            label={had ? 'Already a project' : adding ? 'Adding...' : 'Add this folder'}
            says={`${host.name} · ${shown.path}`}
            accent={!had}
            {...(had || adding
              ? {}
              : {
                  onPress: () => {
                    setAdding(true)
                    void window.geckit.hosts.addFolder(host.id, shown.path).then((root) => {
                      setAdding(false)
                      if (root === undefined) {
                        setTrouble(`Could not add ${shown.path} on ${host.name}.`)
                        return
                      }
                      tap('done')
                      chat.refresh()
                      onAdded?.(root)
                    })
                  },
                })}
          />
        </div>
      )}
    </>
  )
}
