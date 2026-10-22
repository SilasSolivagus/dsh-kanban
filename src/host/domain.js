import {
  activitySchema,
  attachmentSchema,
  commentSchema,
  projectSchema,
  taskSchema,
} from './schema.js'

// Keep the domain spec a plain object. The Host supplies the storage-domain
// service at runtime; importing its package here would make the installed
// bundle depend on a module that lives inside the DSH application, outside
// this package's resolution root.
export const kanbanDomainSpec = {
  name: 'dsh_kanban',
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    projects: { valueSchema: projectSchema },
    tasks: { valueSchema: taskSchema },
    comments: { valueSchema: commentSchema },
    attachments: { valueSchema: attachmentSchema },
    task_activity: { valueSchema: activitySchema },
  },
}
