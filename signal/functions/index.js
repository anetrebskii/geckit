import { createPrivateKey, sign } from 'node:crypto'
import { connect } from 'node:http2'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const ALIVE = 60_000
const ROOM = /^[0-9a-f]{64}$/

initializeApp()

// The relay is Cloudflare's TURN, handed out for a day at a time, and only to a room whose Mac is waiting in it; with no Cloudflare key set, only STUN.
export const ice = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5 }, async (request, response) => {
  const room = String(request.query.room ?? '')
  if (!ROOM.test(room)) {
    response.status(400).json({ error: 'bad ask' })
    return
  }
  const seen = (await getFirestore().doc(`rooms/${room}`).get()).get('seen')?.toMillis() ?? 0
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN
  if (Date.now() - seen > ALIVE || !keyId || !token) {
    response.json({ iceServers: STUN, relay: false })
    return
  }
  const answer = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: 86_400 }),
  })
  if (!answer.ok) {
    response.json({ iceServers: STUN, relay: false })
    return
  }
  const { iceServers } = await answer.json()
  response.json({ iceServers: [...STUN, ...iceServers], relay: true })
})

const TOKEN = /^[0-9a-f]{64,200}$/
const BOX = /^[A-Za-z0-9_-]{1,3000}$/
const TOPIC = 'com.anetrebskii.geckit'
// Apple takes a signed token for up to an hour and refuses one made again more often than every twenty minutes.
const SIGNED_FOR = 40 * 60_000
// Each key reaches only GeckIt and only one of Apple's two services, so one is kept for each.
const HOSTS = { production: 'api.push.apple.com', sandbox: 'api.sandbox.push.apple.com' }
const KEYS = {
  production: { key: 'APNS_KEY', id: 'APNS_KEY_ID' },
  sandbox: { key: 'APNS_SANDBOX_KEY', id: 'APNS_SANDBOX_KEY_ID' },
}
const signed = {}

const base64url = (data) => Buffer.from(data).toString('base64url')

const hasKey = (where) => Boolean(process.env[KEYS[where].key] && process.env[KEYS[where].id])

function apnsJwt(where) {
  const held = signed[where]
  if (held !== undefined && Date.now() - held.at < SIGNED_FOR) return held.jwt
  const key = createPrivateKey((process.env[KEYS[where].key] ?? '').replaceAll('\\n', '\n'))
  const head = base64url(JSON.stringify({ alg: 'ES256', kid: process.env[KEYS[where].id] }))
  const claims = base64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }))
  const signature = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  signed[where] = { jwt: `${head}.${claims}.${signature}`, at: Date.now() }
  return signed[where].jwt
}

function toApple(where, token, payload) {
  return new Promise((done, failed) => {
    const session = connect(`https://${HOSTS[where]}`)
    session.on('error', failed)
    const request = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${apnsJwt(where)}`,
      'apns-topic': TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    })
    let status = 0
    let body = ''
    request.on('response', (headers) => {
      status = Number(headers[':status'])
    })
    request.setEncoding('utf8')
    request.on('data', (part) => {
      body += part
    })
    request.on('end', () => {
      session.close()
      done({ status, reason: body === '' ? '' : (JSON.parse(body).reason ?? '') })
    })
    request.on('error', failed)
    request.end(JSON.stringify(payload))
  })
}

// What Google and Apple carry is only that there is something: the notice itself is sealed with the key in the QR code, and the phone opens it.
export const push = onRequest({ region: 'europe-west1', maxInstances: 5 }, async (request, response) => {
  const { room, token, box } = request.body ?? {}
  if (request.method !== 'POST' || !ROOM.test(room ?? '') || !TOKEN.test(token ?? '') || !BOX.test(box ?? '')) {
    response.status(400).json({ error: 'bad ask' })
    return
  }
  const where = ['production', 'sandbox'].filter(hasKey)
  if (where.length === 0 || !process.env.APNS_TEAM_ID) {
    response.status(503).json({ error: 'no push key' })
    return
  }
  const payload = { aps: { alert: { title: 'GeckIt', body: 'A conversation has something for you' }, sound: 'default', 'mutable-content': 1 }, room, box }
  try {
    // A token from a build run from Xcode is only known to Apple's sandbox.
    let sent = { status: 0, reason: '' }
    for (const one of where) {
      sent = await toApple(one, token, payload)
      if (sent.reason !== 'BadDeviceToken') break
    }
    const gone = sent.status === 410 || sent.reason === 'BadDeviceToken' || sent.reason === 'Unregistered'
    response.status(sent.status === 200 ? 200 : gone ? 410 : 502).json({ sent: sent.status === 200, gone, reason: sent.reason })
  } catch (error) {
    response.status(502).json({ sent: false, gone: false, reason: String(error) })
  }
})
