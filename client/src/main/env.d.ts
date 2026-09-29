/// <reference types="electron-vite/node" />

/** Set at build time: true when the workflow had a Developer ID to sign the Mac build with. */
declare const __SIGNED__: boolean

/** Set at build time from SENTRY_DSN; empty sends no error anywhere. */
declare const __SENTRY_DSN__: string
