import { attentionReason, columnForTask, nextIdentifier } from '../shared/rules.js'

const LOCAL_USER = { type: 'user', id: 'local-user', name: '本地用户', avatarUrl: null }

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

  createTask({ projectId, title, description = '', status = 'backlog', priority = 'none', labels = [], assigneeTarget = 'current-user', sortOrder }) {
    return this.#run(async () => {
      const project = this.#project(projectId)
      if (project.archivedAt) throw Object.assign(new Error('Project is archived'), { code: 'PROJECT_ARCHIVED' })
      const tasks = [...this.#tables.tasks.entries()].map(([, task]) => task)
      const identifier = nextIdentifier(project, tasks)
      const timestamp = this.#now()
      const siblings = tasks.filter((task) => task.projectId === projectId && task.status === status && !task.archivedAt)
      const order = sortOrder ?? (siblings.length ? Math.min(...siblings.map((task) => task.sortOrder)) - 1000 : 1000)
      const task = {
        id: this.#newId(),
        identifier,
        projectId,
        title: String(title).trim(),
        description: String(description),
        status,
        priority,
        labels: [...labels],
        assignee: LOCAL_USER,
        sortOrder: order,
        statusSince: timestamp,
        blockedReason: null,
        blockedSince: null,
        pendingQuestion: null,
        questionResolution: null,
        links: [],
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
      if (patch.version !== task.version) {
        throw Object.assign(new Error('Task changed elsewhere'), { code: 'TASK_VERSION_CONFLICT' })
      }
      const now = this.#now()
      const next = { ...task, ...patch, version: task.version + 1, updatedAt: now }
      if (patch.status && patch.status !== task.status) next.statusSince = now
      if (patch.blockedReason && !task.blockedReason) next.blockedSince = now
      if (patch.blockedReason === null) next.blockedSince = null
      delete next.versionInput
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
