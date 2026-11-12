import { randomBytes } from 'node:crypto'
import { appendFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { version } from '../../package.json'
import { ownDataDirectory } from '../../src/core/ownership'
import { listenRpc } from '../../src/core/rpc'

async function main(): Promise<void> {
  const directory = process.argv[process.argv.indexOf('--data') + 1]!
  const release = await ownDataDirectory(directory)
  appendFileSync(join(directory, 'owners.log'), `${process.pid}\n`)
  // Exercise competing launches while an owner has not published its token yet.
  await new Promise<void>((resolve) => setTimeout(resolve, 150))
  const token = randomBytes(32).toString('hex')
  const tokenFile = join(directory, 'operator-token')
  writeFileSync(tokenFile, token)
  const server = listenRpc(directory, token, {
    'desktop:hello': () => ({ protocol: 1, version }),
    'service:bootstrap': () => ({ name: 'Recovered fixture' }),
    'probe:pid': () => process.pid,
  })
  await server.ready
  process.on('SIGTERM', () => {
    void server.close().then(async () => { rmSync(tokenFile); await release() })
  })
  console.log('recovery fixture ready')
}

void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1 })
