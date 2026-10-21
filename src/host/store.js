import { attentionReason, columnForTask, nextIdentifier } from '../shared/rules.js'
import { PRIORITIES, STATUSES } from '../shared/statuses.js'

const LOCAL_USER = { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null }
const CURRENT_USER_TARGET = 'current-user'
const TASK_TITLE_MAX = 240
const TASK_DESCRIPTION_MAX = 100000
const TASK_LABELS_MAX = 20
const TASK_LABEL_MAX = 64
const TASK_LINKS_MAX = 50
const TASK_LINK_LABEL_MAX = 120
const TASK_BLOCKED_REASON_MAX = 2000
const TASK_PATCH_FIELDS = new Set([
  'title',
  'description',
  'status',
  'priority',
  'labels',
  'assigneeTarget',
  'sortOrder',
  'blockedReason',
  'links',
])

function invalidField(field, reason) {
  return Object.assign(new Error(`${field}: ${reason}`), { code: 'INVALID_FIELD', details: { field } })
}

function validateTitle(value) {
  if (typeof value !== 'string') throw invalidField('title', 'must be a string')
  const title = value.trim()
  if (title.length < 1 || title.length > TASK_TITLE_MAX) {
    throw invalidField('title', `must be 1-${TASK_TITLE_MAX} characters after trimming`)
  }
  return title
}

function validateDescription(value) {
  if (typeof value !== 'string') throw invalidField('description', 'must be a string')
  if (value.length > TASK_DESCRIPTION_MAX) {
    throw invalidField('description', `must be at most ${TASK_DESCRIPTION_MAX} characters`)
  }
  return value
}

function validateStatus(value) {
  if (!STATUSES.includes(value)) throw invalidField('status', `must be one of ${STATUSES.join(', ')}`)
  return value
}

function validatePriority(value) {
  if (!PRIORITIES.includes(value)) throw invalidField('priority', `must be one of ${PRIORITIES.join(', ')}`)
  return value
}

function validateLabels(value) {
  if (!Array.isArray(value)) throw invalidField('labels', 'must be an array')
  if (value.length > TASK_LABELS_MAX) throw invalidField('labels', `must contain at most ${TASK_LABELS_MAX} labels`)
  for (const label of value) {
    if (typeof label !== 'string' || label.length < 1 || label.length > TASK_LABEL_MAX) {
      throw invalidField('labels', `each label must be a string of 1-${TASK_LABEL_MAX} characters`)
    }
  }
  return [...value]
}

function validateLinks(value) {
  if (!Array.isArray(value)) throw invalidField('links', 'must be an array')
  if (value.length > TASK_LINKS_MAX) throw invalidField('links', `must contain at most ${TASK_LINKS_MAX} links`)
  return value.map((link, index) => {
    if (!link || typeof link !== 'object' || Array.isArray(link)) {
      throw invalidField('links', `link ${index} must be an object`)
    }
    if (typeof link.id !== 'string' || link.id.length < 1) {
      throw invalidField('links', `link ${index} must have an id`)
    }
    if (typeof link.label !== 'string' || link.label.length < 1 || link.label.length > TASK_LINK_LABEL_MAX) {
      throw invalidField('links', `link ${index} label must be 1-${TASK_LINK_LABEL_MAX} characters`)
    }
    if (typeof link.url !== 'string') throw invalidField('links', `link ${index} url must be a string`)
    let url
    try {
      url = new URL(link.url)
    } catch {
      throw invalidField('links', `link ${index} url must use http or https`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw invalidField('links', `link ${index} url must use http or https`)
    }
    return { ...link }
  })
}

function validateSortOrder(value) {
  if (!Number.isFinite(value)) throw invalidField('sortOrder', 'must be a finite number')
  return value
}

function validateBlockedReason(value) {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > TASK_BLOCKED_REASON_MAX) {
    throw invalidField('blockedReason', `must be null or a string of at most ${TASK_BLOCKED_REASON_MAX} characters`)
  }
  return value
}

function validateAssigneeTarget(value) {
  if (value !== CURRENT_USER_TARGET) throw invalidField('assigneeTarget', `must be ${CURRENT_USER_TARGET}`)
}

function validateTaskPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw invalidField('patch', 'must be an object')
  }
  for (const key of Object.keys(patch)) {
    if (key !== 'version' && !TASK_PATCH_FIELDS.has(key)) {
      throw invalidField(key, 'is not a patchable task field')
    }
  }
  return patch
}

export class KanbanStore {
  #tables
  #attachments
  #now
  #newId
  #tail = Promise.resolve()

