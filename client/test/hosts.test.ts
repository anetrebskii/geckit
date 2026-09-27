import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readPrompt } from '../src/main/hosts/askpass'
import { HostDisk, readEdges, readListing } from '../src/main/hosts/disk'
import type { HostsLike } from '../src/main/hosts/hosts'
import { lineSplitter } from '../src/main/hosts/lines'
import { readChecked, readFolders, readSshConfig } from '../src/main/hosts/read'
import { retryAfter } from '../src/main/hosts/run'
import {
  attachInScript,
  attachOutScript,
  checkScript,
  edgesScript,
  listScript,
  quote,
  readCheck,
  safeFile,
  safeId,
  startScript,
} from '../src/main/hosts/run-script'
import { sshArgs, sshProblem } from '../src/main/hosts/ssh'
import { edgesOf, rowFrom, slug } from '../src/main/sessions/disk'
import type { HostConfig, HostState } from '../src/shared/hosts'
import { draftProblem, forHowLong, hostIdFor, hostOf, outOfReach, outOfReachLine, parseTarget, pathOf, remoteRoot, stateLine, targetLine } from '../src/shared/hosts'

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, 'fixtures', 'hosts', name), 'utf8')

/** A fake standing in for `Hosts`, so a host's connection is never really reached in a test. */
const fakeHost: HostConfig = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'key' }
const fakeHosts = (state: HostState): HostsLike => ({
  config: (id) => (id === fakeHost.id ? fakeHost : undefined),
  setup: () => ({ env: {} }),
  state: () => state,
})

describe('a project root that names a host', () => {
  it('is read into the host and the path, and a local one names none', () => {
    expect(hostOf('ssh://devbox/home/leo/trailmap')).toBe('devbox')
    expect(pathOf('ssh://devbox/home/leo/trailmap')).toBe('/home/leo/trailmap')
    expect(hostOf('/Users/leo/trailmap')).toBeUndefined()
    expect(pathOf('/Users/leo/trailmap')).toBe('/Users/leo/trailmap')
    expect(pathOf('ssh://devbox')).toBe('/')
  })

  it('is written from a host and a path, without a trailing slash', () => {
    expect(remoteRoot('devbox', '/home/leo/trailmap/')).toBe('ssh://devbox/home/leo/trailmap')
    expect(remoteRoot('devbox', 'srv/api')).toBe('ssh://devbox/srv/api')
    expect(remoteRoot('devbox', '/')).toBe('ssh://devbox/')
  })
})

describe('what is typed into Address', () => {
  it('fills the user and the port from user@address:port', () => {
    expect(parseTarget('leo@devbox.local:2222')).toEqual({ address: 'devbox.local', user: 'leo', port: 2222 })
    expect(parseTarget('ssh leo@devbox')).toEqual({ address: 'devbox', user: 'leo' })
    expect(parseTarget('devbox')).toEqual({ address: 'devbox' })
    expect(parseTarget('[fe80::1]:2200')).toEqual({ address: 'fe80::1', port: 2200 })
  })

  it('leaves out a port that is not one', () => {
    expect(parseTarget('devbox:99999')).toEqual({ address: 'devbox' })
  })

  it('says what stands in the way of connecting', () => {
    expect(draftProblem({ address: '', port: 22, name: '' })).toBe('Type the address of the host.')
    expect(draftProblem({ address: 'dev box', port: 22, name: '' })).toBe('The address has a space in it.')
    expect(draftProblem({ address: 'devbox', port: 0, name: '' })).toBe('The port is a number from 1 to 65535.')
    expect(draftProblem({ address: 'devbox', port: 22, name: 'devbox' })).toBeUndefined()
  })
})

describe('a host as it is named and shown', () => {
  it('gets an id from its name that no other host has', () => {
    expect(hostIdFor('Office Mac', [])).toBe('office-mac')
    expect(hostIdFor('devbox', ['devbox'])).toBe('devbox-2')
    expect(hostIdFor('***', [])).toBe('host')
  })

  it('is written the way ssh writes it, the port only where it is not 22', () => {
    expect(targetLine({ address: 'devbox.local', user: 'leo', port: 22 })).toBe('leo@devbox.local')
    expect(targetLine({ address: 'devbox.local', user: '', port: 2222 })).toBe('devbox.local:2222')
  })

  it('says how it stands, and how long it has been connected', () => {
    expect(stateLine({ state: 'idle' }, 0)).toBe('Not connected')
    expect(stateLine({ state: 'up', since: 0 }, 2 * 3_600_000)).toBe('Connected for 2 h')
    expect(stateLine({ state: 'lost' }, 0)).toBe('Out of reach, reconnecting')
    expect(stateLine({ state: 'needs', problem: 'Could not reach devbox: timed out after 20 s.' }, 0)).toBe('Could not reach devbox: timed out after 20 s.')
    expect(forHowLong(30_000)).toBe('a moment')
    expect(forHowLong(12 * 60_000)).toBe('12 min')
    expect(forHowLong(72 * 3_600_000)).toBe('3 d')
  })

  it('is out of reach when it dropped or needs the person, and says so in the words of the design', () => {
    expect(outOfReach('lost')).toBe(true)
    expect(outOfReach('needs')).toBe(true)
    expect(outOfReach('idle')).toBe(false)
    expect(outOfReachLine('devbox')).toBe('devbox is out of reach. Still working there')
  })
})

