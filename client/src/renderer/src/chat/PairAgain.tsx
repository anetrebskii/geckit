import { useSyncExternalStore } from 'react'
import { macs } from '../macs'
import { pairAgain } from '../pair-again'

export const PAIR_AGAIN_BODY = 'This phone is paired the old way. To send messages and answer questions from here, pair it again. Run geckit pair on the computer, then scan the code.'

export const usePairAgain = (): { readonly needed: boolean; readonly shown: boolean } => {
  const needed = useSyncExternalStore(pairAgain.on, pairAgain.needed)
  const shown = useSyncExternalStore(pairAgain.on, pairAgain.shown)
  return { needed, shown }
}

/** At the top of the board while this phone can only read what the computer has. */
export function PairAgain(): React.JSX.Element | null {
  const { shown } = usePairAgain()
  if (!shown) return null
  return (
    <div className="notices" aria-live="polite">
      <div className="notice global asks" role="status">
        <span className="state" />
        <span className="lines">
          <span className="title">Pair this phone again</span>
          <span className="body">{PAIR_AGAIN_BODY}</span>
          <span className="notice-actions">
            <button type="button" className="primary" onClick={() => macs()?.add()}>Scan code</button>
            <button type="button" className="quiet" onClick={() => pairAgain.hide()}>Not now</button>
          </span>
        </span>
      </div>
    </div>
  )
}
