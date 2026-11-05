import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

export function create() {
  const directory = process.env.GECKIT_DATA
  const file = join(directory, 'fixture-history.json')
  const records = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const children = new Set()
  const save = () => writeFileSync(file, JSON.stringify(records))
  return {
    id: 'plugin:fixture', family: 'plugin:fixture',
    available: true, localOnly: true, subscriptionOnly: false, images: false,
    remoteControl: false, nativeGoals: false, idleMs: 600000, waitForExit: false,
    account: async () => ({ provider: 'plugin:fixture', here: true, signedIn: true }),
    program: async () => undefined,
    models: async () => [{ value: 'fixture', label: 'Fixture' }],
    limits: async () => ({ windows: new Map() }),
    list: async (roots) => records.filter((one) => roots.includes(one.root)).map(({ id, root, title, at, stands, driven }) => ({ id, root, title, at, stands, driven })),
    search: async () => [], hidden: async () => [],
    create: async ({ root }) => { const id = `plugin:fixture:${randomUUID()}`; records.push({ id, root, title: 'Fixture', at: Date.now(), stands: '', driven: false, items: [] }); save(); return id },
    fork: async () => { throw new Error('Fixture does not fork') },
    has: async (_root, id) => records.some((one) => one.id === id),
    read: async (_root, id) => { const record = records.find((one) => one.id === id); return record && { items: record.items, title: record.title, tasks: [] } },
    links: async () => [], goal: async () => undefined, setGoal: async () => undefined,
    clearGoal: async () => undefined,
    hold: (options, hear, left) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./worker.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] })
      children.add(child)
      writeFileSync(join(directory, 'fixture-child.pid'), String(child.pid))
      let rest = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (part) => {
        rest += part
        let end
        while ((end = rest.indexOf('\n')) >= 0) {
          const heard = JSON.parse(rest.slice(0, end)); rest = rest.slice(end + 1)
          const record = records.find((one) => one.id === options.id)
          if (record) { record.items.push(...heard.items); record.at = Date.now(); record.stands = heard.items.findLast((one) => one.kind === 'theirs')?.text ?? record.stands; save() }
          hear(heard)
        }
      })
      child.on('close', () => { children.delete(child); left() })
      child.on('error', () => left())
      const write = (value) => child.stdin.write(`${JSON.stringify(value)}\n`)
      return {
        send: (text) => write({ text }),
        answer: (_ask, answer) => write({ answer }),
        stop: () => write({ stop: true }),
        end: () => new Promise((resolve) => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else { child.once('close', resolve); child.kill() } }),
      }
    },
    rename: async () => undefined, remote: async () => undefined,
    mcp: async () => undefined, browsers: async () => undefined,
    correct: async () => ({ ok: false }), setInstructions: async () => undefined,
    delete: async () => false,
    dispose: () => { for (const child of children) child.kill() },
  }
}
