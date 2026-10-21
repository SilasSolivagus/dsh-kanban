export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function attachmentHref(attachmentId) {
  return `/kanban-api/attachments/${encodeURIComponent(attachmentId)}`
}

export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 1024) return `${value} B`
  const units = ['KiB', 'MiB', 'GiB']
  let size = value / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[index]}`
}

/**
 * Newest first, with the event id as a deterministic tie-breaker.
 */
export function sortActivityDesc(events) {
  if (!Array.isArray(events)) return []
  return [...events].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt) || 0
    const rightTime = Date.parse(right?.createdAt) || 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return String(right?.id ?? '').localeCompare(String(left?.id ?? ''))
  })
}

export function formatActivityValue(field, value, t) {
  if (value === null || value === undefined || value === '') return t('activityNone')
  if (field === 'status' && typeof value === 'string') return t(`status_${value}`)
  if (field === 'priority' && typeof value === 'string') return t(`priority_${value}`)
  if (field === 'labels' && Array.isArray(value)) return value.length ? value.join(', ') : t('activityNone')
  if (field === 'links' && Array.isArray(value)) {
    return value.length ? value.map((link) => link?.label || link?.url || '').filter(Boolean).join(', ') : t('activityNone')
  }
  if (field === 'archivedAt') return value ? t('activityArchived') : t('activityActive')
  if (field === 'pendingQuestion') {
    if (value && typeof value === 'object') return value.prompt ?? t('activityNone')
    return String(value)
  }
  if (field === 'questionResolution' && value && typeof value === 'object') {
    const decision = value.decision === 'approve' ? t('approve') : value.decision === 'reject' ? t('reject') : ''
    return [decision, value.optionLabel].filter(Boolean).join(' · ') || t('activityNone')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
