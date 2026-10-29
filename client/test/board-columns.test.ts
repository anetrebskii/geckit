import { describe, expect, it } from 'vitest'

import { BOARD_COLUMNS, columnOf, columnShown, inProgress, toggledColumns } from '../src/shared/api'
import type { SessionStatus } from '../src/shared/api'
import { landingIndex } from '../src/shared/order'
import type { Box } from '../src/shared/order'

describe('the columns of the board', () => {
  it('stand in their order, In progress holding what carries no status and ordered for the queue', () => {
    expect(BOARD_COLUMNS.map((one) => one.id)).toEqual(['todo', 'progress', 'done', 'archived'])
    expect(BOARD_COLUMNS.map((one) => one.status)).toEqual(['todo', undefined, 'done', 'archived'])
    expect(BOARD_COLUMNS.map((one) => one.order)).toEqual(['manual', 'lineup', 'manual', 'manual'])
    expect(BOARD_COLUMNS.map((one) => one.byDay === true)).toEqual([false, false, true, true])
  })

  it('take a card by its status, blocked and what an earlier build kept as In review in In progress', () => {
    expect(columnOf('todo').id).toBe('todo')
    expect(columnOf('done').id).toBe('done')
    expect(columnOf('blocked').id).toBe('progress')
    expect(columnOf(undefined).id).toBe('progress')
    expect(columnOf('review' as SessionStatus).id).toBe('progress')
    expect(inProgress('todo')).toBe(false)
    expect(inProgress('blocked')).toBe(true)
  })

  it('are all shown, or the ones ticked', () => {
    for (const one of BOARD_COLUMNS) expect(columnShown([], one.id)).toBe(true)
    expect(columnShown(['todo', 'done'], 'todo')).toBe(true)
    expect(columnShown(['todo', 'done'], 'progress')).toBe(false)
  })

  it('are all shown when nothing ticked is a column, rather than none', () => {
    for (const one of BOARD_COLUMNS) expect(columnShown(['review'], one.id)).toBe(true)
  })

  it('are ticked on and off one at a time, every one or none being All columns', () => {
    expect(toggledColumns([], 'todo')).toEqual(['progress', 'done', 'archived'])
    expect(toggledColumns(['progress', 'done', 'archived'], 'todo')).toEqual([])
    expect(toggledColumns(['done'], 'todo')).toEqual(['todo', 'done'])
    expect(toggledColumns(['done'], 'done')).toEqual([])
    expect(toggledColumns(['todo'], 'all')).toEqual([])
  })
})

describe('where a dragged card lands', () => {
  // Three cards one under another, 80 tall with a gap of 8.
  const column: readonly Box[] = [0, 88, 176].map((top) => ({ top, bottom: top + 80, left: 0, width: 300 }))
  // Three tiles in a row, then one in the next row.
  const tiles: readonly Box[] = [
    { top: 0, bottom: 80, left: 0, width: 300 },
    { top: 0, bottom: 80, left: 308, width: 300 },
    { top: 0, bottom: 80, left: 616, width: 300 },
    { top: 88, bottom: 168, left: 0, width: 300 },
  ]

  it('in a column, before the first card whose middle is below the pointer', () => {
    expect(landingIndex(column, 10, 10)).toBe(0)
    expect(landingIndex(column, 10, 60)).toBe(1)
    expect(landingIndex(column, 10, 130)).toBe(2)
    expect(landingIndex(column, 10, 300)).toBe(3)
  })

  it('among tiles, where in the row the pointer is, not only which row', () => {
    expect(landingIndex(tiles, 10, 40, true)).toBe(0)
    expect(landingIndex(tiles, 200, 40, true)).toBe(1)
    expect(landingIndex(tiles, 500, 40, true)).toBe(2)
    expect(landingIndex(tiles, 900, 40, true)).toBe(3)
    // Between the rows, or in the second row's own tile.
    expect(landingIndex(tiles, 500, 84, true)).toBe(3)
    expect(landingIndex(tiles, 10, 120, true)).toBe(3)
    expect(landingIndex(tiles, 290, 120, true)).toBe(4)
    expect(landingIndex(tiles, 500, 300, true)).toBe(4)
    // Left of the first tile, in the gap between two, and in the empty part of a short row.
    expect(landingIndex(tiles, -10, 40, true)).toBe(0)
    expect(landingIndex(tiles, 304, 40, true)).toBe(1)
    expect(landingIndex(tiles, 500, 120, true)).toBe(4)
  })

  it('is after the last where there are none', () => {
    expect(landingIndex([], 10, 10)).toBe(0)
  })
})
