import { useState } from 'react'
import { createPortal } from 'react-dom'

import { forHowLong, stateLine, targetLine } from '../../../shared/hosts'
import type { HostPrompt, HostState, HostView } from '../../../shared/hosts'
import { Picker } from '../ui/Menu'
import { askDisconnect, Confirm } from './Hosts'
import { useMinute } from './useHosts'

/** How a host stands, as a dot: solid when connected, hollow when not, amber out of reach, red when it needs the person. */
export function HostDot({ state }: { readonly state: HostState }): React.JSX.Element {
  return <span className={`host-dot ${state}`} aria-hidden="true" />
}

/**
 * The host a conversation runs on, in its header, with how it stands; its menu
 * says since when and offers a terminal there and Reconnect or Disconnect.
 */
export function HostChip({ host, onTerminal }: { readonly host: HostView; readonly onTerminal: () => void }): React.JSX.Element {
  const now = useMinute()
  const [asking, setAsking] = useState<number | undefined>()
  const tip =
    host.state === 'up'
      ? `On ${host.name} (${targetLine(host)})${host.since === undefined ? '' : `, connected for ${forHowLong(now - host.since)}`}`
      : `${host.name}: ${stateLine(host, now)}`
  const down = host.state === 'idle' || host.state === 'needs' || host.state === 'missing' || host.state === 'signin'
  return (
    <>
      <Picker
        label={
          <>
            <HostDot state={host.state} />
            {host.name}
          </>
        }
        // Who it signs in as heads the note rather than the menu's title, which is set in capitals and would change how an address reads.
        note={[targetLine(host), stateLine(host, now), host.version === undefined ? undefined : `Claude Code ${host.version}`, host.plan === undefined ? undefined : `Claude ${host.plan}`]
          .filter((one) => one !== undefined)
          .join(' · ')}
        tip={tip}
        className="picker host-chip no-drag"
        choices={[
          { value: 'terminal', label: 'Open a terminal there', icon: 'terminal' },
          ...(down ? [{ value: 'connect', label: 'Connect' }] : [{ value: 'reconnect', label: 'Reconnect' }, { value: 'disconnect', label: 'Disconnect' }]),
        ]}
        onPick={(value) => {
          if (value === 'terminal') onTerminal()
          if (value === 'connect' || value === 'reconnect') window.geckit.hosts.reconnect(host.id)
          if (value === 'disconnect') askDisconnect(host, setAsking)
        }}
      />
      {/* Portalled out of the drag region: nested in .talk-head.drag, it would inherit the header's nowrap and sit where drags start. */}
      {asking === undefined
        ? null
        : createPortal(<Confirm host={host} what="disconnect" running={asking} onClose={() => setAsking(undefined)} />, document.body)}
    </>
  )
}

/**
 * What a host asks while connecting, as a card: a password, a passphrase, a
 * code, or trust in its key. A key is asked about as the phone asks it: which
 * host, then the fingerprint on a line of its own to compare, and the two
 * answers weigh the same, with Not now where focus starts, since trusting a
 * key is not a thing to be done by pressing Return.
 */
