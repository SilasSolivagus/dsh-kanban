export function groupTasks(tasks) {
  return {
    backlog: tasks.filter((task) => task.column === 'backlog'),
    running: tasks.filter((task) => task.column === 'running'),
    needs: tasks.filter((task) => task.column === 'needs'),
    done: tasks.filter((task) => task.column === 'done'),
  }
}

export function applyTaskPatch(tasks, taskId, patch) {
  return tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task)
}
