import { listen } from '../link'
import type { Link } from '../link'

/**
 * The hidden window the phones are answered in: main has no WebRTC, a window
 * does. Each call from a phone goes to main as the chat window's would, and
 * what main tells its windows goes to every phone.
 */

const links = new Set<Link>()
let trouble: string | undefined

const said = (): void => window.geckit.peer.state(links.size, trouble)

window.geckit.peer.onTell((channel, value) => {
  for (const link of links) link.send({ t: 'tell', channel, value })
})

const joined = (link: Link): void => {
  links.add(link)
  said()
  link.onClose(() => {
    links.delete(link)
    said()
  })
  link.onMessage((message) => {
    if (message.t !== 'call') return
    window.geckit.peer.call(message.name, message.args).then(
      (value) => link.send({ t: 'reply', id: message.id, value }),
      (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
    )
  })
}

void window.geckit.peer.pairing().then((pairing) => {
  if (pairing === undefined) return
  listen(pairing, joined, (now) => {
    if (now === trouble) return
    trouble = now
    said()
  })
})
