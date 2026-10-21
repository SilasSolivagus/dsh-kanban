import React, { useEffect, useRef, useState } from 'react'
import { activeFilterCount } from '../board-state.js'

function FilterField({ label, children }) {
  return <label className="dkb-filter-field">
    <span className="dkb-filter-label">{label}</span>
    {children}
  </label>
}

export function FiltersMenu({
  t,
  filters = {},
  projects = [],
  priorities = [],
  labels = [],
  assignees = [],
  onChange,
  onClear,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const count = activeFilterCount(filters)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (rootRef.current === null || rootRef.current.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const set = (key) => (event) => onChange?.(key, event.target.value)

  return <div className="dkb-filters-wrap" ref={rootRef}>
    <button
      type="button"
      ref={triggerRef}
      className="dkb-button dkb-button-ghost dkb-filters"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={count > 0 ? t('filtersCountAria', { count }) : t('filters')}
      title={count > 0 ? t('filtersCountAria', { count }) : t('filters')}
      onClick={() => setOpen((value) => !value)}
    >
      <span>{t('filters')}</span>
      {count > 0 ? <span className="dkb-filter-count">{count}</span> : null}
    </button>
    {open ? <div className="dkb-filter-popover" role="dialog" aria-label={t('filters')}>
      <p className="dkb-filter-title">{t('filters')}</p>
      <FilterField label={t('filterProject')}>
        <select className="dkb-select" value={filters.projectId ?? ''} onChange={set('projectId')}>
          <option value="">{t('filterAny')}</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </FilterField>
      <FilterField label={t('filterPriority')}>
        <select className="dkb-select" value={filters.priority ?? ''} onChange={set('priority')}>
          <option value="">{t('filterAny')}</option>
          {priorities.map((priority) => <option key={priority} value={priority}>{t(`priority_${priority}`)}</option>)}
        </select>
      </FilterField>
      <FilterField label={t('filterLabel')}>
        <select className="dkb-select" value={filters.label ?? ''} onChange={set('label')}>
          <option value="">{t('filterAny')}</option>
          {labels.map((label) => <option key={label} value={label}>{label}</option>)}
        </select>
      </FilterField>
      <FilterField label={t('filterAssignee')}>
        <select className="dkb-select" value={filters.assignee ?? ''} onChange={set('assignee')}>
          <option value="">{t('filterAny')}</option>
          {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
        </select>
      </FilterField>
      <div className="dkb-filter-actions">
        <button
          type="button"
          className="dkb-button dkb-button-small"
          onClick={() => onClear?.()}
          disabled={count === 0}
        >{t('clearFilters')}</button>
        <button
          type="button"
          className="dkb-button dkb-button-small dkb-button-primary"
          onClick={() => setOpen(false)}
        >{t('close')}</button>
      </div>
    </div> : null}
  </div>
}