export function HostPromptCard({ prompt, hostName, canRemember }: { readonly prompt: HostPrompt; readonly hostName: string; readonly canRemember: boolean }): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [remember, setRemember] = useState(true)
  const send = (): void => window.geckit.hosts.answer({ id: prompt.id, answer, ...(prompt.kind === 'password' ? { remember: remember && canRemember } : {}) })
  const notNow = (): void => window.geckit.hosts.answer({ id: prompt.id })
  const typed = prompt.kind !== 'trust'
  const print = prompt.kind === 'trust' ? prompt.detail : undefined
  return (
    <div
      className="host-prompt"
      role="alertdialog"
      aria-label={prompt.text}
      onKeyDown={(event) => {
        if (event.key === 'Escape') notNow()
      }}
    >
      <div className="host-prompt-title">{print === undefined ? prompt.text : `This is the first connection to ${hostName}.`}</div>
      {print === undefined ? null : (
        <>
          <div className="host-prompt-note">Its key, to compare with what the host shows for itself:</div>
          <div className="host-print">{print}</div>
        </>
      )}
      {typed ? (
        <input
          type={prompt.kind === 'other' || prompt.kind === 'code' ? 'text' : 'password'}
          value={answer}
          autoFocus
          aria-label={prompt.kind === 'code' ? 'Code' : prompt.kind === 'passphrase' ? 'Passphrase' : 'Password'}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && answer !== '') send()
          }}
        />
      ) : null}
      {prompt.kind === 'password' && canRemember ? (
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Remember on this computer
        </label>
      ) : null}
      <div className="host-prompt-actions">
        <button type="button" className="quiet" autoFocus={!typed} onClick={notNow}>
          Not now
        </button>
        <button type="button" className={typed ? 'primary' : 'quiet'} disabled={typed && answer === ''} onClick={send}>
          {prompt.kind === 'trust' ? 'Trust' : prompt.kind === 'passphrase' ? 'Unlock' : prompt.kind === 'code' ? 'Send' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

/** A host that could not be used, as a card: what stands in the way, and what fixes it. */
export function HostTroubleCard({ host }: { readonly host: HostView }): React.JSX.Element | null {
  const [installing, setInstalling] = useState(false)
  const [said, setSaid] = useState<string | undefined>()
  const [trusting, setTrusting] = useState(false)
  const [trustSaid, setTrustSaid] = useState<string | undefined>()
  // A key that changed since the last connection is dismissed for that print alone: a new change to look at shows the card again. Starts false, since a print of undefined must never read as already dismissed.
  const [dismissed, setDismissed] = useState(false)
  const [dismissedPrint, setDismissedPrint] = useState<string | undefined>()
  if (host.state !== 'missing' && host.state !== 'signin' && host.state !== 'needs') return null
  if (host.changedKey !== undefined && (!dismissed || dismissedPrint !== host.changedKey.print)) {
    return (
      <div className="host-prompt trouble">
        <div className="host-prompt-title">{host.problem ?? `${host.name}'s key has changed since the last connection.`}</div>
        {host.changedKey.print === undefined ? null : <div className="host-print">{host.changedKey.print}</div>}
        {trustSaid === undefined ? null : <div className="host-prompt-note trouble">{trustSaid}</div>}
        <div className="host-prompt-actions">
          <button
            type="button"
            className="quiet"
            autoFocus
            onClick={() => {
              setDismissed(true)
              setDismissedPrint(host.changedKey?.print)
            }}
          >
            Not now
          </button>
          <button
            type="button"
            className="quiet"
            disabled={trusting}
            onClick={() => {
              setTrusting(true)
              setTrustSaid(undefined)
              void window.geckit.hosts.trustNewKey(host.id).then((done) => {
                setTrusting(false)
                if (!done.ok) setTrustSaid(done.problem)
              })
            }}
          >
            {trusting ? 'Trusting...' : 'Trust the new key'}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="host-prompt trouble">
      <div className="host-prompt-title">{host.problem ?? `${host.name} needs you.`}</div>
      {said === undefined ? null : <pre className="host-said">{said}</pre>}
      <div className="host-prompt-actions">
        {host.state === 'missing' ? (
          <button
            type="button"
            className="primary"
            disabled={installing}
            onClick={() => {
              setInstalling(true)
              void window.geckit.hosts.install(host.id).then((done) => {
                setInstalling(false)
                setSaid(done.text)
              })
            }}
          >
            {installing ? 'Installing...' : 'Install it'}
          </button>
        ) : null}
        {host.state === 'signin' ? (
          <button type="button" className="primary" onClick={() => window.geckit.hosts.terminal(host.id, 'claude /login')}>
            Sign in on {host.name}
          </button>
        ) : null}
        <button type="button" className="quiet" onClick={() => window.geckit.hosts.reconnect(host.id)}>
          Try again
        </button>
      </div>
    </div>
  )
}

/** What a host is, in motion: a message leaves the board here, Claude Code works on the host, and the answer comes back. */
export function HostsMotion(): React.JSX.Element {
  return (
    <div className="hosts-motion" aria-hidden="true">
      <div className="hm-side">
        <div className="hm-box hm-here">
          <span className="hm-card" />
          <span className="hm-card hm-sent" />
          <span className="hm-card" />
        </div>
        <span className="hm-label">This computer</span>
      </div>
      <div className="hm-wire">
        <span className="hm-ssh">SSH</span>
        <span className="hm-dot hm-out" />
        <span className="hm-dot hm-back" />
      </div>
      <div className="hm-side">
        <div className="hm-box hm-there">
          <span className="hm-prompt">
            <span className="hm-spark">*</span> claude
          </span>
          <span className="hm-line" />
          <span className="hm-line" />
          <span className="hm-line" />
        </div>
        <span className="hm-label">The host</span>
      </div>
    </div>
  )
}
