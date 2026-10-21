import React, { useEffect, useMemo, useState } from 'react'
import { canDrop } from '../../shared/rules.js'
import { sortByOrder } from '../board-state.js'
import { groupTasks } from '../store-state.js'
import { Column } from './Column.js'

export const COLUMNS = [
  { id: 'backlog', tone: 'backlog', labelKey: 'backlog' },
  { id: 'running', tone: 'running', labelKey: 'running' },
  { id: 'needs', tone: 'needs', labelKey: 'needs' },
  { id: 'done', tone: 'done', labelKey: 'done' },
]

export function Board({
  tasks = [],
  collapsed = {},
  projects = [],
  showProject = false,
  readOnly = false,
  selectedTaskId = null,
  onToggleColumn,
  onOpenTask,
  onDropTask,
  onAddTask,
  onFilterProject,
  onFilterPriority,
  onAnswerQuestion,
  t,
}) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const grouped = useMemo(() => groupTasks(sortByOrder(tasks)), [tasks])

  const commitDrop = (columnId, beforeTaskId) => {
    const task = dragging
    setDragging(null)
    setOver(null)
    if (readOnly || !task || beforeTaskId === task.id) return
    onDropTask?.(task, columnId, beforeTaskId ?? null)
  }

  const handleDragStart = (task) => {
    if (readOnly) return
    setDragging(task)
    setOver(null)
  }

  const handleDragEnd = () => {
    setDragging(null)
    setOver(null)
  }

  const handleColumnDragOver = (event, columnId) => {
    if (readOnly || !dragging) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setOver((current) => current?.columnId === columnId && current?.beforeTaskId === null
      ? current
      : { columnId, beforeTaskId: null })
  }

  const handleColumnDragLeave = (event, columnId) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return
    setOver((current) => current?.columnId === columnId ? null : current)
  }

  const handleColumnDrop = (event, columnId) => {
    if (readOnly) return
    event.preventDefault()
    const beforeTaskId = over?.columnId === columnId ? over.beforeTaskId : null
    commitDrop(columnId, beforeTaskId)
  }

  const handleCardDragOver = (event, columnId, taskId) => {
    if (readOnly || !dragging) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setOver({ columnId, beforeTaskId: taskId })
  }

  const handleCardDrop = (event, columnId, taskId) => {
    if (readOnly) return
    event.preventDefault()
    event.stopPropagation()
    commitDrop(columnId, taskId)
  }

  return <div className="dkb-columns" aria-readonly={readOnly || undefined}>
    {COLUMNS.map((column) => {
      const check = dragging ? canDrop(dragging, column.id) : null
      return <Column
        key={column.id}
        id={column.id}
        tone={column.tone}
        title={t(column.labelKey)}
        tasks={grouped[column.id]}
        collapsed={Boolean(collapsed[column.id])}
        projects={projects}
        showProject={showProject}
        readOnly={readOnly}
        selectedTaskId={selectedTaskId}
        now={now}
        isOver={over?.columnId === column.id}
        dropInvalid={Boolean(dragging && over?.columnId === column.id && check && !check.ok)}
        dropBeforeTaskId={over?.columnId === column.id ? over.beforeTaskId : null}
        onToggle={() => onToggleColumn?.(column.id)}
        onAdd={() => onAddTask?.(column.id)}
        onOpenTask={onOpenTask}
        onFilterProject={onFilterProject}
        onFilterPriority={onFilterPriority}
        onAnswer={onAnswerQuestion}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onCardDragOver={handleCardDragOver}
        onCardDrop={handleCardDrop}
        onColumnDragOver={handleColumnDragOver}
        onColumnDragLeave={handleColumnDragLeave}
        onColumnDrop={handleColumnDrop}
        t={t}
      />
    })}
  </div>
}
