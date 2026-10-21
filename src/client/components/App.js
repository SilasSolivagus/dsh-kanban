import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { groupTasks } from '../store-state.js'
import { ProjectSwitcher } from './ProjectSwitcher.js'
import {
  ArchivedTasksDialog,
  ArchiveProjectDialog,
  CreateProjectDialog,
  DeleteProjectDialog,
  ManageProjectsDialog,
  RenameProjectDialog,
} from './dialogs.js'
import styles from '../styles.css'

const ALL_PROJECTS = '__all__'

const COLUMNS = [
  { id: 'backlog', labelKey: 'backlog' },
  { id: 'running', labelKey: 'running' },
  { id: 'needs', labelKey: 'needs' },
  { id: 'done', labelKey: 'done' },
]

const COLUMN_IDS = new Set(COLUMNS.map((column) => column.id))

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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [dialogs, setDialogs] = useState([])

  const tRef = useRef(t)
  tRef.current = t
  const dialogKey = useRef(0)

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
        const match = nextProjects.find((project) => project.id === current)
        return match && !match.archivedAt ? current : ALL_PROJECTS
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
  const selectedProject = activeProjects.find((project) => project.id === selectedProjectId) ?? null

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])
  const activeProjectIds = useMemo(() => new Set(activeProjects.map((project) => project.id)), [activeProjects])

  const boardTasks = useMemo(() => {
    return tasks.filter((task) => activeProjectIds.has(task.projectId) && COLUMN_IDS.has(task.column))
  }, [tasks, activeProjectIds])

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    return boardTasks.filter((task) => {
      if (selectedProjectId !== ALL_PROJECTS && task.projectId !== selectedProjectId) return false
      if (!query) return true
      const haystack = [
        task.title,
        task.description,
        projectNames.get(task.projectId) ?? '',
        ...(Array.isArray(task.labels) ? task.labels : []),
      ]
      return haystack.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [boardTasks, selectedProjectId, search, projectNames])

  const grouped = useMemo(() => groupTasks(visibleTasks), [visibleTasks])
  const runningCount = visibleTasks.filter((task) => task.status === 'in_progress').length

  const openDialog = useCallback((dialog) => {
    const key = `dkb-dialog-${dialogKey.current++}`
    setDialogs((current) => [...current, { ...dialog, key }])
  }, [])

  const closeDialog = useCallback((key) => {
    setDialogs((current) => current.filter((dialog) => dialog.key !== key))
  }, [])

  const createProject = useCallback(async ({ name, workspacePath }, dialogKey) => {
    const body = { name }
    if (workspacePath) body.workspacePath = workspacePath
    const created = await api.createProject(body)
    setProjects((current) => [...current, { ...created, taskCount: 0 }])
    setSelectedProjectId(created.id)
    closeDialog(dialogKey)
    await load({ silent: true, selectProjectId: created.id })
  }, [closeDialog, load])

  const renameProject = useCallback(async (project, name, dialogKey) => {
    const updated = await api.renameProject(project.id, { name })
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    closeDialog(dialogKey)
  }, [closeDialog])

  const archiveProject = useCallback(async (project, dialogKey) => {
    const updated = await api.archiveProject(project.id)
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    setSelectedProjectId((current) => current === project.id ? ALL_PROJECTS : current)
    closeDialog(dialogKey)
    await load({ silent: true })
  }, [closeDialog, load])

  const restoreProject = useCallback(async (project) => {
    const updated = await api.restoreProject(project.id)
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    await load({ silent: true })
  }, [load])

  const deleteProject = useCallback(async (project, dialogKey) => {
    await api.deleteProject(project.id)
    setProjects((current) => current.filter((item) => item.id !== project.id))
    setSelectedProjectId((current) => current === project.id ? ALL_PROJECTS : current)
    closeDialog(dialogKey)
    await load({ silent: true })
  }, [closeDialog, load])

  const loadArchivedTasks = useCallback((projectId) => {
    return api.archivedTasks(projectId).then((data) => data?.tasks ?? [])
  }, [])

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
      />
    }
    return null
  }

  return <>
    <style>{styles}</style>
    <div className="dkb">
      <header className="dkb-header">
        <ProjectSwitcher
          projects={activeProjects}
          archivedCount={archivedProjects.length}
          selectedId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onCreate={() => openDialog({ type: 'create' })}
          onManage={() => openDialog({ type: 'manage', view: 'active' })}
          onArchivedProjects={() => openDialog({ type: 'manage', view: 'archived' })}
          onArchivedTasks={() => openDialog({ type: 'archivedTasks' })}
          t={t}
        />
        <div className="dkb-search">
          <span className="dkb-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input
            className="dkb-input dkb-search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
          />
        </div>
        <button
          type="button"
          className="dkb-button dkb-button-ghost dkb-filters"
          title={t('filters')}
          disabled
          aria-disabled="true"
        >
          {t('filters')}
        </button>
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
        {!loading && projects.length > 0 ? <section className="dkb-board" aria-label={t('nav')}>
          <div className="dkb-board-head">
            <div>
              <h2 className="dkb-board-title">{selectedProject?.name ?? t('allProjects')}</h2>
              <p className="dkb-board-meta">{t('taskCount', { count: visibleTasks.length })}</p>
            </div>
          </div>
          <div className="dkb-column-counts">
            {COLUMNS.map((column) => <div className={`dkb-column-count dkb-tone-${column.id}`} key={column.id}>
              <span className="dkb-column-count-label">{t(column.labelKey)}</span>
              <strong className="dkb-column-count-value">{grouped[column.id].length}</strong>
            </div>)}
          </div>
          <p className="dkb-muted dkb-board-placeholder-text">
            {visibleTasks.length === 0 ? t('boardEmpty') : t('boardPlaceholder')}
          </p>
        </section> : null}
      </main>

      {dialogs.map(renderDialog)}
    </div>
  </>
}
