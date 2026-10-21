import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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

export function ArchivedTasksDialog({ t, layer, projectId, projects = [], onClose, loadArchivedTasks }) {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setTasks(null)
    setError('')
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

  const scopedProject = projectId ? projects.find((project) => project.id === projectId) ?? null : null
  const projectName = (id) => projects.find((project) => project.id === id)?.name ?? ''

  return <Modal title={t('archivedTasks')} t={t} onClose={onClose} layer={layer} wide>
    {scopedProject ? <p className="dkb-dialog-text dkb-muted">{t('archivedTasksFor', { project: scopedProject.name })}</p> : null}
    {error ? <ErrorBanner>{error}</ErrorBanner> : null}
    {tasks === null && !error ? <p className="dkb-list-empty">{t('loading')}</p> : null}
    {tasks !== null && tasks.length === 0 ? <p className="dkb-list-empty">{t('noArchivedTasks')}</p> : null}
    {tasks !== null && tasks.length > 0 ? <ul className="dkb-archive-list">
      {tasks.map((task) => <li className="dkb-archive-row" key={task.id}>
        <span className="dkb-archive-identifier">{task.identifier}</span>
        <span className="dkb-archive-title">{task.title}</span>
        {projectId ? null : <span className="dkb-archive-project">{projectName(task.projectId)}</span>}
      </li>)}
    </ul> : null}
    <div className="dkb-modal-actions">
      {error ? <button type="button" className="dkb-button" onClick={() => setReloadToken((value) => value + 1)}>{t('retry')}</button> : null}
      <button type="button" className="dkb-button dkb-button-primary" onClick={onClose}>{t('close')}</button>
    </div>
  </Modal>
}
