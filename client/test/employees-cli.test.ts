import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { mkdtemp, rm, symlink, realpath } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readEmployees } from '../src/cli/employees'
import { askedEndpoint } from '../src/cli/endpoint'
import { Employees } from '../src/main/employees'
import type { EmployeesCliAsked } from '../src/shared/employees'

describe('read-only employee CLI over the native application socket', () => {
  it('resolves catalog/current/history through live transport and rejects mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geckit-employee-cli-'))
    const oldClaude = process.env['CLAUDE_CODE_SESSION_ID']
    const oldCodex = process.env['CODEX_THREAD_ID']
    let assigned = ''
    const employees = new Employees({ directory, sync: async () => undefined, assignment: (session) => session === 'current-session' ? assigned : undefined, sources: async () => [{ session: { id: 'earlier', root: '/project', title: 'Earlier reel', at: 1 }, hidden: true }], items: async () => [{ kind: 'theirs', id: 'decision', text: 'Use a blue cover.' }] })
    const created = await employees.save({ name: 'Tatiana', role: 'Promotion', description: '', avatar: 'employee-01' })
    assigned = created.employees[0]?.id ?? ''
    const server = createServer((socket) => {
      let input = ''
      socket.setEncoding('utf8')
      socket.on('data', (part: string) => {
        input += part
        if (!input.includes('\n')) return
        const request = JSON.parse(input) as EmployeesCliAsked
        void employees.command(request.args, request.session).then((result) => socket.end(`${JSON.stringify({ ok: true, result })}\n`), (error: Error) => socket.end(`${JSON.stringify({ ok: false, error: error.message })}\n`))
      })
    })
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(askedEndpoint(directory), resolve) })
      process.env['CLAUDE_CODE_SESSION_ID'] = 'current-session'
      delete process.env['CODEX_THREAD_ID']
      expect((await readEmployees(['list'], directory)).said).toContain('Tatiana')
      expect((await readEmployees(['current'], directory)).said).toContain(assigned)
      expect((await readEmployees(['memory', assigned], directory)).said).toContain('Use a blue cover.')
      expect(await readEmployees(['archive', assigned], directory)).toMatchObject({ ok: false, said: expect.stringContaining('only read') })
      expect(employees.get(assigned).archived).toBe(false)
      await symlink(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      const script = join(directory, 'employee-cli.mjs')
      await build({ entryPoints: [join(process.cwd(), 'src', 'cli', 'index.ts')], outfile: script, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' })
      const executableScript = await realpath(script)
      const execute = promisify(execFile)
      const env = { ...process.env, GECKIT_DATA: directory }
      const printed = await execute(process.execPath, [executableScript, 'employees', 'current'], { env })
      expect(JSON.parse(printed.stdout)).toMatchObject({ session: 'current-session', employee: { id: assigned } })
      const history = await execute(process.execPath, [executableScript, 'employees', 'memory', assigned], { env })
      expect(history.stdout).toContain('Use a blue cover.')
      await expect(execute(process.execPath, [executableScript, 'employees', 'archive', assigned], { env })).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('only read') })
    } finally {
      if (oldClaude === undefined) delete process.env['CLAUDE_CODE_SESSION_ID']; else process.env['CLAUDE_CODE_SESSION_ID'] = oldClaude
      if (oldCodex === undefined) delete process.env['CODEX_THREAD_ID']; else process.env['CODEX_THREAD_ID'] = oldCodex
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  })
})
