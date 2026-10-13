import { createElement } from 'react'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BackgroundTask, SessionItem } from '../src/shared/api'
import { collapse } from '../src/shared/steps'

vi.stubGlobal('window', { geckit: { copy: () => undefined }, setTimeout, clearTimeout })
vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })

const { Transcript } = await import('../src/renderer/src/chat/Transcript')

const nothing = (): void => undefined

function drawn(items: SessionItem[], working = false, tasks?: readonly BackgroundTask[], guard: Pick<ComponentProps<typeof Transcript>, 'checkingIp' | 'heldSend' | 'retrying' | 'queued'> = {}): string {
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
      onRetry: () => undefined,
      onContinue: nothing,
      tasks,
      onTasks: nothing,
      ...guard,
    }),
  )
}

describe('conversation recovery', () => {
  const failure: SessionItem = { kind: 'note', id: 'failure', note: 'failed', text: 'Not sent. Connect your VPN, then try again.' }

  it('offers Try again after provider failures and limits', () => {
    expect(drawn([failure])).toContain('Try again</button>')
    expect(drawn([{ ...failure, note: 'limit' }])).toContain('Try again</button>')
  })

  it('keeps Continue for an explicit Stop', () => {
    const html = drawn([{ ...failure, note: 'stopped', text: 'Stopped' }])
    expect(html).toContain('Continue')
    expect(html).not.toContain('Try again</button>')
  })

  it('offers held recovery even if a question remains last', () => {
    const html = drawn([failure, { kind: 'card', id: 'permission', card: { kind: 'permission', title: 'Run the checks?' } }], false, undefined, { heldSend: true })
    expect(html).toContain('Run the checks?')
    expect(html).toContain('Try again</button>')
  })

  it('keeps one recovery action for a held unsent message', () => {
    const items: SessionItem[] = [{ kind: 'mine', id: 'unsent', text: 'Retained instruction', unsent: true }, failure]
    expect(drawn(items, false, undefined, { heldSend: true })).not.toContain('Send again')
    expect(drawn(items, false, undefined, { checkingIp: true })).not.toContain('Send again')
    expect(drawn(items)).toContain('Send again')
  })

  it('hides only the accepted queued retry and restores its action when cancelled', () => {
    const accepted: Extract<SessionItem, { kind: 'mine' }> = { kind: 'mine', id: 'accepted', text: 'First unsent message', unsent: true }
    const available: Extract<SessionItem, { kind: 'mine' }> = { kind: 'mine', id: 'available', text: 'Other unsent message', unsent: true }
    const items: SessionItem[] = [accepted, available]
    const queued = drawn(items, true, undefined, { queued: [{ id: 'queued:first', text: 'First unsent message', images: 0, again: 'accepted' }] })
    expect(queued.match(/Send again/g)).toHaveLength(1)
    expect(queued.slice(queued.indexOf('First unsent message'), queued.indexOf('Other unsent message'))).not.toContain('Send again')
    expect(drawn(items, true, undefined, { queued: [] }).match(/Send again/g)).toHaveLength(2)
    expect(drawn([{ ...accepted, unsent: false }, available], true).match(/Send again/g)).toHaveLength(1)
  })

  it('replaces recovery actions with checking status during verification', () => {
    const html = drawn([failure], false, undefined, { heldSend: true, checkingIp: true })
    expect(html).toContain('Checking public IP...')
    expect(html).not.toContain('Try again</button>')
    expect(html).not.toContain('Continue</button>')
  })

  it('disables Try again while the saved retry is waiting for provider interruption without claiming an IP check', () => {
    const html = drawn([failure], false, undefined, { heldSend: true, retrying: true })
    expect(html).toContain('class="quiet retry" disabled="">Try again</button>')
    expect(html).not.toContain('Checking public IP...')
    expect(drawn([failure], false, undefined, { heldSend: true })).not.toContain('class="quiet retry" disabled=""')
  })

  it('clears the end action once a later message has been answered', () => {
    const html = drawn([failure, { kind: 'mine', id: 'later', text: 'Continue the work' }, { kind: 'theirs', id: 'answer', text: 'Completed' }])
    expect(html).not.toContain('Try again</button>')
  })
})

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

  it('labels progress separately from the final reply and shows when work continues', () => {
    const html = drawn([
      { kind: 'theirs', id: 'progress', text: 'Checking the code.', phase: 'commentary', at: 1000 },
      { kind: 'did', id: 'command', what: 'Running npm test', live: true },
      { kind: 'theirs', id: 'answer', text: 'Fixed.', phase: 'final_answer' },
    ], true)
    expect(html.match(/Progress update/g)).toHaveLength(1)
    expect(html).toContain('Checking the code.')
    expect(html).toContain('Fixed.')
    expect(html).toContain('Still working')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('copy-answer')
  })

  it('keeps a progress-only reply from looking like a completed answer after stopping', () => {
    const html = drawn([{ kind: 'theirs', id: 'progress', text: 'Checking the code.', phase: 'commentary', at: 1000 }])
    expect(html).toContain('Progress update')
    expect(html).not.toContain('Still working')
    expect(html).not.toContain('copy-answer')
  })
})