describe('what is run on a host', () => {
  it('quotes a word so the host shell reads it as one word', () => {
    expect(quote("it's")).toBe(`'it'\\''s'`)
    expect(quote('$(rm -rf ~)')).toBe(`'$(rm -rf ~)'`)
  })

  it('takes only conversation ids and files that are what the tool makes', () => {
    expect(safeId('1c006f9e-8bcd-4950-8f21-e41c0f0093cd')).toBe('1c006f9e-8bcd-4950-8f21-e41c0f0093cd')
    expect(() => safeId('../etc')).toThrow()
    expect(() => safeFile('../x.jsonl')).toThrow()
    expect(() => listScript('a b')).toThrow()
  })

  it('starts claude apart from the connection, without the variables that take it off the plan', () => {
    const script = startScript('abc-1', '/home/leo/trail map', ['claude', '-p', '--permission-mode', 'auto'])
    expect(script).toContain('mkfifo "$d/in"')
    expect(script).toContain("cd '/home/leo/trail map'")
    expect(script).toContain('-u ANTHROPIC_API_KEY')
    expect(script).toContain("'claude' '-p' '--permission-mode' 'auto'")
    expect(script).toContain('setsid')
    expect(script).toContain('geckit_exit')
    expect(script).toContain('-mmin -720')
  })

  it('reads the output from the byte after the one reached, saying first that it is attached', () => {
    const script = attachOutScript('abc-1', 20873)
    expect(script).toContain('tail -c +20874 -f "$d/out"')
    expect(script).toContain("printf '@@attached\\n'")
    expect(attachInScript('abc-1')).toContain('exec cat > "$d/in"')
  })

  it('fetches both ends of a long file and a short one whole', () => {
    const script = edgesScript([
      { file: '-home-leo-trailmap/a-1.jsonl', size: 100 },
      { file: '-home-leo-trailmap/b-2.jsonl', size: 1_000_000 },
    ])
    expect(script).toContain("base64 < '-home-leo-trailmap/a-1.jsonl'")
    expect(script).toContain("head -c 65536 './-home-leo-trailmap/b-2.jsonl' | base64")
    expect(script).toContain("tail -c 65536 './-home-leo-trailmap/b-2.jsonl' | base64")
  })

  it('reads both ends of a long file whose folder starts with a dash, as every slug does', () => {
    const home = mkdtempSync(join(tmpdir(), 'geckit-edges-'))
    const folder = join(home, 'projects', '-home-leo-trailmap')
    mkdirSync(folder, { recursive: true })
    const first = `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'Faster tile cache build' } })}\n`
    writeFileSync(join(folder, 'b-2.jsonl'), first + 'x'.repeat(200_000) + '\n')
    const out = execFileSync('sh', ['-c', edgesScript([{ file: '-home-leo-trailmap/b-2.jsonl', size: 200_000 + first.length + 1 }])], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: home },
    }).toString()
    const ends = readEdges(out).get('-home-leo-trailmap/b-2.jsonl')
    expect(ends?.head.toString().startsWith(first)).toBe(true)
    expect(ends?.tail?.length).toBe(65536)
    rmSync(home, { recursive: true, force: true })
  })

  it('reads what the check printed', () => {
    const out = `@@path /home/leo/.local/bin/claude\n@@version\n2.1.283 (Claude Code)\n@@auth\n{"loggedIn": true, "subscriptionType": "max"}\n@@end\n`
    expect(readCheck(out)).toEqual({ missing: false, path: '/home/leo/.local/bin/claude', version: '2.1.283 (Claude Code)', auth: '{"loggedIn": true, "subscriptionType": "max"}' })
    expect(readChecked(out)).toEqual({ missing: false, version: '2.1.283', account: { here: true, signedIn: true, plan: 'Max' } })
    expect(readChecked('@@missing\n')).toEqual({ missing: true })
    expect(readChecked(`@@path /x\n@@version\n2.1.283\n@@auth\n{"loggedIn": false}\n@@end\n`).account).toEqual({ here: true, signedIn: false })
    expect(checkScript()).toContain('auth status')
  })
})

