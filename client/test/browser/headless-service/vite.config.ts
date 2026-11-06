import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

import { connectRpc } from '../../../src/core/rpc'
import type { RpcEvent } from '../../../src/core/rpc'
import type { ServiceMethods, ServiceEvents } from '../../../src/service/application'
import { DEFAULT_SETTINGS, homeOf, shownProjects } from '../../../src/shared/api'
import type { Settings, UpdateView } from '../../../src/shared/api'

type BoundaryValue = object | string | number | boolean | null | undefined
interface BoundaryRequest { readonly channel: string; readonly args: BoundaryValue[] }

function serviceBridge(): Plugin {
  let stop = (): void => undefined
  return {
    closeBundle: () => stop(),
    name: 'real-headless-service-bridge',
    async configureServer(server) {
      const directory = process.env['GECKIT_BROWSER_DATA']
      if (directory === undefined || !existsSync(join(directory, 'browser-harness.json'))) throw new Error('GECKIT_BROWSER_DATA must name an isolated directory created by setup.mjs.')
      const peers = new Set<ServerResponse>()
      let settings: Settings = DEFAULT_SETTINGS
      const emit = (event: RpcEvent<ServiceEvents>): void => {
        if (event.name === 'settings:changed') settings = event.args[0]
        const packet = event.name === 'chat:sessions'
          ? { name: event.name, args: [event.args[0].filter((one) => one.manager !== true && (one.question === true || shownProjects(settings).includes(homeOf(one))))] }
          : event
        for (const peer of peers) peer.write(`data: ${JSON.stringify(packet)}\n\n`)
      }
      const connection = await connectRpc<ServiceMethods, ServiceEvents>(directory, readFileSync(join(directory, 'operator-token'), 'utf8').trim(), emit)
      settings = await connection.call('settings:get')
      const hello = await connection.call('desktop:hello')
      const allowed = new Set<string>(hello.methods.filter((name) => !name.startsWith('desktop:') && !name.startsWith('service:')))
      const updates: UpdateView = { state: 'off', version: 'browser-harness', offered: '', channel: 'stable', percent: 0, message: 'Native app updates are unavailable in this browser harness.', waitingFor: [] }
      stop = () => { connection.close(); for (const peer of peers) peer.end() }
      server.httpServer?.once('close', stop)
      server.middlewares.use('/remote-workspace.html', (_request, response, next) => {
        const html = readFileSync(resolve(import.meta.dirname, '../../../src/renderer/remote-workspace.html'), 'utf8').replace('/src/remote/workspace-entry.ts', '/src/renderer/src/remote/workspace-entry.ts')
        void server.transformIndexHtml('/remote-workspace.html', html).then((page) => { response.setHeader('Content-Type', 'text/html'); response.end(page) }).catch(next)
      })
      server.middlewares.use('/favicon.ico', (_request, response) => { response.writeHead(204).end() })
      server.middlewares.use('/api/fixture/notice', (request, response) => {
        if (request.method !== 'POST') { response.writeHead(405).end(); return }
        const state = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('state')
        if (state !== 'disconnected' && state !== 'clear') { response.writeHead(400).end(); return }
        emit({ name: 'chat:notice', args: [{ session: '', title: state === 'clear' ? '' : 'GeckIt service disconnected. Reconnecting...', subtitle: '', body: '', asks: false }] })
        response.writeHead(204).end()
      })
      server.middlewares.use('/api/events', (_request, response) => {
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        response.write(': connected to real local GeckIt service\n\n')
        peers.add(response)
        response.once('close', () => peers.delete(response))
      })
      server.middlewares.use('/api/invoke', (request, response) => {
        if (request.method !== 'POST') { response.writeHead(405).end(); return }
        let body = ''
        request.setEncoding('utf8')
        request.on('data', (part: string) => { body += part; if (body.length > 64 * 1024 * 1024) request.destroy() })
        request.once('end', () => {
          void (async () => {
            const parsed: unknown = JSON.parse(body)
            if (parsed === null || typeof parsed !== 'object' || !('channel' in parsed) || typeof parsed.channel !== 'string' || !('args' in parsed) || !Array.isArray(parsed.args)) throw new Error('Invalid browser request.')
            const asked: BoundaryRequest = { channel: parsed.channel, args: (parsed.args as BoundaryValue[]).map((value) => value !== null && typeof value === 'object' && '__geckitUndefined' in value && value.__geckitUndefined === true ? undefined : value) }
            const { channel, args } = asked
            let value: BoundaryValue | void
            if (channel === 'update:view' || channel === 'update:check') value = updates
            else if (channel === 'phone:state') value = { count: 0 }
            else if (channel === 'settings:accessibility') value = true
            else if (channel === 'errors:question' || channel === 'settings:pickApp' || channel === 'chat:addProject') value = undefined
            else if (channel === 'chat:listening' || channel === 'chat:open' || channel === 'voice:form') value = undefined
            else if (allowed.has(channel)) value = await connection.call(channel as keyof ServiceMethods, ...args as Parameters<ServiceMethods[keyof ServiceMethods]>)
            else throw new Error(`Native-only operation is unavailable in browser harness: ${channel}`)
            response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ value: value ?? null }))
          })().catch((error: Error) => response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error.message })))
        })
      })
    },
  }
}

export default defineConfig({
  root: resolve(import.meta.dirname, '../../..'),
  plugins: [serviceBridge(), react()],
  resolve: { alias: { electron: resolve(import.meta.dirname, 'electron.ts') } },
  define: { 'process.platform': JSON.stringify('darwin'), 'process.env': '{}' },
  server: { host: '127.0.0.1', port: 5207, strictPort: true },
})
