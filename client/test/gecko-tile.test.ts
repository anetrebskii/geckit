import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { GeckoTile } from '../src/renderer/src/chat/Gecko'

const drawn = (pose: 'asleep' | 'working' | 'waiting', count: number): string => renderToStaticMarkup(createElement(GeckoTile, { pose, count }))

describe('the gecko tile', () => {
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

  it('walks with two strides only while working', () => {
    expect(drawn('working', 0)).toContain('gecko-art stride')
    expect(drawn('asleep', 0)).not.toContain('stride')
  })
})
