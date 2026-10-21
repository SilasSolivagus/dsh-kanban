import React, { useState } from 'react'
import { attentionReason, elapsedStart } from '../../shared/rules.js'
import { formatElapsed } from '../time.js'
import {
  AttachmentIcon,
  ChevronRight,
  ClockIcon,
  CommentIcon,
  LinkIcon,
  QuestionIcon,
  ReviewIcon,
} from './icons.js'

function Metric({ icon, count, label, onOpen, task }) {
  return <button
    type="button"
    className="dkb-metric"
    onClick={() => onOpen(task)}
    aria-label={label}
    title={label}
  >
    {icon}
    <span>{count}</span>
  </button>
}

function QuestionBlock({ task, t, onAnswer }) {
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const question = task.pendingQuestion
  const submit = async (decision) => {
    if (!selected || busy) return
    setBusy(true)
    try {
      await onAnswer(task, decision, selected, note)
    } finally {
      setBusy(false)
    }
  }

  return <div className="dkb-question" onClick={(event) => event.stopPropagation()}>
    <p className="dkb-question-prompt">
      <QuestionIcon />
      <span>{t('questionNeedsAnswer')}</span>
    </p>
    <p className="dkb-question-text">{question.prompt}</p>
    {question.note ? <p className="dkb-question-context">{question.note}</p> : null}
    <div className="dkb-question-options" role="radiogroup" aria-label={t('questionOptions')}>
      {question.options.map((option) => <label className="dkb-question-option" key={option.id}>
        <input
          type="radio"
          name={`dkb-question-${task.id}`}
          value={option.id}
          checked={selected === option.id}
          onChange={() => setSelected(option.id)}
          disabled={busy}
        />
        <span className="dkb-question-option-text">
          <span className="dkb-question-option-label">{option.label}</span>
          {option.detail ? <span className="dkb-question-option-detail">{option.detail}</span> : null}
        </span>
      </label>)}
    </div>
    <input
      className="dkb-input dkb-input-small"
      value={note}
      onChange={(event) => setNote(event.target.value)}
      placeholder={t('questionNotePlaceholder')}
      aria-label={t('questionNote')}
      disabled={busy}
    />
    {!selected ? <p className="dkb-question-hint">{t('questionSelectOption')}</p> : null}
    <div className="dkb-question-actions">
      <button
        type="button"
        className="dkb-button dkb-button-small"
        onClick={() => submit('reject')}
        disabled={busy || !selected}
      >{busy ? t('submitting') : t('reject')}</button>
      <button
        type="button"
        className="dkb-button dkb-button-small dkb-button-primary"
        onClick={() => submit('approve')}
        disabled={busy || !selected}
      >{t('approve')}</button>
    </div>
  </div>
}

function ReviewBlock({ task, t, onAnswer }) {
  const [busy, setBusy] = useState(false)
  const submit = async (decision) => {
    if (busy) return
    setBusy(true)
    try {
      await onAnswer(task, decision, null, '')
    } finally {
      setBusy(false)
    }
  }

  return <div className="dkb-review" onClick={(event) => event.stopPropagation()}>
    <p className="dkb-review-prompt">
      <ReviewIcon />
      <span>{t('reviewPrompt')}</span>
    </p>
    <div className="dkb-review-actions">
      <button
        type="button"
        className="dkb-button dkb-button-small"
        onClick={() => submit('reject')}
        disabled={busy}
      >{busy ? t('submitting') : t('returnToWork')}</button>
      <button
        type="button"
        className="dkb-button dkb-button-small dkb-button-primary"
        onClick={() => submit('approve')}
        disabled={busy}
      >{t('confirm')}</button>
    </div>
  </div>
}

