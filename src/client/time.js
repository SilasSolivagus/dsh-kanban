function toMillis(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function elapsedParts(start, now = Date.now()) {
  const startMs = toMillis(start)
  const nowMs = toMillis(now)
  if (startMs === null || nowMs === null) return null
  const totalMinutes = Math.max(0, Math.floor((nowMs - startMs) / 60000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  return { days, hours, minutes }
}

/**
 * Short elapsed label, e.g. "2h 30m" or "3d 4h". `t` supplies localized units.
 */
export function formatElapsed(start, now, t) {
  const parts = elapsedParts(start, now)
  if (!parts) return ''
  const { days, hours, minutes } = parts
  if (days > 0) {
    return hours > 0
      ? `${t('elapsedDays', { count: days })} ${t('elapsedHours', { count: hours })}`
      : t('elapsedDays', { count: days })
  }
  if (hours > 0) {
    return minutes > 0
      ? `${t('elapsedHours', { count: hours })} ${t('elapsedMinutes', { count: minutes })}`
      : t('elapsedHours', { count: hours })
  }
  if (minutes > 0) return t('elapsedMinutes', { count: minutes })
  return t('elapsedUnderMinute')
}
