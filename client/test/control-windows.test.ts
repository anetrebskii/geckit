import { describe, expect, it } from 'vitest'

import { keyLine, powershellPath, typeLine, wheel, windowsHandArgs } from '../src/main/control-windows'
import type { ScreenModifier } from '../src/shared/api'

// What the script reads: a letter and whole numbers, nothing a shell or the parser could take for more.
const LINE = /^[mduckwt]( -?\d+)+$/

describe('the phone working a Windows computer', () => {
  it('presses the named keys by their virtual key codes', () => {
    expect(keyLine('return', [])).toBe('k 13 0')
    expect(keyLine('delete', [])).toBe('k 8 0')
    expect(keyLine('forwardDelete', [])).toBe('k 46 0')
    expect(keyLine('left', ['shift'])).toBe('k 37 4')
    expect(keyLine('escape', [])).toBe('k 27 0')
  })

  it('finds a shortcut by its key on the keyboard, so Ctrl+C is the same in any layout', () => {
    expect(keyLine('c', ['control'])).toBe('k 67 1')
    expect(keyLine('C', ['control', 'shift'])).toBe('k 67 5')
    expect(keyLine('1', ['option'])).toBe('k 49 2')
    expect(keyLine('/', ['command'])).toBe('k 191 8')
  })

  it('leaves a character no US key is for to the layout in front', () => {
    expect(keyLine('ж', ['control'])).toBe(`k 0 1 ${String('ж'.charCodeAt(0))}`)
  })

  it('says nothing for a key it does not know, the names objects carry included', () => {
    expect(keyLine('f13', [])).toBeUndefined()
    expect(keyLine('constructor', [])).toBeUndefined()
    expect(keyLine('toString', [])).toBeUndefined()
    expect(keyLine('return', ['toString' as ScreenModifier])).toBe('k 13 0')
  })

  it('types text unit by unit, whatever the layout', () => {
    expect(typeLine('Hi')).toBe('t 72 105')
    expect(typeLine('Привет')).toBe(`t ${[...'Привет'].map((one) => String(one.charCodeAt(0))).join(' ')}`)
    expect(typeLine('😀')).toBe('t 55357 56832')
    expect(typeLine('')).toBeUndefined()
  })

  it('sends only lines of a letter and numbers', () => {
    const lines = [
      keyLine('return', ['control', 'option', 'shift', 'command']),
      keyLine('ж', []),
      keyLine('"', []),
      typeLine('"; Remove-Item C:\\ -Recurse #'),
      typeLine('\n\r\t'),
    ]
    for (const line of lines) expect(line).toMatch(LINE)
  })

  it('turns the wheel in whole notches, keeping what is left for the next scroll', () => {
    const turn = wheel()
    expect(turn(0, 30)).toEqual({ vertical: 120, horizontal: 0 })
    expect(turn(0, 20)).toEqual({ vertical: 0, horizontal: 0 })
    expect(turn(0, 20)).toEqual({ vertical: 120, horizontal: 0 })
    expect(turn(0, -15)).toEqual({ vertical: 0, horizontal: 0 })
    expect(turn(0, -60)).toEqual({ vertical: -240, horizontal: 0 })
    expect(turn(-30, 0).horizontal).toBe(120)
  })

  it('runs Windows own PowerShell on the script file', () => {
    expect(powershellPath('C:\\WINDOWS')).toBe('C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(powershellPath(undefined)).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(windowsHandArgs('C:\\data\\phone-hand.ps1')).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\data\\phone-hand.ps1'])
  })
})
