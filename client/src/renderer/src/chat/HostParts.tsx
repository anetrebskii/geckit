import { useState } from 'react'

import { forHowLong, stateLine, targetLine } from '../../../shared/hosts'
import type { HostPrompt, HostState, HostView } from '../../../shared/hosts'
import { Picker } from '../ui/Menu'
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
  const tip =
    host.state === 'up'
      ? `On ${host.name} (${targetLine(host)})${host.since === undefined ? '' : `, connected for ${forHowLong(now - host.since)}`}`
      : `${host.name}: ${stateLine(host, now)}`
  const down = host.state === 'idle' || host.state === 'needs' || host.state === 'missing' || host.state === 'signin'
  return (
    <Picker
      label={
        <>
          <HostDot state={host.state} />
          {host.name}
        </>
      }
      title={`${host.name} · ${targetLine(host)}`}
      note={[stateLine(host, now), host.version === undefined ? undefined : `Claude Code ${host.version}`, host.plan === undefined ? undefined : `Claude ${host.plan}`]
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
        if (value === 'disconnect') window.geckit.hosts.disconnect(host.id)
      }}
    />
  )
}

/** What a host asks while connecting, as a card: a password, a passphrase, a code, or trust in its key. */
export function HostPromptCard({ prompt, canRemember }: { readonly prompt: HostPrompt; readonly canRemember: boolean }): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [remember, setRemember] = useState(true)
  const send = (): void => window.geckit.hosts.answer({ id: prompt.id, answer, ...(prompt.kind === 'password' ? { remember: remember && canRemember } : {}) })
  const notNow = (): void => window.geckit.hosts.answer({ id: prompt.id })
  const typed = prompt.kind !== 'trust'
  return (
    <div className="host-prompt">
      <div className="host-prompt-title">{prompt.text}</div>
      {typed ? (
        <input
          type={prompt.kind === 'other' || prompt.kind === 'code' ? 'text' : 'password'}
          value={answer}
          autoFocus
          aria-label={prompt.kind === 'code' ? 'Code' : prompt.kind === 'passphrase' ? 'Passphrase' : 'Password'}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && answer !== '') send()
            if (event.key === 'Escape') notNow()
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
        <button type="button" className="primary" disabled={typed && answer === ''} onClick={send}>
          {prompt.kind === 'trust' ? 'Trust' : prompt.kind === 'passphrase' ? 'Unlock' : prompt.kind === 'code' ? 'Send' : 'Sign in'}
        </button>
        <button type="button" className="quiet" onClick={notNow}>
          Not now
        </button>
      </div>
    </div>
  )
}

/** A host that could not be used, as a card: what stands in the way, and what fixes it. */
export function HostTroubleCard({ host }: { readonly host: HostView }): React.JSX.Element | null {
  const [installing, setInstalling] = useState(false)
  const [said, setSaid] = useState<string | undefined>()
  if (host.state !== 'missing' && host.state !== 'signin' && host.state !== 'needs') return null
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
          <button type="button" className="primary" onClick={() => window.geckit.hosts.terminal(host.id, 'claude')}>
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
