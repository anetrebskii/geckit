import { describe, expect, it } from 'vitest'
import { computerArg } from '../src/cli/computer'
import { refusedCli } from '../src/core/cli-run'
import { computerNamed } from '../src/service/remote/computers'

describe('ordinary CLI target selection', () => {
  it('preserves omitted target and legacy alias; strips explicit local', () => {
    expect(computerArg(['settings', 'show'])).toEqual({ args: ['settings', 'show'] })
    expect(computerArg(['settings', 'show', '--host', 'local'])).toEqual({ args: ['settings', 'show'] })
    expect(computerArg(['--host=Build computer', 'settings', 'show'])).toEqual({ computer: 'Build computer', args: ['settings', 'show'] })
    expect(computerArg(['settings', 'show', '--computer', 'server'])).toEqual({ computer: 'server', args: ['settings', 'show'] })
    expect(computerArg(['start', '--', '--host', 'text'])).toEqual({ args: ['start', '--', '--host', 'text'] })
  })
  it.each([
    ['--host'], ['--host='], ['--host', '  '], ['--host', '--json'],
    ['--host', 'one', '--computer', 'two'], ['--computer=one', '--host=two'],
  ])('rejects malformed or multiple targets: %j', (...args) => {
    expect(typeof computerArg(args)).toBe('string')
  })
  it('resolves exact IDs before unique case-insensitive names, refusing ambiguity and unknown names', () => {
    const computers = [{ server: { id: 'one', name: 'Builder' } }, { server: { id: 'two', name: 'builder' } }, { server: { id: 'three', name: 'Work' } }]
    expect(computerNamed(computers, 'one')).toBe(computers[0])
    expect(computerNamed(computers, 'WORK')).toBe(computers[2])
    expect(computerNamed(computers, 'builder')).toContain('More than one')
    expect(computerNamed(computers, 'missing')).toContain('No paired computer')
  })
  it('refuses recursive targets and operator control over assistant relay', () => {
    for (const selector of ['--host', '--host=local', '--computer', '--computer=local']) expect(refusedCli(['settings', 'show', selector])).toContain('Nested host')
    expect(refusedCli(['service', 'call', 'settings:set', '[]'])).toContain('only on that computer')
    expect(refusedCli(['settings', 'show'])).toBeUndefined()
    expect(refusedCli(['employees', 'create', '--name', 'unsafe'])).toContain('authenticated operator')
  })
})