describe('the ssh a host is reached with', () => {
  const host = { address: 'devbox.local', user: 'leo', port: 2222, auth: 'key' as const }

  it('names the port, the user, the keepalives and the shared connection', () => {
    const args = sshArgs(host, { control: '/tmp/cm' })
    expect(args).toEqual(expect.arrayContaining(['-T', '-p', '2222', '-l', 'leo', 'ServerAliveInterval=5', 'ServerAliveCountMax=2', 'ControlMaster=auto', 'ControlPath=/tmp/cm/%C']))
    expect(args.at(-1)).toBe('devbox.local')
    expect(args).not.toContain('BatchMode=yes')
  })

  it('leaves the port and user to the SSH config where none is given, and adds a key file of its own', () => {
    const args = sshArgs({ address: 'devbox', user: '', port: 22, auth: 'key', keyFile: '~/.ssh/work' }, {})
    expect(args).not.toContain('-p')
    expect(args).not.toContain('-l')
    expect(args).toEqual(expect.arrayContaining(['-i', '~/.ssh/work', 'IdentitiesOnly=yes']))
    expect(args).not.toContain('ControlMaster=auto')
  })

  it('says what went wrong in the words of the design', () => {
    expect(sshProblem('ssh: Could not resolve hostname devbox: nodename nor servname provided', 'devbox')).toBe('Could not reach devbox: no host by that name.')
    expect(sshProblem('ssh: connect to host devbox port 22: Operation timed out', 'devbox')).toBe('Could not reach devbox: timed out after 20 s.')
    expect(sshProblem('leo@devbox: Permission denied (publickey,password).', 'devbox')).toBe('devbox did not accept the sign-in.')
  })
})

describe('what ssh asks', () => {
  it('reads each kind of question into its card', () => {
    expect(readPrompt("leo@devbox.local's password: ", 'devbox', '')).toEqual({ kind: 'password', text: 'devbox asks for the password of leo.' })
    expect(readPrompt("Enter passphrase for key '/tmp/id_ed25519': ", 'devbox', 'leo')).toEqual({
      kind: 'passphrase',
      text: 'devbox asks for the passphrase of /tmp/id_ed25519.',
      detail: '/tmp/id_ed25519',
    })
    const trust = readPrompt(
      "The authenticity of host 'devbox (10.0.4.12)' can't be established.\nED25519 key fingerprint is SHA256:3f9Tq0abc1c.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ",
      'devbox',
      'leo',
    )
    expect(trust).toEqual({ kind: 'trust', text: 'This is the first connection to devbox. Its key is SHA256:3f9Tq0abc1c. Trust it?', detail: 'SHA256:3f9Tq0abc1c' })
    expect(readPrompt('Verification code: ', 'devbox', 'leo').kind).toBe('code')
    expect(readPrompt('Something else?', 'devbox', 'leo')).toEqual({ kind: 'other', text: 'devbox asks: Something else?' })
  })
})

describe('reading a run from a byte on', () => {
  it('hands on whole lines only, with the bytes each took, however the chunks fall', () => {
    const lines: [string, number][] = []
    const split = lineSplitter((line, bytes) => lines.push([line, bytes]))
    const out = Buffer.from(fixture('out.jsonl'))
    for (const at of [0, 7, 50, 51, 100]) split(out.subarray(at, [7, 50, 51, 100, out.length][[0, 7, 50, 51, 100].indexOf(at)]))
    expect(lines.map(([line]) => JSON.parse(line) as { type: string }).map((one) => one.type)).toEqual(['system', 'assistant', 'result'])
    expect(lines.reduce((sum, [, bytes]) => sum + bytes, 0)).toBe(out.length)
  })

  it('keeps a line cut off at the end until its newline comes', () => {
    const lines: string[] = []
    const split = lineSplitter((line) => lines.push(line))
    split(Buffer.from('{"a":1}\n{"b":'))
    expect(lines).toEqual(['{"a":1}'])
    split(Buffer.from('2}\n'))
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('tries again sooner at first and then every 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryAfter)).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000])
  })
})

describe("a host's conversation files", () => {
  it('reads the listing, leaving out a line that is not one', () => {
    const listed = readListing(fixture('list.txt'))
    expect(listed).toHaveLength(3)
    expect(listed[0]).toEqual({ file: '-home-leo-trailmap/1c006f9e-8bcd-4950-8f21-e41c0f0093cd.jsonl', id: '1c006f9e-8bcd-4950-8f21-e41c0f0093cd', size: 306348, at: 1787816161000 })
  })

  it('reads the ends of each file and makes its row from them', () => {
    const head = Buffer.from(
      [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'Make the tile cache build faster' }, cwd: '/home/leo/trailmap' }),
        JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5', content: [{ type: 'text', text: 'Done: it now skips unchanged tiles.' }] } }),
        '',
      ].join('\n'),
    )
    const out = `@@-home-leo-trailmap/a-1.jsonl\n${head.toString('base64')}\n@@\n@@.\n`
    const ends = readEdges(out).get('-home-leo-trailmap/a-1.jsonl')
    expect(ends?.head.toString('utf8')).toBe(head.toString('utf8'))
    expect(ends?.tail).toBeUndefined()
    const row = rowFrom({ id: 'a-1', at: 5 }, edgesOf(ends?.head ?? Buffer.alloc(0), ends?.tail, head.length))
    expect(row).toMatchObject({ id: 'a-1', title: 'Make the tile cache build faster', model: 'claude-opus-5', cwd: '/home/leo/trailmap', at: 5 })
  })
})

