import { useEffect, useMemo, useState } from 'react'

import type { ClaudeAccount } from '../../../shared/api'
import { parseTarget, stateLine, targetLine } from '../../../shared/hosts'
import type { HostAuth, HostCheck, HostView, KnownHost } from '../../../shared/hosts'
import { Icon } from '../ui/Icon'
import { HostDot } from './HostParts'
import { useEscape, useHosts, useMinute } from './useHosts'

/**
 * Settings, Hosts: this computer first, as Local, then every host with how it
 * stands, the Claude Code there and whose plan it runs on; and Add a host.
 */
export function HostsSection({ working }: { readonly working?: (host: string) => number }): React.JSX.Element {
  const { hosts } = useHosts()
  const [account, setAccount] = useState<ClaudeAccount | undefined>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<HostView | undefined>()
  const [asking, setAsking] = useState<{ readonly host: HostView; readonly what: 'disconnect' | 'remove' } | undefined>()
  const now = useMinute()

  useEffect(() => {
    void window.geckit.chat.account().then(setAccount)
  }, [])

  const local = [account?.program === undefined ? undefined : `Claude Code ${account.program.version}`, account?.plan === undefined ? undefined : `Claude ${account.plan}`]
    .filter((one) => one !== undefined)
    .join(' · ')

  return (
    <>
      <div className="field">
        <label>Hosts</label>
        <span className="hosts-lead">
          Conversations on a host run there, on the Claude Code and the plan signed in there, and keep working when this
          computer sleeps or the connection drops. Their projects are listed with the host's name after them.
        </span>
        <div className="hosts-list">
          <div className="host-row">
            <HostDot state="up" />
            <span className="host-lines">
              <span className="name">Local</span>
              <span className="says">{local === '' ? 'This computer' : local}</span>
            </span>
          </div>
          {hosts.map((host) => (
            <div key={host.id} className="host-row">
              <HostDot state={host.state} />
              <span className="host-lines">
                <span className="name">{host.name}</span>
                <span className="says">
                  <span className={`host-state${host.state === 'needs' || host.state === 'missing' || host.state === 'signin' ? ' trouble' : ''}`}>{stateLine(host, now)}</span>
                  {[targetLine(host), host.version === undefined ? undefined : `Claude Code ${host.version}`, host.plan === undefined ? undefined : `Claude ${host.plan}`]
                    .filter((one) => one !== undefined)
                    .map((one) => ` · ${one}`)
                    .join('')}
                </span>
              </span>
              {host.state === 'idle' || host.state === 'needs' || host.state === 'missing' || host.state === 'signin' ? (
                <button type="button" className="quiet" onClick={() => window.geckit.hosts.connect(host.id)}>
                  {host.state === 'idle' ? 'Connect' : 'Try again'}
                </button>
              ) : (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => ((working?.(host.id) ?? 0) > 0 ? setAsking({ host, what: 'disconnect' }) : window.geckit.hosts.disconnect(host.id))}
                >
                  Disconnect
                </button>
              )}
              <button type="button" className="quiet" onClick={() => setEditing(host)}>
                Edit
              </button>
            </div>
          ))}
        </div>
        <div>
          <button type="button" className="quiet" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} /> Add a host
          </button>
        </div>
      </div>
      {adding ? <AddHost onClose={() => setAdding(false)} /> : null}
      {editing === undefined ? null : (
        <AddHost
          editing={editing}
          onClose={() => setEditing(undefined)}
          onRemove={() => {
            setEditing(undefined)
            setAsking({ host: editing, what: 'remove' })
          }}
        />
      )}
      {asking === undefined ? null : (
        <Confirm
          host={asking.host}
          what={asking.what}
          working={working?.(asking.host.id) ?? 0}
          onClose={() => setAsking(undefined)}
        />
      )}
    </>
  )
}

