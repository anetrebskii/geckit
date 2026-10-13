import { useId, useRef, useState } from 'react'

import type { Settings } from '../../../shared/api'
import type { Geckit } from '../../../preload'
import { parseVpnIps, VPN_IP_CONFIGURATION_ERROR } from '../../../shared/vpn-ip'
import { Cell, Page, Switch } from '../chat/PhoneKit'

type VpnSettings = Pick<Settings, 'vpnIpCheck' | 'vpnAllowedIps'>

interface Props {
  readonly settings: VpnSettings
  readonly save?: Geckit['settings']['set']
  readonly phone?: boolean
}

export function VpnIpSettings({ settings, save: persist = window.geckit.settings.set, phone = false }: Props): React.JSX.Element {
  const id = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const writing = useRef(false)
  const savedText = settings.vpnAllowedIps.join('\n')
  const text = draft ?? savedText
  const savedAddresses = parseVpnIps(savedText)
  const invalidSaved = savedAddresses.error !== undefined || savedAddresses.ips.length === 0
  const issue = error ?? (settings.vpnIpCheck && invalidSaved ? VPN_IP_CONFIGURATION_ERROR : undefined)
  const write = async (partial: Partial<VpnSettings>, addresses: boolean): Promise<void> => {
    if (writing.current) return
    writing.current = true
    setPending(true)
    setSaved(false)
    try {
      await persist(partial)
      setError(undefined)
      if (addresses) {
        setDraft(undefined)
        setSaved(true)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save VPN IP check. Try again.')
    } finally {
      writing.current = false
      setPending(false)
    }
  }
  const toggle = (on: boolean): void => {
    if (on && invalidSaved) {
      setError(VPN_IP_CONFIGURATION_ERROR)
      field.current?.focus()
      return
    }
    setError(undefined)
    void write({ vpnIpCheck: on }, false)
  }
  const save = (): void => {
    const parsed = parseVpnIps(text)
    if (parsed.error !== undefined) {
      setError(parsed.error)
      return
    }
    if (settings.vpnIpCheck && parsed.ips.length === 0) {
      setError(VPN_IP_CONFIGURATION_ERROR)
      return
    }
    void write({ vpnAllowedIps: parsed.ips }, true)
  }

  return (
    <section className={`vpn-settings${phone ? ' phone' : ''}`} aria-busy={pending} aria-label={phone ? 'VPN IP check' : undefined} aria-labelledby={phone ? undefined : `${id}-title`}>
      {phone ? null : <h3 id={`${id}-title`}>VPN IP check</h3>}
      {phone ? (
        <div className="phone-group">
          <Cell label="Check public IP before sending">
            <Switch on={settings.vpnIpCheck} label="Check public IP before sending" aria-describedby={`${id}-periodic ${id}-scope`} disabled={pending} onChange={toggle} />
          </Cell>
        </div>
      ) : (
        <label className="assistant-option">
          <span>Check public IP before sending</span>
          <input className="assistant-toggle" type="checkbox" role="switch" aria-describedby={`${id}-periodic ${id}-scope`} checked={settings.vpnIpCheck} disabled={pending} onChange={(event) => toggle(event.target.checked)} />
        </label>
      )}
      <span id={`${id}-periodic`} className={`vpn-note${phone ? ' phone-note' : ''}`}>When enabled, checks every 10 seconds while sessions are active. If verification fails, GeckIt interrupts active sessions and holds queued work until you retry.</span>
      <div className={`vpn-addresses${phone ? ' phone-group' : ''}`}>
        <label htmlFor={`${id}-addresses`}>Approved public IP addresses</label>
        <textarea id={`${id}-addresses`} ref={field} rows={4} value={text} disabled={pending} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-describedby={`${id}-help${issue === undefined ? '' : ` ${id}-error`}`} aria-invalid={issue === undefined ? undefined : true} onChange={(event) => { setDraft(event.target.value); setError(undefined); setSaved(false) }} />
        <span id={`${id}-help`} className="vpn-note">One public IPv4 or IPv6 address per line.</span>
        <div className="vpn-actions">
          <button type="button" className="quiet" disabled={pending || text === savedText} onClick={save}>{pending ? 'Saving...' : 'Save addresses'}</button>
          <span role="status">{pending ? 'Saving...' : saved ? 'Addresses saved.' : ''}</span>
        </div>
        {issue === undefined ? null : <span id={`${id}-error`} className="vpn-alert" role="alert">{issue}</span>}
      </div>
      <span id={`${id}-scope`} className={`vpn-note${phone ? ' phone-note' : ''}`}>Checks the computer running GeckIt, including requests from your phone. Does not verify an SSH host's public IP. Periodic checks cannot prevent traffic between checks; use your VPN's kill switch for that.</span>
      <span className={`vpn-note${phone ? ' phone-note' : ''}`}>Public IP checked using ipify (IPv4 and IPv6). No conversation content is sent to this service.</span>
    </section>
  )
}

export function PhoneVpnSettings({ settings, save, back, onBack }: Omit<Props, 'phone'> & Pick<Parameters<typeof Page>[0], 'back' | 'onBack'>): React.JSX.Element {
  return <Page title="VPN IP check" {...(back === undefined ? {} : { back })} {...(onBack === undefined ? {} : { onBack })}><VpnIpSettings settings={settings} {...(save === undefined ? {} : { save })} phone /></Page>
}
