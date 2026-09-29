/// <reference types="vite/client" />

import type { Geckit } from '../../preload'

declare global {
  interface Window {
    readonly geckit: Geckit
  }
}

declare global {
  /** Set at build time from SENTRY_DSN; empty sends no error anywhere. */
  const __SENTRY_DSN__: string
}