describe('progress belongs to the current turn', () => {
  const interrupted: SessionItem[] = [
    { kind: 'mine', id: 'm1', text: 'Check models' },
    { kind: 'did', id: 'd1', what: 'Checking models', live: true, detail: 'Partial output' },
    { kind: 'note', id: 'stop', note: 'stopped', text: 'Stopped' },
  ]

  for (const phone of [false, true]) {
    const items = (turn: SessionItem[]): SessionItem[] => phone ? collapse(turn) : turn

    it(`does not revive interrupted progress when Continue starts (${phone ? 'phone' : 'desktop'})`, () => {
      const continued: SessionItem[] = [...interrupted, { kind: 'mine', id: 'm2', text: 'Continue' }]
      const waiting = drawn(items(continued), true)
      expect(waiting.match(/spinner-turn/g)).toHaveLength(1)
      expect(waiting).toContain('Still working')
      expect(waiting).not.toContain('1 step, Checking models')
      const working = drawn(items([...continued, { kind: 'did', id: 'd2', what: 'Checking the fix', live: true }]), true)
      expect(working.match(/spinner-turn/g)).toHaveLength(2)
      expect(working).toContain('1 step, Checking the fix')
      expect(working).not.toContain('1 step, Checking models')
      const completed = drawn(items([...continued, { kind: 'theirs', id: 't2', text: 'Fixed' }]))
      expect(completed).not.toContain('spinner-turn')
      expect(completed).toContain('1 step')
      expect(completed).toContain('Fixed')
    })

    it(`leaves completed histories still while a new turn waits (${phone ? 'phone' : 'desktop'})`, () => {
      const html = drawn(items([
        { kind: 'mine', id: 'm1', text: 'Fix it' },
        { kind: 'did', id: 'd1', what: 'Ran tests' },
        { kind: 'theirs', id: 't1', text: 'Fixed', phase: 'final_answer' },
        { kind: 'mine', id: 'm2', text: 'Ignore the last message about models' },
      ]), true)
      expect(html.match(/spinner-turn/g)).toHaveLength(1)
      expect(html).toContain('Fixed')
      expect(html).not.toContain('1 step, Ran tests')
    })
  }
})

it('keeps legitimate background tasks running after the turn ends', () => {
  const html = drawn([
    { kind: 'mine', id: 'm1', text: 'Start a watch' },
    { kind: 'did', id: 'd1', what: 'Started watch' },
    { kind: 'theirs', id: 't1', text: 'Watch is running' },
  ], false, [{ id: 'watch', kind: 'local_bash', what: 'Test watch', use: 'd1', status: 'running', started: 1000 }])
  expect(html).toContain('Running in the background: Test watch')
  expect(html.match(/spinner-turn/g)).toHaveLength(1)
  expect(html).not.toContain('Still working')
})

it('does not reactivate a stopped group while session state catches up', () => {
  const html = drawn([
    { kind: 'mine', id: 'm1', text: 'Check models' },
    { kind: 'did', id: 'd1', what: 'Checking models', live: true },
    { kind: 'note', id: 'stop', note: 'stopped', text: 'Stopped' },
  ], true)
  expect(html.match(/spinner-turn/g)).toHaveLength(1)
  expect(html).not.toContain('1 step, Checking models')
})

it('keeps current progress active when an unsent message is present', () => {
  const html = drawn([
    { kind: 'mine', id: 'm1', text: 'Check models' },
    { kind: 'did', id: 'd1', what: 'Checking models', live: true },
    { kind: 'mine', id: 'm2', text: 'Not delivered', unsent: true },
  ], true)
  expect(html).toContain('1 step, Checking models')
  expect(html.match(/spinner-turn/g)).toHaveLength(2)
  expect(html).toContain('Send again')
})
