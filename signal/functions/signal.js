import { CORS, json, ROOM } from './lib/http.js'

// A room is the hash of the key in the QR code; what is kept in it is sealed with that key, so this only passes it on.
const KEPT = 60_000
const HOLD = 10_000
const STEP = 400
const ID = /^[0-9a-z-]{1,64}$/
const KINDS = new Set(['offer', 'answer'])

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

export default async function (request, { db }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  db.prepare('DELETE FROM signals WHERE at < ?').run(Date.now() - KEPT)

  if (request.method === 'POST') {
    const { room, kind, id, box } = await request.json()
    if (!ROOM.test(room) || !KINDS.has(kind) || !ID.test(id) || typeof box !== 'string' || box.length > 65_536) {
      return json({ error: 'bad signal' }, 400)
    }
    db.prepare('INSERT INTO signals (room, id, kind, box, at) VALUES (?, ?, ?, ?, ?)').run(room, id, kind, box, Date.now())
    return json({ ok: true })
  }

  const url = new URL(request.url)
  const room = url.searchParams.get('room') ?? ''
  const kind = url.searchParams.get('kind') ?? ''
  const id = url.searchParams.get('id')
  const after = Number(url.searchParams.get('after') ?? 0)
  if (!ROOM.test(room) || !KINDS.has(kind) || (id !== null && !ID.test(id))) return json({ error: 'bad ask' }, 400)
  // The Mac is the one waiting for offers; that it is waiting is what lets a phone in the same room ask for a relay.
  if (kind === 'offer') {
    db.prepare('INSERT INTO rooms (room, seen) VALUES (?, ?) ON CONFLICT (room) DO UPDATE SET seen = excluded.seen').run(room, Date.now())
  }
  const ask =
    id === null
      ? db.prepare('SELECT id, box, at FROM signals WHERE room = ? AND kind = ? AND at >= ? ORDER BY at')
      : db.prepare('SELECT id, box, at FROM signals WHERE room = ? AND kind = ? AND at >= ? AND id = ? ORDER BY at')
  const until = Date.now() + HOLD
  for (;;) {
    const found = id === null ? ask.all(room, kind, after) : ask.all(room, kind, after, id)
    if (found.length > 0 || Date.now() >= until) return json({ signals: found, at: Date.now() })
    await sleep(STEP)
  }
}
