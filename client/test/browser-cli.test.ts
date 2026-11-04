import { describe, expect, it } from 'vitest'
import { browser, pickProfile } from '../src/cli/browser'

describe('geckit browser design commands', () => {
  it('refuses a size that is not width x height', async () => {
    expect(await browser(['view', '12', '--size', 'big'])).toEqual({ ok: false, said: 'Give the size as <width>x<height>, such as 1280x800.' })
  })

  it('asks what to emulate', async () => {
    expect((await browser(['view', '12'])).said).toContain('Give what to emulate')
  })

  it('keeps a recording within twenty seconds of real time', async () => {
    expect((await browser(['record', '12', '--for', '6000', '--slow', '4'])).said).toBe('Record from 1 ms up to 20 seconds of real time, --for times --slow.')
  })

  it('needs a ref for hover and style', async () => {
    expect((await browser(['hover', '12'])).said).toBe('Give the ref from geckit browser read, the number in brackets.')
    expect((await browser(['style', '12', 'x'])).said).toBe('Give the ref from geckit browser read, the number in brackets.')
  })
})

describe('Chrome profile routing', () => {
  const home = { pid: 1, label: 'aleks@example.com', tabs: [10, 11], focused: 100, t: 0 }
  const work = { pid: 2, label: 'alex@work.example', tabs: [20], focused: 200, t: 0 }
  it('sends a tab to the profile that owns it, and the rest to the one used last or named', () => {
    expect(pickProfile([home, work], { tab: 11 })).toBe(home)
    expect(pickProfile([home, work], {})).toBe(work)
    expect(pickProfile([home, work], {}, 'aleks')).toBe(home)
    expect(pickProfile([home, work], { tab: 99 })).toMatch(/No tab 99/)
    expect(pickProfile([home, work], {}, 'example')).toMatch(/More than one/)
  })
})
