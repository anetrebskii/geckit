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

describe('geckit browser person actions', () => {
  it('needs files that exist for upload and drop', async () => {
    expect((await browser(['upload', '12', '4'])).said).toBe('Give the files, by their paths on this computer.')
    expect((await browser(['drop', '12', '4', '/no/such/file.png'])).said).toBe('There is no file /no/such/file.png.')
  })

  it('takes a drag target or an offset', async () => {
    expect((await browser(['drag', '12', '4'])).said).toBe('Give the ref to drag onto, or --by <dx>,<dy>.')
    expect((await browser(['drag', '12', '4', '--by', 'right'])).said).toBe('Give --by as <dx>,<dy> in pixels, such as 120,0.')
  })

  it('needs text or an image to paste', async () => {
    expect((await browser(['paste', '12', '4'])).said).toBe('Give --text <text> or an image file to paste.')
  })

  it('keeps a wait within fifty seconds', async () => {
    expect((await browser(['wait', '12', '--text', 'Done', '--timeout', '90'])).said).toBe('--timeout takes 1 to 50 seconds.')
  })

  it('answers a dialog with accept or dismiss', async () => {
    expect((await browser(['dialog', '12', 'ok'])).said).toBe('Give the tab and accept or dismiss.')
  })

  it('knows the permissions it can set', async () => {
    expect((await browser(['permission', '12', 'usb', 'allow'])).said).toBe('Give the tab, one of notifications, geolocation, camera, microphone, clipboard, and allow, block or ask.')
  })

  it('needs an option to select and a key to press', async () => {
    expect((await browser(['select', '12', '4'])).said).toBe('Give the tab, the ref of the list and the option.')
    expect((await browser(['key', '12'])).said).toBe('Give the tab and the key.')
  })

  it('takes a ref inside a frame', async () => {
    expect((await browser(['hover', '12', '57.x'])).said).toBe('Give the ref from geckit browser read, the number in brackets.')
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
