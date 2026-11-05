const SECRET = /\b(?:xox[abposr]-[\w-]{10,}|xapp-[\w-]{10,}|sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/
const ANSWERS = { allow: 'once', 'allow always': 'session', deny: 'no' }

export const containsSecret = (text) => SECRET.test(text)
export const cleanMention = (text) => text.replace(/<@[A-Z0-9]+>/g, '').trim()

export function create(context, { fetch: request = fetch, WebSocket: Socket = WebSocket } = {}) {
  let socket
  let stopped = false
  let retry
  const watching = new Map()

  const slack = async (method, body, token = context.secret('botToken')) => {
    const response = await request(`https://slack.com/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body ?? {}) })
    const json = await response.json()
    if (!json.ok) throw new Error(`Slack ${method}: ${json.error}`)
    return json
  }
  const post = (channel, thread, text) => slack('chat.postMessage', { channel, ...(thread === undefined ? {} : { thread_ts: thread }), text: text.slice(0, 39_000) })

  const threads = () => context.store.get('threads') ?? {}
  const keyOf = (channel, thread) => `${channel}:${thread}`
  const remember = (key, conversation) => context.store.set('threads', { ...threads(), [key]: conversation })

  const folder = () => {
    const allowed = context.projects().map((one) => one.root)
    const chosen = context.config().folder
    if (typeof chosen === 'string' && chosen !== '') {
      if (!allowed.includes(chosen)) throw new Error('The folder for new threads is not among the folders this channel may use.')
      return chosen
    }
    if (allowed.length === 0) throw new Error('Allow at least one folder for Slack in GeckIt.')
    return allowed[0]
  }

  const follow = (conversation, channel, thread, key) => {
    if (watching.has(conversation)) return
    let last = ''
    const cards = new Set()
    watching.set(conversation, context.conversations.watch(conversation, (event) => {
      if (event.kind === 'items') {
        for (const item of event.items) {
          if (item.kind === 'theirs' && item.phase !== 'commentary') last = item.text
          if (item.kind === 'card' && item.card.answered === undefined && !cards.has(item.id)) {
            cards.add(item.id)
            context.store.set(`card:${key}`, item.id)
            void post(channel, thread, `*${item.card.title}*${item.card.detail === undefined ? '' : `\n\`\`\`${item.card.detail}\`\`\``}\nReply \`allow\`, \`allow always\` or \`deny\`.`).catch((error) => context.log.write('warn', 'slack.post.failed', { reason: error.message }))
          }
        }
      }
      if (event.kind === 'decisions') {
        for (const decision of event.decisions) {
          if (cards.has(decision.id)) continue
          cards.add(decision.id)
          context.store.set(`card:${key}`, decision.id)
          void post(channel, thread, `*${decision.title}*\nReply with one of: ${decision.choices.map((one) => `\`${one.value}\``).join(', ')}`).catch(() => undefined)
        }
      }
      if (event.kind === 'state' && event.conversation.state === 'idle' && last !== '') {
        const text = last
        last = ''
        void post(channel, thread, text).catch((error) => context.log.write('warn', 'slack.post.failed', { reason: error.message }))
      }
    }))
  }

  const heard = async (event) => {
    if (event.type !== 'app_mention' && !(event.type === 'message' && event.channel_type === 'im')) return
    if (event.bot_id !== undefined || event.subtype !== undefined) return
    const allow = context.config().allow ?? []
    const thread = event.thread_ts ?? event.ts
    if (!allow.includes(event.user)) {
      await post(event.channel, thread, 'You are not on the list of people who may use this bot.')
      return
    }
    const text = cleanMention(event.text ?? '')
    if (text === '') return
    if (context.config().checkSecrets !== false && containsSecret(text)) {
      await post(event.channel, thread, 'That message looks like it contains a token or key, so it was not sent. Remove it and write again.')
      return
    }
    const key = keyOf(event.channel, event.channel_type === 'im' ? 'dm' : thread)
    const answer = ANSWERS[text.toLowerCase()] ?? text
    const card = context.store.get(`card:${key}`)
    const known = threads()[key]

    if (event.channel_type === 'im') {
      const manager = context.conversations.manager()
      if (manager === undefined) { await post(event.channel, undefined, 'Manager is not available to Slack. Allow it in GeckIt, Settings, Channels.'); return }
      remember(key, manager)
      follow(manager, event.channel, undefined, key)
      if (typeof card === 'string' && await context.conversations.answer(manager, card, answer)) { context.store.set(`card:${key}`, undefined); return }
      await context.conversations.send(manager, { text, from: event.user })
      return
    }

    if (typeof known === 'string' && context.conversations.get(known) !== undefined) {
      follow(known, event.channel, thread, key)
      if (typeof card === 'string' && await context.conversations.answer(known, card, answer)) { context.store.set(`card:${key}`, undefined); return }
      await context.conversations.send(known, { text })
      return
    }
    const conversation = await context.conversations.start({ root: folder(), text, provider: 'claude' })
    remember(key, conversation)
    follow(conversation, event.channel, thread, key)
    await post(event.channel, thread, 'Working on it.')
  }

  const connect = async () => {
    const { url } = await slack('apps.connections.open', {}, context.secret('appToken'))
    if (stopped) return
    socket = new Socket(url)
    socket.addEventListener('message', (message) => {
      const envelope = JSON.parse(String(message.data))
      if (envelope.type === 'hello') context.status('connected', 'Listening')
      if (envelope.type === 'disconnect') socket.close()
      if (envelope.envelope_id !== undefined) socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }))
      if (envelope.type === 'events_api') void heard(envelope.payload.event).catch((error) => context.log.write('error', 'slack.event.failed', { reason: error.message }))
    })
    socket.addEventListener('close', () => {
      if (stopped) return
      context.status('starting', 'Reconnecting to Slack')
      retry = setTimeout(() => { void connect().catch((error) => context.status('failed', error.message)) }, 5_000)
    })
  }

  return {
    start: async () => {
      context.status('starting', 'Connecting to Slack')
      await slack('auth.test')
      await connect()
    },
    stop: async () => {
      stopped = true
      clearTimeout(retry)
      for (const unwatch of watching.values()) unwatch()
      watching.clear()
      socket?.close()
    },
  }
}
