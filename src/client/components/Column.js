import React from 'react'
import { TaskCard } from './TaskCard.js'
import { ChevronDown, ChevronRight, ColumnIcon, PlusIcon } from './icons.js'

export function Column({
  id,
  tone,
  title,
  tasks = [],
  collapsed = false,
  isOver = false,
  dropInvalid = false,
  dropBeforeTaskId = null,
  readOnly = false,
  projects = [],
  showProject = false,
  selectedTaskId = null,
  now = Date.now(),
  onToggle,
  onAdd,
  onOpenTask,
  onFilterProject,
  onFilterPriority,
  onAnswer,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  t,
}) {
  const projectName = (projectId) => projects.find((project) => project.id === projectId)?.name ?? ''
  const dropClass = [
    'dkb-column',
    `dkb-tone-${tone}`,
    collapsed ? 'dkb-column-collapsed' : '',
    isOver ? 'dkb-column-drop-target' : '',
    dropInvalid ? 'dkb-column-drop-invalid' : '',
  ].filter(Boolean).join(' ')

  const dragHandlers = {
    onDragOver: (event) => onColumnDragOver?.(event, id),
    onDragLeave: (event) => onColumnDragLeave?.(event, id),
    onDrop: (event) => onColumnDrop?.(event, id),
  }

  if (collapsed) {
    return <section className={dropClass} aria-label={title} data-column-id={id} {...dragHandlers}>
      <button
        type="button"
        className="dkb-icon-button dkb-collapsed-toggle"
        onClick={onToggle}
        aria-expanded={false}
        aria-label={t('expandColumn', { column: title })}
        title={t('expandColumn', { column: title })}
      ><ChevronRight /></button>
      <span className={`dkb-collapsed-icon dkb-column-icon-${tone}`} aria-hidden="true"><ColumnIcon tone={tone} /></span>
      <span className="dkb-collapsed-count" aria-label={t('columnCountAria', { column: title, count: tasks.length })}>{tasks.length}</span>
      <span className="dkb-collapsed-label">{title}</span>
    </section>
  }

  return <section className={dropClass} aria-label={title} data-column-id={id} {...dragHandlers}>
    <header className="dkb-column-head">
      <span className={`dkb-column-icon dkb-column-icon-${tone}`} aria-hidden="true"><ColumnIcon tone={tone} /></span>
      <h3 className="dkb-column-title">{title}</h3>
      <span className="dkb-column-count" aria-label={t('columnCountAria', { column: title, count: tasks.length })}>{tasks.length}</span>
      <button
        type="button"
        className="dkb-icon-button dkb-column-toggle"
        onClick={onToggle}
        aria-expanded={true}
        aria-label={t('collapseColumn', { column: title })}
        title={t('collapseColumn', { column: title })}
      ><ChevronDown /></button>
      <button
        type="button"
        className="dkb-icon-button dkb-column-add"
        onClick={onAdd}
        disabled={readOnly}
        aria-label={t('addCardTo', { column: title })}
        title={t('addCardTo', { column: title })}
      ><PlusIcon /></button>
    </header>
    <div className="dkb-column-body">
      {tasks.length === 0
        ? <p className="dkb-column-empty">{readOnly ? t('readOnly') : t('dropHint')}</p>
        : tasks.map((task) => <TaskCard
          key={task.id}
          task={task}
          t={t}
          now={now}
          projectName={showProject ? projectName(task.projectId) : ''}
          showProject={showProject}
          readOnly={readOnly}
          selected={selectedTaskId === task.id}
          dropBefore={dropBeforeTaskId === task.id}
          onOpen={onOpenTask}
          onFilterProject={onFilterProject}
          onFilterPriority={onFilterPriority}
          onAnswer={onAnswer}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={(event) => onCardDragOver?.(event, id, task.id)}
          onDrop={(event) => onCardDrop?.(event, id, task.id)}
        />)}
    </div>
    <footer className="dkb-column-foot">
      <button type="button" className="dkb-new-card" onClick={onAdd} disabled={readOnly}>
        <PlusIcon />
        <span>{t('newCard')}</span>
      </button>
    </footer>
  </section>
}
