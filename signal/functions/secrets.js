import { createHash } from 'node:crypto'

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'

const ID = /^[A-Za-z0-9_-]{22}$/
const KEY = /^[A-Za-z0-9_-]{22,64}$/
const B64 = /^[A-Za-z0-9_-]{1,40000}$/
const LIFETIMES = ['task', 'once', '15m', '1h', '1d', 'keep']
const KINDS = ['website', 'http', 'command', 'ssh']
const LIFE = 15 * 60_000

const hash = (text) => createHash('sha256').update(text).digest('hex')
const text = (value, max) => typeof value === 'string' && value.length <= max ? value : undefined
const doc = (id) => getFirestore().doc(`secretRequests/${id}`)

function cardOf(body) {
  const card = body.card ?? {}
  const places = Array.isArray(card.places) && card.places.length <= 20 && card.places.every((one) => text(one, 200) !== undefined) ? card.places : undefined
  const out = { name: text(card.name, 48), kind: KINDS.includes(card.kind) ? card.kind : undefined, places, note: text(card.note ?? '', 200), field: text(card.field ?? '', 200), computer: text(card.computer, 80), task: text(card.task ?? '', 80), brokerKey: text(card.brokerKey, 200) }
  return Object.values(out).every((one) => one !== undefined) && /^[a-z0-9][a-z0-9-]{1,47}$/.test(out.name) && B64.test(out.brokerKey) ? out : undefined
}

// The page and the computer meet here. It keeps the card a page shows, and for a few minutes the value sealed in the page for the computer's broker, never anything it could open.
export const secret = onRequest({ region: 'europe-west1', maxInstances: 10 }, async (request, response) => {
  response.set('Cache-Control', 'no-store')
  const body = request.body ?? {}
  const id = String(body.id ?? '')
  if (request.method !== 'POST' || !ID.test(id)) { response.status(400).json({ error: 'bad ask' }); return }
  const now = Date.now()
  try {
    switch (body.action) {
      case 'open': {
        const card = cardOf(body)
        if (card === undefined || !KEY.test(body.linkKey ?? '') || !KEY.test(body.owner ?? '')) { response.status(400).json({ error: 'bad card' }); return }
        await doc(id).create({ card, linkKey: hash(body.linkKey), owner: hash(body.owner), state: 'sent', expiresAt: Timestamp.fromMillis(now + LIFE), tries: 0 })
        response.json({ expiresAt: now + LIFE })
        return
      }
      case 'card': {
        const held = (await doc(id).get()).data()
        if (held === undefined || held.linkKey !== hash(String(body.linkKey ?? ''))) { response.status(404).json({ error: 'not-valid' }); return }
        if (held.state !== 'sent') { response.status(409).json({ error: 'already-used' }); return }
        if (held.expiresAt.toMillis() < now) { response.status(410).json({ error: 'expired' }); return }
        response.json({ card: held.card, expiresAt: held.expiresAt.toMillis() })
        return
      }
      case 'save': {
        const sealed = body.ciphertext ?? {}
        if (!B64.test(sealed.epk ?? '') || !B64.test(sealed.iv ?? '') || !B64.test(sealed.data ?? '') || !LIFETIMES.includes(body.lifetime)) { response.status(400).json({ error: 'bad value' }); return }
        const answer = await getFirestore().runTransaction(async (work) => {
          const held = (await work.get(doc(id))).data()
          if (held === undefined || held.linkKey !== hash(String(body.linkKey ?? ''))) return [404, 'not-valid']
          if (held.tries >= 10) return [429, 'too-many']
          work.update(doc(id), { tries: held.tries + 1 })
          if (held.state !== 'sent') return [409, 'already-used']
          if (held.expiresAt.toMillis() < now) return [410, 'expired']
          work.update(doc(id), { state: 'saved', ciphertext: { epk: sealed.epk, iv: sealed.iv, data: sealed.data }, lifetime: body.lifetime, device: text(String(request.get('user-agent') ?? ''), 300) ?? '', savedAt: Timestamp.fromMillis(now) })
          return [200, held.card.computer]
        })
        if (answer[0] !== 200) { response.status(answer[0]).json({ error: answer[1] }); return }
        response.json({ saved: true, computer: answer[1] })
        return
      }
      case 'collect': {
        const answer = await getFirestore().runTransaction(async (work) => {
          const held = (await work.get(doc(id))).data()
          if (held === undefined || held.owner !== hash(String(body.owner ?? ''))) return { status: 404, json: { error: 'not-valid' } }
          if (held.state === 'sent') return { status: 200, json: { state: held.expiresAt.toMillis() < now ? 'expired' : 'sent' } }
          if (held.state !== 'saved') return { status: 200, json: { state: held.state } }
          work.update(doc(id), { state: 'collected', ciphertext: null })
          return { status: 200, json: { state: 'saved', ciphertext: held.ciphertext, lifetime: held.lifetime, device: held.device } }
        })
        response.status(answer.status).json(answer.json)
        return
      }
      default: response.status(400).json({ error: 'bad ask' })
    }
  } catch (error) {
    if (error?.code === 6) { response.status(409).json({ error: 'exists' }); return }
    response.status(500).json({ error: 'failed' })
  }
})

export const secretCleanup = onSchedule({ region: 'europe-west1', schedule: 'every 60 minutes' }, async () => {
  const old = await getFirestore().collection('secretRequests').where('expiresAt', '<', Timestamp.fromMillis(Date.now() - 60 * 60_000)).limit(500).get()
  await Promise.all(old.docs.map((one) => one.ref.delete()))
})
