import { describe, expect, it, vi } from 'vitest'

import { projectLabel, projectName } from '../src/renderer/src/chat/project'

import type { ChatSession } from '../src/shared/api'

vi.stubGlobal('window', { geckit: {}, setTimeout, clearTimeout })
vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })

const { seeks } = await import('../src/renderer/src/chat/Switcher')

const session = { id: 'a', root: '/Users/alex/Projects/mine/geckit', title: 'Add mobile push notifications', stands: 'Done', state: 'idle', at: 0, here: true, mode: 'manual' } as ChatSession
const hit = { id: 'a', root: session.root, said: 'the push notifications arrive', count: 3 }

describe('seeks', () => {
  it('opens at the latest message when the title answers, though the words are also said inside', () => {
    expect(seeks({ session, hit }, ['push', 'notifications'])).toBe(false)
  })

  it('opens at the latest message when the project answers', () => {
    expect(seeks({ session, hit }, ['geckit'])).toBe(false)
  })

  it('goes to the message when only what was said answers', () => {
    expect(seeks({ session, hit }, ['arrive'])).toBe(true)
  })

  it('opens at the latest message when nothing was found inside', () => {
    expect(seeks({ session }, ['push'])).toBe(false)
  })
})

describe('folder display names', () => {
  it.each([
    ['/Users/alex/Projects/geckit', 'geckit'],
    ['/Users/alex/Projects/geckit/', 'geckit'],
    ['C:\\Users\\niraj\\Downloads\\hypergen', 'hypergen'],
    ['C:\\Users\\niraj\\Downloads\\hypergen\\', 'hypergen'],
    ['C:/Users/niraj/Downloads\\hypergen', 'hypergen'],
    ['\\\\server\\share\\hypergen', 'hypergen'],
    ['C:\\Users\\niraj\\Downloads\\My folder', 'My folder'],
    ['ssh://devbox/home/niraj/hypergen/', 'hypergen'],
    ['ssh://devbox/home/niraj/a\\b', 'a\\b'],
    ['/', '/'],
  ])('shows the folder name for %s', (root, name) => {
    expect(projectName(root)).toBe(name)
  })

  it('uses the Windows folder name in labels on desktop and phone', () => {
    expect(projectLabel('C:\\Users\\niraj\\Downloads\\hypergen')).toBe('hypergen')
    expect(projectLabel('ssh://devbox/home/niraj/hypergen')).toBe('hypergen · devbox')
  })
})
