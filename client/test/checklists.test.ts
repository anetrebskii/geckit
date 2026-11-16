import { describe, expect, it } from 'vitest'

import type { Checklist } from '../src/shared/checklists'
import { checklistContext, checklistDone, checklistGoal, checklistItems, checklistMet, checklistsFor, copyChecklist, defaultChecklist, itemCondition, nextCondition, taskGoal, taskPlan } from '../src/shared/checklists'
import type { Settings } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { checklistsCommand } from '../src/main/checklists-cli'
import { settingsCommand } from '../src/main/agent-settings'
import { tasksFrom } from '../src/cli/start'

const feature: Checklist = {
  id: 'c1', name: 'Feature flow', root: '/work/app', isDefault: true,
  items: [
    { id: 'a', title: 'UX doc approved.', check: 'person' },
    { id: 'b', title: 'Tests pass', description: 'No test file is skipped', check: 'command', command: 'npm test' },
    { id: 'c', title: 'Lint clean', check: 'command', command: 'npm run lint', final: true },
    { id: 'd', title: '  ', check: 'none' },
  ],
}

describe('checklists', () => {
  it('sends nothing for an empty checklist and a single plain item as the goal it used to be', () => {
    expect(checklistGoal(undefined)).toBe('')
    expect(checklistGoal({ items: [{ id: 'x', title: '  ', check: 'none' }] })).toBe('')
    expect(checklistGoal({ items: [{ id: 'x', title: 'All tests in test/auth pass.', check: 'none' }] })).toBe('All tests in test/auth pass')
  })

  it('writes several items as one line, in order, with their checks and the items checked again', () => {
    const goal = checklistGoal(copyChecklist(feature))
    expect(goal).not.toContain('\n')
    expect(goal).toBe('All 3 items of Feature flow hold, in this order, one at a time: (1) UX doc approved - check: stop and ask the person to approve before going on; (2) Tests pass - No test file is skipped - check: `npm test` exits with 0; (3) Lint clean - check: `npm run lint` exits with 0. After each item holds, print "[n/3 passed] <item>" with its evidence. Before finishing, check (3) again.')
  })

  it('offers a folder its own checklists before the shared ones, and its default', () => {
    const shared: Checklist = { id: 'c2', name: 'Bug fix', items: [] }
    const other: Checklist = { id: 'c3', name: 'Other', root: '/work/other', isDefault: true, items: [] }
    expect(checklistsFor([shared, feature, other], '/work/app')).toEqual({ folder: [feature], shared: [shared] })
    expect(defaultChecklist([shared, feature, other], '/work/app')).toBe(feature)
    expect(defaultChecklist([shared, feature, other], '')).toBeUndefined()
  })

  it('copies a saved checklist with new item ids so editing the task never edits the saved one', () => {
    const copy = copyChecklist(feature)
    expect(copy.from).toEqual({ id: 'c1', name: 'Feature flow' })
    expect(copy.items.map((one) => one.title)).toEqual(feature.items.map((one) => one.title))
    expect(copy.items.some((one, at) => one.id === feature.items[at]?.id)).toBe(false)
  })
})

