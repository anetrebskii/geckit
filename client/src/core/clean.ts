import { runningSecrets } from './secrets'

/** Text with every saved secret's value, and its encoded forms, replaced by [secret:<name>] before it leaves this computer. */
export async function cleanText(text: string): Promise<string> {
  const secrets = runningSecrets()
  if (secrets === undefined || text === '') return text
  try { return await secrets.clean(text) } catch { return text }
}

/** The same for anything sent as JSON, such as conversation items. */
export async function cleanJson<T>(value: T): Promise<T> {
  const text = JSON.stringify(value)
  const cleaned = await cleanText(text)
  return cleaned === text ? value : JSON.parse(cleaned) as T
}
