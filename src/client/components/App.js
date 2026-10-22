import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canDrop } from '../../shared/rules.js'
import { COLUMN_IDS, PRIORITIES } from '../../shared/statuses.js'
import { api } from '../api.js'
import {
  DEFAULT_STATUS_BY_COLUMN,
  activeFilterCount,
  matchesFilters,
  parseCollapsedColumns,
  planDropSortOrder,
  reconcileProjectFilter,
  serializeCollapsedColumns,
  statusForColumn,
  toggleCollapsedColumn,
} from '../board-state.js'
import { Board } from './Board.js'
import { FiltersMenu } from './FiltersMenu.js'
import { ProjectSwitcher } from './ProjectSwitcher.js'
import { TaskDrawer } from './TaskDrawer.js'
import {
  ArchivedTasksDialog,
  ArchiveProjectDialog,
  CreateProjectDialog,
  CreateTaskDialog,
  DeleteProjectDialog,
  ManageProjectsDialog,
  RenameProjectDialog,
  projectErrorText,
  taskErrorText,
} from './dialogs.js'
import styles from '../styles.css'

const ALL_PROJECTS = '__all__'
const COLLAPSED_STORAGE_KEY = 'dsh-kanban.collapsed-columns'
const EMPTY_FILTERS = { projectId: '', priority: '', label: '', assignee: '' }
const COLUMN_ID_SET = new Set(COLUMN_IDS)
const DROP_REASON_KEYS = {
  'Needs you is automatic': 'dropNeedsAutomatic',
  'Resolve attention before moving': 'dropResolveAttention',
  'Resolve attention before Done': 'dropResolveBeforeDone',
}

function loadCollapsedColumns() {
  if (typeof window === 'undefined') return {}
  try {
    return parseCollapsedColumns(window.localStorage.getItem(COLLAPSED_STORAGE_KEY))
  } catch {
    return {}
  }
}

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="6.1" cy="6.1" r="4.1" stroke="currentColor" strokeWidth="1.4" />
    <path d="m9.2 9.2 2.4 2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
}

