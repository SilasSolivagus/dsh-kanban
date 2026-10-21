import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PRIORITIES, STATUSES } from '../../shared/statuses.js'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const CREATE_STATUSES = STATUSES.filter((status) => status !== 'canceled')

export function projectErrorText(error, t) {
  if (error?.code === 'PROJECT_NOT_EMPTY') {
    return t('projectNotEmpty', { count: error?.details?.taskCount ?? 0 })
  }
  if (error?.code === 'PROJECT_EXISTS') return t('projectExists')
  if (error?.code === 'PROJECT_ARCHIVED') return t('projectArchived')
  if (error?.code === 'PROJECT_NOT_FOUND') return t('projectNotFound')
  if (error?.code === 'INVALID_FIELD') {
    return t('invalidField', { field: error?.details?.field ?? '' })
  }
  return error?.message || t('actionFailed')
}

export function taskErrorText(error, t) {
  if (error?.code === 'TASK_VERSION_CONFLICT') return t('versionConflict')
  if (error?.code === 'TASK_NEEDS_ATTENTION') return t('resolveAttention')
  if (error?.code === 'TASK_NOT_IN_REVIEW') return t('reviewNotPending')
  if (error?.code === 'TASK_ARCHIVED') return t('taskArchived')
  if (error?.code === 'TASK_NOT_FOUND') return t('taskNotFound')
  if (error?.code === 'QUESTION_ALREADY_PENDING') return t('questionAlreadyPending')
  if (error?.code === 'QUESTION_NOT_PENDING') return t('questionNotPending')
  if (error?.code === 'PROJECT_ARCHIVED') return t('projectArchived')
  if (error?.code === 'PROJECT_NOT_FOUND') return t('projectNotFound')
  if (error?.code === 'INVALID_FIELD') {
    return t('invalidField', { field: error?.details?.field ?? '' })
  }
  return error?.message || t('actionFailed')
}

function ErrorBanner({ children }) {
  return <div className="dkb-form-error" role="alert">{children}</div>
}

function Field({ label, children }) {
  return <label className="dkb-field">
    <span className="dkb-field-label">{label}</span>
    {children}
  </label>
}

function useMountedRef() {
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  return mountedRef
}

