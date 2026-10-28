import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { geckoItems, geckoRing } from '../src/shared/gecko'
import type { GeckoShown } from '../src/shared/gecko'
import { GeckoArt, layers } from '../src/renderer/src/gecko/Art'
import { BubbleCard, choices, question } from '../src/renderer/src/gecko/Bubble'
import { bend } from '../src/renderer/src/gecko/Gecko'
import { RingCard } from '../src/renderer/src/gecko/Ring'

type Drawn = Omit<Parameters<typeof GeckoArt>[0], 'pose' | 'count' | 'shown'>
const drawn = (pose: 'asleep' | 'working' | 'waiting', count: number, shown: GeckoShown = pose, more: Drawn = {}): string =>
  renderToStaticMarkup(createElement(GeckoArt, { pose, count, shown, ...more }))
const sorted = (set: ReadonlySet<string>): string[] => [...set].sort()

describe('the gecko', () => {
  it('says the state it shows', () => {
    expect(drawn('asleep', 0)).toContain('aria-label="Nothing running"')
    expect(drawn('working', 0)).toContain('aria-label="Claude is working"')
    expect(drawn('waiting', 1)).toContain('aria-label="1 conversation waiting for you"')
    expect(drawn('waiting', 3, 'asleep')).toContain('aria-label="3 conversations waiting for you"')
  })

  it('shows the waiting count from one, and keeps it while it dozes', () => {
    expect(drawn('working', 0)).not.toContain('gk-badge')
    expect(drawn('waiting', 1)).toContain('<span class="gk-badge" aria-hidden="true">1</span>')
    expect(drawn('waiting', 2, 'asleep')).toContain('<span class="gk-badge" aria-hidden="true">2</span>')
  })

  it('layers one body frame and one head, as the demo does', () => {
    expect(sorted(layers({ shown: 'working' }))).toEqual(['wA', 'wHead'])
    expect(sorted(layers({ shown: 'working', alt: true }))).toEqual(['wB', 'wHead'])
    expect(sorted(layers({ shown: 'waiting' }))).toEqual(['p0', 'p1', 'tB', 'tHead'])
    expect(sorted(layers({ shown: 'waiting', alt: true }))).toEqual(['p0', 'p1', 'tA', 'tHead'])
    expect(sorted(layers({ shown: 'done' }))).toEqual(['bA', 'bAh', 'p0', 'p1'])
    expect(sorted(layers({ shown: 'look' }))).toEqual(['bA', 'bAh', 'p0', 'p1'])
    expect(sorted(layers({ shown: 'asleep' }))).toEqual(['aA', 'aAh'])
  })

  it('blinks with the drawn closed eyes, and pets with the bent head, the pupils hidden', () => {
    expect(sorted(layers({ shown: 'waiting', blinking: true }))).toEqual(['tAc', 'tB'])
    expect(sorted(layers({ shown: 'done', blinking: true }))).toEqual(['bA', 'bAc'])
    expect(sorted(layers({ shown: 'waiting', petting: true }))).toEqual(['petHead', 'tB'])
  })

  it('catches files with its eyes on them, takes them, raises its camera, writes while it listens, and hops alone', () => {
    expect(sorted(layers({ shown: 'catch' }))).toEqual(['cUp', 'p0', 'p1'])
    expect(sorted(layers({ shown: 'got' }))).toEqual(['cGot'])
    expect(sorted(layers({ shown: 'camera' }))).toEqual(['cam', 'lens', 'p1'])
    expect(sorted(layers({ shown: 'listen' }))).toEqual(['lA'])
    expect(sorted(layers({ shown: 'listen', alt: true }))).toEqual(['lB'])
    expect(sorted(layers({ shown: 'waiting', hopping: true }))).toEqual(['hA'])
  })

  it('keeps every frame drawn, so none loads when it is shown, and draws only the bend asked for', () => {
    const markup = drawn('working', 0, 'working', { tilt: 3 })
    expect(markup.match(/<image/g)?.length).toBe(56)
    expect(markup).not.toContain('href=""')
    expect(markup).toMatch(/class="gk-key gk-on"[^>]*bend10-k3/)
  })

  it('carries what it is doing as classes, and holds still when not seen', () => {
    expect(drawn('working', 0, 'working', { hopping: true, pressing: true, snapping: true })).toContain('class="gecko-art gk-working gk-hop gk-press gk-snap"')
    expect(drawn('asleep', 0, 'asleep', { still: true })).toContain('class="gecko-art gk-asleep gk-still"')
  })

  it('moves the pupils where it is told', () => {
    expect(drawn('waiting', 1, 'waiting', { look: [{ x: 4, y: -2 }, { x: 16, y: 0 }] })).toContain('transform="translate(4.0 -2.0)"')
  })

  it('names its masks for itself, so two on one page keep their own', () => {
    expect(drawn('waiting', 1)).toMatch(/mask="url\(#[\w-]+-m0\)"/)
  })

  it('bends its head up and back over a pet', () => {
    expect([0, 0.3, 0.5, 0.7, 1].map(bend)).toEqual([0, 7, 4, 7, 0])
    expect(bend(0.15)).toBeGreaterThan(0)
  })
})

