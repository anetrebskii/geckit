import type * as SentryBrowser from '@sentry/browser'

import type { ErrorAnswer } from '../../shared/api'
import { NO_CRASHES, answered, capture, heldText, questionDue, rebuild, redactDeep } from '../../shared/reporting'
import type { CrashRecord, Roots } from '../../shared/reporting'

/**
 * The phone's own errors, held on the phone and sent from it, as Notula's phone does: the SDK is not even loaded
 * until sending is on, and its own handlers are left out, so everything sent passes through `hold` and `beforeSend`.
 */

const KEPT = 'errors'

const roots = (): Roots => ({ app: [location.origin] })

function read(): CrashRecord {
  try {
    return { ...NO_CRASHES, ...(JSON.parse(localStorage.getItem(KEPT) ?? '{}') as Partial<CrashRecord>) }
  } catch {
    return NO_CRASHES
  }
}

const write = (record: CrashRecord): void => localStorage.setItem(KEPT, JSON.stringify(record))

type Sentry = typeof SentryBrowser

export function phoneErrors(sending: () => boolean, turnOn: () => void) {
  const heard = new Set<(report: string | undefined) => void>()
  let loaded: Promise<Sentry | undefined> | undefined

  const sdk = (): Promise<Sentry | undefined> => {
    if (__SENTRY_DSN__ === '') return Promise.resolve(undefined)
    loaded ??= import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn: __SENTRY_DSN__,
          sendDefaultPii: false,
          initialScope: { tags: { app: 'phone' } },
          integrations: (defaults) => defaults.filter((one) => !['GlobalHandlers', 'BrowserSession'].includes(one.name)),
          beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : redactDeep(crumb, roots())),
          beforeSend: (event) => {
            if (!sending()) return null
            delete event.server_name
            delete event.user
            return redactDeep(event, roots())
          },
        })
        return Sentry
      })
      .catch(() => undefined)
    return loaded
  }

  const question = (): string | undefined => {
    const record = read()
    return questionDue(record, sending()) ? heldText(record) : undefined
  }
  const say = (): void => {
    const report = question()
    for (const one of heard) one(report)
  }

  return {
    question: (): Promise<string | undefined> => Promise.resolve(question()),
    onQuestion: (said: (report: string | undefined) => void): (() => void) => {
      heard.add(said)
      return () => heard.delete(said)
    },
    answer: (answer: ErrorAnswer): void => {
      if (answer === 'send') turnOn()
      else write(answered(read(), answer))
      say()
    },
    hold: (name: string, message: string, stack: string): void => {
      const error = Object.assign(new Error(message), { name, stack })
      if (sending()) {
        void sdk().then((Sentry) => Sentry?.captureException(error))
        return
      }
      const before = read()
      const after = capture(before, error, Date.now(), roots())
      write(after)
      if (!questionDue(before, false) && questionDue(after, false)) say()
    },
    /** The switch moved: on sends what was held, off deletes it. */
    follow: (on: boolean): void => {
      const record = read()
      write({ ...record, held: [], fresh: [] })
      say()
      if (!on) return
      void sdk().then((Sentry) => {
        for (const error of record.held) Sentry?.captureException(rebuild(error), { extra: { 'held since': new Date(error.at).toISOString() } })
      })
    },
  }
}
