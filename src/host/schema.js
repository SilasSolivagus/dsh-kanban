import { z } from 'zod'
import { PRIORITIES, STATUSES } from '../shared/statuses.js'

const iso = z.string().min(1)
const actor = z.object({
  type: z.enum(['user', 'agent']),
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().nullable(),
})
const link = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  url: z.string().refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'URL must use http or https'),
})
const questionOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  detail: z.string().max(1000).default(''),
})
const pendingQuestion = z.object({
  prompt: z.string().min(1).max(2000),
  note: z.string().max(2000).default(''),
  options: z.array(questionOption).min(2).max(5),
  selected: z.string().nullable(),
  createdAt: iso,
})
const questionResolution = z.object({
  decision: z.enum(['approve', 'reject']),
  optionId: z.string().nullable(),
  optionLabel: z.string().nullable(),
  note: z.string().max(2000).default(''),
  at: iso,
})

export const projectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  workspacePath: z.string().nullable(),
  taskPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/),
  labels: z.array(z.string().min(1).max(64)).max(50),
  nextTaskNumber: z.number().int().min(1),
  archivedAt: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
})

export const taskSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).max(240),
  description: z.string().max(100000),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  labels: z.array(z.string().min(1).max(64)).max(20),
  assignee: actor,
  sortOrder: z.number().finite(),
  statusSince: iso,
  blockedReason: z.string().max(2000).nullable(),
  blockedSince: iso.nullable(),
  pendingQuestion: pendingQuestion.nullable(),
  questionResolution: questionResolution.nullable(),
  links: z.array(link).max(50),
  archivedAt: z.string().nullable(),
  version: z.number().int().min(1),
  createdAt: iso,
  updatedAt: iso,
})

export const commentSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  body: z.string().min(1).max(10000),
  author: actor,
  createdAt: iso,
  updatedAt: iso,
})

export const attachmentSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(200),
  size: z.number().int().min(0),
  storageRef: z.object({
    attachmentId: z.string().min(1),
    name: z.string().min(1),
    bytes: z.number().int().min(0),
  }),
  createdAt: iso,
})

export const activitySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  actor,
  changes: z.array(z.object({
    field: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
  })),
  createdAt: iso,
})
