import React from 'react'
import { App } from './components/App.js'

export const inject = ['slots', 'locale']

const NS = 'kanban'

const ZH = {
  nav: '看板',
  allProjects: '所有项目',
  activeProjects: '进行中项目',
  createProject: '创建项目',
  manageProjects: '管理项目',
  archivedProjects: '已归档项目',
  archivedTasks: '已归档任务',
  search: '搜索标题 / 摘要 / 项目',
  filters: '筛选',
  runningCount: '{count} 个运行中',
  newCard: '新建卡片',
  backlog: 'Backlog',
  running: 'Running',
  needs: 'Needs you',
  done: 'Done',
  refresh: '刷新',
  refreshing: '刷新中…',
  loading: '加载中…',
  loadError: '无法加载看板：{message}',
  loadErrorTitle: '无法加载看板',
  archivedTasksLoadError: '无法加载已归档任务：{message}',
  retry: '重试',
  noProjects: '还没有项目',
  noProjectsHint: '创建第一个项目，开始跟踪任务。',
  boardPlaceholder: '任务卡片将在这里显示。',
  boardEmpty: '此视图暂无任务',
  taskCount: '{count} 个任务',
  projectName: '项目名称',
  projectNamePlaceholder: '例如：市场网站',
  workspacePath: '工作区路径（可选）',
  workspacePathPlaceholder: '/path/to/workspace',
  cancel: '取消',
  create: '创建',
  save: '保存',
  close: '关闭',
  renameProject: '重命名项目',
  rename: '重命名',
  archiveProject: '归档项目',
  archive: '归档',
  archiveConfirm: '归档“{name}”？任务会被保留，但项目会从切换器中移出，直到恢复。',
  restoreProject: '恢复项目',
  restore: '恢复',
  deleteProject: '删除项目',
  delete: '删除',
  deleteConfirm: '删除“{name}”？此操作无法撤销。',
  deleteNonEmptyHint: '该项目包含 {count} 个任务。请先删除或移出这些任务。',
  projectNotEmpty: '项目仍有 {count} 个任务。请先删除或移出这些任务。',
  projectExists: '同名项目已存在。',
  projectArchived: '项目已归档，请先恢复。',
  projectNotFound: '找不到该项目。',
  nameRequired: '请输入项目名称。',
  invalidField: '字段无效：{field}',
  actionFailed: '操作失败，请重试。',
  noActiveProjects: '没有进行中的项目。',
  noArchivedProjects: '没有已归档项目。',
  noArchivedTasks: '没有已归档任务。',
  archived: '已归档',
  menuLabel: '项目菜单',
  workspaceLabel: '工作区',
  archivedTasksFor: '显示“{project}”的已归档任务。',
}

const EN = {
  nav: 'Kanban',
  allProjects: 'All projects',
  activeProjects: 'Active projects',
  createProject: 'Create project',
  manageProjects: 'Manage projects',
  archivedProjects: 'Archived projects',
  archivedTasks: 'Archived tasks',
  search: 'Search title / summary / project',
  filters: 'Filters',
  runningCount: '{count} running',
  newCard: 'New card',
  backlog: 'Backlog',
  running: 'Running',
  needs: 'Needs you',
  done: 'Done',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  loading: 'Loading…',
  loadError: 'Could not load the board: {message}',
  loadErrorTitle: 'Could not load the board',
  archivedTasksLoadError: 'Could not load archived tasks: {message}',
  retry: 'Retry',
  noProjects: 'No projects yet',
  noProjectsHint: 'Create your first project to start tracking work.',
  boardPlaceholder: 'Task cards will render here.',
  boardEmpty: 'No tasks in this view',
  taskCount: '{count} tasks',
  projectName: 'Project name',
  projectNamePlaceholder: 'e.g. Marketing site',
  workspacePath: 'Workspace path (optional)',
  workspacePathPlaceholder: '/path/to/workspace',
  cancel: 'Cancel',
  create: 'Create',
  save: 'Save',
  close: 'Close',
  renameProject: 'Rename project',
  rename: 'Rename',
  archiveProject: 'Archive project',
  archive: 'Archive',
  archiveConfirm: 'Archive "{name}"? Its tasks are kept, but the project leaves the switcher until restored.',
  restoreProject: 'Restore project',
  restore: 'Restore',
  deleteProject: 'Delete project',
  delete: 'Delete',
  deleteConfirm: 'Delete "{name}"? This cannot be undone.',
  deleteNonEmptyHint: 'This project contains {count} tasks. Delete or move them first.',
  projectNotEmpty: 'The project still contains {count} tasks. Delete or move them first.',
  projectExists: 'A project with this name already exists.',
  projectArchived: 'The project is archived. Restore it first.',
  projectNotFound: 'Project not found.',
  nameRequired: 'Enter a project name.',
  invalidField: 'Invalid field: {field}',
  actionFailed: 'Something went wrong. Try again.',
  noActiveProjects: 'No active projects.',
  noArchivedProjects: 'No archived projects.',
  noArchivedTasks: 'No archived tasks.',
  archived: 'Archived',
  menuLabel: 'Project menu',
  workspaceLabel: 'Workspace',
  archivedTasksFor: 'Showing archived tasks for "{project}".',
}

function SidebarIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2.2" y="2.5" width="3.3" height="13" rx="1.2" fill="currentColor" opacity=".38" />
    <rect x="7.35" y="2.5" width="3.3" height="13" rx="1.2" fill="currentColor" opacity=".66" />
    <rect x="12.5" y="2.5" width="3.3" height="13" rx="1.2" fill="currentColor" />
  </svg>
}

export function apply(ctx) {
  ctx.effect(() => {
    const offZh = ctx.locale.register(NS, 'zh', ZH)
    const offEn = ctx.locale.register(NS, 'en', EN)
    return () => { offZh(); offEn() }
  }, 'dsh-kanban: locale')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: 'kanban',
    locale: NS,
  }, App))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'kanban',
    order: 20,
    label: () => t('nav'),
  }, SidebarIcon))
}