export function TaskCard({
  task,
  t,
  now = Date.now(),
  projectName = '',
  showProject = false,
  readOnly = false,
  selected = false,
  dropBefore = false,
  onOpen,
  onFilterProject,
  onFilterPriority,
  onAnswer,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const attention = task.attentionReason ?? attentionReason(task)
  const hasQuestion = Boolean(task.pendingQuestion) && !task.questionResolution
  const timer = formatElapsed(elapsedStart(task), now, t)
  const statusLabel = t(`status_${task.status}`)
  const attentionLabel = attention === 'question'
    ? t('attentionQuestion')
    : attention === 'blocked'
      ? t('attentionBlocked')
      : attention === 'review'
        ? t('attentionReview')
        : ''
  const labels = Array.isArray(task.labels) ? task.labels : []
  const activity = formatElapsed(task.updatedAt ?? task.statusSince, now, t)
  const rootClass = [
    'dkb-card',
    `dkb-card-tone-${task.column ?? 'backlog'}`,
    selected ? 'dkb-card-selected' : '',
    attention ? 'dkb-card-attention' : '',
    dropBefore ? 'dkb-card-drop-before' : '',
  ].filter(Boolean).join(' ')

  return <article
    className={rootClass}
    data-task-id={task.id}
    draggable={!readOnly}
    onDragStart={(event) => {
      event.dataTransfer.setData('text/plain', task.id)
      event.dataTransfer.effectAllowed = 'move'
      onDragStart?.(task, event)
    }}
    onDragEnd={() => onDragEnd?.()}
    onDragOver={(event) => onDragOver?.(event)}
    onDrop={(event) => onDrop?.(event)}
  >
    <div className="dkb-card-top">
      <button type="button" className="dkb-card-title" onClick={() => onOpen?.(task)} title={t('openTask')}>
        {task.identifier ? <span className="dkb-card-identifier">{task.identifier}</span> : null}
        <span className="dkb-card-title-text">{task.title}</span>
      </button>
      <button
        type="button"
        className="dkb-card-open"
        onClick={() => onOpen?.(task)}
        aria-label={t('openTaskAria', { title: task.title })}
        title={t('openTask')}
      ><ChevronRight /></button>
    </div>

    {task.description ? <p className="dkb-card-desc">{task.description}</p> : null}

    <div className="dkb-card-chips">
      {showProject && projectName
        ? <button
          type="button"
          className="dkb-chip dkb-chip-project"
          onClick={() => onFilterProject?.(task.projectId)}
          title={t('filterByProject', { name: projectName })}
        >{projectName}</button>
        : null}
      <button
        type="button"
        className={`dkb-chip dkb-priority-${task.priority}`}
        onClick={() => onFilterPriority?.(task.priority)}
        title={t('filterByPriority', { priority: t(`priority_${task.priority}`) })}
      >{t(`priority_${task.priority}`)}</button>
      {labels.map((label) => <span className="dkb-chip dkb-label-chip" key={label}>{label}</span>)}
      {task.archivedAt ? <span className="dkb-badge">{t('archived')}</span> : null}
      {readOnly && !task.archivedAt ? <span className="dkb-badge">{t('readOnly')}</span> : null}
    </div>

    {task.blockedReason
      ? <p className="dkb-card-blocker"><strong>{t('attentionBlocked')}:</strong> {task.blockedReason}</p>
      : activity
        ? <p className="dkb-card-activity"><ClockIcon /> {t('updatedAgo', { elapsed: activity })}</p>
        : null}

    {hasQuestion
      ? <QuestionBlock task={task} t={t} onAnswer={onAnswer} />
      : attention === 'review'
        ? <ReviewBlock task={task} t={t} onAnswer={onAnswer} />
        : null}

    <footer className="dkb-card-footer">
      <span
        className={`dkb-card-status dkb-status-${task.column ?? 'backlog'}${attention ? ' dkb-status-attention' : ''}`}
        title={attentionLabel || statusLabel}
      >
        <span className="dkb-status-dot" aria-hidden="true" />
        <span className="dkb-card-status-label">{attentionLabel || statusLabel}</span>
        {timer ? <span className="dkb-card-timer">· {timer}</span> : null}
      </span>
      <span className="dkb-card-metrics">
        <Metric
          icon={<CommentIcon />}
          count={task.commentCount ?? 0}
          label={t('commentsCount', { count: task.commentCount ?? 0 })}
          onOpen={onOpen}
          task={task}
        />
        <Metric
          icon={<AttachmentIcon />}
          count={task.attachmentCount ?? 0}
          label={t('attachmentsCount', { count: task.attachmentCount ?? 0 })}
          onOpen={onOpen}
          task={task}
        />
        <Metric
          icon={<LinkIcon />}
          count={task.linkCount ?? (Array.isArray(task.links) ? task.links.length : 0)}
          label={t('linksCount', { count: task.linkCount ?? (Array.isArray(task.links) ? task.links.length : 0) })}
          onOpen={onOpen}
          task={task}
        />
      </span>
    </footer>
  </article>
}
