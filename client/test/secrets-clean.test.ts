import { afterEach, expect, it } from 'vitest'
import { cleanJson, cleanText } from '../src/core/clean'
import { setRunningSecrets, type Secrets } from '../src/core/secrets'

afterEach(() => setRunningSecrets(undefined))

it('leaves text alone without a broker and replaces values with one', async () => {
  expect(await cleanText('key sk-canary-1')).toBe('key sk-canary-1')
  setRunningSecrets({ clean: async (text: string) => text.replaceAll('sk-canary-1', '[secret:openai-key]') } as unknown as Secrets)
  expect(await cleanText('key sk-canary-1')).toBe('key [secret:openai-key]')
  expect(await cleanJson({ items: [{ text: 'out sk-canary-1' }] })).toEqual({ items: [{ text: 'out [secret:openai-key]' }] })
})

it('sends text on when the broker fails rather than dropping it', async () => {
  setRunningSecrets({ clean: async () => { throw new Error('down') } } as unknown as Secrets)
  expect(await cleanText('plain')).toBe('plain')
})
