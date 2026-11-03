import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { askedEndpoint } from '../src/cli/endpoint'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, it } from 'vitest'

import { connectDesktop } from '../src/main/service-client'
import type { DesktopServiceClient } from '../src/main/service-client'
import { connectRpc } from '../src/core/rpc'
import type { RpcEvent } from '../src/core/rpc'
import type { ServiceMethods, ServiceEvents } from '../src/service/application'

const exec = promisify(execFile)
const clientDirectory = resolve(import.meta.dirname, '..')

it('bootstraps persisted projects before listing, shares events across desktop clients, and keeps running when they detach', async () => {
  await exec(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'service.vite.config.ts'], { cwd: clientDirectory, timeout: 30_000 })
  const folder = await mkdtemp(join(tmpdir(), 'geckit-core-app-'))
  const directory = join(folder, 'data')
  const firstProject = join(folder, 'first')
  const secondProject = join(folder, 'second')
  const firstId = 'plugin:fixture:persisted-first'
  const secondId = 'plugin:fixture:persisted-second'
  const events: RpcEvent<ServiceEvents>[] = []
  let desktop: DesktopServiceClient | undefined
  let other: DesktopServiceClient | undefined
  let control: Awaited<ReturnType<typeof connectRpc<ServiceMethods, ServiceEvents>>> | undefined
  try {
    const plugin = join(directory, 'provider-plugins', 'plugin-fixture')
    await cp(join(import.meta.dirname, 'fixtures', 'headless'), plugin, { recursive: true })
    await mkdir(firstProject)
    await mkdir(secondProject)
    await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ projects: [firstProject, secondProject], profiles: [{ id: 'first-only', name: 'First', projects: [firstProject] }], profile: 'first-only', chatProviders: ['plugin:fixture'], chatProvider: 'plugin:fixture', vpnIpCheck: false, guideClaude: false, guideCodex: false, providerAutoUpdate: false }))
    await writeFile(join(directory, 'fixture-history.json'), JSON.stringify([
      { id: firstId, root: firstProject, title: 'First persisted conversation', at: 100, stands: '', driven: false, items: [] },
      { id: secondId, root: secondProject, title: 'Second persisted conversation', at: 101, stands: '', driven: false, items: [] },
    ]))
    const options = {
      directory, executable: process.execPath, script: join(clientDirectory, 'out', 'service', 'service.js'),
      env: { GECKIT_VAULT_KEY: Buffer.alloc(32, 19).toString('base64'), HOME: join(folder, 'home'), CODEX_HOME: join(folder, 'codex'), CLAUDE_CONFIG_DIR: join(folder, 'claude') },
      onEvent: (event: RpcEvent<ServiceEvents>) => { events.push(event) },
    }
    desktop = await connectDesktop(options)
    expect(desktop.snapshot.sessions.map((one) => one.id)).toEqual(expect.arrayContaining([firstId, secondId]))
    expect((await desktop.call('chat:list', undefined)).map((one) => one.id)).toEqual([firstId])
    expect((await desktop.call('phone:list', undefined)).map((one) => one.id)).toEqual(expect.arrayContaining([firstId, secondId]))
    expect(await desktop.call('phone:settings')).toMatchObject({ profile: '', chatProjects: [], chatAll: true })
    other = await connectDesktop(options)
    await other.call('settings:set', { nativeLanguage: 'French' })
    const deadline = Date.now() + 3_000
    while (!events.some((event) => event.name === 'settings:changed' && event.args[0].nativeLanguage === 'French')) {
      if (Date.now() > deadline) throw new Error('Service settings event was not delivered to desktop.')
      await new Promise<void>((done) => setTimeout(done, 20))
    }
    desktop.close()
    other.close()
    const token = (await readFile(join(directory, 'operator-token'), 'utf8')).trim()
    control = await connectRpc<ServiceMethods, ServiceEvents>(directory, token, () => undefined)
    expect((await control.call('service:bootstrap')).settings.nativeLanguage).toBe('French')
  } finally {
    desktop?.close()
    other?.close()
    if (control === undefined) {
      try { control = await connectRpc<ServiceMethods, ServiceEvents>(directory, (await readFile(join(directory, 'operator-token'), 'utf8')).trim(), () => undefined) } catch { /* Startup failures have no listener. */ }
    }
    if (control !== undefined) {
      const token = (await readFile(join(directory, 'operator-token'), 'utf8')).trim()
      await new Promise<void>((done, reject) => {
        const socket = connect(askedEndpoint(directory))
        socket.once('error', reject)
        socket.once('connect', () => socket.write(`${JSON.stringify({ action: 'operator', token, args: ['shutdown'] })}\n`))
        socket.once('data', () => { socket.destroy(); done() })
      })
      await control.closed
      const deadline = Date.now() + 3_000
      while (existsSync(join(directory, 'service-owner.json'))) {
        expect(Date.now(), 'Service must release its data directory before cleanup').toBeLessThan(deadline)
        await new Promise<void>((done) => setTimeout(done, 20))
      }
    }
    await rm(folder, { recursive: true, force: true })
  }
}, 40_000)