  constructor({ tables, attachments, now = () => new Date().toISOString(), newId = () => crypto.randomUUID() }) {
    this.#tables = tables
    this.#attachments = attachments
    this.#now = now
    this.#newId = newId
  }

  #run(operation) {
    const next = this.#tail.then(operation)
    this.#tail = next.catch(() => {})
    return next
  }

  #project(id) {
    const project = this.#tables.projects.get(id)
    if (!project) throw Object.assign(new Error('Project not found'), { code: 'PROJECT_NOT_FOUND' })
    return project
  }

  #task(id) {
    const task = this.#tables.tasks.get(id)
    if (!task) throw Object.assign(new Error('Task not found'), { code: 'TASK_NOT_FOUND' })
    return task
  }

  bootstrap() {
    const projects = [...this.#tables.projects.entries()].map(([, project]) => ({
      ...project,
      taskCount: [...this.#tables.tasks.entries()].filter(([, task]) => task.projectId === project.id && !task.archivedAt).length,
    }))
    const tasks = [...this.#tables.tasks.entries()]
      .map(([, task]) => task)
      .filter((task) => !task.archivedAt)
      .map((task) => this.#summary(task))
    return { projects, tasks }
  }

  createProject({ name, workspacePath = null }) {
    return this.#run(async () => {
      const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      let id = base
      let suffix = 2
      while (this.#tables.projects.get(id)) id = `${base}-${suffix++}`
      const prefixBase = String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 3) || 'TSK'
      let taskPrefix = prefixBase
      suffix = 2
      while ([...this.#tables.projects.entries()].some(([, project]) => project.taskPrefix === taskPrefix)) {
        taskPrefix = `${prefixBase.slice(0, 5)}${suffix++}`
      }
      const timestamp = this.#now()
      const project = {
        id,
        name: String(name).trim(),
        workspacePath,
        taskPrefix,
        labels: [],
        nextTaskNumber: 1,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.projects.put(id, project)
      return project
    })
  }

  renameProject(id, name) {
    return this.#run(async () => {
      const project = this.#project(id)
      const next = { ...project, name: String(name).trim(), updatedAt: this.#now() }
      await this.#tables.projects.put(id, next)
      return next
    })
  }

  archiveProject(id) {
    return this.#run(async () => {
      const project = this.#project(id)
      const next = { ...project, archivedAt: project.archivedAt ?? this.#now(), updatedAt: this.#now() }
      await this.#tables.projects.put(id, next)
      return next
    })
  }

  restoreProject(id) {
    return this.#run(async () => {
      const project = this.#project(id)
      const next = { ...project, archivedAt: null, updatedAt: this.#now() }
      await this.#tables.projects.put(id, next)
      return next
    })
  }

  deleteProject(id) {
    return this.#run(async () => {
      this.#project(id)
      const count = [...this.#tables.tasks.entries()].filter(([, task]) => task.projectId === id).length
      if (count > 0) {
        throw Object.assign(new Error('Project still contains tasks'), { code: 'PROJECT_NOT_EMPTY', details: { taskCount: count } })
      }
      await this.#tables.projects.delete(id)
    })
  }

  createTask(input = {}) {
    return this.#run(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw invalidField('input', 'must be an object')
      }
      const {
        projectId,
        title,
        description = '',
        status = 'backlog',
        priority = 'none',
        labels = [],
        assigneeTarget = CURRENT_USER_TARGET,
        sortOrder,
        links = [],
      } = input
      const project = this.#project(projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const cleanTitle = validateTitle(title)
      const cleanDescription = validateDescription(description)
      const cleanStatus = validateStatus(status)
      const cleanPriority = validatePriority(priority)
      const cleanLabels = validateLabels(labels)
      const cleanLinks = validateLinks(links)
      validateAssigneeTarget(assigneeTarget)
      const cleanSortOrder = sortOrder === undefined ? undefined : validateSortOrder(sortOrder)
      const tasks = [...this.#tables.tasks.entries()].map(([, task]) => task)
      const identifier = nextIdentifier(project, tasks)
      const timestamp = this.#now()
      const siblings = tasks.filter((task) => task.projectId === projectId && task.status === cleanStatus && !task.archivedAt)
      const order = cleanSortOrder ?? (siblings.length ? Math.min(...siblings.map((task) => task.sortOrder)) - 1000 : 1000)
      const task = {
        id: this.#newId(),
        identifier,
        projectId,
        title: cleanTitle,
        description: cleanDescription,
        status: cleanStatus,
        priority: cleanPriority,
        labels: cleanLabels,
        assignee: LOCAL_USER,
        sortOrder: order,
        statusSince: timestamp,
        blockedReason: null,
        blockedSince: null,
        pendingQuestion: null,
        questionResolution: null,
        links: cleanLinks,
        archivedAt: null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.tasks.put(task.id, task)
      await this.#tables.projects.put(projectId, {
        ...project,
        nextTaskNumber: Number(identifier.split('-').at(-1)) + 1,
        updatedAt: timestamp,
      })
      return task
    })
  }

  updateTask(id, patch) {
    return this.#run(async () => {
      const task = this.#task(id)
      const project = this.#project(task.projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
      validateTaskPatch(patch)
      if (patch.version !== task.version) {
        throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      }
      const now = this.#now()
      const next = { ...task }
      if (Object.hasOwn(patch, 'title')) next.title = validateTitle(patch.title)
      if (Object.hasOwn(patch, 'description')) next.description = validateDescription(patch.description)
      if (Object.hasOwn(patch, 'status')) next.status = validateStatus(patch.status)
      if (Object.hasOwn(patch, 'priority')) next.priority = validatePriority(patch.priority)
      if (Object.hasOwn(patch, 'labels')) next.labels = validateLabels(patch.labels)
      if (Object.hasOwn(patch, 'links')) next.links = validateLinks(patch.links)
      if (Object.hasOwn(patch, 'sortOrder')) next.sortOrder = validateSortOrder(patch.sortOrder)
      if (Object.hasOwn(patch, 'blockedReason')) next.blockedReason = validateBlockedReason(patch.blockedReason)
      if (Object.hasOwn(patch, 'assigneeTarget')) validateAssigneeTarget(patch.assigneeTarget)
      next.version = task.version + 1
      next.updatedAt = now
      if (Object.hasOwn(patch, 'status') && next.status !== task.status) next.statusSince = now
      if (Object.hasOwn(patch, 'blockedReason')) {
        if (patch.blockedReason === null) next.blockedSince = null
        else if (!task.blockedReason) next.blockedSince = now
      }
      await this.#tables.tasks.put(id, next)
      return next
    })
  }

  getTaskDetail(id) {
    const task = this.#task(id)
    return {
      task: this.#summary(task),
      comments: [...this.#tables.comments.entries()].map(([, comment]) => comment).filter((comment) => comment.taskId === id),
      attachments: [...this.#tables.attachments.entries()].map(([, attachment]) => attachment).filter((attachment) => attachment.taskId === id),
      activity: [...this.#tables.activity.entries()].map(([, event]) => event).filter((event) => event.taskId === id),
    }
  }

  archiveTask(id, { version }) {
    return this.#run(async () => {
      const task = this.#task(id)
      const project = this.#project(task.projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      if (version !== task.version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      const now = this.#now()
      const next = { ...task, archivedAt: now, updatedAt: now, version: task.version + 1 }
      await this.#tables.tasks.put(id, next)
      return next
    })
  }

  restoreTask(id, { version }) {
    return this.#run(async () => {
      const task = this.#task(id)
      const project = this.#project(task.projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      if (!task.archivedAt) throw Object.assign(new Error('Task is not archived'), { code: 'TASK_NOT_ARCHIVED' })
      if (version !== task.version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      const next = { ...task, archivedAt: null, updatedAt: this.#now(), version: task.version + 1 }
      await this.#tables.tasks.put(id, next)
      return next
    })
  }

  deleteTask(id, { version }) {
    return this.#run(async () => {
      const task = this.#task(id)
      const project = this.#project(task.projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      if (!task.archivedAt) throw Object.assign(new Error('Task is not archived'), { code: 'TASK_NOT_ARCHIVED' })
      if (version !== task.version) throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      await this.#tables.tasks.delete(id)
      for (const [key, comment] of this.#tables.comments.entries()) if (comment.taskId === id) await this.#tables.comments.delete(key)
      for (const [key, attachment] of this.#tables.attachments.entries()) if (attachment.taskId === id) await this.#tables.attachments.delete(key)
      for (const [key, event] of this.#tables.activity.entries()) if (event.taskId === id) await this.#tables.activity.delete(key)
    })
  }

  listArchivedTasks(projectId) {
    return [...this.#tables.tasks.entries()]
      .map(([, task]) => task)
      .filter((task) => task.archivedAt && (!projectId || task.projectId === projectId))
      .map((task) => this.#summary(task))
  }

  #summary(task) {
    return {
      ...task,
      attentionReason: attentionReason(task),
      column: columnForTask(task),
      commentCount: [...this.#tables.comments.entries()].filter(([, comment]) => comment.taskId === task.id).length,
      attachmentCount: [...this.#tables.attachments.entries()].filter(([, attachment]) => attachment.taskId === task.id).length,
      linkCount: task.links.length,
    }
  }
}
