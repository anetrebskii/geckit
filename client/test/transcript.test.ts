import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { SessionItem } from '../src/shared/api'

vi.stubGlobal('window', { geckit: { copy: () => undefined }, setTimeout, clearTimeout })
vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })

const { Transcript } = await import('../src/renderer/src/chat/Transcript')

const nothing = (): void => undefined

function drawn(items: SessionItem[], working = false): string {
  return renderToStaticMarkup(
    createElement(Transcript, {
      at: 's1',
      items,
      working,
      onAnswer: nothing,
      onAgain: nothing,
      onFile: nothing,
      onStopShell: nothing,
      onTypeShell: nothing,
      onBackground: nothing,
      onContinue: nothing,
      tasks: undefined,
      onTasks: nothing,
    }),
  )
}

describe('a turn in short', () => {
  const turn: SessionItem[] = [
    { kind: 'mine', id: 'm1', text: 'Fix the build' },
    { kind: 'did', id: 'd1', what: 'Read package.json' },
    { kind: 'theirs', id: 't1', text: 'Looking at the config first' },
    { kind: 'did', id: 'd2', what: 'Ran npm run build' },
    { kind: 'thought', id: 'h1', text: '' },
    { kind: 'theirs', id: 't2', text: 'Fixed: the alias was wrong' },
  ]

  it('shows the messages and every reply, and each run of steps between them as one line', () => {
    const html = drawn(turn)
    expect(html).toContain('Fix the build')
    expect(html).toContain('Looking at the config first')
    expect(html).toContain('Fixed: the alias was wrong')
    expect(html).toContain('1 step')
    expect(html).toContain('2 steps')
    expect(html).not.toContain('Read package.json')
    expect(html).not.toContain('Ran npm run build')
  })

  it('draws a run the phone was sent as one line the same way', () => {
    const html = drawn([
      { kind: 'mine', id: 'm1', text: 'Fix the build' },
      { kind: 'steps', id: 'steps:d1', ids: ['d1', 'd2', 'd3'], latest: 'Ran npm run build' },
      { kind: 'theirs', id: 't1', text: 'Fixed' },
    ])
    expect(html).toContain('3 steps')
    expect(html).not.toContain('Ran npm run build')
    expect(html).toContain('Fixed')
  })

  it('says the step a turn still going is at', () => {
    const html = drawn([...turn, { kind: 'mine', id: 'm2', text: 'And the tests' }, { kind: 'did', id: 'd3', what: 'Ran npm test' }], true)
    expect(html).toContain('1 step, Ran npm test')
  })

  it('leaves a question waiting on the person in sight', () => {
    const html = drawn([
      { kind: 'mine', id: 'm1', text: 'Deploy it' },
      { kind: 'did', id: 'd1', what: 'Read deploy.sh' },
      { kind: 'card', id: 'c1', card: { kind: 'permission', title: 'Run deploy.sh?' } },
    ])
    expect(html).toContain('1 step')
    expect(html).toContain('Run deploy.sh?')
  })
})
