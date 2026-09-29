import { describeError } from '../../shared/reporting'

/** A window's own failures, handed to whoever holds them: main on the Mac, the phone's own store on the phone. */
export function watchWindowErrors(): void {
  const hold = (thrown: unknown): void => {
    const { message, stack } = describeError(thrown)
    const split = /^([A-Za-z]*Error): ([\s\S]*)$/.exec(message)
    window.geckit.errors.hold(split?.[1] ?? 'Error', split?.[2] ?? message, stack)
  }
  window.addEventListener('error', (event) => hold(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => hold(event.reason))
}
