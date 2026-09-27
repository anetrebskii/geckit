import { useState } from 'react'

import type { HostPrompt, HostView } from '../../../shared/hosts'
import { tap } from '../tap'
import { Sheet } from '../ui/Sheet'
import { Switch } from './PhoneKit'
import { computerName } from './PhoneHosts'

/**
 * What a host asks while the computer connects to it, as a sheet over whatever
 * the phone has open: a password, a passphrase, a code, or trust in a key it has
 * never seen. The answer goes to the computer, which hands it to ssh, so the
 * question answered here or there goes from both. See docs/ux/remote-hosts-phone.md.
 */
export function PhoneHostSheet({ prompt, host }: { readonly prompt: HostPrompt; readonly host: HostView | undefined }): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [remember, setRemember] = useState(true)
  const typed = prompt.kind !== 'trust'
  const canRemember = prompt.kind === 'password' && host?.canRemember === true
  const computer = computerName()
  const send = (): void => {
    if (typed && answer === '') return
    tap('done')
    window.geckit.hosts.answer({ id: prompt.id, answer, ...(prompt.kind === 'password' ? { remember: remember && canRemember } : {}) })
  }
  const notNow = (): void => window.geckit.hosts.answer({ id: prompt.id })
  // A key is asked about in two parts, as the design has it: which host, then the fingerprint on a line of its own to compare.
  const print = prompt.kind === 'trust' ? prompt.detail : undefined
  const words = prompt.kind === 'trust' && print !== undefined ? `This is the first connection to ${host?.name ?? prompt.host}.` : prompt.text

  return (
    <Sheet onClose={notNow} cancel={false} className="host-sheet">
      <div className="host-sheet-ask">{words}</div>
      {print === undefined ? null : <div className="host-sheet-print">{print}</div>}
      {typed ? (
        <div className="sheet-field">
          <input
            type={prompt.kind === 'code' || prompt.kind === 'other' ? 'text' : 'password'}
            value={answer}
            autoFocus
            autoComplete="off"
            enterKeyHint="go"
            placeholder={prompt.kind === 'code' ? 'Code' : prompt.kind === 'passphrase' ? 'Passphrase' : prompt.kind === 'other' ? 'Answer' : 'Password'}
            aria-label={prompt.kind === 'code' ? 'Code' : prompt.kind === 'passphrase' ? 'Passphrase' : 'Password'}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send()
            }}
          />
        </div>
      ) : null}
      {canRemember ? (
        <div className="sheet-list host-sheet-remember">
          <div className="sheet-option">
            <span>Remember on {computer}</span>
            <Switch on={remember} label={`Remember on ${computer}`} onChange={setRemember} />
          </div>
        </div>
      ) : null}
      {/* Trusting a key weighs the same as not: neither is filled, as iOS asks whether to trust a computer. */}
      <button type="button" className={typed ? 'host-sheet-go' : 'host-sheet-go even'} disabled={typed && answer === ''} onPointerDown={(event) => event.preventDefault()} onClick={send}>
        {prompt.kind === 'trust' ? 'Trust' : prompt.kind === 'passphrase' ? 'Unlock' : prompt.kind === 'code' ? 'Send' : 'Sign in'}
      </button>
      <button type="button" className="host-sheet-not" onClick={notNow}>
        Not now
      </button>
    </Sheet>
  )
}
