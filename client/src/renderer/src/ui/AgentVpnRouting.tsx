import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

type Playback = 'playing' | 'paused' | 'static'

export function AgentVpnRouting(): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [connected, setConnected] = useState(true)
  const [playback, setPlayback] = useState<Playback>(() => reduced ? 'static' : 'playing')
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const [cycle, setCycle] = useState(0)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = (): void => {
      setReduced(preference.matches)
      if (preference.matches) setPlayback('static')
    }
    const visibility = (): void => setHidden(document.hidden)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry !== undefined && entry.isIntersecting && entry.intersectionRatio >= 0.1), { threshold: [0, 0.1] })
    const element = stage.current
    if (element !== null) observer.observe(element)
    preference.addEventListener('change', changed)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      preference.removeEventListener('change', changed)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  const running = playback === 'playing' && visible && !hidden && !reduced
  const motionLabel = playback === 'static' ? 'Replay' : playback === 'paused' ? 'Resume' : 'Pause'
  const choose = (next: boolean): void => { setConnected(next); setPlayback('static') }
  const motion = (): void => {
    if (playback === 'static') { setConnected(true); setCycle((was) => was + 1); setPlayback('playing') }
    else setPlayback(playback === 'playing' ? 'paused' : 'playing')
  }
  return <section className={`agent-vpn-routing${connected ? '' : ' disconnected'}${playback === 'static' ? '' : ' playback'}${running ? ' running' : ''}${reduced ? ' reduced' : ''}`} aria-label="VPN routing illustration">
    <div className="agent-vpn-routing-heading"><h3>How protection will work</h3><p>Illustration only. This is not your connection status.</p></div>
    <div className="agent-vpn-routing-stage" ref={stage}>
      <div className="agent-vpn-routing-path" key={cycle} aria-hidden="true">
        <div className="agent-vpn-routing-node"><span><Icon name="terminal" size={22} /></span><strong>Agents &amp; tools</strong>{connected ? null : <small>Waiting for VPN</small>}</div>
        <div className="agent-vpn-routing-wire first">
          <span className="agent-vpn-routing-packet request"><span /></span><span className="agent-vpn-routing-packet reply"><span /></span>
          <span className="agent-vpn-routing-block"><Icon name="blocked" size={16} /></span>
        </div>
        <div className="agent-vpn-routing-node"><span><Icon name="link" size={22} /></span><strong>AmneziaWG</strong></div>
        <div className="agent-vpn-routing-wire second"><span className="agent-vpn-routing-packet request"><span /></span><span className="agent-vpn-routing-packet reply"><span /></span></div>
        <div className="agent-vpn-routing-node"><span><Icon name="display" size={22} /></span><strong>Internet</strong></div>
        <span className="agent-vpn-routing-clock" onAnimationEnd={(event) => {
          if (event.animationName === 'agent-vpn-routing-clock' && !reduced) { setConnected(false); setPlayback('static') }
        }} />
      </div>
    </div>
    <p className="agent-vpn-routing-caption">{connected ? 'Agents and tools reach AI providers and websites through the VPN.' : 'VPN disconnected. Agents have no internet access until it reconnects.'}</p>
    <div className="agent-vpn-routing-controls">
      <div className="views" role="group" aria-label="Illustration state">
        <button type="button" className={connected ? 'on' : undefined} aria-pressed={connected} onClick={() => choose(true)}>Connected</button>
        <button type="button" className={connected ? undefined : 'on'} aria-pressed={!connected} onClick={() => choose(false)}>Disconnected</button>
      </div>
      {reduced ? null : <button type="button" className="quiet" aria-label={`${motionLabel} routing illustration`} onClick={motion}>{motionLabel}</button>}
    </div>
  </section>
}
