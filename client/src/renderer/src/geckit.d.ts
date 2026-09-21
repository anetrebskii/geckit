import type { Geckit } from '../../preload'

declare global {
  interface Window {
    readonly geckit: Geckit
  }
}
