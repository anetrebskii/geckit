import { CORS, json, ROOM } from './lib/http.js'

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const ALIVE = 60_000

// The relay is Cloudflare's TURN, handed out for a day at a time, and only to a room whose Mac is waiting in it.
export default async function (request, { db }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const room = new URL(request.url).searchParams.get('room') ?? ''
  if (!ROOM.test(room)) return json({ error: 'bad ask' }, 400)
  const seen = db.prepare('SELECT seen FROM rooms WHERE room = ?').get(room)?.seen ?? 0
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN
  if (Date.now() - seen > ALIVE || !keyId || !token) return json({ iceServers: STUN, relay: false })
  const answer = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: 86_400 }),
  })
  if (!answer.ok) return json({ iceServers: STUN, relay: false })
  const { iceServers } = await answer.json()
  return json({ iceServers: [...STUN, ...iceServers], relay: true })
}
