import React, { useEffect, useRef, useState } from 'react'

function ChevronDown() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function Check() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="m2.2 6.3 2.4 2.4 5.2-5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function MenuItem({ children, count, selected, onSelect, role = 'menuitemradio' }) {
  return <button
    type="button"
    role={role}
    className="dkb-menu-item"
    aria-checked={role === 'menuitemradio' ? selected === true : undefined}
    onClick={onSelect}
  >
    <span className="dkb-menu-item-check" aria-hidden="true">{selected ? <Check /> : null}</span>
    <span className="dkb-menu-item-label">{children}</span>
    {count === undefined ? null : <span className="dkb-menu-item-count">{count}</span>}
  </button>
}

export function ProjectSwitcher({
  projects = [],
  archivedProjects = [],
  selectedId,
  onSelect,
  onCreate,
  onManage,
  onArchivedProjects,
  onArchivedTasks,
  t,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const selectedProject = [...projects, ...archivedProjects].find((project) => project.id === selectedId) ?? null
  const selectedArchived = Boolean(selectedProject?.archivedAt)
  const label = selectedProject?.name ?? t('allProjects')
  const totalTasks = projects.reduce((sum, project) => sum + (project.taskCount ?? 0), 0)

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
    const first = menuRef.current?.querySelector('[role="menuitem"], [role="menuitemradio"]')
    first?.focus?.()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const runAction = (action) => {
    setOpen(false)
    triggerRef.current?.focus()
    action?.()
  }

  return <div className="dkb-switcher" ref={rootRef}>
    <button
      type="button"
      ref={triggerRef}
      className={`dkb-project-trigger${selectedArchived ? ' dkb-project-trigger-archived' : ''}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`${t('menuLabel')}: ${label}`}
      onClick={() => setOpen((value) => !value)}
    >
      <span className="dkb-project-mark" aria-hidden="true" />
      <span className="dkb-project-trigger-label">{label}</span>
      {selectedArchived ? <span className="dkb-badge">{t('archived')}</span> : null}
      <span className="dkb-project-trigger-chevron" aria-hidden="true"><ChevronDown /></span>
    </button>
    {open ? <div className="dkb-menu" role="menu" aria-label={t('menuLabel')} ref={menuRef}>
      <MenuItem
        selected={selectedProject === null}
        count={t('taskCount', { count: totalTasks })}
        onSelect={() => runAction(() => onSelect?.('__all__'))}
      >
        {t('allProjects')}
      </MenuItem>
      <div className="dkb-menu-section" role="presentation">{t('activeProjects')}</div>
      {projects.length === 0 ? <div className="dkb-menu-empty">{t('noActiveProjects')}</div> : projects.map((project) => (
        <MenuItem
          key={project.id}
          selected={selectedId === project.id}
          count={t('taskCount', { count: project.taskCount ?? 0 })}
          onSelect={() => runAction(() => onSelect?.(project.id))}
        >
          {project.name}
        </MenuItem>
      ))}
      {archivedProjects.length > 0 ? <>
        <div className="dkb-menu-divider" role="separator" />
        <div className="dkb-menu-section" role="presentation">{t('archivedProjects')}</div>
        {archivedProjects.map((project) => (
          <MenuItem
            key={project.id}
            selected={selectedId === project.id}
            count={t('taskCount', { count: project.taskCount ?? 0 })}
            onSelect={() => runAction(() => onSelect?.(project.id))}
          >
            {project.name}
          </MenuItem>
        ))}
      </> : null}
      <div className="dkb-menu-divider" role="separator" />
      <MenuItem role="menuitem" onSelect={() => runAction(onCreate)}>{t('createProject')}</MenuItem>
      <MenuItem role="menuitem" onSelect={() => runAction(onManage)}>{t('manageProjects')}</MenuItem>
      <MenuItem
        role="menuitem"
        count={archivedProjects.length > 0 ? String(archivedProjects.length) : undefined}
        onSelect={() => runAction(onArchivedProjects)}
      >
        {t('archivedProjects')}
      </MenuItem>
      <MenuItem role="menuitem" onSelect={() => runAction(onArchivedTasks)}>{t('archivedTasks')}</MenuItem>
    </div> : null}
  </div>
}
