import { attentionReason, columnForTask, nextIdentifier } from '../shared/rules.js'
import { PRIORITIES, STATUSES } from '../shared/statuses.js'
import { LOCAL_USER } from './actors.js'
const CURRENT_USER_TARGET = 'current-user'
const TASK_TITLE_MAX = 240
const TASK_DESCRIPTION_MAX = 100000
const TASK_LABELS_MAX = 20
const TASK_LABEL_MAX = 64
const TASK_LINKS_MAX = 50
const TASK_LINK_LABEL_MAX = 120
const TASK_BLOCKED_REASON_MAX = 2000
const QUESTION_PROMPT_MAX = 2000
const QUESTION_NOTE_MAX = 2000
const QUESTION_OPTIONS_MIN = 2
const QUESTION_OPTIONS_MAX = 5
const QUESTION_OPTION_LABEL_MAX = 200
const QUESTION_OPTION_DETAIL_MAX = 1000
const COMMENT_BODY_MAX = 10000
const PROJECT_NAME_MAX = 120
const PROJECT_WORKSPACE_PATH_MAX = 4096
const ATTACHMENT_FILENAME_MAX = 255
const ATTACHMENT_CONTENT_TYPE_MAX = 200
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
const ATTACHMENT_LIMIT = 50
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/
const QUESTION_DECISIONS = ['approve', 'reject']
const TASK_PATCH_FIELDS = new Set([
  'title',
  'description',
  'status',
  'priority',
  'labels',
  'assigneeTarget',
  'assigneeId',
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

function assertInputObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidField('input', 'must be an object')
  }
  return input
}

function validateQuestionPrompt(value) {
  if (typeof value !== 'string') throw invalidField('prompt', 'must be a string')
  if (value.length < 1 || value.length > QUESTION_PROMPT_MAX) {
    throw invalidField('prompt', `must be 1-${QUESTION_PROMPT_MAX} characters`)
  }
  return value
}

function validateQuestionNote(value) {
  if (typeof value !== 'string') throw invalidField('note', 'must be a string')
  if (value.length > QUESTION_NOTE_MAX) {
    throw invalidField('note', `must be at most ${QUESTION_NOTE_MAX} characters`)
  }
  return value
}

function validateQuestionOptions(value) {
  if (!Array.isArray(value)) throw invalidField('options', 'must be an array')
  if (value.length < QUESTION_OPTIONS_MIN || value.length > QUESTION_OPTIONS_MAX) {
    throw invalidField('options', `must contain ${QUESTION_OPTIONS_MIN}-${QUESTION_OPTIONS_MAX} options`)
  }
  return value.map((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      throw invalidField('options', `option ${index} must be an object`)
    }
    if (typeof option.id !== 'string' || option.id.length < 1) {
      throw invalidField('options', `option ${index} must have a non-empty id`)
    }
    if (typeof option.label !== 'string' || option.label.length < 1 || option.label.length > QUESTION_OPTION_LABEL_MAX) {
      throw invalidField('options', `option ${index} label must be 1-${QUESTION_OPTION_LABEL_MAX} characters`)
    }
    const detail = option.detail === undefined ? '' : option.detail
    if (typeof detail !== 'string' || detail.length > QUESTION_OPTION_DETAIL_MAX) {
      throw invalidField('options', `option ${index} detail must be a string of at most ${QUESTION_OPTION_DETAIL_MAX} characters`)
    }
    return { id: option.id, label: option.label, detail }
  })
}

function validateQuestionDecision(value) {
  if (!QUESTION_DECISIONS.includes(value)) {
    throw invalidField('decision', `must be one of ${QUESTION_DECISIONS.join(', ')}`)
  }
  return value
}

function hasUnresolvedQuestion(task) {
  return Boolean(task.pendingQuestion) && !task.questionResolution
}

function validateCommentBody(value) {
  if (typeof value !== 'string') throw invalidField('body', 'must be a string')
  const body = value.trim()
  if (body.length < 1 || body.length > COMMENT_BODY_MAX) {
    throw invalidField('body', `must be 1-${COMMENT_BODY_MAX} characters after trimming`)
  }
  return body
}

