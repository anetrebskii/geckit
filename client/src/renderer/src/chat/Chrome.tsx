import { useState } from 'react'

import type { Browser } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { NameField } from './NameField'

/**
 * Which Chrome Claude drives, under the field: every browser the extension is
 * signed in to, asked when the menu is opened. A profile is its own browser,
 * so two profiles with the extension are two lines here. Picking one holds
 * for every conversation, as /chrome in a terminal does. The extension calls
 * them Browser 1, Browser 2; a name given here is GeckIt's own, kept by the
 * browser's id and told to Claude in GECKIT.md. The design is
 * docs/ux/chrome-names.md.
 */
export function Chrome({
  root,
  id,
  names,
  onName,
}: {
  readonly root: string
  readonly id: string | undefined
  readonly names: Readonly<Record<string, string>>
  readonly onName: (id: string, name: string | undefined) => void
}): React.JSX.Element {
  const [said, setSaid] = useState<{ readonly root: string; readonly browsers: readonly Browser[] | undefined }>()
  const [asking, setAsking] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
  const [naming, setNaming] = useState<string>()
  const browsers = said?.root === root ? said.browsers : undefined

  const ask = (pick?: string): void => {
    setAsking(true)
    void window.geckit.chat.browsers(root, id, pick).then((got) => {
      setSaid({ root, browsers: got })
      setAsking(false)
    })
  }

  const close = (): void => {
    setAnchor(undefined)
    setNaming(undefined)
  }

  return (
    <>
      <button
        type="button"
        className="picker"
        title="The Chrome Claude drives"
        onClick={(event) => {
          ask()
          setAnchor(event.currentTarget.getBoundingClientRect())
        }}
      >
        Chrome
        <Icon name="down" size={11} />
      </button>
      {anchor === undefined ? null : (
        <Menu
          anchor={anchor}
          choices={
            browsers === undefined || browsers.length === 0
              ? [
                  {
                    value: '__asking',
                    label: asking ? 'Asking Claude Code...' : 'No browser signed in to the extension',
                    disabled: true,
                  },
                ]
              : []
          }
          title="Claude in Chrome"
          explained
          note="A Chrome profile is its own browser. The one picked is used by every conversation. Names given here are GeckIt's own."
          onPick={() => undefined}
          onClose={close}
        >
          {(browsers ?? []).map((one) => {
            const own = names[one.id]
            const under = [own === undefined ? '' : one.name, one.current ? 'in use' : ''].filter((part) => part !== '').join(' · ')
            return (
              <div
                key={one.id}
                role="menuitem"
                className={`menu-item browser-row${one.current ? ' on' : ''}`}
                onClick={() => {
                  if (naming === one.id) return
                  if (!one.current) ask(one.id)
                  close()
                }}
              >
                <span style={{ width: 14, flexShrink: 0 }}>{one.current ? <Icon name="check" size={13} /> : null}</span>
                <span className="browser-words">
                  {naming === one.id ? (
                    <NameField
                      name={own ?? one.name}
                      className="browser-name-field"
                      onDone={(name) => {
                        setNaming(undefined)
                        if (name !== undefined) onName(one.id, name === one.name ? undefined : name)
                      }}
                      onEmpty={() => {
                        setNaming(undefined)
                        onName(one.id, undefined)
                      }}
                    />
                  ) : (
                    <span className="label">{own ?? one.name}</span>
                  )}
                  {under === '' ? null : <span className="says">{asking ? 'asking...' : under}</span>}
                </span>
                <button
                  type="button"
                  className="icon-button rename"
                  aria-label={`Name ${own ?? one.name}`}
                  title="Name this browser"
                  onClick={(event) => {
                    event.stopPropagation()
                    setNaming(one.id)
                  }}
                >
                  <Icon name="pencil" size={12} />
                </button>
              </div>
            )
          })}
        </Menu>
      )}
    </>
  )
}
