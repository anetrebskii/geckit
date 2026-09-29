import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'

import { answered, capture, heldText, questionDue, rebuild, redactDeep } from '../shared/reporting'
import type { CrashAnswer, Roots } from '../shared/reporting'
import { getSettings, readErrors, setSettings, writeErrors } from './store'

/**
 * Errors, as Notula reports them: held here redacted, and sent to Sentry only once somebody said they may be.
 *
 * `@sentry/electron` has to start before `ready` and cannot be stopped, so it runs from launch and `beforeSend`
 * is the gate. Minidumps are a slice of the heap, which here is somebody's conversation, so they are removed, and
 * so are sessions, which would count people rather than report errors.
 */

let started = false
let asking: (() => void) | undefined

const roots = (): Roots => ({ app: [app.getAppPath(), process.resourcesPath].filter((path) => path.length > 0) })

export function startErrors(): void {
  if (started || __SENTRY_DSN__ === '') return
  try {
    Sentry.init({
      dsn: __SENTRY_DSN__,
      release: `geckit@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      sendDefaultPii: false,
      integrations: (defaults) => defaults.filter((one) => !/Minidump|Screenshots|Session/.test(one.name)),
      beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : redactDeep(crumb, roots())),
      beforeSend: (event) => {
        if (!getSettings().sendErrors) return null
        delete event.server_name
        delete event.user
        const clean = redactDeep(event, roots())
        // `geckit@1.27.0` reads as an address to the redaction, and a release nothing matches is no release.
        if (event.release === undefined) delete clean.release
        else clean.release = event.release
        return clean
      },
    })
    started = true
  } catch {
    // Nothing is sent, which is all a failed start costs.
  }
}

let writing: Promise<void> = Promise.resolve()

/**
 * One error. While sending is off it is held, redacted here: the question shows what it is asking about. While on,
 * the SDK's own handlers take the main process's, and only what a window forwards is sent from here.
 */
export function holdError(thrown: unknown, forward = false): void {
  if (getSettings().sendErrors) {
    if (forward && started) Sentry.captureException(thrown)
    return
  }
  writing = writing.then(() => {
    try {
      const before = readErrors()
      const after = capture(before, thrown, Date.now(), roots())
      writeErrors(after)
      if (!questionDue(before, false) && questionDue(after, false)) asking?.()
    } catch {
      // An error while holding an error stops here, or it holds itself.
    }
  })
}

/** An error a window caught, forwarded as its three strings. */
export function windowError(name: string, message: string, stack: string): void {
  holdError(Object.assign(new Error(message), { name, stack }), true)
}

/** Watches the main process for its own failures, and says when the question has become due. */
export function watchErrors(onQuestion: () => void): void {
  asking = onQuestion
  process.on('uncaughtException', (error) => holdError(error))
  process.on('unhandledRejection', (reason) => holdError(reason))
}

/** What would be sent, as the card shows it, when the question is due. */
export function errorQuestion(): string | undefined {
  const record = readErrors()
  if (!questionDue(record, getSettings().sendErrors)) return undefined
  return heldText(record)
}

/** Send turns the switch on, which sends what was held; Never deletes it; Later waits for more. */
export async function answerErrors(answer: CrashAnswer): Promise<void> {
  await writing
  if (answer === 'send') setSettings({ sendErrors: true })
  else writeErrors(answered(readErrors(), answer))
}

/** The switch moved: on sends what was held, off deletes it, so nothing is left to leak. */
export async function followErrors(on: boolean): Promise<void> {
  await writing
  const record = readErrors()
  writeErrors({ ...record, held: [], fresh: [] })
  if (!on || !started) return
  for (const error of record.held) {
    Sentry.withScope((scope) => {
      scope.clearBreadcrumbs()
      scope.setExtra('held since', new Date(error.at).toISOString())
      Sentry.captureException(rebuild(error))
    })
  }
}