describe('the gecko menu as drawn', () => {
  const laid = geckoRing({ x: 600, y: 400, width: 120, height: 120 }, { x: 0, y: 0, width: 1440, height: 900 }, 6)
  const markup = renderToStaticMarkup(createElement(RingCard, { laid, items: geckoItems({ waiting: 2, screenshot: true }), focus: false, onAct: () => undefined, onClose: () => undefined }))

  it('is a menu of items with their labels, the waiting one with its count', () => {
    expect(markup).toContain('role="menu" aria-label="Gecko"')
    expect(markup.match(/role="menuitem"/g)).toHaveLength(5)
    for (const label of ['Screenshot', 'New task', 'Voice task', 'Waiting', 'Open GeckIt']) expect(markup).toContain(`<span class="gk-lbl">${label}</span>`)
    expect(markup).toContain('<b class="gk-cnt">2</b>')
  })

  it('sends each item out from the gecko to its place', () => {
    expect(markup).toContain('class="gk-ring gk-ring-open"')
    const first = laid.items[0]
    expect(markup).toContain(`--x:${String((first?.x ?? 0) - (laid.gecko.x + 60))}px`)
  })
})

describe('the gecko bubble', () => {
  const labels = (files: number, waiting: number): string[] => choices({ files, waiting }).map((one) => one.label)

  it('asks about dropped files', () => {
    expect(question({ files: 1, waiting: 0 })).toBe('What should I do with this file?')
    expect(question({ files: 2, waiting: 0 })).toBe('What should I do with these 2 files?')
    expect(labels(1, 0)).toEqual(['New task with this file', 'Cancel'])
    expect(labels(2, 1)).toEqual(['New task with these files', 'Send to the waiting conversation', 'Cancel'])
  })

  it('says a note, to be closed', () => {
    expect(question({ files: 0, waiting: 0, note: 'Nothing was heard' })).toBe('Nothing was heard')
    expect(choices({ files: 0, waiting: 2, note: 'Nothing was heard' }).map((one) => one.label)).toEqual(['Close'])
  })

  it('is a dialog named by its question, its tail on the gecko side', () => {
    const markup = renderToStaticMarkup(createElement(BubbleCard, { asked: { files: 1, waiting: 0 }, side: 'left', onChoose: () => undefined }))
    expect(markup).toMatch(/class="gecko-bubble gecko-bubble-left" role="dialog" aria-labelledby="([^"]+)".*<p id="\1">What should I do with this file\?<\/p>/)
    expect(markup.match(/<button/g)).toHaveLength(2)
  })
})