export function Modal({ title, t, onClose, layer = 0, wide = false, busy = false, children }) {
  const titleId = useId()
  const layerRef = useRef(null)
  const returnFocusRef = useRef(null)

  useLayoutEffect(() => {
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    const dialog = layerRef.current?.querySelector('[role="dialog"]')
    const target = dialog?.querySelector('[data-autofocus="true"]')
      ?? dialog?.querySelector('input, textarea, select, button')
    target?.focus?.()
  }, [])

  useEffect(() => () => {
    const target = returnFocusRef.current
    if (target?.isConnected && typeof target.focus === 'function') target.focus()
  }, [])

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = layerRef.current?.querySelector('[role="dialog"]')
    if (!dialog) return
    const focusable = [...dialog.querySelectorAll(FOCUSABLE)]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }

  const requestClose = () => {
    if (busy) return
    onClose()
  }

  return <div
    className="dkb-modal-layer"
    style={{ zIndex: 1000 + layer }}
    ref={layerRef}
    onKeyDown={onKeyDown}
    onClick={(event) => {
      if (busy) return
      if (event.target === event.currentTarget) onClose()
    }}
  >
    <div
      className={`dkb-modal${wide ? ' dkb-modal-wide' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-busy={busy || undefined}
      aria-labelledby={titleId}
    >
      <div className="dkb-modal-head">
        <h2 className="dkb-modal-title" id={titleId}>{title}</h2>
        <button
          type="button"
          className="dkb-modal-close"
          onClick={requestClose}
          disabled={busy}
          aria-disabled={busy || undefined}
          aria-label={t('close')}
          title={t('close')}
        >×</button>
      </div>
      <div className="dkb-modal-body">{children}</div>
    </div>
  </div>
}

export function CreateProjectDialog({ t, layer, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()

  const submit = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      setError(t('nameRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await onCreate({ name: cleanName, workspacePath: workspacePath.trim() })
    } catch (failure) {
      if (!mountedRef.current) return
      setError(projectErrorText(failure, t))
      setBusy(false)
    }
  }

  return <Modal title={t('createProject')} t={t} onClose={onClose} layer={layer} busy={busy}>
    <form className="dkb-form" onSubmit={submit} noValidate>
      <Field label={t('projectName')}>
        <input
          className="dkb-input"
          data-autofocus="true"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('projectNamePlaceholder')}
          autoComplete="off"
        />
      </Field>
      <Field label={t('workspacePath')}>
        <input
          className="dkb-input"
          value={workspacePath}
          onChange={(event) => setWorkspacePath(event.target.value)}
          placeholder={t('workspacePathPlaceholder')}
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <div className="dkb-modal-actions">
        <button type="button" className="dkb-button" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="submit" className="dkb-button dkb-button-primary" disabled={busy}>{t('create')}</button>
      </div>
    </form>
  </Modal>
}

export function CreateTaskDialog({
  t,
  layer,
  projects = [],
  defaultProjectId = '',
  defaultStatus = 'backlog',
  onClose,
  onCreate,
}) {
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(defaultStatus)
  const [priority, setPriority] = useState('none')
  const [labels, setLabels] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()

  const submit = async (event) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError(t('titleRequired'))
      return
    }
    if (!projectId) {
      setError(t('projectRequired'))
      return
    }
    const cleanLabels = labels.split(',').map((label) => label.trim()).filter(Boolean)
    setBusy(true)
    setError('')
    try {
      await onCreate({
        projectId,
        title: cleanTitle,
        description,
        status,
        priority,
        labels: cleanLabels,
        assigneeTarget: 'current-user',
      })
    } catch (failure) {
      if (!mountedRef.current) return
      setError(taskErrorText(failure, t))
      setBusy(false)
    }
  }

  return <Modal title={t('createTask')} t={t} onClose={onClose} layer={layer} busy={busy}>
    <form className="dkb-form" onSubmit={submit} noValidate>
      <Field label={t('taskProject')}>
        <select
          className="dkb-select"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          disabled={busy}
        >
          <option value="">{t('selectProject')}</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </Field>
      <Field label={t('taskTitle')}>
        <input
          className="dkb-input"
          data-autofocus="true"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('taskTitlePlaceholder')}
          maxLength={240}
          autoComplete="off"
          disabled={busy}
        />
      </Field>
      <Field label={t('taskDescription')}>
        <textarea
          className="dkb-textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('taskDescriptionPlaceholder')}
          rows={3}
          disabled={busy}
        />
      </Field>
      <Field label={t('taskStatus')}>
        <select className="dkb-select" value={status} onChange={(event) => setStatus(event.target.value)} disabled={busy}>
          {CREATE_STATUSES.map((value) => <option key={value} value={value}>{t(`status_${value}`)}</option>)}
        </select>
      </Field>
      <Field label={t('taskPriority')}>
        <select className="dkb-select" value={priority} onChange={(event) => setPriority(event.target.value)} disabled={busy}>
          {PRIORITIES.map((value) => <option key={value} value={value}>{t(`priority_${value}`)}</option>)}
        </select>
      </Field>
      <Field label={t('taskLabels')}>
        <input
          className="dkb-input"
          value={labels}
          onChange={(event) => setLabels(event.target.value)}
          placeholder={t('taskLabelsPlaceholder')}
          autoComplete="off"
          disabled={busy}
        />
        <span className="dkb-field-hint">{t('taskLabelsHint')}</span>
      </Field>
      <Field label={t('taskAssignee')}>
        <select className="dkb-select" defaultValue="current-user" disabled>
          <option value="current-user">{t('currentUser')}</option>
        </select>
      </Field>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <div className="dkb-modal-actions">
        <button type="button" className="dkb-button" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="submit" className="dkb-button dkb-button-primary" disabled={busy}>{t('create')}</button>
      </div>
    </form>
  </Modal>
}

export function RenameProjectDialog({ t, layer, project, onClose, onRename }) {
  const [name, setName] = useState(project.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()

  const submit = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      setError(t('nameRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await onRename(project, cleanName)
    } catch (failure) {
      if (!mountedRef.current) return
      setError(projectErrorText(failure, t))
      setBusy(false)
    }
  }

  return <Modal title={t('renameProject')} t={t} onClose={onClose} layer={layer} busy={busy}>
    <form className="dkb-form" onSubmit={submit} noValidate>
      <Field label={t('projectName')}>
        <input
          className="dkb-input"
          data-autofocus="true"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.target.select()}
          autoComplete="off"
        />
      </Field>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <div className="dkb-modal-actions">
        <button type="button" className="dkb-button" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="submit" className="dkb-button dkb-button-primary" disabled={busy}>{t('save')}</button>
      </div>
    </form>
  </Modal>
}

export function ArchiveProjectDialog({ t, layer, project, onClose, onConfirm }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onConfirm(project)
    } catch (failure) {
      if (!mountedRef.current) return
      setError(projectErrorText(failure, t))
      setBusy(false)
    }
  }

  return <Modal title={t('archiveProject')} t={t} onClose={onClose} layer={layer} busy={busy}>
    <form className="dkb-form" onSubmit={submit}>
      <p className="dkb-dialog-text">{t('archiveConfirm', { name: project.name })}</p>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <div className="dkb-modal-actions">
        <button type="button" className="dkb-button" data-autofocus="true" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="submit" className="dkb-button dkb-button-primary" disabled={busy}>{t('archive')}</button>
      </div>
    </form>
  </Modal>
}

export function DeleteProjectDialog({ t, layer, project, onClose, onConfirm }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onConfirm(project)
    } catch (failure) {
      if (!mountedRef.current) return
      setError(projectErrorText(failure, t))
      setBusy(false)
    }
  }

  return <Modal title={t('deleteProject')} t={t} onClose={onClose} layer={layer} busy={busy}>
    <form className="dkb-form" onSubmit={submit}>
      <p className="dkb-dialog-text">{t('deleteConfirm', { name: project.name })}</p>
      {project.taskCount > 0 ? <p className="dkb-warning">{t('deleteNonEmptyHint', { count: project.taskCount })}</p> : null}
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      <div className="dkb-modal-actions">
        <button type="button" className="dkb-button" data-autofocus="true" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="submit" className="dkb-button dkb-button-danger" disabled={busy}>{t('delete')}</button>
      </div>
    </form>
  </Modal>
}

export function ManageProjectsDialog({
  t,
  layer,
  projects = [],
  initialView = 'active',
  onClose,
  onCreate,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}) {
  const [view, setView] = useState(initialView)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const active = useMemo(() => projects.filter((project) => !project.archivedAt), [projects])
  const archived = useMemo(() => projects.filter((project) => project.archivedAt), [projects])
  const rows = view === 'active' ? active : archived

  const restore = async (project) => {
    setBusyId(project.id)
    setError('')
    try {
      await onRestore(project)
    } catch (failure) {
      setError(projectErrorText(failure, t))
    } finally {
      setBusyId(null)
    }
  }

  return <Modal title={t('manageProjects')} t={t} onClose={onClose} layer={layer} wide>
    <div className="dkb-tabs" role="tablist" aria-label={t('manageProjects')}>
      <button
        type="button"
        role="tab"
        className="dkb-tab"
        aria-selected={view === 'active'}
        data-autofocus={view === 'active' ? 'true' : undefined}
        onClick={() => { setView('active'); setError('') }}
      >
        {t('activeProjects')} <span className="dkb-tab-count">{active.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        className="dkb-tab"
        aria-selected={view === 'archived'}
        data-autofocus={view === 'archived' ? 'true' : undefined}
        onClick={() => { setView('archived'); setError('') }}
      >
        {t('archivedProjects')} <span className="dkb-tab-count">{archived.length}</span>
      </button>
    </div>
    {error ? <ErrorBanner>{error}</ErrorBanner> : null}
    {rows.length === 0
      ? <p className="dkb-list-empty">{view === 'active' ? t('noActiveProjects') : t('noArchivedProjects')}</p>
      : <ul className="dkb-project-list">
        {rows.map((project) => <li className="dkb-project-row" key={project.id}>
          <div className="dkb-project-row-main">
            <div className="dkb-project-row-name">
              <span className="dkb-project-row-name-text">{project.name}</span>
              {project.archivedAt ? <span className="dkb-badge">{t('archived')}</span> : null}
            </div>
            <div className="dkb-project-row-meta">
              <span>{t('taskCount', { count: project.taskCount ?? 0 })}</span>
              {project.workspacePath ? <span className="dkb-project-row-path" title={project.workspacePath}>{project.workspacePath}</span> : null}
            </div>
          </div>
          <div className="dkb-project-row-actions">
            <button type="button" className="dkb-button dkb-button-small" onClick={() => onRename(project)}>{t('rename')}</button>
            {project.archivedAt
              ? <button
                type="button"
                className="dkb-button dkb-button-small"
                onClick={() => restore(project)}
                disabled={busyId === project.id}
                aria-busy={busyId === project.id}
              >{t('restore')}</button>
              : <button type="button" className="dkb-button dkb-button-small" onClick={() => onArchive(project)}>{t('archive')}</button>}
            <button type="button" className="dkb-button dkb-button-small dkb-button-danger" onClick={() => onDelete(project)}>{t('delete')}</button>
          </div>
        </li>)}
      </ul>}
    <div className="dkb-modal-actions">
      <button type="button" className="dkb-button" onClick={onCreate}>{t('createProject')}</button>
      <button type="button" className="dkb-button dkb-button-primary" onClick={onClose}>{t('close')}</button>
    </div>
  </Modal>
}

export function ArchivedTasksDialog({
  t,
  layer,
  projectId,
  projects = [],
  onClose,
  loadArchivedTasks,
  onOpenTask,
  onRestoreTask,
  onDeleteTask,
}) {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const mountedRef = useMountedRef()

  useEffect(() => {
    let cancelled = false
    setTasks(null)
    setError('')
    setActionError('')
    Promise.resolve()
      .then(() => loadArchivedTasks(projectId ?? undefined))
      .then((list) => {
        if (!cancelled) setTasks(Array.isArray(list) ? list : [])
      })
      .catch((failure) => {
        if (!cancelled) setError(t('archivedTasksLoadError', { message: failure?.message ?? t('actionFailed') }))
      })
    return () => { cancelled = true }
  }, [loadArchivedTasks, projectId, reloadToken, t])

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const scopedProject = projectId ? projectById.get(projectId) ?? null : null
  const query = search.trim().toLowerCase()

  const groups = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : []
    const matches = !query
      ? list
      : list.filter((task) => `${task.identifier ?? ''} ${task.title ?? ''}`.toLowerCase().includes(query))
    const grouped = new Map()
    for (const task of matches) {
      if (!grouped.has(task.projectId)) grouped.set(task.projectId, [])
      grouped.get(task.projectId).push(task)
    }
    const projectOrder = new Map(projects.map((project, index) => [project.id, index]))
    const rank = (id) => projectOrder.has(id) ? projectOrder.get(id) : Number.MAX_SAFE_INTEGER
    return [...grouped.entries()]
      .sort(([left], [right]) => {
        const delta = rank(left) - rank(right)
        return delta !== 0 ? delta : String(left).localeCompare(String(right))
      })
      .map(([groupProjectId, groupTasks]) => {
        const project = projectById.get(groupProjectId) ?? null
        return {
          id: groupProjectId,
          name: project?.name ?? t('unknownProject'),
          archived: Boolean(project?.archivedAt),
          tasks: [...groupTasks].sort((left, right) => {
            const archivedDelta = String(right.archivedAt ?? '').localeCompare(String(left.archivedAt ?? ''))
            return archivedDelta !== 0
              ? archivedDelta
              : String(left.identifier ?? '').localeCompare(String(right.identifier ?? ''))
          }),
        }
      })
  }, [tasks, query, projects, projectById, t])

  const matchedCount = groups.reduce((sum, group) => sum + group.tasks.length, 0)

  const runAction = async (task, action) => {
    if (!task || busyId) return
    setBusyId(task.id)
    setActionError('')
    try {
      if (action === 'restore') await onRestoreTask?.(task)
      else await onDeleteTask?.(task)
      setPending(null)
      setReloadToken((value) => value + 1)
    } catch (failure) {
      if (mountedRef.current) setActionError(taskErrorText(failure, t))
    } finally {
      if (mountedRef.current) setBusyId(null)
    }
  }

  return <Modal title={t('archivedTasks')} t={t} onClose={onClose} layer={layer} wide busy={Boolean(busyId)}>
    <div className="dkb-archive-toolbar">
      <input
        className="dkb-input"
        data-autofocus="true"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('searchArchivedTasks')}
        aria-label={t('searchArchivedTasks')}
        disabled={tasks === null}
      />
      {tasks !== null ? <span className="dkb-archive-count">{t('taskCount', { count: matchedCount })}</span> : null}
    </div>
    {scopedProject ? <p className="dkb-dialog-text dkb-muted">
      {t('archivedTasksFor', { project: scopedProject.name })}
      {scopedProject.archivedAt ? <span className="dkb-badge dkb-archive-scope-badge">{t('archived')}</span> : null}
    </p> : null}
    {error ? <ErrorBanner>{error}</ErrorBanner> : null}
    {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
    {tasks === null && !error ? <p className="dkb-list-empty">{t('loading')}</p> : null}
    {tasks !== null && tasks.length === 0 ? <p className="dkb-list-empty">{t('noArchivedTasks')}</p> : null}
    {tasks !== null && tasks.length > 0 && groups.length === 0 ? <p className="dkb-list-empty">{t('noArchivedTasksMatch')}</p> : null}
    {groups.map((group) => <section className="dkb-archive-group" key={group.id} aria-label={group.name}>
      <header className="dkb-archive-group-head">
        <h3 className="dkb-archive-group-title">{group.name}</h3>
        {group.archived ? <span className="dkb-badge">{t('archived')}</span> : null}
        <span className="dkb-archive-group-count">{t('taskCount', { count: group.tasks.length })}</span>
      </header>
      <ul className="dkb-archive-list">
        {group.tasks.map((task) => {
          const confirming = pending?.task.id === task.id ? pending.action : null
          const locked = group.archived
          const busyRow = busyId === task.id
          const lockedTitle = locked ? t('restoreProjectFirst') : undefined
          return <li className="dkb-archive-row" key={task.id}>
            <button
              type="button"
              className="dkb-archive-open"
              onClick={() => onOpenTask?.(task)}
              title={t('openTask')}
            >
              <span className="dkb-archive-identifier">{task.identifier}</span>
              <span className="dkb-archive-title">{task.title}</span>
            </button>
            {confirming ? null : <span className="dkb-archive-row-actions">
              <button
                type="button"
                className="dkb-button dkb-button-small"
                onClick={() => setPending({ task, action: 'restore' })}
                disabled={Boolean(busyId) || locked}
                title={lockedTitle}
              >{t('restoreTask')}</button>
              <button
                type="button"
                className="dkb-button dkb-button-small dkb-button-danger"
                onClick={() => setPending({ task, action: 'delete' })}
                disabled={Boolean(busyId) || locked}
                title={lockedTitle}
              >{t('deleteTaskPermanently')}</button>
            </span>}
            {confirming ? <div className="dkb-archive-confirm" role="group" aria-label={confirming === 'delete' ? t('deleteTaskPermanently') : t('restoreTask')}>
              <p className="dkb-archive-confirm-text">
                {confirming === 'delete' ? t('deleteTaskConfirm') : t('restoreTaskConfirm')}
              </p>
              <div className="dkb-archive-confirm-actions">
                <button
                  type="button"
                  className="dkb-button dkb-button-small"
                  onClick={() => setPending(null)}
                  disabled={busyRow}
                >{t('cancel')}</button>
                <button
                  type="button"
                  className={confirming === 'delete'
                    ? 'dkb-button dkb-button-small dkb-button-danger'
                    : 'dkb-button dkb-button-small dkb-button-primary'}
                  onClick={() => { void runAction(task, confirming) }}
                  disabled={busyRow}
                >{busyRow
                    ? t('submitting')
                    : confirming === 'delete' ? t('delete') : t('restore')}</button>
              </div>
            </div> : null}
          </li>
        })}
      </ul>
    </section>)}
    <div className="dkb-modal-actions">
      {error ? <button type="button" className="dkb-button" onClick={() => setReloadToken((value) => value + 1)}>{t('retry')}</button> : null}
      <button type="button" className="dkb-button dkb-button-primary" onClick={onClose}>{t('close')}</button>
    </div>
  </Modal>
}