function validateProjectName(value) {
  if (typeof value !== 'string') throw invalidField('name', 'must be a string')
  const name = value.trim()
  if (name.length < 1 || name.length > PROJECT_NAME_MAX) {
    throw invalidField('name', `must be 1-${PROJECT_NAME_MAX} characters after trimming`)
  }
  return name
}

function validateWorkspacePath(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.length > PROJECT_WORKSPACE_PATH_MAX) {
    throw invalidField('workspacePath', `must be null or a string of at most ${PROJECT_WORKSPACE_PATH_MAX} characters`)
  }
  return value
}

function validateAttachmentFilename(value) {
  if (typeof value !== 'string') throw invalidField('filename', 'must be a string')
  const filename = value.trim()
  if (filename.length < 1 || filename.length > ATTACHMENT_FILENAME_MAX) {
    throw invalidField('filename', `must be 1-${ATTACHMENT_FILENAME_MAX} characters after trimming`)
  }
  if (CONTROL_CHARACTERS.test(filename)) {
    throw invalidField('filename', 'must not contain control characters')
  }
  return filename
}

function validateAttachmentContentType(value) {
  if (typeof value !== 'string') throw invalidField('contentType', 'must be a string')
  const contentType = value.trim()
  if (contentType.length < 1 || contentType.length > ATTACHMENT_CONTENT_TYPE_MAX) {
    throw invalidField('contentType', `must be 1-${ATTACHMENT_CONTENT_TYPE_MAX} characters after trimming`)
  }
  return contentType
}

function validateAttachmentData(value) {
  if (typeof value !== 'string' || Buffer.from(value, 'base64').toString('base64') !== value) {
    throw invalidField('data', 'must be canonical base64')
  }
  return value
}

