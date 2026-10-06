import { useState } from 'react'

import type { CodexBrowser as ConnectedBrowser } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { NameField } from './NameField'

export function CodexBrowser({
  chosen,
  names,
  onPick,
  onName,
}: {
  readonly chosen: string
  readonly names: Readonly<Record<string, string>>
  readonly onPick: (id: string) => void
  readonly onName: (id: string, name: string | undefined) => void
}): React.JSX.Element {
  const [browsers, setBrowsers] = useState<readonly ConnectedBrowser[]>()
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect>()
  const [naming, setNaming] = useState<string>()

  const ask = (): void => {
    setAsking(true)
    setFailed(false)
    void Promise.resolve().then(() => window.geckit.chat.codexBrowsers()).then((found) => {
      setBrowsers(found)
      setFailed(found === undefined)
    }).catch(() => {
      setBrowsers(undefined)
      setFailed(true)
    }).finally(() => setAsking(false))
  }

  const close = (): void => {
    setAnchor(undefined)
    setNaming(undefined)
  }

  return (
    <>
      <button type="button" className="picker" title="The Chrome Codex uses" onClick={(event) => { ask(); setAnchor(event.currentTarget.getBoundingClientRect()) }}>
        Chrome<Icon name="down" size={11} />
      </button>
      {anchor === undefined ? null : (
        <Menu
          anchor={anchor}
          choices={browsers === undefined || browsers.length === 0 ? [{ value: '__empty', label: asking ? 'Asking Codex...' : failed ? 'Codex could not list browsers' : 'No connected Chrome browsers', disabled: true }] : []}
          title="Codex browsers"
          explained
          note="Codex does not give GeckIt Chrome profile names. Use the pencil to name each connection here; the name stays with that connection."
          onPick={() => undefined}
          onClose={close}
        >
          <div role="menuitem" className={`menu-item browser-row${chosen === '' ? ' on' : ''}`} onClick={() => { onPick(''); close() }}>
            <span style={{ width: 14, flexShrink: 0 }}>{chosen === '' ? <Icon name="check" size={13} /> : null}</span>
            <span className="browser-words"><span className="label">Automatic</span></span>
          </div>
          {(browsers ?? []).map((one) => {
            const own = names[one.id]
            return (
              <div key={one.id} role="menuitem" className={`menu-item browser-row${chosen === one.id ? ' on' : ''}`} onClick={() => { if (naming !== one.id) { onPick(one.id); close() } }}>
                <span style={{ width: 14, flexShrink: 0 }}>{chosen === one.id ? <Icon name="check" size={13} /> : null}</span>
                <span className="browser-words">
                  {naming === one.id ? (
                    <NameField name={own ?? one.name} className="browser-name-field" onDone={(name) => { setNaming(undefined); if (name !== undefined) onName(one.id, name === one.name ? undefined : name) }} onEmpty={() => { setNaming(undefined); onName(one.id, undefined) }} />
                  ) : <span className="label">{own ?? one.name}</span>}
                  {own === undefined ? null : <span className="says">{one.name}</span>}
                </span>
                <button type="button" className="icon-button rename" aria-label={`Name ${own ?? one.name}`} title="Name this browser" onClick={(event) => { event.stopPropagation(); setNaming(one.id) }}><Icon name="pencil" size={12} /></button>
              </div>
            )
          })}
        </Menu>
      )}
    </>
  )
}
