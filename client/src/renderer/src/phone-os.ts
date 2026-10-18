/**
 * The phone the app runs on, as its settings name it and its system; the app on
 * Android says so, and anything else is an iPhone. Read when shown, not when a
 * module loads, which may be before the app has said.
 */
export const phoneOs = (): { readonly phone: string; readonly system: string } =>
  (window as { geckitPhoneOs?: string }).geckitPhoneOs === 'android' ? { phone: 'This phone', system: 'Android' } : { phone: 'iPhone', system: 'iOS' }