function sameValue(left, right) {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

export class KanbanStore {
  #tables
  #attachments
  #now
  #newId
  #actors
  #tail = Promise.resolve()

  constructor({ tables, attachments, actors = null, now = () => new Date().toISOString(), newId = () => crypto.randomUUID() }) {
    this.#tables = tables
    this.#attachments = attachments
    this.#actors = actors
    this.#now = now
    this.#newId = newId
  }

  #resolveAssignee(assigneeId) {
    if (assigneeId === undefined || assigneeId === null) return LOCAL_USER
    const actor = this.#actors?.get(assigneeId)
    if (!actor) throw Object.assign(new Error('Unknown assignee'), { code: 'INVALID_ASSIGNEE' })
    return actor
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

  #mutableTask(id) {
    const task = this.#task(id)
    const project = this.#project(task.projectId)
    if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
    if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
    return task
  }

  async #activity(taskId, changes, actor = LOCAL_USER) {
    const event = {
      id: this.#newId(),
      taskId,
      actor,
      changes: structuredClone(changes),
      createdAt: this.#now(),
    }
    await this.#tables.activity.put(event.id, event)
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

  createProject(input = {}) {
    return this.#run(async () => {
      assertInputObject(input)
      const name = validateProjectName(input.name)
      const workspacePath = validateWorkspacePath(input.workspacePath)
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      const base = slug.slice(0, 64)
      let id = base
      let suffix = 2
      while (this.#tables.projects.get(id)) {
        const tail = `-${suffix++}`
        id = `${base.slice(0, 64 - tail.length)}${tail}`
      }
      const prefixSource = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 3) || 'TSK'
      const prefixBase = prefixSource.length < 2 ? `${prefixSource}X` : prefixSource
      let taskPrefix = prefixBase
      suffix = 2
      while ([...this.#tables.projects.entries()].some(([, project]) => project.taskPrefix === taskPrefix)) {
        const tail = String(suffix++)
        taskPrefix = `${prefixBase.slice(0, 6 - tail.length)}${tail}`
      }
      const timestamp = this.#now()
      const project = {
        id,
        name,
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
      const next = { ...project, name: validateProjectName(name), updatedAt: this.#now() }
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

  createTask(input = {}, actor = LOCAL_USER) {
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
        assigneeId,
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
      const assignee = this.#resolveAssignee(assigneeId)
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
        assignee,
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
      await this.#activity(task.id, [{ field: 'status', before: null, after: task.status }], actor)
      return task
    })
  }

  updateTask(id, patch, actor = LOCAL_USER) {
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
      if (Object.hasOwn(patch, 'assigneeId')) next.assignee = this.#resolveAssignee(patch.assigneeId)
      next.version = task.version + 1
      next.updatedAt = now
      if (Object.hasOwn(patch, 'status') && next.status !== task.status) next.statusSince = now
      if (Object.hasOwn(patch, 'blockedReason')) {
        if (patch.blockedReason === null) next.blockedSince = null
        else if (!task.blockedReason) next.blockedSince = now
      }
      if (next.status === 'done') {
        if (hasUnresolvedQuestion(next) || next.blockedReason) {
          throw Object.assign(new Error('Resolve attention before Done'), { code: 'TASK_NEEDS_ATTENTION' })
        }
      }
      const changes = []
      const record = (field, before, after) => {
        if (!sameValue(before, after)) changes.push({ field, before, after })
      }
      record('title', task.title, next.title)
      record('description', task.description, next.description)
      record('status', task.status, next.status)
      record('priority', task.priority, next.priority)
      record('labels', task.labels, next.labels)
      record('links', task.links, next.links)
      record('blockedReason', task.blockedReason, next.blockedReason)
      record('assignee', task.assignee, next.assignee)
      await this.#tables.tasks.put(id, next)
      if (changes.length) await this.#activity(id, changes, actor)
      return next
    })
  }

  askQuestion(id, input = {}) {
    return this.#run(async () => {
      const task = this.#mutableTask(id)
      assertInputObject(input)
      const { version, prompt, note = '', options } = input
      const cleanPrompt = validateQuestionPrompt(prompt)
      const cleanNote = validateQuestionNote(note)
      const cleanOptions = validateQuestionOptions(options)
      if (version !== task.version) {
        throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      }
      if (hasUnresolvedQuestion(task)) {
        throw Object.assign(new Error('Question already pending'), { code: 'QUESTION_ALREADY_PENDING' })
      }
      const now = this.#now()
      const next = {
        ...task,
        status: task.status === 'done' ? 'in_review' : task.status,
        statusSince: task.status === 'done' ? now : task.statusSince,
        pendingQuestion: {
          prompt: cleanPrompt,
          note: cleanNote,
          options: cleanOptions,
          selected: null,
          createdAt: now,
        },
        questionResolution: null,
        version: task.version + 1,
        updatedAt: now,
      }
      await this.#tables.tasks.put(id, next)
      const changes = [
        { field: 'pendingQuestion', before: task.pendingQuestion?.prompt ?? null, after: cleanPrompt },
      ]
      if (next.status !== task.status) {
        changes.push({ field: 'status', before: task.status, after: next.status })
      }
      await this.#activity(id, changes)
      return this.#summary(next)
    })
  }

  answerQuestion(id, input = {}) {
    return this.#run(async () => {
      const task = this.#mutableTask(id)
      assertInputObject(input)
      const { version, decision, selected = null, note = '' } = input
      const cleanDecision = validateQuestionDecision(decision)
      const cleanNote = validateQuestionNote(note)
      if (version !== task.version) {
        throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      }
      const pending = hasUnresolvedQuestion(task)
      if (!pending && task.status !== 'in_review') {
        throw Object.assign(new Error('Task is not awaiting review'), { code: 'TASK_NOT_IN_REVIEW' })
      }
      const option = pending ? task.pendingQuestion.options.find((item) => item.id === selected) ?? null : null
      if (pending && !option) {
        throw Object.assign(new Error('Selected option is required'), { code: 'INVALID_FIELD', details: { field: 'selected' } })
      }
      if (cleanDecision === 'approve' && task.blockedReason) {
        throw Object.assign(new Error('Resolve attention before Done'), { code: 'TASK_NEEDS_ATTENTION' })
      }
      const now = this.#now()
      const next = {
        ...task,
        status: cleanDecision === 'approve' ? 'done' : 'backlog',
        statusSince: now,
        questionResolution: {
          decision: cleanDecision,
          optionId: option?.id ?? null,
          optionLabel: option?.label ?? null,
          note: cleanNote,
          at: now,
        },
        version: task.version + 1,
        updatedAt: now,
      }
      await this.#tables.tasks.put(id, next)
      const changes = [
        { field: 'questionResolution', before: task.questionResolution, after: next.questionResolution },
      ]
      if (next.status !== task.status) {
        changes.push({ field: 'status', before: task.status, after: next.status })
      }
      await this.#activity(id, changes)
      return this.#summary(next)
    })
  }

  addComment(taskId, body, actor = LOCAL_USER) {
    return this.#run(async () => {
      const task = this.#mutableTask(taskId)
      const cleanBody = validateCommentBody(body)
      const timestamp = this.#now()
      const comment = {
        id: this.#newId(),
        taskId: task.id,
        body: cleanBody,
        author: actor,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.#tables.comments.put(comment.id, comment)
      return comment
    })
  }

  deleteComment(taskId, commentId) {
    return this.#run(async () => {
      this.#mutableTask(taskId)
      const comment = this.#tables.comments.get(commentId)
      if (!comment || comment.taskId !== taskId) {
        throw Object.assign(new Error('Comment not found'), { code: 'NOT_FOUND' })
      }
      await this.#tables.comments.delete(commentId)
    })
  }

  addAttachment(taskId, input = {}) {
    return this.#run(async () => {
      const task = this.#task(taskId)
      const project = this.#project(task.projectId)
      if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      assertInputObject(input)
      const filename = validateAttachmentFilename(input.filename)
      const contentType = validateAttachmentContentType(input.contentType)
      const data = validateAttachmentData(input.data)
      const bytes = Buffer.from(data, 'base64')
      if (bytes.length > ATTACHMENT_MAX_BYTES) {
        throw Object.assign(new Error('Attachment is too large'), { code: 'ATTACHMENT_TOO_LARGE' })
      }
      const count = [...this.#tables.attachments.entries()].filter(([, attachment]) => attachment.taskId === taskId).length
      if (count >= ATTACHMENT_LIMIT) {
        throw Object.assign(new Error('Attachment limit reached'), { code: 'ATTACHMENT_LIMIT_REACHED' })
      }
      const ref = await this.#attachments.admitEncodedFile({ data, name: filename })
      const attachment = {
        id: this.#newId(),
        taskId,
        filename,
        contentType,
        size: ref.bytes,
        storageRef: { attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes },
        createdAt: this.#now(),
      }
      await this.#tables.attachments.put(attachment.id, attachment)
      await this.#activity(taskId, [{ field: 'attachment', before: null, after: filename }])
      return attachment
    })
  }

  deleteAttachment(taskId, attachmentId) {
    return this.#run(async () => {
      const attachment = this.#tables.attachments.get(attachmentId)
      if (!attachment || attachment.taskId !== taskId) {
        throw Object.assign(new Error('Attachment not found'), { code: 'NOT_FOUND' })
      }
      const task = this.#task(taskId)
      const project = this.#project(task.projectId)
      if (task.archivedAt) throw Object.assign(new Error('Task is archived'), { code: 'TASK_ARCHIVED' })
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      await this.#tables.attachments.delete(attachmentId)
      await this.#activity(taskId, [{ field: 'attachment', before: attachment.filename, after: null }])
    })
  }

  readAttachment(attachmentId) {
    const attachment = this.#tables.attachments.get(attachmentId)
    if (!attachment) throw Object.assign(new Error('Attachment not found'), { code: 'NOT_FOUND' })
    return {
      attachment,
      stream: this.#attachments.readFileStream(attachment.storageRef),
    }
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
      await this.#activity(id, [{ field: 'archivedAt', before: task.archivedAt, after: next.archivedAt }])
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
      await this.#activity(id, [{ field: 'archivedAt', before: task.archivedAt, after: next.archivedAt }])
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
