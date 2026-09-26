import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { onRequest } from 'firebase-functions/v2/https'

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const ALIVE = 60_000
const ROOM = /^[0-9a-f]{64}$/
const KEY_ID = defineSecret('CLOUDFLARE_TURN_KEY_ID')
const TOKEN = defineSecret('CLOUDFLARE_TURN_API_TOKEN')

initializeApp()

// The relay is Cloudflare's TURN, handed out for a day at a time, and only to a room whose Mac is waiting in it.
export const ice = onRequest({ region: 'europe-west1', cors: true, secrets: [KEY_ID, TOKEN], maxInstances: 5 }, async (request, response) => {
  const room = String(request.query.room ?? '')
  if (!ROOM.test(room)) {
    response.status(400).json({ error: 'bad ask' })
    return
  }
  const seen = (await getFirestore().doc(`rooms/${room}`).get()).get('seen')?.toMillis() ?? 0
  const keyId = KEY_ID.value()
  const token = TOKEN.value()
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