function RefreshIcon({ spinning }) {
  return <svg className={spinning ? 'dkb-spin' : undefined} width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M12.3 6.1A5 5 0 1 0 12.1 9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M12.6 2.8v3.6H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export function App({ t }) {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(ALL_PROJECTS)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [collapsed, setCollapsed] = useState(loadCollapsedColumns)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [restoringProject, setRestoringProject] = useState(false)
  const [error, setError] = useState(null)
  const [dialogs, setDialogs] = useState([])

  const tRef = useRef(t)
  tRef.current = t
  const dialogKey = useRef(0)
  const toastKey = useRef(0)
  const searchRef = useRef(null)
  const rootRef = useRef(null)

  const showToast = useCallback((message, tone = 'error') => {
    toastKey.current += 1
    setToast({ id: toastKey.current, message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current)
    }, 4000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const root = rootRef.current
    if (!root) return undefined
    let frame = 0
    const measure = () => {
      frame = 0
      const rail = document.querySelector('[class*="_root"][class*="_collapsed"]')
      const railRect = rail?.getBoundingClientRect()
      if (!railRect || railRect.width <= 0) {
        root.style.removeProperty('--dkb-rail-safe')
        delete root.dataset.sidebarCollapsed
        return
      }
      const rootRect = root.getBoundingClientRect()
      // Keep the switcher at least 84px from the viewport edge. The desktop
      // shell can place a floating action button past the rail's right edge,
      // so measuring the rail alone is not enough on every client build.
      const safe = Math.max(18, Math.ceil(Math.max(railRect.right + 28, 84) - rootRect.left))
      root.style.setProperty('--dkb-rail-safe', `${safe}px`)
      root.dataset.sidebarCollapsed = 'true'
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    const mutation = new MutationObserver(schedule)
    mutation.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-sidebar-collapsed', 'data-animating'],
      subtree: true,
    })
    const resize = typeof window.ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    resize?.observe(document.body)
    window.addEventListener('resize', schedule)
    const timer = window.setInterval(schedule, 1000)
    return () => {
      mutation.disconnect()
      resize?.disconnect()
      window.removeEventListener('resize', schedule)
      window.clearInterval(timer)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const load = useCallback(async ({ silent = false, selectProjectId } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await api.bootstrap()
      const nextProjects = Array.isArray(data?.projects) ? data.projects : []
      setProjects(nextProjects)
      setTasks(Array.isArray(data?.tasks) ? data.tasks : [])
      setSelectedProjectId((current) => {
        if (selectProjectId !== undefined) return selectProjectId
        if (current === ALL_PROJECTS) return current
        return nextProjects.some((project) => project.id === current) ? current : ALL_PROJECTS
      })
    } catch (failure) {
      setError(tRef.current('loadError', { message: failure?.message || tRef.current('actionFailed') }))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeProjects = useMemo(() => projects.filter((project) => !project.archivedAt), [projects])
  const archivedProjects = useMemo(() => projects.filter((project) => project.archivedAt), [projects])
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedProjectArchived = Boolean(selectedProject?.archivedAt)

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])
  const activeProjectIds = useMemo(() => new Set(activeProjects.map((project) => project.id)), [activeProjects])

  const boardTasks = useMemo(() => {
    const activeOnly = selectedProjectId === ALL_PROJECTS
    return tasks.filter((task) => {
      if (!COLUMN_ID_SET.has(task.column)) return false
      return activeOnly ? activeProjectIds.has(task.projectId) : task.projectId === selectedProjectId
    })
  }, [tasks, activeProjectIds, selectedProjectId])

  const filterOptions = useMemo(() => {
    const priorities = new Set()
    const labels = new Set()
    const assignees = new Map()
    for (const task of boardTasks) {
      if (task.priority) priorities.add(task.priority)
      for (const label of Array.isArray(task.labels) ? task.labels : []) labels.add(label)
      const assignee = task.assignee
      if (assignee?.id) assignees.set(assignee.id, assignee.name || assignee.id)
    }
    return {
      priorities: PRIORITIES.filter((priority) => priorities.has(priority)),
      labels: [...labels].sort((left, right) => left.localeCompare(right)),
      assignees: [...assignees].map(([id, name]) => ({ id, name })),
    }
  }, [boardTasks])

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    return boardTasks.filter((task) => {
      if (selectedProjectId !== ALL_PROJECTS && task.projectId !== selectedProjectId) return false
      if (!matchesFilters(task, filters)) return false
      if (!query) return true
      const haystack = [
        task.title,
        task.description,
        projectNames.get(task.projectId) ?? '',
        ...(Array.isArray(task.labels) ? task.labels : []),
      ]
      return haystack.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [boardTasks, selectedProjectId, filters, search, projectNames])

  const runningCount = visibleTasks.filter((task) => task.status === 'in_progress').length
  const filterCount = activeFilterCount(filters)

  const openDialog = useCallback((dialog) => {
    const key = `dkb-dialog-${dialogKey.current++}`
    setDialogs((current) => [...current, { ...dialog, key }])
  }, [])

  const closeDialog = useCallback((key) => {
    setDialogs((current) => current.filter((dialog) => dialog.key !== key))
  }, [])

  const selectProject = useCallback((projectId) => {
    setSelectedProjectId(projectId)
    setFilters((current) => current.projectId ? { ...current, projectId: '' } : current)
  }, [])

  const toggleColumn = useCallback((columnId) => {
    setCollapsed((current) => {
      const next = toggleCollapsedColumn(current, columnId)
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, serializeCollapsedColumns(next))
      } catch {
        // localStorage can be unavailable; collapse still works for this session.
      }
      return next
    })
  }, [])

  const changeFilter = useCallback((key, value) => {
    if (!Object.hasOwn(EMPTY_FILTERS, key)) return
    setFilters((current) => ({ ...current, [key]: value }))
    if (key === 'projectId') {
      setSelectedProjectId((current) => reconcileProjectFilter(current, value, ALL_PROJECTS))
    }
  }, [])

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), [])

  const clearSearchAndFilters = useCallback(() => {
    setSearch('')
    setFilters(EMPTY_FILTERS)
  }, [])

  const createProject = useCallback(async ({ name, workspacePath }, key) => {
    const body = { name }
    if (workspacePath) body.workspacePath = workspacePath
    const created = await api.createProject(body)
    setProjects((current) => [...current, { ...created, taskCount: 0 }])
    setSelectedProjectId(created.id)
    closeDialog(key)
    await load({ silent: true, selectProjectId: created.id })
  }, [closeDialog, load])

  const renameProject = useCallback(async (project, name, key) => {
    const updated = await api.renameProject(project.id, { name })
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    closeDialog(key)
  }, [closeDialog])

  const archiveProject = useCallback(async (project, key) => {
    const updated = await api.archiveProject(project.id)
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    setSelectedProjectId((current) => current === project.id ? ALL_PROJECTS : current)
    closeDialog(key)
    await load({ silent: true })
  }, [closeDialog, load])

  const restoreProject = useCallback(async (project, { select = false } = {}) => {
    const updated = await api.restoreProject(project.id)
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    const keepSelected = select || selectedProjectId === project.id
    await load({ silent: true, ...(keepSelected ? { selectProjectId: updated.id } : {}) })
  }, [load, selectedProjectId])

  const restoreSelectedProject = useCallback(async () => {
    if (!selectedProject || !selectedProjectArchived) return
    setRestoringProject(true)
    try {
      await restoreProject(selectedProject, { select: true })
    } catch (failure) {
      showToast(projectErrorText(failure, tRef.current))
    } finally {
      setRestoringProject(false)
    }
  }, [restoreProject, selectedProject, selectedProjectArchived, showToast])

  const deleteProject = useCallback(async (project, key) => {
    await api.deleteProject(project.id)
    setProjects((current) => current.filter((item) => item.id !== project.id))
    setSelectedProjectId((current) => current === project.id ? ALL_PROJECTS : current)
    closeDialog(key)
    await load({ silent: true })
  }, [closeDialog, load])

  const createTask = useCallback(async (payload, key) => {
    await api.createTask(payload)
    closeDialog(key)
    await load({ silent: true })
  }, [closeDialog, load])

  const addTask = useCallback((columnId) => {
    openDialog({ type: 'createTask', status: DEFAULT_STATUS_BY_COLUMN[columnId] ?? 'backlog' })
  }, [openDialog])

  const openTask = useCallback((task) => {
    setSelectedTaskId(task.id)
  }, [])

  const closeTask = useCallback(() => {
    setSelectedTaskId(null)
  }, [])

  const refreshAfterTaskChange = useCallback(() => {
    void load({ silent: true })
  }, [load])

  const closeAfterTaskArchived = useCallback(() => {
    setSelectedTaskId(null)
    void load({ silent: true })
  }, [load])

  const filterByProject = useCallback((projectId) => {
    const next = filters.projectId === projectId ? '' : projectId
    setFilters((current) => ({ ...current, projectId: next }))
    setSelectedProjectId((current) => reconcileProjectFilter(current, next, ALL_PROJECTS))
  }, [filters.projectId])

  const filterByPriority = useCallback((priority) => {
    setFilters((current) => ({ ...current, priority: current.priority === priority ? '' : priority }))
  }, [])

  const dropTask = useCallback(async (task, columnId, beforeTaskId) => {
    const check = canDrop(task, columnId)
    if (!check.ok) {
      showToast(tRef.current(DROP_REASON_KEYS[check.reason] ?? 'dropRejected'))
      return
    }
    const status = statusForColumn(columnId, task.status)
    if (!status) {
      showToast(tRef.current('dropRejected'))
      return
    }
    const columnTasks = tasks.filter((item) => (
      item.id !== task.id
      && item.column === columnId
      && activeProjectIds.has(item.projectId)
    ))
    const plan = planDropSortOrder(columnTasks, beforeTaskId, task)
    try {
      if (plan.sortOrder !== null) {
        await api.updateTask(task.id, { version: task.version, status, sortOrder: plan.sortOrder })
      } else {
        for (const update of plan.updates) {
          await api.updateTask(update.id, {
            version: update.version,
            sortOrder: update.sortOrder,
            ...(update.id === task.id ? { status } : {}),
          })
        }
      }
      await load({ silent: true })
    } catch (failure) {
      showToast(taskErrorText(failure, tRef.current))
      await load({ silent: true })
    }
  }, [tasks, activeProjectIds, load, showToast])

  const answerTask = useCallback(async (task, decision, selected, note) => {
    try {
      await api.answerQuestion(task.id, { version: task.version, decision, selected, note })
      await load({ silent: true })
    } catch (failure) {
      showToast(taskErrorText(failure, tRef.current))
      await load({ silent: true })
    }
  }, [load, showToast])

  const loadArchivedTasks = useCallback((projectId) => {
    return api.archivedTasks(projectId).then((data) => data?.tasks ?? [])
  }, [])

  const restoreArchivedTask = useCallback(async (task) => {
    await api.restoreTask(task.id, { version: task.version })
    await load({ silent: true })
  }, [load])

  const deleteArchivedTask = useCallback(async (task) => {
    await api.deleteTask(task.id, { version: task.version })
    await load({ silent: true })
  }, [load])

  const refresh = () => { void load({ silent: true }) }

  const renderDialog = (dialog, layer) => {
    const close = () => closeDialog(dialog.key)
    if (dialog.type === 'create') {
      return <CreateProjectDialog
        key={dialog.key}
        t={t}
        layer={layer}
        onClose={close}
        onCreate={(payload) => createProject(payload, dialog.key)}
      />
    }
    if (dialog.type === 'createTask') {
      return <CreateTaskDialog
        key={dialog.key}
        t={t}
        layer={layer}
        projects={activeProjects}
        defaultProjectId={selectedProjectId !== ALL_PROJECTS
          ? selectedProjectId
          : filters.projectId || (activeProjects.length === 1 ? activeProjects[0].id : '')}
        defaultStatus={dialog.status}
        onClose={close}
        onCreate={(payload) => createTask(payload, dialog.key)}
      />
    }
    if (dialog.type === 'rename') {
      return <RenameProjectDialog
        key={dialog.key}
        t={t}
        layer={layer}
        project={dialog.project}
        onClose={close}
        onRename={(project, name) => renameProject(project, name, dialog.key)}
      />
    }
    if (dialog.type === 'archive') {
      return <ArchiveProjectDialog
        key={dialog.key}
        t={t}
        layer={layer}
        project={dialog.project}
        onClose={close}
        onConfirm={(project) => archiveProject(project, dialog.key)}
      />
    }
    if (dialog.type === 'delete') {
      return <DeleteProjectDialog
        key={dialog.key}
        t={t}
        layer={layer}
        project={dialog.project}
        onClose={close}
        onConfirm={(project) => deleteProject(project, dialog.key)}
      />
    }
    if (dialog.type === 'manage') {
      return <ManageProjectsDialog
        key={dialog.key}
        t={t}
        layer={layer}
        projects={projects}
        initialView={dialog.view ?? 'active'}
        onClose={close}
        onCreate={() => openDialog({ type: 'create' })}
        onRename={(project) => openDialog({ type: 'rename', project })}
        onArchive={(project) => openDialog({ type: 'archive', project })}
        onRestore={restoreProject}
        onDelete={(project) => openDialog({ type: 'delete', project })}
      />
    }
    if (dialog.type === 'archivedTasks') {
      return <ArchivedTasksDialog
        key={dialog.key}
        t={t}
        layer={layer}
        projectId={selectedProjectId === ALL_PROJECTS ? null : selectedProjectId}
        projects={projects}
        onClose={close}
        loadArchivedTasks={loadArchivedTasks}
        onRestoreTask={restoreArchivedTask}
        onDeleteTask={deleteArchivedTask}
        onOpenTask={(task) => {
          close()
          openTask(task)
        }}
      />
    }
    return null
  }

  return <>
    <style>{styles}</style>
    <div className="dkb" ref={rootRef}>
      <header className="dkb-header">
        <ProjectSwitcher
          projects={activeProjects}
          archivedProjects={archivedProjects}
          selectedId={selectedProjectId}
          onSelect={selectProject}
          onCreate={() => openDialog({ type: 'create' })}
          onManage={() => openDialog({ type: 'manage', view: 'active' })}
          onArchivedProjects={() => openDialog({ type: 'manage', view: 'archived' })}
          onArchivedTasks={() => openDialog({ type: 'archivedTasks' })}
          t={t}
        />
        <div className="dkb-search">
          <span className="dkb-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input
            ref={searchRef}
            className="dkb-input dkb-search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
          />
        </div>
        <FiltersMenu
          t={t}
          filters={filters}
          projects={activeProjects}
          priorities={filterOptions.priorities}
          labels={filterOptions.labels}
          assignees={filterOptions.assignees}
          onChange={changeFilter}
          onClear={clearFilters}
        />
        <span className="dkb-running" aria-live="polite">
          <span className="dkb-running-dot" aria-hidden="true" />
          {t('runningCount', { count: runningCount })}
        </span>
        <button
          type="button"
          className="dkb-icon-button"
          onClick={refresh}
          disabled={refreshing}
          aria-label={refreshing ? t('refreshing') : t('refresh')}
          title={refreshing ? t('refreshing') : t('refresh')}
          aria-busy={refreshing}
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </header>

      {error ? <div className="dkb-banner dkb-banner-error" role="alert">
        <span className="dkb-banner-text">{error}</span>
        <button type="button" className="dkb-button dkb-button-small" onClick={() => { void load() }} disabled={loading || refreshing}>
          {t('retry')}
        </button>
      </div> : null}

      {selectedProjectArchived ? <div className="dkb-banner dkb-banner-readonly" role="status">
        <span className="dkb-badge dkb-badge-archived">{t('archived')}</span>
        <span className="dkb-banner-text">
          {t('archivedProjectBanner', { name: selectedProject?.name ?? '' })}
        </span>
        <button
          type="button"
          className="dkb-button dkb-button-small dkb-button-primary"
          onClick={() => { void restoreSelectedProject() }}
          disabled={restoringProject}
          aria-busy={restoringProject || undefined}
        >{restoringProject ? t('submitting') : t('restoreProject')}</button>
      </div> : null}

      <main className="dkb-main">
        {loading && projects.length === 0 ? <div className="dkb-state"><p className="dkb-muted">{t('loading')}</p></div> : null}
        {!loading && error && projects.length === 0 ? <div className="dkb-state">
          <p className="dkb-state-title">{t('loadErrorTitle')}</p>
          <button type="button" className="dkb-button dkb-button-primary" onClick={() => { void load() }}>{t('retry')}</button>
        </div> : null}
        {!loading && !error && projects.length === 0 ? <div className="dkb-state">
          <p className="dkb-state-title">{t('noProjects')}</p>
          <p className="dkb-muted">{t('noProjectsHint')}</p>
          <button type="button" className="dkb-button dkb-button-primary" onClick={() => openDialog({ type: 'create' })}>
            {t('createProject')}
          </button>
        </div> : null}
        {projects.length > 0 ? <section className="dkb-board" aria-label={t('nav')}>
          <div className="dkb-board-head">
            <div>
              <h2 className="dkb-board-title">
                <span>{selectedProject?.name ?? t('allProjects')}</span>
                {selectedProjectArchived ? <span className="dkb-badge dkb-badge-archived">{t('archived')}</span> : null}
              </h2>
              <p className="dkb-board-meta">
                {t('taskCount', { count: visibleTasks.length })}
                {filterCount > 0 ? ` · ${t('filtersActive', { count: filterCount })}` : ''}
                {selectedProjectArchived ? ` · ${t('readOnly')}` : ''}
              </p>
            </div>
          </div>
          {visibleTasks.length === 0 && (search.trim() || filterCount > 0) ? <div className="dkb-board-empty">
            <span>{t('noMatches')}</span>
            <button type="button" className="dkb-button dkb-button-small" onClick={clearSearchAndFilters}>
              {t('clearSearchAndFilters')}
            </button>
          </div> : null}
          <Board
            tasks={visibleTasks}
            collapsed={collapsed}
            projects={activeProjects}
            showProject={selectedProjectId === ALL_PROJECTS}
            readOnly={Boolean(selectedProject?.archivedAt)}
            onToggleColumn={toggleColumn}
            onOpenTask={openTask}
            onDropTask={dropTask}
            onAddTask={addTask}
            onFilterProject={filterByProject}
            onFilterPriority={filterByPriority}
            onAnswerQuestion={answerTask}
            selectedTaskId={selectedTaskId}
            t={t}
          />
        </section> : null}
      </main>

      {toast ? <div
        className={`dkb-toast dkb-toast-${toast.tone}`}
        role="status"
        aria-live="polite"
      >{toast.message}</div> : null}

      {dialogs.map(renderDialog)}

      {selectedTaskId ? <TaskDrawer
        key={selectedTaskId}
        taskId={selectedTaskId}
        projects={projects}
        onClose={closeTask}
        onChanged={refreshAfterTaskChange}
        onArchived={closeAfterTaskArchived}
        t={t}
      /> : null}
    </div>
  </>
}
