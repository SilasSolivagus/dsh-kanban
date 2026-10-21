import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import {
  activitySchema,
  attachmentSchema,
  commentSchema,
  projectSchema,
  taskSchema,
} from './schema.js'

export const kanbanDomainSpec = defineDomain({
  name: 'dsh-kanban',
  version: 1,
  tables: {
    projects: domainTable(projectSchema),
    tasks: domainTable(taskSchema),
    comments: domainTable(commentSchema),
    attachments: domainTable(attachmentSchema),
    task_activity: domainTable(activitySchema),
  },
})
