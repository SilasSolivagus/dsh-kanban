export const STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
]

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent']

export const COLUMN_IDS = ['backlog', 'running', 'needs', 'done']

export const STATUS_LABELS = {
  backlog: '待立项',
  todo: '等待认领',
  in_progress: '处理中',
  in_review: '等你确认',
  done: '完成',
  canceled: '取消',
}

export const PRIORITY_LABELS = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}
