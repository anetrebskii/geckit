import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

/** The CLI: on the PATH a terminal has, or inside the Mac app, since an app started from the Dock has neither in its PATH. */
const CANDIDATES = [
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/opt/homebrew/bin/tailscale',
  '/usr/local/bin/tailscale',
  '/usr/bin/tailscale',
]

const cli = (): string | undefined => CANDIDATES.find((path) => existsSync(path))

function run(args: readonly string[]): Promise<{ readonly out: string; readonly error?: string }> {
  const path = cli()
  if (path === undefined) return Promise.resolve({ out: '', error: 'Tailscale is not installed on this Mac.' })
  return new Promise((done) => {
    execFile(path, [...args], { timeout: 15_000 }, (error, out, err) =>
      done(error === null ? { out } : { out, error: (err || error.message).trim() }),
    )
  })
}

/** Where the phone opens GeckIt: this Mac's own name in the tailnet, over HTTPS, handed on to the port. */
export async function serveOnTailnet(port: number): Promise<{ readonly url?: string; readonly error?: string }> {
  const status = await run(['status', '--json'])
  if (status.error !== undefined) return { error: status.error }
  const self = (JSON.parse(status.out) as { readonly Self?: { readonly DNSName?: string; readonly Online?: boolean } }).Self
  const name = self?.DNSName?.replace(/\.$/, '')
  if (name === undefined || name === '') return { error: 'Tailscale is not signed in on this Mac.' }
  const served = await run(['serve', '--bg', '--https=443', `http://127.0.0.1:${String(port)}`])
  if (served.error !== undefined) return { error: served.error }
  return { url: `https://${name}` }
}

export async function stopServing(): Promise<void> {
  await run(['serve', '--https=443', 'off'])
}
