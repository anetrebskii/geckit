import type { RemoteTrust } from './protocol'

export type SavedServer = RemoteTrust & { readonly label?: string }

export interface ConnectionStorage {
  publicKey(): Promise<string>
  sign(text: string): Promise<string>
  list(): Promise<SavedServer[]>
  remember(trust: RemoteTrust): Promise<void>
  forget(id: string): Promise<void>
  name(id: string, label: string): Promise<void>
}
