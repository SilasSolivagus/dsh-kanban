import { COLUMN_IDS } from '../shared/statuses.js'

export const DEFAULT_STATUS_BY_COLUMN = {
  backlog: 'backlog',
  running: 'in_progress',
  needs: 'in_review',
  done: 'done',
}

const COLUMN_ID_SET = new Set(COLUMN_IDS)

export function sortByOrder(tasks) {
  return [...tasks].sort((left, right) => {
    const delta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    if (delta !== 0) return delta
    return String(left.id).localeCompare(String(right.id))
  })
}

/**
 * Order for a task dropped into a column, excluding the dragged task.
 * `beforeTaskId` is the card the task is inserted before, or null to append.
 * Returns null when no strictly ordered value fits between the neighbours and
 * the column must be rebalanced with `planDropSortOrder`.
 */
export function computeDropSortOrder(columnTasks, beforeTaskId) {
  const ordered = sortByOrder(columnTasks)
  if (ordered.length === 0) return 1000
  const index = beforeTaskId ? ordered.findIndex((task) => task.id === beforeTaskId) : -1
  if (index === 0) return ordered[0].sortOrder - 1000
  if (index > 0) {
    const previous = ordered[index - 1].sortOrder
    const next = ordered[index].sortOrder
    const candidate = previous + (next - previous) / 2
    if (Number.isFinite(candidate) && candidate > previous && candidate < next) return candidate
    return null
  }
  const candidate = ordered[ordered.length - 1].sortOrder + 1000
  return Number.isFinite(candidate) ? candidate : null
}

/**
 * Full drop plan for a target column. The fast path only patches the dragged
 * task; equal/invalid neighbour gaps rebalance the whole column to spaced
 * sortOrders (1000, 2000, ...) and return every task that must be PATCHed,
 * including the dragged task so its status is applied in the same pass.
 */
export function planDropSortOrder(columnTasks, beforeTaskId, draggedTask, gap = 1000) {
  const sortOrder = computeDropSortOrder(columnTasks, beforeTaskId)
  if (sortOrder !== null) return { sortOrder, updates: [] }
  const ordered = sortByOrder(columnTasks).filter((task) => task.id !== draggedTask?.id)
  const index = beforeTaskId ? ordered.findIndex((task) => task.id === beforeTaskId) : -1
  const insertAt = index === -1 ? ordered.length : index
  const fullOrder = [...ordered]
  fullOrder.splice(insertAt, 0, draggedTask)
  const updates = fullOrder
    .map((task, position) => ({
      id: task.id,
      version: task.version,
      sortOrder: (position + 1) * gap,
      original: task.sortOrder,
    }))
    .filter((entry) => entry.id === draggedTask.id || entry.sortOrder !== entry.original)
    .map(({ id, version, sortOrder: value }) => ({ id, version, sortOrder: value }))
  return { sortOrder: null, updates }
}

/**
 * A board filtered to one project must not also be scoped to a different
 * selected project. Choosing a conflicting project filter falls back to All
 * projects so the filter can never produce an unexplained empty board.
 */
export function reconcileProjectFilter(selectedProjectId, filterProjectId, allProjectsId = '__all__') {
  if (filterProjectId && selectedProjectId !== allProjectsId && filterProjectId !== selectedProjectId) {
    return allProjectsId
  }
  return selectedProjectId
}

/**
 * Stored status for a card moved into a column. Reordering inside one column
 * keeps the underlying status (Backlog contains both backlog and todo).
 */
export function statusForColumn(columnId, currentStatus) {
  if (columnId === 'backlog') {
    return currentStatus === 'backlog' || currentStatus === 'todo' ? currentStatus : 'backlog'
  }
  if (columnId === 'running') {
    return currentStatus === 'in_progress' || currentStatus === 'reviewing' ? currentStatus : 'in_progress'
  }
  if (columnId === 'done') {
    return currentStatus === 'done' ? currentStatus : 'done'
  }
  return null
}

export function parseCollapsedColumns(raw) {
  if (!raw) return {}
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  const ids = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.keys(parsed).filter((id) => parsed[id])
      : []
  const collapsed = {}
  for (const id of COLUMN_IDS) if (ids.includes(id)) collapsed[id] = true
  return collapsed
}

export function serializeCollapsedColumns(collapsed) {
  return JSON.stringify(COLUMN_IDS.filter((id) => Boolean(collapsed?.[id])))
}

export function toggleCollapsedColumn(collapsed, id) {
  if (!COLUMN_ID_SET.has(id)) return collapsed
  const next = { ...collapsed }
  if (next[id]) delete next[id]
  else next[id] = true
  return next
}

export function matchesFilters(task, filters = {}) {
  if (filters.projectId && task.projectId !== filters.projectId) return false
  if (filters.priority && task.priority !== filters.priority) return false
  if (filters.label && !(Array.isArray(task.labels) ? task.labels : []).includes(filters.label)) return false
  if (filters.assignee && task.assignee?.id !== filters.assignee) return false
  return true
}

export function activeFilterCount(filters = {}) {
  return ['projectId', 'priority', 'label', 'assignee'].filter((key) => Boolean(filters[key])).length
}
