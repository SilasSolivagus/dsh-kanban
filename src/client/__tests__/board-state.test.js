import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_STATUS_BY_COLUMN,
  activeFilterCount,
  computeDropSortOrder,
  matchesFilters,
  planDropSortOrder,
  reconcileProjectFilter,
  parseCollapsedColumns,
  serializeCollapsedColumns,
  sortByOrder,
  statusForColumn,
  toggleCollapsedColumn,
} from '../board-state.js'

const task = (id, sortOrder, extra = {}) => ({
  id,
  sortOrder,
  projectId: 'p1',
  priority: 'none',
  labels: [],
  assignee: { id: 'local-user', name: 'Local user' },
  ...extra,
})

test('sortByOrder sorts ascending without mutating the input', () => {
  const input = [task('c', 300), task('a', 100), task('b', 200)]
  const output = sortByOrder(input)
  assert.deepEqual(output.map((item) => item.id), ['a', 'b', 'c'])
  assert.deepEqual(input.map((item) => item.id), ['c', 'a', 'b'])
})

test('computeDropSortOrder appends, prepends and finds a midpoint', () => {
  const column = [task('a', 1000), task('b', 2000), task('c', 3000)]
  assert.equal(computeDropSortOrder([], null), 1000)
  assert.equal(computeDropSortOrder(column, null), 4000)
  assert.equal(computeDropSortOrder(column, 'a'), 0)
  assert.equal(computeDropSortOrder(column, 'b'), 1500)
  assert.equal(computeDropSortOrder(column, 'c'), 2500)
  assert.equal(computeDropSortOrder(column, 'missing'), 4000)
})

test('planDropSortOrder keeps the fast path for append and before', () => {
  const column = [task('a', 1000), task('b', 2000), task('c', 3000)]
  const dragged = task('x', 2500, { version: 7 })
  assert.deepEqual(planDropSortOrder(column, null, dragged), { sortOrder: 4000, updates: [] })
  assert.deepEqual(planDropSortOrder(column, 'b', dragged), { sortOrder: 1500, updates: [] })
  assert.deepEqual(planDropSortOrder([], null, dragged), { sortOrder: 1000, updates: [] })
})

test('equal neighbour sortOrders trigger a deterministic rebalance', () => {
  const column = [task('a', 1000, { version: 2 }), task('b', 1000, { version: 3 })]
  const dragged = task('x', 2000, { version: 5 })
  assert.equal(computeDropSortOrder(column, 'b'), null)
  const plan = planDropSortOrder(column, 'b', dragged)
  assert.equal(plan.sortOrder, null)
  assert.deepEqual(plan.updates, [
    { id: 'x', version: 5, sortOrder: 2000 },
    { id: 'b', version: 3, sortOrder: 3000 },
  ])
  const allMoved = planDropSortOrder(
    [task('a', 1, { version: 2 }), task('b', 1, { version: 3 })],
    'b',
    task('x', 5000, { version: 5 }),
  )
  assert.deepEqual(allMoved.updates, [
    { id: 'a', version: 2, sortOrder: 1000 },
    { id: 'x', version: 5, sortOrder: 2000 },
    { id: 'b', version: 3, sortOrder: 3000 },
  ])
})

test('statusForColumn maps columns and preserves a same-column status', () => {
  assert.equal(statusForColumn('backlog', 'todo'), 'todo')
  assert.equal(statusForColumn('backlog', 'in_progress'), 'backlog')
  assert.equal(statusForColumn('running', 'backlog'), 'in_progress')
  assert.equal(statusForColumn('done', 'in_progress'), 'done')
  assert.equal(statusForColumn('needs', 'in_progress'), null)
  assert.deepEqual(DEFAULT_STATUS_BY_COLUMN, {
    backlog: 'backlog',
    running: 'in_progress',
    needs: 'in_review',
    done: 'done',
  })
})

test('same-column reorder keeps a reviewing card in reviewing', () => {
  assert.equal(statusForColumn('running', 'reviewing'), 'reviewing')
})

test('collapsed column state round-trips through localStorage JSON', () => {
  const collapsed = { backlog: true, needs: true }
  const raw = serializeCollapsedColumns(collapsed)
  assert.deepEqual(parseCollapsedColumns(raw), collapsed)
  assert.deepEqual(parseCollapsedColumns(null), {})
  assert.deepEqual(parseCollapsedColumns('not json'), {})
  assert.deepEqual(parseCollapsedColumns(JSON.stringify(['bogus', 'done'])), { done: true })
  assert.deepEqual(toggleCollapsedColumn(collapsed, 'backlog'), { needs: true })
  assert.deepEqual(toggleCollapsedColumn(collapsed, 'running'), { backlog: true, needs: true, running: true })
})

test('reconcileProjectFilter clears a conflicting selected project', () => {
  assert.equal(reconcileProjectFilter('__all__', 'p1'), '__all__')
  assert.equal(reconcileProjectFilter('p1', 'p1'), 'p1')
  assert.equal(reconcileProjectFilter('p1', 'p2'), '__all__')
  assert.equal(reconcileProjectFilter('p2', ''), 'p2')
})

test('matchesFilters applies project, priority, label and assignee filters', () => {
  const item = task('a', 1, { projectId: 'p1', priority: 'high', labels: ['ui'], assignee: { id: 'u1', name: 'Ada' } })
  assert.equal(matchesFilters(item, {}), true)
  assert.equal(matchesFilters(item, { projectId: 'p1' }), true)
  assert.equal(matchesFilters(item, { projectId: 'p2' }), false)
  assert.equal(matchesFilters(item, { priority: 'high' }), true)
  assert.equal(matchesFilters(item, { priority: 'low' }), false)
  assert.equal(matchesFilters(item, { label: 'ui' }), true)
  assert.equal(matchesFilters(item, { label: 'api' }), false)
  assert.equal(matchesFilters(item, { assignee: 'u1' }), true)
  assert.equal(matchesFilters(item, { assignee: 'u2' }), false)
  assert.equal(activeFilterCount({}), 0)
  assert.equal(activeFilterCount({ projectId: 'p1', priority: 'high', label: '', assignee: 'u1' }), 3)
})
