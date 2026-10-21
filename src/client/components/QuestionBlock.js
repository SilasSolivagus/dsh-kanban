import React, { useState } from 'react'
import { QuestionIcon, ReviewIcon } from './icons.js'

/**
 * Shared pending-question block. Used inline by TaskCard and inside TaskDrawer.
 * `namePrefix` keeps radio groups unique when the same task is rendered twice
 * (card behind an open drawer).
 */
export function QuestionBlock({
  task,
  t,
  onAnswer,
  readOnly = false,
  namePrefix = 'dkb-question',
}) {
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const question = task.pendingQuestion
  if (!question) return null
  const disabled = busy || readOnly
  const submit = async (decision) => {
    if (!selected || busy || readOnly) return
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
          name={`${namePrefix}-${task.id}`}
          value={option.id}
          checked={selected === option.id}
          onChange={() => setSelected(option.id)}
          disabled={disabled}
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
      disabled={disabled}
    />
    {!selected ? <p className="dkb-question-hint">{t('questionSelectOption')}</p> : null}
    <div className="dkb-question-actions">
      <button
        type="button"
        className="dkb-button dkb-button-small"
        onClick={() => submit('reject')}
        disabled={disabled || !selected}
      >{busy ? t('submitting') : t('reject')}</button>
      <button
        type="button"
        className="dkb-button dkb-button-small dkb-button-primary"
        onClick={() => submit('approve')}
        disabled={disabled || !selected}
      >{t('approve')}</button>
    </div>
  </div>
}

/**
 * Shared generic-review block (status `in_review` without a pending question).
 */
export function ReviewBlock({ task, t, onAnswer, readOnly = false }) {
  const [busy, setBusy] = useState(false)
  const disabled = busy || readOnly
  const submit = async (decision) => {
    if (busy || readOnly) return
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
        disabled={disabled}
      >{busy ? t('submitting') : t('returnToWork')}</button>
      <button
        type="button"
        className="dkb-button dkb-button-small dkb-button-primary"
        onClick={() => submit('approve')}
        disabled={disabled}
      >{t('confirm')}</button>
    </div>
  </div>
}
