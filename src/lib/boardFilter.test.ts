import { describe, expect, it } from 'vitest'
import { EMPTY_BOARD_FILTER, filterBoardTasks, isBoardFilterActive, matchesBoardFilter } from './boardFilter'
import { makeTask } from './testFactory'

describe('matchesBoardFilter — query', () => {
  it('keeps everything when the query is empty', () => {
    const task = makeTask({ title: 'Vendor comparison' })
    expect(matchesBoardFilter(task, EMPTY_BOARD_FILTER)).toBe(true)
  })

  it('matches case-insensitively on a substring of the title', () => {
    const task = makeTask({ title: 'Vendor comparison for OCR service' })
    expect(matchesBoardFilter(task, { ...EMPTY_BOARD_FILTER, query: 'ocr' })).toBe(true)
    expect(matchesBoardFilter(task, { ...EMPTY_BOARD_FILTER, query: 'OCR' })).toBe(true)
  })

  it('excludes a task whose title does not contain the query', () => {
    const task = makeTask({ title: 'Quarterly cloud cost report' })
    expect(matchesBoardFilter(task, { ...EMPTY_BOARD_FILTER, query: 'ocr' })).toBe(false)
  })

  it('ignores surrounding whitespace, so a stray space does not blank the board', () => {
    const task = makeTask({ title: 'Vendor comparison' })
    expect(matchesBoardFilter(task, { ...EMPTY_BOARD_FILTER, query: '   ' })).toBe(true)
    expect(matchesBoardFilter(task, { ...EMPTY_BOARD_FILTER, query: '  vendor  ' })).toBe(true)
  })

  it('does not match on description or deliverable — a hit the card cannot show would be unexplainable', () => {
    const task = makeTask({
      title: 'Quarterly cloud cost report',
      description: 'Depends on the OCR pipeline',
      deliverable: 'An OCR-free summary',
    })
    expect(matchesBoardFilter(task, { ...EMPTY_BOARD_FILTER, query: 'ocr' })).toBe(false)
  })
})

describe('matchesBoardFilter — assignee', () => {
  it('keeps everyone under "all"', () => {
    expect(matchesBoardFilter(makeTask({ assigneeId: 'u_1' }), EMPTY_BOARD_FILTER)).toBe(true)
    expect(matchesBoardFilter(makeTask({ assigneeId: null }), EMPTY_BOARD_FILTER)).toBe(true)
  })

  it('narrows to a single teammate', () => {
    expect(matchesBoardFilter(makeTask({ assigneeId: 'u_1' }), { ...EMPTY_BOARD_FILTER, assigneeId: 'u_1' })).toBe(true)
    expect(matchesBoardFilter(makeTask({ assigneeId: 'u_2' }), { ...EMPTY_BOARD_FILTER, assigneeId: 'u_1' })).toBe(false)
  })

  it('finds work nobody has picked up', () => {
    const filter = { ...EMPTY_BOARD_FILTER, assigneeId: 'unassigned' }
    expect(matchesBoardFilter(makeTask({ assigneeId: null }), filter)).toBe(true)
    expect(matchesBoardFilter(makeTask({ assigneeId: 'u_1' }), filter)).toBe(false)
  })
})

describe('filterBoardTasks', () => {
  it('applies query and assignee together, not either/or', () => {
    const tasks = [
      makeTask({ title: 'OCR rollout', assigneeId: 'u_1' }),
      makeTask({ title: 'OCR comparison', assigneeId: 'u_2' }),
      makeTask({ title: 'Cloud costs', assigneeId: 'u_1' }),
    ]
    const result = filterBoardTasks(tasks, { query: 'ocr', assigneeId: 'u_1' })
    expect(result.map((t) => t.title)).toEqual(['OCR rollout'])
  })
})

describe('isBoardFilterActive', () => {
  it('is false for an untouched filter', () => {
    expect(isBoardFilterActive(EMPTY_BOARD_FILTER)).toBe(false)
  })

  it('is false for a whitespace-only query — nothing is actually being hidden', () => {
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, query: '  ' })).toBe(false)
  })

  it('is true once either control is in use', () => {
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, query: 'ocr' })).toBe(true)
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, assigneeId: 'u_1' })).toBe(true)
    expect(isBoardFilterActive({ ...EMPTY_BOARD_FILTER, assigneeId: 'unassigned' })).toBe(true)
  })
})
