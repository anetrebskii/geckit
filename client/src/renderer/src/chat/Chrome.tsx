import { useState } from 'react'

import type { Browser } from '../../../shared/api'
import { Picker } from '../ui/Menu'

/**
 * Which Chrome Claude drives, under the field: every browser the extension is
 * signed in to, asked when the menu is opened. A profile is its own browser,
 * so two profiles with the extension are two lines here. Picking one holds
 * for every conversation, as /chrome in a terminal does.
 */
export function Chrome({ root, id }: { readonly root: string; readonly id: string | undefined }): React.JSX.Element {
  const [said, setSaid] = useState<{ readonly root: string; readonly browsers: readonly Browser[] | undefined }>()
  const [asking, setAsking] = useState(false)
  const browsers = said?.root === root ? said.browsers : undefined

  const ask = (pick?: string): void => {
    setAsking(true)
    void window.geckit.chat.browsers(root, id, pick).then((got) => {
      setSaid({ root, browsers: got })
      setAsking(false)
    })
  }

  return (
    <Picker
      label="Chrome"
      tip="The Chrome Claude drives"
      title="Claude in Chrome"
      explained
      choices={
        browsers === undefined || browsers.length === 0
          ? [
              {
                value: '__asking',
                label: asking ? 'Asking Claude Code...' : 'No browser signed in to the extension',
              },
            ]
          : browsers.map((one) => ({
              value: one.id,
              label: one.name,
              says: asking ? 'asking...' : one.current ? 'in use' : '',
              on: one.current,
            }))
      }
      note="A Chrome profile is its own browser. The one picked is used by every conversation."
      onOpen={() => ask()}
      onPick={(value) => {
        if (value !== '__asking' && browsers?.some((one) => one.id === value && !one.current) === true) ask(value)
      }}
    />
  )
}
