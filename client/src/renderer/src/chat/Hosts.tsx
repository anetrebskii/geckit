import { useEffect, useMemo, useState } from 'react'

import type { ClaudeAccount } from '../../../shared/api'
import { besideName, parseTarget, stateLine } from '../../../shared/hosts'
import type { HostAuth, HostCheck, HostView, KnownHost } from '../../../shared/hosts'
import { Icon } from '../ui/Icon'
import { HostDot } from './HostParts'
import { useEscape, useHosts, useMinute } from './useHosts'

/** Disconnect at once when nothing is working there; otherwise ask, with the count read fresh from the host. */
export function askDisconnect(host: HostView, ask: (working: number) => void): void {
  void window.geckit.hosts.working(host.id).then((working) => {
    if (working > 0) ask(working)
    else window.geckit.hosts.disconnect(host.id)
  })
}

/**
 * Settings, Hosts: this computer first, as Local, then every host with how it
 * stands, the Claude Code there and whose plan it runs on; and Add a host.
 */
export function HostsSection(): React.JSX.Element {
  const { hosts } = useHosts()
  const [account, setAccount] = useState<ClaudeAccount | undefined>()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<HostView | undefined>()
  const [asking, setAsking] = useState<
    { readonly host: HostView; readonly what: 'disconnect' | 'remove'; readonly running: number; readonly total?: number } | undefined
  >()
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
                  {[besideName(host), host.version === undefined ? undefined : `Claude Code ${host.version}`, host.plan === undefined ? undefined : `Claude ${host.plan}`]
                    .filter((one) => one !== undefined)
                    .map((one) => ` · ${one}`)
                    .join('')}
                </span>
                {host.changedKey?.print === undefined ? null : (
                  <span className="print" title={host.changedKey.print}>
                    {host.changedKey.print}
                  </span>
                )}
              </span>
              <RowAction host={host} onDisconnect={() => askDisconnect(host, (running) => setAsking({ host, what: 'disconnect', running }))} />
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
            const host = editing
            void Promise.all([window.geckit.hosts.running(host.id), window.geckit.hosts.conversations(host.id)]).then(([running, total]) =>
              setAsking({ host, what: 'remove', running, total }),
            )
          }}
        />
      )}
      {asking === undefined ? null : (
        <Confirm
          host={asking.host}
          what={asking.what}
          running={asking.running}
          {...(asking.total === undefined ? {} : { total: asking.total })}
          onClose={() => setAsking(undefined)}
          onConfirm={() => {
            if (asking.what === 'remove') setEditing(undefined)
          }}
        />
      )}
    </>
  )
}

/** What a row's own button does, by the host's state: connect, fix what stands in the way, or disconnect. */
function RowAction({ host, onDisconnect }: { readonly host: HostView; readonly onDisconnect: () => void }): React.JSX.Element {
  const [installing, setInstalling] = useState(false)
  const [installSaid, setInstallSaid] = useState<string | undefined>()
  const [trusting, setTrusting] = useState(false)
  const [trustSaid, setTrustSaid] = useState<string | undefined>()
  if (host.changedKey !== undefined) {
    return (
      <>
        {/* Dismisses the row, not tries the drop again: as answered elsewhere, its Not now is one that lets go rather than one that retries. */}
        <button type="button" className="quiet" onClick={() => window.geckit.hosts.disconnect(host.id)}>
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
        {trustSaid === undefined ? null : (
          <span className="row-said" title={trustSaid}>
            {trustSaid}
          </span>
        )}
      </>
    )
  }
  if (host.state === 'idle') {
    return (
      <button type="button" className="quiet" onClick={() => window.geckit.hosts.connect(host.id)}>
        Connect
      </button>
    )
  }
  if (host.state === 'missing') {
    return (
      <>
        <button
          type="button"
          className="quiet"
          disabled={installing}
          onClick={() => {
            setInstalling(true)
            setInstallSaid(undefined)
            void window.geckit.hosts.install(host.id).then((done) => {
              setInstalling(false)
              setInstallSaid(done.ok ? undefined : done.text)
            })
          }}
        >
          {installing ? 'Installing...' : 'Install it'}
        </button>
        {installSaid === undefined ? null : (
          <span className="row-said" title={installSaid}>
            {installSaid}
          </span>
        )}
      </>
    )
  }
  if (host.state === 'signin') {
    return (
      <button type="button" className="quiet" onClick={() => window.geckit.hosts.terminal(host.id, 'claude /login')}>
        Sign in on {host.name}
      </button>
    )
  }
  if (host.state === 'needs') {
    return (
      <button type="button" className="quiet" onClick={() => window.geckit.hosts.reconnect(host.id)}>
        Try again
      </button>
    )
  }
  return (
    <button type="button" className="quiet" onClick={onDisconnect}>
      Disconnect
    </button>
  )
}

/** Disconnect while something works there, or Remove: asked in the words the design gives, with the count read fresh from the host. */
export function Confirm({
  host,
  what,
  running,
  total,
  onClose,
  onConfirm,
}: {
  readonly host: HostView
  readonly what: 'disconnect' | 'remove'
  /** Disconnect: how many are working or asking there now. Remove: how many runs it would stop, idle ones too. */
  readonly running: number
  /** Remove only: every conversation on the host, listed here or not, that stays behind. */
  readonly total?: number
  readonly onClose: () => void
  /** Beyond closing: what the caller still has open and should put away too. */
  readonly onConfirm?: () => void
}): React.JSX.Element {
  // Escape closes this alone: opened over Edit, it must not take that sheet down with it.
  useEscape(onClose)
  const count = `${String(running)} ${running === 1 ? 'conversation is' : 'conversations are'}`
  const kept = total ?? 0
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
            <p>
              Its {String(kept)} {kept === 1 ? 'conversation stays' : 'conversations stay'} on {host.name} and leave this list.
              {running === 0 ? '' : ` The ${String(running)} working there now ${running === 1 ? 'is' : 'are'} stopped.`}
            </p>
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
              onConfirm?.()
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
    // A stray click outside never closes this: typed fields, and a connection under way, are not lost to a mis-click. Cancel and Escape still do.
    <div className="dialog-scrim">
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
        {problem === undefined || checks.some((one) => one.failed === true) ? null : (
          <div className="error">
            {problem}
            {editing === undefined ? null : <div className="hint">{editing.name} is kept as it was.</div>}
          </div>
        )}
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
