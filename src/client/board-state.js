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
 */
export function computeDropSortOrder(columnTasks, beforeTaskId) {
  const ordered = sortByOrder(columnTasks)
  if (ordered.length === 0) return 1000
  const index = beforeTaskId ? ordered.findIndex((task) => task.id === beforeTaskId) : -1
  if (index === 0) return ordered[0].sortOrder - 1000
  if (index > 0) {
    const previous = ordered[index - 1].sortOrder
    const next = ordered[index].sortOrder
    return previous + (next - previous) / 2
  }
  return ordered[ordered.length - 1].sortOrder + 1000
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
    return currentStatus === 'in_progress' ? currentStatus : 'in_progress'
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
