import { describe, expect, it } from 'vitest'

import { keyLine, typeLine, wheelOf, windowsHandArgs, WINDOWS_SCRIPT } from '../src/main/control-windows'

describe('the phone working a Windows computer', () => {
  it('presses the named keys by their virtual key codes', () => {
    expect(keyLine('return', [])).toBe('k 13 0')
    expect(keyLine('delete', [])).toBe('k 8 0')
    expect(keyLine('forwardDelete', [])).toBe('k 46 0')
    expect(keyLine('left', ['shift'])).toBe('k 37 4')
    expect(keyLine('escape', [])).toBe('k 27 0')
  })

  it('finds a shortcut by its place on the keyboard, so Ctrl+C is the same in any layout', () => {
    expect(keyLine('c', ['control'])).toBe('k 67 1')
    expect(keyLine('C', ['control', 'shift'])).toBe('k 67 5')
    expect(keyLine('1', ['option'])).toBe('k 49 2')
    expect(keyLine('/', ['command'])).toBe('k 191 8')
  })

  it('types a character no key is placed for with the keys held', () => {
    expect(keyLine('ж', ['control'])).toBe(`k 0 1 ${String('ж'.charCodeAt(0))}`)
  })

  it('says nothing for a key it does not know', () => {
    expect(keyLine('f13', [])).toBeUndefined()
  })

  it('types text unit by unit, whatever the layout', () => {
    expect(typeLine('Hi')).toBe('t 72 105')
    expect(typeLine('Привет')).toBe(`t ${[...'Привет'].map((one) => String(one.charCodeAt(0))).join(' ')}`)
    expect(typeLine('😀')).toBe('t 55357 56832')
    expect(typeLine('')).toBeUndefined()
  })

  it('turns the wheel up for a scroll up and right for a scroll right', () => {
    expect(wheelOf(0, 30)).toEqual({ vertical: 120, horizontal: 0 })
    expect(wheelOf(0, -15)).toEqual({ vertical: -60, horizontal: 0 })
    expect(wheelOf(-30, 0).horizontal).toBe(120)
  })

  it('starts PowerShell on the script itself, encoded so no shell reads it', () => {
    const args = windowsHandArgs()
    expect(args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'])
    expect(Buffer.from(args.at(-1) ?? '', 'base64').toString('utf16le')).toBe(WINDOWS_SCRIPT)
  })
})