describe('checklists from the command line', () => {
  const shared: Checklist = { id: 's1', name: 'Release', items: [{ id: 'x', title: 'Changelog written', check: 'none' }, { id: 'y', title: 'Build passes', check: 'command', command: 'npm run build' }] }

  it('reads items as titles or objects and refuses what it cannot check', () => {
    const items = checklistItems('["Tests pass", {"title": "Lint clean", "command": "npm run lint", "final": true}, {"title": "Approved", "check": "person"}]')
    expect(items.map((one) => [one.title, one.check, one.command, one.final])).toEqual([['Tests pass', 'none', undefined, undefined], ['Lint clean', 'command', 'npm run lint', true], ['Approved', 'person', undefined, undefined]])
    expect(() => checklistItems('[]')).toThrow(/nonempty/)
    expect(() => checklistItems('[{"title": "x", "check": "command"}]')).toThrow(/needs a command/)
    expect(() => checklistItems('[{"title": "x", "check": "maybe"}]')).toThrow(/check must be/)
    expect(() => checklistItems('[{"name": "x"}]')).toThrow(/unknown field name/)
  })

  it('turns a goal, a saved checklist, typed items or the folder default into the goal', () => {
    const all = [feature, shared]
    expect(taskGoal(all, '/work/app', { goal: ' Done ' })).toBe('Done')
    expect(taskGoal(all, '/work/other', { checklist: 'release' })).toContain('All 2 items of Release hold')
    expect(taskGoal(all, '/work/app', { items: ['Only this'] })).toBe('Only this')
    expect(taskGoal(all, '/work/app', {})).toContain('of Feature flow')
    expect(taskGoal(all, '/work/other', {})).toBeUndefined()
    expect(() => taskGoal(all, '/work/other', { checklist: 'Feature flow' })).toThrow('There are: Release')
    expect(() => taskGoal(all, '/work/app', { goal: 'x', items: ['y'] })).toThrow(/one of/)
  })

  it('lists, adds, edits and removes saved checklists, one default per folder', () => {
    let current: Settings = { ...DEFAULT_SETTINGS, projects: ['/work/app', '/work/other'], checklists: [feature, shared] }
    const read = (): Settings => current
    const save = (change: Partial<Settings>): Settings => (current = { ...current, ...change })
    expect((JSON.parse(checklistsCommand(['list', '--project', 'other'], read, save)) as Checklist[]).map((one) => one.name)).toEqual(['Release'])
    const made = JSON.parse(checklistsCommand(['add', '--name', 'Bugfix', '--project', 'app', '--default', '--items', '["Failing test reproduces it", "Test passes"]'], read, save)) as Checklist & { goal: string }
    expect(made.root).toBe('/work/app')
    expect(made.goal).toContain('All 2 items of Bugfix hold')
    expect(current.checklists.filter((one) => one.isDefault === true).map((one) => one.name)).toEqual(['Bugfix'])
    checklistsCommand(['edit', '--id', 'Bugfix', '--shared'], read, save)
    const moved = current.checklists.find((one) => one.name === 'Bugfix')
    expect([moved?.root, moved?.isDefault]).toEqual([undefined, undefined])
    expect(() => checklistsCommand(['add', '--name', 'X', '--default', '--items', '["a"]'], read, save)).toThrow(/folder checklist/)
    expect(() => checklistsCommand(['add', '--name', 'X', '--project', 'nowhere', '--items', '["a"]'], read, save)).toThrow(/No folder nowhere/)
    checklistsCommand(['remove', '--id', 's1'], read, save)
    expect(current.checklists.map((one) => one.name)).toEqual(['Feature flow', 'Bugfix'])
    expect(JSON.parse(settingsCommand(['checklists', 'show', '--id', 'Feature flow'], read, save))).toMatchObject({ id: 'c1' })
  })

  it('geckit start passes a checklist or items on, never both', () => {
    expect(tasksFrom(['--project', 'app', '--checklist', 'Release', 'Ship it'], () => '')).toEqual([{ project: 'app', text: 'Ship it', checklist: 'Release' }])
    expect(tasksFrom(['--project', 'app', '--items', '["a", "b"]', 'Do it'], () => '')).toEqual([{ project: 'app', text: 'Do it', items: ['a', 'b'] }])
    expect(tasksFrom(['--project', 'app', '--items', 'nope', 'Do it'], () => '')).toBe('--items is not a JSON array of items.')
    expect(tasksFrom(['--project', 'app', '--goal', 'g', '--checklist', 'Release', 'Do it'], () => '')).toMatch(/one of goal, checklist or items/)
  })
})

describe('a running task checklist', () => {
  it('works one item at a time and checks the final ones again at the end', () => {
    let task = copyChecklist(feature)
    const conditions: string[] = []
    for (let step = 0; step < 6; step++) {
      const next = nextCondition(task)
      if (next === undefined) {
        const waiting = task.items.find((one) => one.state === 'approval')
        if (waiting === undefined) break
        task = { ...task, items: task.items.map((one) => (one.id === waiting.id ? { ...one, state: 'passed' as const } : one)) }
        continue
      }
      conditions.push(next)
      task = checklistMet(task, next) ?? task
    }
    expect(conditions).toEqual([
      'UX doc approved - check: stop and ask the person to approve before going on',
      'Tests pass - No test file is skipped - check: `npm test` exits with 0',
      'Lint clean - check: `npm run lint` exits with 0',
      'Still true after the later work: Lint clean - check: `npm run lint` exits with 0',
    ])
    expect(checklistDone(task)).toBe(true)
  })

  it('ignores a goal that is not its current item, and a single plain item is the plain goal', () => {
    const task = copyChecklist(feature)
    expect(checklistMet(task, 'something else')).toBeUndefined()
    expect(itemCondition({ id: 'x', title: 'Tests pass.', check: 'none' })).toBe('Tests pass')
    expect(checklistContext({ items: [{ id: 'x', title: 'Only', check: 'none' }] })).toBe('')
    expect(taskPlan([feature], '/work/app', { items: ['a', 'b'] }).checklist?.items.map((one) => one.title)).toEqual(['a', 'b'])
    expect(taskPlan([feature], '/work/app', {}).checklist?.from?.name).toBe('Feature flow')
  })

  it('never asks the assistant to recheck an item only the person approves', () => {
    const task = { items: [{ id: 'a', title: 'Design approved', check: 'person' as const, final: true, state: 'passed' as const }, { id: 'b', title: 'Shipped', check: 'none' as const, state: 'passed' as const }] }
    expect(nextCondition(task)).toBeUndefined()
    expect(checklistDone(task)).toBe(true)
    expect(checklistGoal({ items: task.items })).not.toContain('again')
  })
})
