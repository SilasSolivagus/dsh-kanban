import { kanbanDomainSpec } from './domain.js'
import { KanbanStore } from './store.js'
import { createHttpHandler } from './http.js'
import { createActorRegistry } from './actors.js'
import { startSupervisor } from './supervisor/runtime.js'

export const inject = ['webServer', 'storageDomain', 'attachments']

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(kanbanDomainSpec)
  ctx.effect(() => () => domain.close(), 'dsh-kanban: close domain')
  const actors = createActorRegistry()
  const store = new KanbanStore({
    actors,
    tables: {
      projects: domain.table('projects'),
      tasks: domain.table('tasks'),
      comments: domain.table('comments'),
      attachments: domain.table('attachments'),
      activity: domain.table('task_activity'),
    },
    attachments: ctx.attachments,
  })
  ctx.provide('kanban', store)
  const supervisor = startSupervisor(ctx, store)
  if (supervisor) ctx.effect(() => () => supervisor.stop(), 'dsh-kanban: stop supervisor')
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/kanban-api',
    handler: createHttpHandler(store, { actors }),
  }), 'dsh-kanban: HTTP route')
}
