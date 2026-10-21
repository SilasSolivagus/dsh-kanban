import React from 'react'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function ChevronDown({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" {...stroke} strokeWidth="1.4">
    <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
  </svg>
}

export function ChevronRight({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" {...stroke} strokeWidth="1.4">
    <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
  </svg>
}

export function PlusIcon({ size = 13 }) {
  return <svg width={size} height={size} viewBox="0 0 13 13" aria-hidden="true" {...stroke} strokeWidth="1.5">
    <path d="M6.5 2.4v8.2M2.4 6.5h8.2" />
  </svg>
}

export function BacklogIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <rect x="2.2" y="3.2" width="11.6" height="9.6" rx="2" />
    <path d="M2.4 8.6h3l1 1.7h3.2l1-1.7h3" />
  </svg>
}

export function RunningIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <circle cx="8" cy="8" r="5.8" />
    <path d="m6.6 5.3 4 2.7-4 2.7z" fill="currentColor" stroke="none" />
  </svg>
}

export function NeedsIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <path d="M8 2.3 14 13H2z" />
    <path d="M8 6.2v3.1M8 11.3v.1" strokeWidth="1.5" />
  </svg>
}

export function DoneIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <circle cx="8" cy="8" r="5.8" />
    <path d="m5.2 8.2 2 2 3.7-4.2" strokeWidth="1.5" />
  </svg>
}

const COLUMN_ICONS = {
  backlog: BacklogIcon,
  running: RunningIcon,
  needs: NeedsIcon,
  done: DoneIcon,
}

export function ColumnIcon({ tone = 'backlog', size = 15 }) {
  const Icon = COLUMN_ICONS[tone] ?? BacklogIcon
  return <Icon size={size} />
}

export function CommentIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <path d="M2.2 3.5A1.3 1.3 0 0 1 3.5 2.2h7A1.3 1.3 0 0 1 11.8 3.5v5.1a1.3 1.3 0 0 1-1.3 1.3H6.2L3.6 12V9.9h-.1a1.3 1.3 0 0 1-1.3-1.3z" />
  </svg>
}

export function AttachmentIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <path d="M8.6 3.4 4.9 7.1a2 2 0 0 0 2.8 2.8l4.1-4.1a3 3 0 0 0-4.2-4.2L3.2 5.9a3.7 3.7 0 0 0 5.2 5.2l3.2-3.2" />
  </svg>
}

export function LinkIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <path d="M5.7 8.3a2.6 2.6 0 0 0 3.7 0l1.6-1.6a2.6 2.6 0 0 0-3.7-3.7l-.8.8" />
    <path d="M8.3 5.7a2.6 2.6 0 0 0-3.7 0L3 7.3a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
  </svg>
}

export function QuestionIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <circle cx="8" cy="8" r="5.8" />
    <path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.2M8 11.2v.1" strokeWidth="1.4" />
  </svg>
}

export function ReviewIcon({ size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <circle cx="8" cy="8" r="5.8" />
    <path d="m5.2 8.1 2 2 3.6-4" strokeWidth="1.5" />
  </svg>
}

export function ClockIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" {...stroke} strokeWidth="1.3">
    <circle cx="7" cy="7" r="5.2" />
    <path d="M7 3.9V7l2 1.4" />
  </svg>
}