/** Disconnect while something works there, or Remove: asked in the words the design gives. */
function Confirm({ host, what, working, onClose }: { readonly host: HostView; readonly what: 'disconnect' | 'remove'; readonly working: number; readonly onClose: () => void }): React.JSX.Element {
  const count = `${String(working)} ${working === 1 ? 'conversation is' : 'conversations are'}`
  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        {what === 'disconnect' ? (
          <>
            <h2>Disconnect {host.name}?</h2>
            <p>{count} working there and will keep working.</p>
          </>
        ) : (
          <>
            <h2>Remove {host.name}?</h2>
            <p>Its conversations stay on {host.name} and leave this list.</p>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="quiet" autoFocus onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={what === 'remove' ? 'primary danger' : 'primary'}
            onClick={() => {
              if (what === 'disconnect') window.geckit.hosts.disconnect(host.id)
              else void window.geckit.hosts.remove(host.id)
              onClose()
            }}
          >
            {what === 'disconnect' ? 'Disconnect' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The name this computer's account goes by, for a User nobody typed. */
const localUser = (): string => {
  const home = window.geckit.home
  return home.split(/[\\/]/).filter((part) => part !== '').pop() ?? ''
}

/**
 * Add a host: the fields every SSH client asks for, filled in where they can
 * be. `user@address:port` typed into Address fills all three; a Host from the
 * SSH config is offered as it is typed and brings what the config says.
 *
 * Edit is the same sheet filled in, its button Save: a change to how the host
 * is reached is checked again as adding it was, and a new name alone is not.
 */
export function AddHost({
  editing,
  onClose,
  onAdded,
  onRemove,
}: {
  readonly editing?: HostView
  /** Removing a host is kept in its Edit sheet, as a destructive action is kept off the list it is in. */
  readonly onRemove?: () => void
  readonly onClose: () => void
  readonly onAdded?: (host: HostView) => void
}): React.JSX.Element {
  const [address, setAddress] = useState(editing?.address ?? '')
  const [user, setUser] = useState(editing?.user ?? localUser)
  const [port, setPort] = useState(String(editing?.port ?? 22))
  const [auth, setAuth] = useState<HostAuth>(editing?.auth ?? 'key')
  const [keyFile, setKeyFile] = useState(editing?.keyFile ?? '')
  const [ownKey, setOwnKey] = useState(editing?.keyFile !== undefined)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [forgotten, setForgotten] = useState(false)
  const [name, setName] = useState(editing?.name ?? '')
  const [named, setNamed] = useState(editing !== undefined)
  const [known, setKnown] = useState<readonly KnownHost[]>([])
  const [checks, setChecks] = useState<readonly HostCheck[]>([])
  const [running, setRunning] = useState(false)
  const [added, setAdded] = useState<HostView | undefined>()
  const [problem, setProblem] = useState<string | undefined>()
  const { hosts } = useHosts()
  const canRemember = hosts[0]?.canRemember ?? true

  useEffect(() => {
    void window.geckit.hosts.known().then(setKnown)
    return window.geckit.hosts.onChecks(setChecks)
  }, [])
  useEscape(onClose)

  const offered = useMemo(
    () => known.filter((one) => !hosts.some((host) => host.address === one.host) && one.host !== address && (address === '' || one.host.startsWith(address))).slice(0, 5),
    [known, hosts, address],
  )

  const typed = (value: string): void => {
    const read = parseTarget(value)
    if (read.user !== undefined || read.port !== undefined) {
      setAddress(read.address)
      if (read.user !== undefined) setUser(read.user)
      if (read.port !== undefined) setPort(String(read.port))
    } else setAddress(value)
    if (!named) setName((read.user !== undefined || read.port !== undefined ? read.address : value).trim())
  }

  const choose = (one: KnownHost): void => {
    setAddress(one.host)
    if (one.user !== undefined) setUser(one.user)
    setPort(String(one.port ?? 22))
    if (!named) setName(one.host)
  }

  const draft = {
    name,
    address: address.trim(),
    user: user.trim(),
    port: Number(port),
    auth,
    ...(auth === 'key' && ownKey && keyFile.trim() !== '' ? { keyFile: keyFile.trim() } : {}),
    ...(auth === 'password' && (editing === undefined || password !== '') ? { password, remember: remember && canRemember } : {}),
  }
  const remembered = editing?.remembered === true && !forgotten && auth === 'password'

  const connect = async (): Promise<void> => {
    setRunning(true)
    setProblem(undefined)
    setChecks([])
    const said = editing === undefined ? await window.geckit.hosts.check(draft) : await window.geckit.hosts.update(editing.id, draft)
    setRunning(false)
    if (!said.ok) setProblem(said.problem)
    else if (editing !== undefined) onClose()
    else {
      setAdded(said.host)
      onAdded?.(said.host)
    }
  }

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog add-host" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{editing === undefined ? 'Add a host' : `Edit ${editing.name}`}</h2>
        <div className="add-host-grid">
          <div className="field">
            <label htmlFor="host-address">Address</label>
            <input
              id="host-address"
              type="text"
              autoFocus
              spellCheck={false}
              value={address}
              placeholder="Name, IP, or a Host from SSH config"
              onChange={(event) => typed(event.target.value)}
            />
            {offered.length === 0 || added !== undefined ? null : (
              <div className="host-offers">
                {offered.map((one) => (
                  <button key={one.host} type="button" onClick={() => choose(one)}>
                    <span className="name">{one.host}</span>
                    <span className="says">{[one.user, one.address].filter((part) => part !== undefined).join('@')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="host-user">User</label>
            <input id="host-user" type="text" spellCheck={false} value={user} onChange={(event) => setUser(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="host-port">Port</label>
            <input id="host-port" type="text" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div className="field">
          <label>Sign in with</label>
          <div className="views host-auth" role="radiogroup" aria-label="Sign in with">
            <button type="button" role="radio" aria-checked={auth === 'key'} className={auth === 'key' ? 'on' : ''} onClick={() => setAuth('key')}>
              Key
            </button>
            <button type="button" role="radio" aria-checked={auth === 'password'} className={auth === 'password' ? 'on' : ''} onClick={() => setAuth('password')}>
              Password
            </button>
          </div>
          {auth === 'key' ? (
            <>
              <select value={ownKey ? 'file' : 'default'} aria-label="Key" onChange={(event) => setOwnKey(event.target.value === 'file')}>
                <option value="default">Default keys (SSH config and agent)</option>
                <option value="file">A key file</option>
              </select>
              {ownKey ? (
                <input type="text" spellCheck={false} value={keyFile} placeholder="~/.ssh/id_ed25519" aria-label="Key file" onChange={(event) => setKeyFile(event.target.value)} />
              ) : null}
              <span className="hint">A passphrase, if the key has one, is asked for when connecting. It is not kept.</span>
            </>
          ) : (
            <>
              <input
                type="password"
                value={password}
                placeholder={remembered ? 'Remembered' : editing?.auth === 'password' ? 'Asked for when connecting' : 'Password'}
                aria-label="Password"
                onChange={(event) => setPassword(event.target.value)}
              />
              {remembered ? (
                <button
                  type="button"
                  className="quiet host-forget"
                  onClick={() => {
                    window.geckit.hosts.forget(editing.id)
                    setForgotten(true)
                  }}
                >
                  Forget the password
                </button>
              ) : (
                <label className="check">
                  <input type="checkbox" checked={remember && canRemember} disabled={!canRemember} onChange={(event) => setRemember(event.target.checked)} />
                  Remember on this computer
                </label>
              )}
              <span className="hint">
                {canRemember
                  ? "Kept in the system's credential store, not in GeckIt's settings. Not remembered, it is asked for each time."
                  : 'This computer has no credential store GeckIt can use, so the password is asked for each time.'}
              </span>
            </>
          )}
        </div>
        <div className="field">
          <label htmlFor="host-name">Name</label>
          <input
            id="host-name"
            type="text"
            value={name}
            placeholder="What the board calls it"
            onChange={(event) => {
              setNamed(true)
              setName(event.target.value)
            }}
          />
        </div>
        {checks.length === 0 ? (
          <span className="hint">Uses the SSH settings already on this computer. Nothing is installed on the host.</span>
        ) : (
          <ul className="host-checks">
            {checks.map((one) => (
              <li key={one.text} className={one.failed === true ? 'failed' : one.done ? 'ok' : 'wait'}>
                {one.failed === true ? <Icon name="close" size={11} /> : one.done ? <Icon name="check" size={12} /> : <HostDot state="connecting" />}
                {one.text}
              </li>
            ))}
          </ul>
        )}
        {problem === undefined || checks.some((one) => one.failed === true) ? null : <div className="error">{problem}</div>}
        <div className="dialog-actions">
          {editing === undefined || onRemove === undefined ? null : (
            <button type="button" className="quiet danger host-remove" onClick={onRemove}>
              Remove host...
            </button>
          )}
          {added === undefined ? (
            <button type="button" className="quiet" onClick={onClose}>
              Cancel
            </button>
          ) : null}
          {added === undefined ? (
            <button type="button" className="primary" disabled={running || address.trim() === ''} onClick={() => void connect()}>
              {running ? (editing === undefined ? 'Connecting...' : 'Saving...') : editing === undefined ? 'Connect' : 'Save'}
            </button>
          ) : (
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
