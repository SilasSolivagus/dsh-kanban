#!/usr/bin/env node
const BASE = process.env.DSH_KANBAN_URL
const TOKEN = process.env.DSH_KANBAN_TOKEN

function usage() {
  console.log(`Usage:
  DSH_KANBAN_URL=http://127.0.0.1:<port>/kanban-api DSH_KANBAN_TOKEN=... \\
    node scripts/kanban-agent.mjs <command> [options]

Commands:
  bootstrap
  get --id <task-id>
  create --project <project-id> --title <title> [--acceptance <text>] [--assignee <actor-id>] [--status <status>] [--priority <priority>]
  update --id <task-id> [--version <n>] [--status <status>] [--assignee <actor-id>] [--comment <text>]
  comment --id <task-id> --body <text>

Examples:
  create --project dsh-kanban --title '给看板加方案确认' --acceptance 'office 建卡，builder 能更新' --assignee builder
  update --id <id> --status in_progress --comment '收到'`)
}

function parse(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--help' || token === '-h') { args.help = true; continue }
    if (!token.startsWith('--')) { args._.push(token); continue }
    const key = token.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    args[key] = value
    i++
  }
  return args
}

function config() {
  if (!BASE) throw new Error('DSH_KANBAN_URL is required')
  if (!TOKEN) throw new Error('DSH_KANBAN_TOKEN is required')
  return { base: BASE.replace(/\/$/, ''), token: TOKEN }
}

async function request(path, options = {}) {
  const { base, token } = config()
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    console.error(JSON.stringify({ status: response.status, body }, null, 2))
    process.exitCode = 1
    return null
  }
  return body
}

async function main() {
  const args = parse(process.argv.slice(2))
  if (args.help || args._.length === 0) { usage(); return }
  const command = args._[0]

  if (command === 'bootstrap') {
    const body = await request('/bootstrap')
    if (body) console.log(JSON.stringify(body, null, 2))
    return
  }

  if (command === 'get') {
    if (!args.id) throw new Error('--id is required')
    const body = await request(`/tasks/${encodeURIComponent(args.id)}`)
    if (body) console.log(JSON.stringify(body, null, 2))
    return
  }

  if (command === 'create') {
    if (!args.project) throw new Error('--project is required')
    if (!args.title) throw new Error('--title is required')
    const description = args.acceptance ? `## 验收\n${args.acceptance}` : undefined
    const body = await request('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        projectId: args.project,
        title: args.title,
        ...(description ? { description } : {}),
        ...(args.assignee ? { assigneeId: args.assignee } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
      }),
    })
    if (body) console.log(JSON.stringify(body, null, 2))
    return
  }

  if (command === 'update') {
    if (!args.id) throw new Error('--id is required')
    let version = args.version
    if (version === undefined) {
      const detail = await request(`/tasks/${encodeURIComponent(args.id)}`)
      if (!detail) return
      version = detail.task.version
    }
    const body = await request(`/tasks/${encodeURIComponent(args.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: Number(version),
        ...(args.status ? { status: args.status } : {}),
        ...(args.assignee ? { assigneeId: args.assignee } : {}),
      }),
    })
    if (!body) return
    const result = { task: body }
    if (args.comment) {
      const comment = await request(`/tasks/${encodeURIComponent(args.id)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: args.comment }),
      })
      if (comment) result.comment = comment
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'comment') {
    if (!args.id) throw new Error('--id is required')
    if (!args.body) throw new Error('--body is required')
    const body = await request(`/tasks/${encodeURIComponent(args.id)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: args.body }),
    })
    if (body) console.log(JSON.stringify(body, null, 2))
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
