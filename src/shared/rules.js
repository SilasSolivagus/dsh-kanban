export function attentionReason(task) {
  if (task.archivedAt) return null
  if (task.pendingQuestion && !task.questionResolution) return 'question'
  if (task.blockedReason) return 'blocked'
  if (task.status === 'in_review') return 'review'
  return null
}

export function columnForTask(task) {
  const attention = attentionReason(task)
  if (attention) return 'needs'
  if (task.status === 'backlog' || task.status === 'todo') return 'backlog'
  if (task.status === 'in_progress' || task.status === 'reviewing') return 'running'
  if (task.status === 'done') return 'done'
  return null
}

export function elapsedStart(task) {
  const attention = attentionReason(task)
  if (attention === 'question') return task.pendingQuestion.createdAt
  if (attention === 'blocked') return task.blockedSince || task.statusSince
  return task.statusSince
}

export function canDrop(task, columnId) {
  if (columnId === 'needs') return { ok: false, reason: 'Needs you is automatic' }
  if (attentionReason(task) && columnForTask(task) === 'needs') {
    return { ok: false, reason: 'Resolve attention before moving' }
  }
  if (columnId === 'done' && attentionReason(task)) {
    return { ok: false, reason: 'Resolve attention before Done' }
  }
  return { ok: true }
}

export function nextIdentifier(project, tasks) {
  const prefix = project.taskPrefix
  let max = 0
  for (const task of tasks) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(task.identifier)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${prefix}-${Math.max(project.nextTaskNumber, max + 1)}`
}
