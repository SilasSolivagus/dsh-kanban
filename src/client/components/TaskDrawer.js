import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { attentionReason } from '../../shared/rules.js'
import { PRIORITIES, STATUSES } from '../../shared/statuses.js'
import { api } from '../api.js'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentHref,
  formatActivityValue,
  formatBytes,
  isHttpUrl,
  sortActivityDesc,
} from '../drawer-state.js'
import { formatElapsed } from '../time.js'
import { QuestionBlock, ReviewBlock } from './QuestionBlock.js'
import { taskErrorText } from './dialogs.js'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

const FIELD_LABEL_KEYS = {
  title: 'field_title',
  description: 'field_description',
  status: 'field_status',
  priority: 'field_priority',
  labels: 'field_labels',
  links: 'field_links',
  blockedReason: 'field_blockedReason',
  pendingQuestion: 'field_pendingQuestion',
  questionResolution: 'field_questionResolution',
  attachment: 'field_attachment',
  archivedAt: 'field_archivedAt',
}

function detailErrorText(error, t) {
  if (error?.code === 'TASK_VERSION_CONFLICT') return t('versionConflictDetail')
  if (error?.code === 'ATTACHMENT_TOO_LARGE') return t('attachmentTooLarge')
  if (error?.code === 'ATTACHMENT_LIMIT_REACHED') return t('attachmentLimitReached')
  if (error?.code === 'TASK_NOT_ARCHIVED') return t('taskNotArchived')
  if (error?.code === 'NOT_FOUND') return t('actionFailed')
  return taskErrorText(error, t)
}

