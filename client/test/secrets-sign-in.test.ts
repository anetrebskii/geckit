import { afterEach, expect, it } from 'vitest'

import type { BrokerOps } from '../src/core/broker'
import { Secrets } from '../src/core/secrets'

let made: Secrets | undefined
afterEach(() => { made?.dispose() })

const secrets = (): Secrets => {
  const broker = { list: async () => ({ secrets: [] }), prepare: async () => ({ brokerKey: 'AAAA' }) } as unknown as BrokerOps & { run: never }
  made = new Secrets({ broker: () => broker, notify: () => undefined, relay: async () => ({ status: 200, json: { expiresAt: Date.now() + 900_000, state: 'sent' } }), computer: () => 'test-mac' })
  return made
}

it('sends one link per website sign-in, since that page takes the username and the password', async () => {
  const kept = secrets()
  expect((await kept.request({ name: 'frank-linkedin', kind: 'website', places: ['https://www.linkedin.com'], taskId: 'task-a' })).link).toBeDefined()
  await expect(kept.request({ name: 'frank-linkedin-email', kind: 'website', places: ['https://www.linkedin.com'], taskId: 'task-a' })).rejects.toThrow(/frank-linkedin already asks for this sign-in/)
  expect((await kept.request({ name: 'frank-linkedin', kind: 'website', places: ['https://www.linkedin.com'], taskId: 'task-a', replace: true })).link).toBeDefined()
  expect((await kept.request({ name: 'dana-linkedin', kind: 'website', places: ['https://www.linkedin.com'], taskId: 'task-b' })).link).toBeDefined()
  expect((await kept.request({ name: 'frank-github', kind: 'website', places: ['https://github.com'], taskId: 'task-a' })).link).toBeDefined()
  expect((await kept.request({ name: 'linkedin-api', kind: 'http', places: ['api.linkedin.com'], taskId: 'task-a' })).link).toBeDefined()
})
