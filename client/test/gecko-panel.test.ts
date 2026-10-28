import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { GeckoPanel } from '../src/renderer/src/gecko/Gecko'

type Drawn = Omit<Parameters<typeof GeckoPanel>[0], 'pose' | 'count'>
const drawn = (pose: 'asleep' | 'working' | 'waiting', count: number, more: Drawn = {}): string =>
  renderToStaticMarkup(createElement(GeckoPanel, { pose, count, ...more }))

describe('the gecko panel', () => {
  it('says the state it shows', () => {
    expect(drawn('asleep', 0)).toContain('aria-label="Nothing running"')
    expect(drawn('working', 0)).toContain('aria-label="Claude is working"')
    expect(drawn('waiting', 1)).toContain('aria-label="1 conversation waiting for you"')
    expect(drawn('waiting', 3)).toContain('aria-label="3 conversations waiting for you"')
  })

  it('shows the count from 2', () => {
    expect(drawn('waiting', 1)).not.toContain('gecko-count')
    expect(drawn('waiting', 2)).toContain('<span class="gecko-count" aria-hidden="true">2</span>')
  })

  it('is drawn in parts that move on their own', () => {
    const markup = drawn('working', 0)
    for (const part of ['gk-tail', 'gk-breathe', 'gk-foot-l', 'gk-foot-r', 'gk-head', 'gk-eye-l', 'gk-eye-r', 'gk-pupil', 'gk-slit', 'gk-lid']) expect(markup).toContain(part)
  })

  it('carries what it is doing as classes, and holds still when not seen', () => {
    expect(drawn('working', 0, { blinking: true, tilting: true, hovering: true, pressing: true, hopping: true })).toContain('class="gecko-panel gecko-working gecko-hop gecko-blink gecko-tilt gecko-hover gecko-press"')
    expect(drawn('asleep', 0, { moving: false })).toContain('gecko-still')
  })

  it('looks where it is told', () => {
    expect(drawn('waiting', 1, { look: { x: 0.5, y: -0.25 } })).toContain('--lx:0.500;--ly:-0.250')
  })

  it('names its gradient for itself, so two panels on one page keep their own', () => {
    expect(drawn('working', 0)).toMatch(/url\(#[\w-]+-skin\)/)
  })
})
