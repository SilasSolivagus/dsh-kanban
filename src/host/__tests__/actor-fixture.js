export const AGENTS = [
  {
    type: 'agent',
    id: 'office',
    name: 'Office',
    role: 'office',
    projects: ['*'],
    scopes: ['board:read', 'board:create', 'board:assign', 'board:update:any', 'board:comment'],
    token: 'office-token',
  },
  {
    type: 'agent',
    id: 'builder',
    name: 'Builder',
    role: 'builder',
    projects: ['dsh-kanban'],
    scopes: ['board:read', 'board:update:own', 'board:comment'],
    token: 'builder-token',
  },
]
