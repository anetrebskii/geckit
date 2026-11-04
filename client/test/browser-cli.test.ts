import { describe, expect, it } from 'vitest'
import { browser } from '../src/cli/browser'

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
