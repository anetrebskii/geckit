import { clipboard, ClipboardItem } from 'electron'

export async function correctionText(): Promise<string> {
  const selected = await clipboard.selection?.readText()
  return selected || await clipboard.readText()
}

export async function copyRichText(text: string, html: string): Promise<void> {
  await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })])
}
