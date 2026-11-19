import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mock, test } from 'node:test'

const records = new Map()
let readsFail = false
const db = {
  collection: (collection) => ({
    doc: (id) => ({
      id: `${collection}/${id}`,
      async get() {
        if (readsFail) throw new Error('Firestore unavailable')
        const data = records.get(this.id)
        return { exists: data !== undefined, get: (field) => data?.[field] }
      },
    }),
  }),
  runTransaction: async (update) => update({
    get: (ref) => ref.get(),
    set: (ref, data) => records.set(ref.id, data),
  }),
}
mock.module('firebase-admin/firestore', { namedExports: { getFirestore: () => db, Timestamp: class {} } })
mock.module('firebase-functions/v2/https', { namedExports: { onRequest: (_options, handler) => handler } })

const delivered = []
mock.module('node:http2', { namedExports: {
  connect: () => Object.assign(new EventEmitter(), {
    close() {},
    request: (headers) => Object.assign(new EventEmitter(), {
      setEncoding() {},
      end(body) {
        delivered.push({ path: headers[':path'], notification: JSON.parse(body) })
        this.emit('response', { ':status': 200 })
        this.emit('end')
      },
    }),
  }),
} })

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
process.env.APNS_TEAM_ID = 'fixture'
process.env.APNS_KEY_ID = 'fixture'
process.env.APNS_KEY = privateKey.export({ format: 'pem', type: 'pkcs8' })

const { push, pushRoute } = await import('../index.js')
const token = 'f'.repeat(64)
const a = 'a'.repeat(64)
const b = 'b'.repeat(64)

async function post(handler, body) {
  const response = {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this },
    json(value) { this.body = value },
    end() {},
  }
  await handler({ method: 'POST', body }, response)
  return { code: response.code, body: response.body }
}

test('push follows the saved room, ignores older updates and stops after removal', async () => {
  const notice = (room) => post(push, { token, room, box: 'encrypted' })
  const select = (room, revision) => post(pushRoute, { token, room, revision })
  assert.equal((await notice(a)).body.sent, true)
  assert.equal((await select(a, 100)).code, 204)
  assert.equal((await notice(a)).body.sent, true)
  assert.equal((await notice(b)).body.sent, false)
  assert.equal((await select(b, 102)).code, 204)
  assert.equal((await select(a, 101)).code, 204)
  assert.deepEqual((await notice(a)).body, { sent: false, gone: false })
  assert.equal((await notice(b)).body.sent, true)
  assert.equal((await select(null, 103)).code, 204)
  assert.equal((await notice(b)).body.sent, false)
  assert.equal((await select(a, 102)).code, 204)
  assert.equal((await notice(a)).body.sent, false)
  assert.equal((await select(a, 104)).code, 204)
  assert.equal((await notice(a)).body.sent, true)
  assert.deepEqual(delivered.map(({ notification }) => notification.room), [a, a, b, a])
  assert.equal((await post(push, { token: 'e'.repeat(64), room: b, box: 'encrypted' })).body.sent, true)
})

test('rejects malformed route requests and keeps alerts off Apple when routing is unavailable', async () => {
  assert.equal((await post(pushRoute, { token, room: [a], revision: 105 })).code, 400)
  assert.equal((await post(pushRoute, { token, room: a, revision: '105' })).code, 400)
  const before = delivered.length
  readsFail = true
  try {
    assert.equal((await post(pushRoute, { token, room: b, revision: 105 })).code, 503)
    assert.equal((await post(push, { token, room: a, box: 'encrypted' })).code, 502)
    assert.equal(delivered.length, before)
  } finally {
    readsFail = false
  }
})
