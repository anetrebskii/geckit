import { useEffect, useState } from 'react'

import type { Settings } from '../../../shared/api'
import { ON_PHONE } from '../on-phone'
import { Icon } from './Icon'
import { UpdateNotice } from './UpdateNotice'

/**
 * The two questions GeckIt asks, as Notula asks them: a card in the corner, never a sheet over the work. No and
 * Never weigh the same as Yes and Send; closing a card is Later, never yes.
 */

function useErrorQuestion(): string | undefined {
  const [report, setReport] = useState<string>()
  useEffect(() => window.geckit.errors.onQuestion(setReport), [])
  useEffect(() => {
    void window.geckit.errors.question().then(setReport)
  }, [])
  return report
}

export function Consent({
  settings,
  change,
}: {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
}): React.JSX.Element | null {
  const report = useErrorQuestion()
  const counting = !settings.analyticsAsked && (settings.welcomed || ON_PHONE)
  const cards = (
    <>
      {report === undefined ? null : <ErrorCard report={report} />}
      {counting ? <CountingCard change={change} /> : null}
    </>
  )
  // On the phone over the tab bar; on the computer in the corner the update notice stands in, above it.
  const any = report !== undefined || counting
  if (ON_PHONE)
    return (
      <>
        {any ? <div className="consent-cards">{cards}</div> : null}
        <UpdateNotice />
      </>
    )
  return <UpdateNotice>{any ? cards : undefined}</UpdateNotice>
}

function ErrorCard({ report }: { readonly report: string }): React.JSX.Element {
  const answer = window.geckit.errors.answer
  return (
    <div className="notice consent">
      <span className="state" />
      <span className="lines">
        <span className="title">GeckIt hit an error</span>
        <span className="body">
          Nothing was lost. May GeckIt send the error and where it happened, so it gets fixed? Never your conversations, files, folders or keys.
        </span>
        <details className="reveal">
          <summary>What would be sent</summary>
          <pre>{report}</pre>
        </details>
        <span className="actions">
          <button type="button" className="quiet" onClick={() => answer('never')}>
            Never
          </button>
          <button type="button" className="quiet" onClick={() => answer('later')}>
            Later
          </button>
          <button type="button" className="primary" onClick={() => answer('send')}>
            Send
          </button>
        </span>
      </span>
      <button type="button" className="icon-button" aria-label="Later" title="Later" onClick={() => answer('later')}>
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

function CountingCard({ change }: { readonly change: (change: Partial<Settings>) => void }): React.JSX.Element {
  return (
    <div className="notice consent">
      <span className="state" />
      <span className="lines">
        <span className="title">May GeckIt count what gets used?</span>
        <span className="body">
          The name of what was used, such as correct or chatSent, the version, and a random id for this {ON_PHONE ? 'phone' : 'computer'}, sent to Google Analytics. Never text, paths or keys.
        </span>
        <span className="actions">
          <button type="button" className="quiet" onClick={() => change({ analytics: false, analyticsAsked: true })}>
            No
          </button>
          <button type="button" className="primary" onClick={() => change({ analytics: true, analyticsAsked: true })}>
            Yes
          </button>
        </span>
      </span>
    </div>
  )
}
