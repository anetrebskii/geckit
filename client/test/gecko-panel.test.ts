import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BubbleCard, choices, question } from '../src/renderer/src/gecko/Bubble'
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
    for (const part of ['gk-tail', 'gk-breathe', 'gk-foot-l', 'gk-foot-r', 'gk-head', 'gk-eye-l', 'gk-eye-r', 'gk-pupil', 'gk-dot', 'gk-shut', 'gk-happy', 'gk-mouth-smile', 'gk-mouth-o', 'gk-mouth-happy', 'gk-lie', 'gk-lie-back', 'gk-lie-tail', 'gk-peek-open']) expect(markup).toContain(part)
  })

  it('carries what it is doing as classes, and holds still when not seen', () => {
    expect(drawn('working', 0, { blinking: true, tilting: true, hovering: true, pressing: true, hopping: true })).toContain('class="gecko-panel gecko-working gecko-hop gecko-blink gecko-tilt gecko-hover gecko-press"')
    expect(drawn('asleep', 0, { moving: false })).toContain('gecko-still')
    expect(drawn('working', 0, { catching: true })).toContain('class="gecko-panel gecko-working gecko-catch"')
  })

  it('looks where it is told', () => {
    expect(drawn('waiting', 1, { look: { x: 0.5, y: -0.25 } })).toContain('--lx:0.500;--ly:-0.250')
  })

  it('names its gradient for itself, so two panels on one page keep their own', () => {
    expect(drawn('working', 0)).toMatch(/url\(#[\w-]+-skin\)/)
  })
})

describe('the gecko bubble', () => {
  const labels = (files: number, waiting: number, screenshot: boolean): string[] => choices({ files, waiting, screenshot }).map((one) => one.label)

  it('asks what to do, and offers a screenshot only where one can be taken', () => {
    expect(question({ files: 0, waiting: 0, screenshot: true })).toBe('What should I do?')
    expect(labels(0, 0, true)).toEqual(['Take a screenshot', 'New task', 'Open GeckIt'])
    expect(labels(0, 0, false)).toEqual(['New task', 'Open GeckIt'])
  })

  it('offers the waiting conversation only when one waits, with the count from 2', () => {
    expect(labels(0, 1, true)).toEqual(['Take a screenshot', 'New task', 'Open the waiting conversation', 'Open GeckIt'])
    expect(labels(0, 3, false)).toContain('Open the waiting conversation (3)')
  })

  it('asks about dropped files', () => {
    expect(question({ files: 1, waiting: 0, screenshot: true })).toBe('What should I do with this file?')
    expect(question({ files: 2, waiting: 0, screenshot: true })).toBe('What should I do with these 2 files?')
    expect(labels(1, 0, true)).toEqual(['New task with this file', 'Cancel'])
    expect(labels(2, 1, true)).toEqual(['New task with these files', 'Send to the waiting conversation', 'Cancel'])
  })

  it('is a dialog named by its question, its tail on the gecko side', () => {
    const markup = renderToStaticMarkup(createElement(BubbleCard, { asked: { files: 0, waiting: 0, screenshot: false }, side: 'left', onChoose: () => undefined }))
    expect(markup).toMatch(/class="gecko-bubble gecko-bubble-left" role="dialog" aria-labelledby="([^"]+)".*<p id="\1">What should I do\?<\/p>/)
    expect(markup.match(/<button/g)).toHaveLength(2)
  })
})
