async function request(path, options = {}) {
  const response = await fetch(`/kanban-api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  })
  const body = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? response.statusText)
    error.code = body?.error?.code
    error.details = body?.error?.details
    throw error
  }
  return body
}

export const api = {
  bootstrap: () => request('/bootstrap'),
  createProject: (body) => request('/projects', { method: 'POST', body: JSON.stringify(body) }),
  renameProject: (id, body) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveProject: (id) => request(`/projects/${id}/archive`, { method: 'POST', body: '{}' }),
  restoreProject: (id) => request(`/projects/${id}/restore`, { method: 'POST', body: '{}' }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  taskDetail: (id) => request(`/tasks/${id}`),
  archiveTask: (id, body) => request(`/tasks/${id}/archive`, { method: 'POST', body: JSON.stringify(body) }),
  restoreTask: (id, body) => request(`/tasks/${id}/restore`, { method: 'POST', body: JSON.stringify(body) }),
  deleteTask: (id, body) => request(`/tasks/${id}`, { method: 'DELETE', body: JSON.stringify(body) }),
  askQuestion: (id, body) => request(`/tasks/${id}/question`, { method: 'POST', body: JSON.stringify(body) }),
  answerQuestion: (id, body) => request(`/tasks/${id}/answer`, { method: 'POST', body: JSON.stringify(body) }),
  addComment: (id, body) => request(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteComment: (taskId, commentId) => request(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
  addAttachment: (id, body) => request(`/tasks/${id}/attachments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAttachment: (taskId, attachmentId) => request(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  archivedTasks: (projectId) => request(`/archived-tasks${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
}
