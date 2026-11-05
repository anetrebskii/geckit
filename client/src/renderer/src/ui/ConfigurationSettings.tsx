import { useRef, useState } from 'react'

import type { ConfigurationApi } from '../../../shared/api'

type Action = keyof ConfigurationApi
const PROGRESS = { reveal: 'Opening configuration…', export: 'Exporting configuration…', import: 'Importing configuration…' } satisfies { readonly [Key in Action]: string }
const FAILURE = { reveal: 'Could not open configuration.', export: 'Could not export configuration.', import: 'Could not import configuration.' } satisfies { readonly [Key in Action]: string }

export function ConfigurationSettings(): React.JSX.Element {
  const busy = useRef(false)
  const [action, setAction] = useState<Action>()
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)
  const perform = async (next: Action): Promise<void> => {
    if (busy.current) return
    busy.current = true
    setAction(next)
    setFailed(false)
    setStatus(PROGRESS[next])
    try {
      const completed = await window.geckit.configuration[next]()
      setStatus(completed === true ? next === 'import' ? 'Restarting GeckIt…' : 'Configuration exported.' : '')
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error)
      setFailed(true)
      setStatus(`${FAILURE[next]} ${reason}`)
    } finally {
      busy.current = false
      setAction(undefined)
    }
  }
  return (
    <section className="field configuration-settings" aria-labelledby="configuration-heading">
      <h3 id="configuration-heading">Configuration</h3>
      <p>Preferences, shortcuts, employees, libraries and enabled assistants in one file. Accounts and conversation history stay on this installation.</p>
      <div className="configuration-actions">
        <button type="button" className="quiet" disabled={action !== undefined} onClick={() => void perform('reveal')}>Open configuration</button>
        <button type="button" className="quiet" disabled={action !== undefined} onClick={() => void perform('export')}>Export…</button>
        <button type="button" className="quiet" disabled={action !== undefined} onClick={() => void perform('import')}>Import…</button>
      </div>
      {status !== '' && <p role={failed ? 'alert' : 'status'} className={failed ? 'configuration-error' : undefined}>{status}</p>}
    </section>
  )
}