function newLinkId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `link-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function formatDateTime(value) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return ''
  try {
    return new Date(parsed).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return new Date(parsed).toLocaleString()
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

function fieldLabel(field, t) {
  const key = FIELD_LABEL_KEYS[field]
  return key ? t(key) : field
}

function Field({ label, children, wide = false }) {
  return <div className={`dkb-drawer-field${wide ? ' dkb-drawer-field-wide' : ''}`}>
    <span className="dkb-drawer-field-label">{label}</span>
    {children}
  </div>
}

export function TaskDrawer({ taskId, projects = [], onClose, onChanged, onArchived, t }) {
  const titleId = useId()
  const drawerRef = useRef(null)
  const closeRef = useRef(null)
  const returnFocusRef = useRef(null)
  const fileInputRef = useRef(null)
  const mountedRef = useRef(true)
  const busyRef = useRef(false)

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [busy, setBusy] = useState(false)

  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [blockerDraft, setBlockerDraft] = useState('')
  const [labelDraft, setLabelDraft] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const [questionPrompt, setQuestionPrompt] = useState('')
  const [questionNote, setQuestionNote] = useState('')
  const [questionOptions, setQuestionOptions] = useState(['', ''])
  const [requestError, setRequestError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const closeBlocked = Boolean(busy) || uploading

  const task = detail?.task ?? null
  const project = useMemo(
    () => projects.find((item) => item.id === task?.projectId) ?? null,
    [projects, task?.projectId],
  )
  const projectArchived = Boolean(project?.archivedAt)
  const taskArchived = Boolean(task?.archivedAt)
  const readOnly = projectArchived || taskArchived
  const controlsDisabled = Boolean(busy) || uploading || readOnly
  const hasPendingQuestion = Boolean(task?.pendingQuestion) && !task?.questionResolution
  const attention = task ? task.attentionReason ?? attentionReason(task) : null
  const isReview = attention === 'review' && !hasPendingQuestion
  const labels = Array.isArray(task?.labels) ? task.labels : []
  const links = Array.isArray(task?.links) ? task.links : []
  const comments = Array.isArray(detail?.comments) ? detail.comments : []
  const attachments = Array.isArray(detail?.attachments) ? detail.attachments : []
  const activity = useMemo(() => sortActivityDesc(detail?.activity), [detail?.activity])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    setActionError('')
    setDetail(null)
    api.taskDetail(taskId)
      .then((data) => {
        if (cancelled) return
        setDetail(data)
        setLoading(false)
      })
      .catch((failure) => {
        if (cancelled) return
        setLoadError(t('taskDetailLoadError', { message: detailErrorText(failure, t) }))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken, taskId, t])

  useEffect(() => {
    setBlockerDraft(task?.blockedReason ?? '')
  }, [task?.blockedReason, taskId])

  useEffect(() => {
    if (!taskArchived) setConfirm(null)
  }, [taskArchived])

  useLayoutEffect(() => {
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    closeRef.current?.focus?.()
  }, [])

  useEffect(() => () => {
    const target = returnFocusRef.current
    if (target?.isConnected && typeof target.focus === 'function') target.focus()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const body = document.body
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previousOverflow
    }
  }, [])

  const requestClose = () => {
    if (closeBlocked) return
    onClose?.()
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      requestClose()
      return
    }
    if (event.key !== 'Tab') return
    const drawer = drawerRef.current
    if (!drawer) return
    const focusable = [...drawer.querySelectorAll(FOCUSABLE)]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }

  const refreshDetail = useCallback(async () => {
    try {
      const data = await api.taskDetail(taskId)
      if (mountedRef.current) setDetail(data)
      return true
    } catch (failure) {
      if (mountedRef.current) setActionError(detailErrorText(failure, t))
      return false
    }
  }, [taskId, t])

  const mutate = useCallback(async (action, options = {}) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setActionError('')
    try {
      const result = await action()
      if (!mountedRef.current) return false
      if (result && result.id === taskId && typeof result.version === 'number') {
        setDetail((current) => current ? { ...current, task: result } : current)
      }
      if (!options.skipRefresh) await refreshDetail()
      if (!mountedRef.current) return false
      options.onSuccess?.(result)
      onChanged?.()
      return true
    } catch (failure) {
      if (!mountedRef.current) return false
      setActionError(detailErrorText(failure, t))
      options.onError?.(failure)
      await refreshDetail()
      return false
    } finally {
      busyRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }, [onChanged, refreshDetail, taskId, t])

  const changeProperty = (field, value) => {
    if (!task || controlsDisabled) return undefined
    return mutate(() => api.updateTask(task.id, { version: task.version, [field]: value }))
  }

  const addLabel = async () => {
    const label = labelDraft.trim()
    if (!label || !task || controlsDisabled) return
    if (labels.includes(label)) {
      setLabelDraft('')
      return
    }
    const ok = await mutate(() => api.updateTask(task.id, {
      version: task.version,
      labels: [...labels, label],
    }))
    if (ok) setLabelDraft('')
  }

  const removeLabel = async (label) => {
    if (!task || controlsDisabled) return
    await mutate(() => api.updateTask(task.id, {
      version: task.version,
      labels: labels.filter((item) => item !== label),
    }))
  }

  const startDescriptionEdit = () => {
    setDescriptionDraft(task?.description ?? '')
    setEditingDescription(true)
  }

  const saveDescription = async () => {
    if (!task || controlsDisabled) return
    const ok = await mutate(() => api.updateTask(task.id, {
      version: task.version,
      description: descriptionDraft,
    }))
    if (ok) setEditingDescription(false)
  }

  const setBlocker = async () => {
    const reason = blockerDraft.trim()
    if (!task || !reason || controlsDisabled) return
    await mutate(() => api.updateTask(task.id, { version: task.version, blockedReason: reason }))
  }

  const clearBlocker = async () => {
    if (!task || controlsDisabled || !task.blockedReason) return
    await mutate(() => api.updateTask(task.id, { version: task.version, blockedReason: null }))
  }

  const addLink = async () => {
    const label = linkLabel.trim()
    const url = linkUrl.trim()
    if (!task || controlsDisabled) return
    if (!label) {
      setLinkError(t('linkLabelRequired'))
      return
    }
    if (!isHttpUrl(url)) {
      setLinkError(t('invalidLinkUrl'))
      return
    }
    setLinkError('')
    const ok = await mutate(() => api.updateTask(task.id, {
      version: task.version,
      links: [...links, { id: newLinkId(), label, url }],
    }))
    if (ok) {
      setLinkLabel('')
      setLinkUrl('')
    }
  }

  const removeLink = async (linkId) => {
    if (!task || controlsDisabled) return
    await mutate(() => api.updateTask(task.id, {
      version: task.version,
      links: links.filter((link) => link.id !== linkId),
    }))
  }

  const addOptionRow = () => {
    setQuestionOptions((current) => current.length >= 5 ? current : [...current, ''])
  }

  const removeOptionRow = (index) => {
    setQuestionOptions((current) => current.length <= 2 ? current : current.filter((_, item) => item !== index))
  }

  const updateOptionRow = (index, value) => {
    setQuestionOptions((current) => current.map((item, position) => position === index ? value : item))
  }

  const submitQuestion = async (event) => {
    event.preventDefault()
    if (!task || controlsDisabled || hasPendingQuestion) return
    const prompt = questionPrompt.trim()
    const cleanedOptions = questionOptions.map((option) => option.trim())
    if (!prompt) {
      setRequestError(t('requestPromptRequired'))
      return
    }
    if (cleanedOptions.length < 2 || cleanedOptions.some((option) => !option)) {
      setRequestError(t('requestOptionsRequired'))
      return
    }
    setRequestError('')
    const ok = await mutate(() => api.askQuestion(task.id, {
      version: task.version,
      prompt,
      note: questionNote,
      options: cleanedOptions.map((label, index) => ({ id: `option-${index + 1}`, label, detail: '' })),
    }))
    if (ok) {
      setQuestionPrompt('')
      setQuestionNote('')
      setQuestionOptions(['', ''])
    }
  }

  const answerQuestion = async (currentTask, decision, selected, note) => {
    await mutate(() => api.answerQuestion(currentTask.id, {
      version: currentTask.version,
      decision,
      selected,
      note,
    }))
  }

  const addComment = async (event) => {
    event.preventDefault()
    const body = commentDraft.trim()
    if (!body || !task || controlsDisabled) return
    const ok = await mutate(() => api.addComment(task.id, { body }))
    if (ok) setCommentDraft('')
  }

  const removeComment = async (commentId) => {
    if (!task || controlsDisabled) return
    await mutate(() => api.deleteComment(task.id, commentId))
  }

  const uploadFile = async (event) => {
    const file = event.target?.files?.[0]
    if (!file || !task || controlsDisabled) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setUploadError(t('attachmentTooLarge'))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const data = await readFileAsBase64(file)
      await mutate(() => api.addAttachment(task.id, {
        filename: file.name,
        contentType: file.type || DEFAULT_CONTENT_TYPE,
        data,
      }), {
        onError: (failure) => {
          if (mountedRef.current) setUploadError(detailErrorText(failure, t))
        },
      })
    } catch {
      if (mountedRef.current) setUploadError(t('attachmentReadFailed'))
    } finally {
      if (mountedRef.current) setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = async (attachment) => {
    if (!task || controlsDisabled) return
    await mutate(() => api.deleteAttachment(task.id, attachment.id))
  }

  const archiveTask = async () => {
    if (!task || busy || taskArchived || projectArchived) return
    await mutate(() => api.archiveTask(task.id, { version: task.version }), {
      skipRefresh: true,
      onSuccess: () => onArchived?.(),
    })
  }

  const restoreTask = async () => {
    if (!task || busy || !taskArchived || projectArchived) return
    await mutate(() => api.restoreTask(task.id, { version: task.version }))
  }

  const deleteTask = async () => {
    if (!task || busy || !taskArchived || projectArchived) return
    await mutate(() => api.deleteTask(task.id, { version: task.version }), {
      skipRefresh: true,
      onSuccess: () => onArchived?.(),
    })
  }

  const projectName = project?.name ?? ''
  const updatedElapsed = task ? formatElapsed(task.updatedAt, Date.now(), t) : ''

  return <div
    className="dkb-drawer-layer"
    onKeyDown={onKeyDown}
    onClick={(event) => {
      if (event.target === event.currentTarget) requestClose()
    }}
  >
    <aside
      className="dkb-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      ref={drawerRef}
    >
      <header className="dkb-drawer-head">
        <div className="dkb-drawer-head-main">
          <p className="dkb-drawer-eyebrow">
            {projectName ? <span className="dkb-drawer-project">{projectName}</span> : null}
            {task?.identifier ? <span className="dkb-drawer-identifier">{task.identifier}</span> : null}
          </p>
          <h2 className="dkb-drawer-title" id={titleId}>{task?.title ?? t('taskDetail')}</h2>
          <p className="dkb-drawer-meta">
            {task ? <span className={`dkb-drawer-status dkb-status-${task.column ?? 'backlog'}`}>
              <span className="dkb-status-dot" aria-hidden="true" />
              {t(`status_${task.status}`)}
            </span> : null}
            {task && updatedElapsed ? <span>{t('updatedAgo', { elapsed: updatedElapsed })}</span> : null}
            {taskArchived ? <span className="dkb-badge">{t('archived')}</span> : null}
            {projectArchived && !taskArchived ? <span className="dkb-badge">{t('readOnly')}</span> : null}
          </p>
        </div>
        <button
          type="button"
          className="dkb-modal-close"
          onClick={requestClose}
          disabled={closeBlocked}
          aria-disabled={closeBlocked || undefined}
          aria-label={t('close')}
          title={t('close')}
          ref={closeRef}
        >×</button>
      </header>

      {loading ? <div className="dkb-drawer-state">
        <p className="dkb-muted">{t('loading')}</p>
      </div> : null}

      {!loading && loadError ? <div className="dkb-drawer-state">
        <p className="dkb-state-title">{t('loadErrorTitle')}</p>
        <p className="dkb-muted" role="alert">{loadError}</p>
        <button
          type="button"
          className="dkb-button dkb-button-primary"
          onClick={() => setReloadToken((value) => value + 1)}
        >{t('retry')}</button>
      </div> : null}

      {!loading && task ? <div className="dkb-drawer-body">
        {actionError ? <div className="dkb-form-error" role="alert">{actionError}</div> : null}
        {readOnly ? <p className="dkb-drawer-notice">
          {projectArchived ? t('projectArchivedNotice') : t('taskArchivedNotice')}
        </p> : null}

        <section className="dkb-drawer-section" aria-label={t('properties')}>
          <h3 className="dkb-drawer-section-title">{t('properties')}</h3>
          <div className="dkb-drawer-properties">
            <Field label={t('taskProject')}>
              <p className="dkb-drawer-value">{projectName || t('activityNone')}</p>
            </Field>
            <Field label={t('taskStatus')}>
              <select
                className="dkb-select"
                value={task.status}
                onChange={(event) => { void changeProperty('status', event.target.value) }}
                disabled={controlsDisabled}
                aria-label={t('taskStatus')}
              >
                {STATUSES.map((value) => <option key={value} value={value}>{t(`status_${value}`)}</option>)}
              </select>
            </Field>
            <Field label={t('taskPriority')}>
              <select
                className="dkb-select"
                value={task.priority}
                onChange={(event) => { void changeProperty('priority', event.target.value) }}
                disabled={controlsDisabled}
                aria-label={t('taskPriority')}
              >
                {PRIORITIES.map((value) => <option key={value} value={value}>{t(`priority_${value}`)}</option>)}
              </select>
            </Field>
            <Field label={t('taskAssignee')}>
              <select
                className="dkb-select"
                value="current-user"
                disabled
                title={t('assigneeOnlyCurrent')}
                aria-label={t('taskAssignee')}
              >
                <option value="current-user">{task.assignee?.name || t('currentUser')}</option>
              </select>
              <span className="dkb-field-hint">{t('assigneeOnlyCurrent')}</span>
            </Field>
            <Field label={t('taskLabels')} wide>
              <div className="dkb-drawer-label-list">
                {labels.length > 0
                  ? labels.map((label) => <span className="dkb-chip dkb-label-chip" key={label}>
                    {label}
                    <button
                      type="button"
                      className="dkb-drawer-label-remove"
                      onClick={() => { void removeLabel(label) }}
                      disabled={controlsDisabled}
                      aria-label={t('removeLabel', { label })}
                      title={t('removeLabel', { label })}
                    >×</button>
                  </span>)
                  : <span className="dkb-drawer-empty">{t('noLabels')}</span>}
              </div>
              <div className="dkb-drawer-inline">
                <input
                  className="dkb-input"
                  value={labelDraft}
                  onChange={(event) => setLabelDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    void addLabel()
                  }}
                  placeholder={t('labelPlaceholder')}
                  aria-label={t('addLabel')}
                  disabled={controlsDisabled}
                />
                <button
                  type="button"
                  className="dkb-button dkb-button-small"
                  onClick={() => { void addLabel() }}
                  disabled={controlsDisabled || !labelDraft.trim()}
                >{t('add')}</button>
              </div>
            </Field>
          </div>
        </section>

        <section className="dkb-drawer-section" aria-label={t('taskDescription')}>
          <h3 className="dkb-drawer-section-title">{t('taskDescription')}</h3>
          {editingDescription
            ? <div className="dkb-drawer-form">
              <textarea
                className="dkb-textarea"
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                rows={4}
                disabled={controlsDisabled}
                aria-label={t('taskDescription')}
              />
              <div className="dkb-drawer-inline-actions">
                <button
                  type="button"
                  className="dkb-button dkb-button-small"
                  onClick={() => setEditingDescription(false)}
                  disabled={busy}
                >{t('cancel')}</button>
                <button
                  type="button"
                  className="dkb-button dkb-button-small dkb-button-primary"
                  onClick={() => { void saveDescription() }}
                  disabled={controlsDisabled}
                >{busy ? t('submitting') : t('save')}</button>
              </div>
            </div>
            : <div className="dkb-drawer-description">
              <p className="dkb-drawer-text">{task.description || t('noDescription')}</p>
              {!readOnly ? <button
                type="button"
                className="dkb-button dkb-button-small"
                onClick={startDescriptionEdit}
                disabled={busy}
              >{t('editDescription')}</button> : null}
            </div>}
        </section>

        <section className="dkb-drawer-section" aria-label={t('blocker')}>
          <h3 className="dkb-drawer-section-title">{t('blocker')}</h3>
          {task.blockedReason
            ? <p className="dkb-drawer-blocked">{task.blockedReason}</p>
            : <p className="dkb-drawer-empty">{t('notBlocked')}</p>}
          {!readOnly ? <div className="dkb-drawer-inline">
            <input
              className="dkb-input"
              value={blockerDraft}
              onChange={(event) => setBlockerDraft(event.target.value)}
              placeholder={t('blockerPlaceholder')}
              aria-label={t('blockedReasonLabel')}
              disabled={controlsDisabled}
            />
            <button
              type="button"
              className="dkb-button dkb-button-small"
              onClick={() => { void setBlocker() }}
              disabled={controlsDisabled || !blockerDraft.trim()}
            >{t('setBlocker')}</button>
            <button
              type="button"
              className="dkb-button dkb-button-small"
              onClick={() => { void clearBlocker() }}
              disabled={controlsDisabled || !task.blockedReason}
            >{t('clearBlocker')}</button>
          </div> : null}
        </section>

        <section className="dkb-drawer-section" aria-label={t('links')}>
          <h3 className="dkb-drawer-section-title">{t('links')}</h3>
          {links.length > 0 ? <ul className="dkb-drawer-list">
            {links.map((link) => <li className="dkb-drawer-link-row" key={link.id}>
              <a
                className="dkb-drawer-link"
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                title={link.url}
              >{link.label}</a>
              {!readOnly ? <button
                type="button"
                className="dkb-icon-button dkb-drawer-row-action"
                onClick={() => { void removeLink(link.id) }}
                disabled={controlsDisabled}
                aria-label={t('removeLink')}
                title={t('removeLink')}
              >×</button> : null}
            </li>)}
          </ul> : <p className="dkb-drawer-empty">{t('noLinks')}</p>}
          {!readOnly ? <div className="dkb-drawer-form">
            <div className="dkb-drawer-inline">
              <input
                className="dkb-input"
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder={t('linkLabel')}
                aria-label={t('linkLabel')}
                disabled={controlsDisabled}
              />
              <input
                className="dkb-input"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder={t('linkUrlPlaceholder')}
                aria-label={t('linkUrl')}
                disabled={controlsDisabled}
                spellCheck={false}
              />
              <button
                type="button"
                className="dkb-button dkb-button-small"
                onClick={() => { void addLink() }}
                disabled={controlsDisabled || !linkLabel.trim() || !linkUrl.trim()}
              >{t('addLink')}</button>
            </div>
            {linkError ? <p className="dkb-form-error" role="alert">{linkError}</p> : null}
          </div> : null}
        </section>

        <section className="dkb-drawer-section" aria-label={t('questionSection')}>
          <h3 className="dkb-drawer-section-title">{t('questionSection')}</h3>
          {hasPendingQuestion ? <QuestionBlock
            task={task}
            t={t}
            onAnswer={answerQuestion}
            readOnly={readOnly}
            namePrefix="dkb-drawer-question"
          /> : isReview ? <ReviewBlock
            task={task}
            t={t}
            onAnswer={answerQuestion}
            readOnly={readOnly}
          /> : null}
          {!hasPendingQuestion && !readOnly ? <form className="dkb-drawer-form" onSubmit={submitQuestion} noValidate>
            <p className="dkb-drawer-form-title">{t('requestInput')}</p>
            <Field label={t('questionPrompt')}>
              <textarea
                className="dkb-textarea"
                value={questionPrompt}
                onChange={(event) => setQuestionPrompt(event.target.value)}
                placeholder={t('questionPromptPlaceholder')}
                rows={2}
                disabled={controlsDisabled}
                aria-label={t('questionPrompt')}
              />
            </Field>
            <Field label={t('questionNote')}>
              <input
                className="dkb-input"
                value={questionNote}
                onChange={(event) => setQuestionNote(event.target.value)}
                placeholder={t('questionNotePlaceholder')}
                aria-label={t('questionNote')}
                disabled={controlsDisabled}
              />
            </Field>
            <div className="dkb-drawer-options">
              <span className="dkb-drawer-field-label">{t('requestOptions')}</span>
              {questionOptions.map((option, index) => <div className="dkb-drawer-option-row" key={`option-${index}`}>
                <input
                  className="dkb-input"
                  value={option}
                  onChange={(event) => updateOptionRow(index, event.target.value)}
                  placeholder={t('optionPlaceholder', { index: index + 1 })}
                  aria-label={t('optionLabel', { index: index + 1 })}
                  disabled={controlsDisabled}
                />
                <button
                  type="button"
                  className="dkb-icon-button dkb-drawer-row-action"
                  onClick={() => removeOptionRow(index)}
                  disabled={controlsDisabled || questionOptions.length <= 2}
                  aria-label={t('removeOption', { index: index + 1 })}
                  title={t('removeOption', { index: index + 1 })}
                >×</button>
              </div>)}
              <div className="dkb-drawer-inline-actions">
                <button
                  type="button"
                  className="dkb-button dkb-button-small"
                  onClick={addOptionRow}
                  disabled={controlsDisabled || questionOptions.length >= 5}
                >{t('addOption')}</button>
                <span className="dkb-field-hint">{t('requestOptionsHint')}</span>
              </div>
            </div>
            {requestError ? <p className="dkb-form-error" role="alert">{requestError}</p> : null}
            <div className="dkb-drawer-inline-actions">
              <button
                type="submit"
                className="dkb-button dkb-button-small dkb-button-primary"
                disabled={controlsDisabled}
              >{busy ? t('submitting') : t('requestInputAction')}</button>
            </div>
          </form> : null}
        </section>

        <section className="dkb-drawer-section" aria-label={t('comments')}>
          <h3 className="dkb-drawer-section-title">{t('comments')}</h3>
          {comments.length > 0 ? <ul className="dkb-drawer-list">
            {comments.map((comment) => <li className="dkb-drawer-comment" key={comment.id}>
              <div className="dkb-drawer-comment-head">
                <span className="dkb-drawer-comment-author">{comment.author?.name || ''}</span>
                <time className="dkb-drawer-time" dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                {!readOnly ? <button
                  type="button"
                  className="dkb-drawer-text-button"
                  onClick={() => { void removeComment(comment.id) }}
                  disabled={controlsDisabled}
                >{t('deleteComment')}</button> : null}
              </div>
              <p className="dkb-drawer-comment-body">{comment.body}</p>
            </li>)}
          </ul> : <p className="dkb-drawer-empty">{t('noComments')}</p>}
          {!readOnly ? <form className="dkb-drawer-form" onSubmit={addComment}>
            <textarea
              className="dkb-textarea"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={t('commentPlaceholder')}
              rows={2}
              aria-label={t('commentPlaceholder')}
              disabled={controlsDisabled}
            />
            <div className="dkb-drawer-inline-actions">
              <button
                type="submit"
                className="dkb-button dkb-button-small dkb-button-primary"
                disabled={controlsDisabled || !commentDraft.trim()}
              >{t('addComment')}</button>
            </div>
          </form> : null}
        </section>

        <section className="dkb-drawer-section" aria-label={t('attachments')}>
          <h3 className="dkb-drawer-section-title">{t('attachments')}</h3>
          {attachments.length > 0 ? <ul className="dkb-drawer-list">
            {attachments.map((attachment) => <li className="dkb-drawer-attachment-row" key={attachment.id}>
              <a
                className="dkb-drawer-attachment-name"
                href={attachmentHref(attachment.id)}
                download={attachment.filename}
                title={t('downloadAttachment', { name: attachment.filename })}
              >{attachment.filename}</a>
              <span className="dkb-drawer-time">{formatBytes(attachment.size)}</span>
              {!readOnly ? <button
                type="button"
                className="dkb-drawer-text-button"
                onClick={() => { void removeAttachment(attachment) }}
                disabled={controlsDisabled}
              >{t('deleteAttachment')}</button> : null}
            </li>)}
          </ul> : <p className="dkb-drawer-empty">{t('noAttachments')}</p>}
          {!readOnly ? <div className="dkb-drawer-form">
            <label className="dkb-drawer-upload">
              <span className="dkb-button dkb-button-small">{uploading ? t('uploading') : t('uploadAttachment')}</span>
              <input
                ref={fileInputRef}
                type="file"
                className="dkb-drawer-file-input"
                onChange={(event) => { void uploadFile(event) }}
                disabled={controlsDisabled || uploading}
              />
            </label>
            {uploadError ? <p className="dkb-form-error" role="alert">{uploadError}</p> : null}
            <p className="dkb-field-hint">{t('attachmentLimitHint')}</p>
          </div> : null}
        </section>

        <section className="dkb-drawer-section" aria-label={t('activity')}>
          <h3 className="dkb-drawer-section-title">{t('activity')}</h3>
          {activity.length > 0 ? <ul className="dkb-drawer-list dkb-drawer-activity">
            {activity.map((event) => <li className="dkb-drawer-activity-item" key={event.id}>
              <div className="dkb-drawer-activity-head">
                <span className="dkb-drawer-comment-author">{event.actor?.name || ''}</span>
                <time className="dkb-drawer-time" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              </div>
              <ul className="dkb-drawer-changes">
                {(Array.isArray(event.changes) ? event.changes : []).map((change, index) => <li
                  className="dkb-drawer-change"
                  key={`${event.id}-${index}`}
                >
                  <span className="dkb-drawer-change-field">{fieldLabel(change.field, t)}</span>
                  <span className="dkb-drawer-change-before">{formatActivityValue(change.field, change.before, t)}</span>
                  <span className="dkb-drawer-change-arrow" aria-hidden="true">→</span>
                  <span className="dkb-drawer-change-after">{formatActivityValue(change.field, change.after, t)}</span>
                </li>)}
              </ul>
            </li>)}
          </ul> : <p className="dkb-drawer-empty">{t('noActivity')}</p>}
        </section>

        {!projectArchived ? <section className="dkb-drawer-section dkb-drawer-actions" aria-label={t('taskActions')}>
          <h3 className="dkb-drawer-section-title">{t('taskActions')}</h3>
          {!taskArchived && !projectArchived ? <button
            type="button"
            className="dkb-button dkb-button-small"
            onClick={() => setConfirm('archive')}
            disabled={busy}
          >{t('archiveTask')}</button> : null}
          {taskArchived && !projectArchived ? <>
            <button
              type="button"
              className="dkb-button dkb-button-small"
              onClick={() => { void restoreTask() }}
              disabled={busy}
            >{t('restoreTask')}</button>
            <button
              type="button"
              className="dkb-button dkb-button-small dkb-button-danger"
              onClick={() => setConfirm('delete')}
              disabled={busy}
            >{t('deleteTaskPermanently')}</button>
          </> : null}
          {confirm === 'archive' ? <div className="dkb-drawer-confirm" role="group" aria-label={t('archiveTask')}>
            <p className="dkb-drawer-confirm-text">{t('archiveTaskConfirm')}</p>
            <div className="dkb-drawer-inline-actions">
              <button
                type="button"
                className="dkb-button dkb-button-small"
                onClick={() => setConfirm(null)}
                disabled={busy}
              >{t('cancel')}</button>
              <button
                type="button"
                className="dkb-button dkb-button-small dkb-button-primary"
                onClick={() => { void archiveTask() }}
                disabled={busy}
              >{busy ? t('submitting') : t('archive')}</button>
            </div>
          </div> : null}
          {confirm === 'delete' ? <div className="dkb-drawer-confirm" role="group" aria-label={t('deleteTaskPermanently')}>
            <p className="dkb-drawer-confirm-text">{t('deleteTaskConfirm')}</p>
            <div className="dkb-drawer-inline-actions">
              <button
                type="button"
                className="dkb-button dkb-button-small"
                onClick={() => setConfirm(null)}
                disabled={busy}
              >{t('cancel')}</button>
              <button
                type="button"
                className="dkb-button dkb-button-small dkb-button-danger"
                onClick={() => { void deleteTask() }}
                disabled={busy}
              >{busy ? t('submitting') : t('delete')}</button>
            </div>
          </div> : null}
        </section> : null}
      </div> : null}
    </aside>
  </div>
}