describe('a host that is not connected', () => {
  const root = remoteRoot('devbox', '/home/leo/trailmap')

  it('answers a list from what was kept here, without reaching it', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-hosts-'))
    try {
      const kept = [{ id: 'a-1', title: 'Make the tile cache build faster', stands: 'Done', at: 5, driven: false }]
      const path = join(folder, fakeHost.id, 'listed', `${slug('/home/leo/trailmap')}.json`)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(kept))
      const disk = new HostDisk(fakeHosts('lost'), folder)
      await expect(disk.list(root)).resolves.toEqual(kept)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('answers a list of nothing where nothing was ever kept', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-hosts-'))
    try {
      const disk = new HostDisk(fakeHosts('idle'), folder)
      await expect(disk.list(root)).resolves.toEqual([])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('reads a conversation from the copy already here, without reaching it', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-hosts-'))
    try {
      const file = join(folder, fakeHost.id, 'projects', slug('/home/leo/trailmap'), 'a-1.jsonl')
      await mkdir(dirname(file), { recursive: true })
      await writeFile(
        file,
        `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'Make the tile cache build faster' }, cwd: '/home/leo/trailmap' })}\n`,
      )
      const disk = new HostDisk(fakeHosts('needs'), folder)
      const conversation = await disk.read(root, 'a-1')
      expect(conversation?.items.some((item) => item.kind === 'mine')).toBe(true)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('has nothing to read where no copy was ever kept', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-hosts-'))
    try {
      const disk = new HostDisk(fakeHosts('idle'), folder)
      await expect(disk.read(root, 'a-1')).resolves.toBeUndefined()
      await expect(disk.goal(root, 'a-1')).resolves.toEqual({})
      await expect(disk.forkPoint(root, 'a-1', Date.now())).resolves.toBeUndefined()
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})

describe('the SSH config', () => {
  it('offers every named host with its address, user and port, and none with a pattern', () => {
    const config = `Host devbox build\n  HostName devbox.local\n  User leo\n  Port 2222\n\nHost *.internal\n  User ci\n\nHost staging # the API\n  HostName staging.example.com\nMatch host foo\n  User nobody\n`
    expect(readSshConfig(config)).toEqual([
      { host: 'devbox', address: 'devbox.local', user: 'leo', port: 2222 },
      { host: 'build', address: 'devbox.local', user: 'leo', port: 2222 },
      { host: 'staging', address: 'staging.example.com' },
    ])
  })
})

describe("a host's folders", () => {
  it('reads one level, its checkouts marked, the way up given', () => {
    const folders = readFolders('/home/leo\n@os Linux\n@home /home/leo\n@git\n1\ttrailmap\n0\t.cache\n0\tnotes\n')
    expect(folders).toEqual({
      path: '/home/leo',
      git: true,
      up: '/home',
      system: 'Linux',
      home: '/home/leo',
      folders: [
        { name: 'notes', path: '/home/leo/notes', git: false },
        { name: 'trailmap', path: '/home/leo/trailmap', git: true },
        { name: '.cache', path: '/home/leo/.cache', git: false },
      ],
    })
    expect(readFolders('/\n0\thome\n').up).toBeUndefined()
  })
})

describe('a localhost link said on a host', () => {
  it('is known by its port, and nothing else is', async () => {
    const { localPort, withPort } = await import('../src/main/hosts/forward')
    expect(localPort('http://localhost:3000/app?x=1')).toBe(3000)
    expect(localPort('http://127.0.0.1:5173')).toBe(5173)
    expect(localPort('http://localhost/')).toBe(80)
    expect(localPort('https://example.com:3000')).toBeUndefined()
    expect(localPort('http://localhostile.com')).toBeUndefined()
    expect(withPort('http://127.0.0.1:3000/app', 3001)).toBe('http://localhost:3001/app')
  })
})
