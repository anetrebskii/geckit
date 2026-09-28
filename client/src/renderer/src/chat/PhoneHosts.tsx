import { useEffect, useState } from 'react'

import type { Folders as FolderList } from '../../../shared/api'
import { stateLine } from '../../../shared/hosts'
import type { HostPrompt, HostView } from '../../../shared/hosts'
import { macs } from '../macs'
import { HostDot } from './HostParts'
import { Cell } from './PhoneKit'
import { useMinute } from './useHosts'
import type { Chat } from './useChat'

/**
 * Hosts on the phone. The phone is paired with a host where GeckIt runs and
 * takes everything from it, the projects it has on other hosts too: those are
 * only labels here, and a folder on one is chosen the way one of its own is.
 * They are connected and managed on that host. The host the phone works
 * through goes by its own name: on the phone nothing is Local.
 * See docs/ux/remote-hosts-phone.md.
 */

/** The name of the host this phone is working through now, where it has one. */
export const pairedName = (): string | undefined => macs()?.list().find((one) => one.current)?.name

/** What the phone calls the host it works through, in a sentence. */
export const computerName = (): string => pairedName() ?? 'the host'

/**
 * Whether a host's trouble is one only the computer can fix, said as "X needs
 * you on <computer>": no Claude Code there, not signed in, or a key that
 * changed, since none of those is answered by a sheet here. A plain `needs`
 * with a password, passphrase or code already up is answered by the phone's
 * own sheet instead, so it does not also say to go to the computer.
 */
export const needsComputer = (host: HostView, prompts: readonly HostPrompt[]): boolean =>
  host.state === 'missing' ||
  host.state === 'signin' ||
  host.changedKey !== undefined ||
  (host.state === 'needs' && !prompts.some((prompt) => prompt.host === host.id))

/** How a host stands, in the words the phone shows: a changed key is not the phone's to fix, so it says where to. */
const phoneStateLine = (host: HostView, now: number): string =>
  host.changedKey !== undefined ? `${host.name}'s key has changed. Check it on ${computerName()}.` : stateLine(host, now)

/** A host as a row: its dot and its name, and how it stands where it is not connected. */
function HostCell({ host, now, onPress }: { readonly host: HostView; readonly now: number; readonly onPress: () => void }): React.JSX.Element {
  return (
    <Cell
      label={
        <span className="phone-host-name">
          <HostDot state={host.state} />
          {host.name}
        </span>
      }
      {...(host.state === 'up' ? {} : { says: phoneStateLine(host, now) })}
      onPress={onPress}
    />
  )
}

/** Where a new project is: the host the phone works through, by its name, then the other hosts it has projects on. */
export function PhoneWhere({ chat, onComputer, onHost }: { readonly chat: Chat; readonly onComputer: () => void; readonly onHost: (id: string) => void }): React.JSX.Element {
  const now = useMinute()
  return (
    <div className="phone-group">
      <Cell label={computerName()} icon="display" onPress={onComputer} />
      {chat.hosts.map((host) => (
        <HostCell key={host.id} host={host} now={now} onPress={() => onHost(host.id)} />
      ))}
    </div>
  )
}

/**
 * A host's folders one level at a time, from its home, read over the computer's
 * connection; the one shown is added as a project at the bottom, or picked from
 * the bar of a sheet that asks for it. A host that asks for a password while
 * its folders are read asks in the sheet over this page.
 */
export function PhoneHostFolders({
  host,
  onShown,
}: {
  readonly host: HostView
  readonly onShown: (folder: FolderList) => void
}): React.JSX.Element {
  const [at, setAt] = useState<string | undefined>()
  const [shown, setShown] = useState<FolderList | undefined>()
  const [trouble, setTrouble] = useState<string | undefined>()
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
        onShown(read)
      },
      () => {
        if (here) setTrouble(`Could not read ${at ?? 'the home folder'} on ${host.name}.`)
      },
    )
    return () => {
      here = false
    }
  }, [at, host.id, host.name, onShown])

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
        {shown.folders.every((one) => one.name.startsWith('.')) ? (
          <Cell label={`No folders inside ${shown.path.split('/').filter((part) => part !== '').pop() ?? host.name}`} />
        ) : null}
      </div>
    </>
  )
}
