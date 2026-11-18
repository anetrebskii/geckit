import { describe, expect, it } from 'vitest'

import { keptPlace, menuDot, menuSaid, monogram, namesShown, NAMES_FOLD, togglesNames, waitingCount, waitingSaid } from '../src/renderer/src/chat/places'

const key = (key: string, mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  key,
  metaKey: mods.meta === true,
  ctrlKey: mods.ctrl === true,
  altKey: mods.alt === true,
  shiftKey: mods.shift === true,
})

describe('keptPlace', () => {
  it('keeps a known place', () => {
    expect(keptPlace('secrets')).toBe('secrets')
    expect(keptPlace('settings')).toBe('settings')
  })

  it('falls back to Tasks for a host page kept by an earlier build or an unknown name', () => {
    expect(keptPlace('host:box')).toBe('tasks')
    expect(keptPlace('inbox')).toBe('tasks')
    expect(keptPlace('')).toBe('tasks')
  })
})

describe('namesShown', () => {
  it('shows names on a wide window unless hidden', () => {
    expect(namesShown(NAMES_FOLD, true)).toBe(true)
    expect(namesShown(NAMES_FOLD, false)).toBe(false)
  })

  it('folds to icons below the fold width', () => {
    expect(namesShown(NAMES_FOLD - 1, true)).toBe(false)
  })
})

describe('waiting', () => {
  it('holds the count to two digits', () => {
    expect(waitingCount(7)).toBe('7')
    expect(waitingCount(99)).toBe('99')
    expect(waitingCount(100)).toBe('99+')
  })

  it('says one or many', () => {
    expect(waitingSaid(1)).toBe('1 conversation waiting for you')
    expect(waitingSaid(3)).toBe('3 conversations waiting for you')
  })
})

describe('togglesNames', () => {
  it('is Cmd+Ctrl+S on macOS', () => {
    expect(togglesNames(key('s', { meta: true, ctrl: true }), true)).toBe(true)
    expect(togglesNames(key('S', { meta: true, ctrl: true }), true)).toBe(true)
    expect(togglesNames(key('s', { meta: true }), true)).toBe(false)
    expect(togglesNames(key('s', { meta: true, ctrl: true, shift: true }), true)).toBe(false)
    expect(togglesNames(key('s', { ctrl: true, alt: true }), true)).toBe(false)
  })

  it('is Ctrl+Alt+S elsewhere', () => {
    expect(togglesNames(key('s', { ctrl: true, alt: true }), false)).toBe(true)
    expect(togglesNames(key('s', { ctrl: true }), false)).toBe(false)
    expect(togglesNames(key('s', { meta: true, ctrl: true }), false)).toBe(false)
  })
})

describe('menuDot', () => {
  it('shows a waiting conversation before an unread answer', () => {
    expect(menuDot('manager', true, true)).toBe('asks')
    expect(menuSaid('asks')).toBe('Menu, a conversation is waiting for you')
  })

  it('stays off for what the shown place already shows', () => {
    expect(menuDot('tasks', true, false)).toBeUndefined()
    expect(menuDot('questions', false, true)).toBeUndefined()
    expect(menuDot('tasks', true, true)).toBe('unread')
    expect(menuSaid('unread')).toBe('Menu, a quick chat has an answer')
    expect(menuSaid(undefined)).toBe('Menu')
  })
})

describe('monogram', () => {
  it('takes the first letters of two words, or the first two letters', () => {
    expect(monogram('build-box')).toBe('BB')
    expect(monogram('Mac mini studio')).toBe('MM')
    expect(monogram('staging')).toBe('ST')
    expect(monogram('x')).toBe('X')
  })
})
