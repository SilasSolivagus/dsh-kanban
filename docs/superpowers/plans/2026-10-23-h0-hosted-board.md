# H0：Hosted Board 服务器骨骼 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox syntax.

**Goal:** 在一台服务器上跑起一个可登录、可建项目、可建卡、重启不丢数据的空看板。没有 UI，没有 A2A，没有 bot token，没有迁移。

**Architecture:** 新建独立服务 `dsh-kanban-server`。Fastify API + PostgreSQL + Caddy TLS + Docker Compose。服务器只跑 board，不跑 DSH host。H0 用单管理员密码登录；H1 再换 OIDC/完整 UI。

**Tech Stack:** Node 22、Fastify 5、PostgreSQL 16、`pg`、`zod`、`@fastify/cookie`、Docker Compose、Caddy。

**Spec:** `docs/superpowers/plans/2026-10-23-hosted-kanban-a2a.md` H0。

## Global Constraints

- 服务器不暴露 DSH shell / 文件系统 / 本地 workspace。
- 不开放公开注册。
- 所有写接口必须登录。
- 数据库只在内网，不暴露 5432。
- 密码只存 scrypt hash，不存明文。
- Session cookie：HttpOnly、Secure、SameSite=Lax、签名。
- 所有响应 JSON；错误不泄露密码、token、SQL。
- 不引入 Redis、Kubernetes、ORM。
- H0 只做单租户；schema 预留 `tenant_id` 可后加。
- H0 不做 UI、A2A、bot token、附件、迁移。

## 目标仓库

```text
/Users/silas/Documents/deepseek-harness/default-workspace/output/dsh-kanban-server
```

独立仓库，不与 `dsh-kanban` 插件混在一起。

## 文件结构

```text
dsh-kanban-server/
  package.json
  pnpm-lock.yaml
  .env.example
  Dockerfile
  docker-compose.yml
  Caddyfile
  migrations/
    001_init.sql
  scripts/
    hash-password.mjs
    migrate.mjs
    backup.sh
    smoke.sh
  src/
    config.js
    db.js
    auth.js
    routes/
      auth.js
      projects.js
      tasks.js
      health.js
    server.js
  tests/
    auth.test.js
    projects.test.js
    tasks.test.js
    helpers.js
```

## 环境

```text
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://kanban:...@db:5432/kanban
APP_ORIGIN=https://kanban.example.com
SESSION_SECRET=<32+ random bytes>
ADMIN_PASSWORD_HASH=<scrypt hash>
COOKIE_SECURE=true
```

---

## Task 1: Server skeleton + health

**Files:** `package.json`, `src/config.js`, `src/server.js`, `src/routes/health.js`, `tests/health.test.js`

**Interfaces:**

- `loadConfig(env)` — validates required keys; returns typed config.
- `buildServer(config)` — Fastify instance; no listen.
- `GET /healthz` -> `{ ok: true }`.
- `GET /readyz` -> checks DB; `{ ok: true }` or 503.

Tests:

- missing `DATABASE_URL` throws `ConfigError`.
- health 200 without DB.
- ready 503 when `SELECT 1` fails.
- `buildServer` does not bind a port.

Run `node --test tests/health.test.js`.

Commit `feat: add server skeleton and health checks`.

---

## Task 2: Postgres schema + migrations

**Files:** `migrations/001_init.sql`, `src/db.js`, `scripts/migrate.mjs`, `tests/db.test.js`

**Schema:**

```sql
CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  task_prefix text NOT NULL,
  next_task_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'backlog',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, identifier)
);
```

**Interfaces:**

- `createPool(config)` -> `pg.Pool`.
- `withTransaction(pool, fn)`.
- `migrate(pool)` — ordered SQL files; insert version; idempotent.
- `scripts/migrate.mjs` reads `DATABASE_URL`.

Tests against `TEST_DATABASE_URL`:

- migration creates tables.
- running twice is a no-op.
- tasks require existing project.
- unique `(project_id, identifier)`.
- `TEST_DATABASE_URL` must end with `_test`; guard.

Run:

```bash
TEST_DATABASE_URL=... node --test tests/db.test.js
```

Commit `feat: add postgres schema and migrations`.

---

## Task 3: Admin auth

**Files:** `src/auth.js`, `src/routes/auth.js`, `scripts/hash-password.mjs`, `tests/auth.test.js`

**Interfaces:**

- `hashPassword(password)` -> `scrypt$N$r$p$salt$hash`.
- `verifyPassword(password, stored)` -> boolean (`timingSafeEqual`).
- `signSession(payload, secret)` / `verifySession(cookie, secret)`.
- `POST /auth/login` `{password}` -> set-cookie `session`; 204.
- `POST /auth/logout` -> clear cookie; 204.
- `GET /auth/me` -> `{ user: { id: 'admin', name: 'Admin' } }`.
- `requireAdmin` preHandler -> 401.

Cookie:

```text
HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800
```

Tests:

- hash/verify roundtrip; wrong password false.
- login sets HttpOnly/Secure cookie.
- login wrong password 401; no cookie.
- `/auth/me` without cookie 401; with cookie 200.
- tampered cookie 401.
- logout clears cookie.

Run `node --test tests/auth.test.js`.

Commit `feat: add admin password auth and signed session`.

---

## Task 4: Projects and tasks API

**Files:** `src/routes/projects.js`, `src/routes/tasks.js`, `tests/projects.test.js`, `tests/tasks.test.js`

**Endpoints (all require auth):**

```text
GET  /v1/bootstrap        -> { projects, tasks }
POST /v1/projects         { name, taskPrefix? } -> project
POST /v1/tasks            { projectId, title, description? } -> task
GET  /v1/tasks/:id        -> { task }
PATCH /v1/tasks/:id       { version, title?, description?, status? } -> task
```

Rules:

- Project id: uuid; prefix from name, uppercase, 2–6 chars.
- Task identifier: `<prefix>-<n>`; increment inside transaction with `SELECT ... FOR UPDATE`.
- Status allowlist: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`.
- PATCH version mismatch -> `409 TASK_VERSION_CONFLICT`.
- All ids validated as UUID.
- No delete in H0.

Tests:

- create project; prefix.
- create task increments identifier `DSH-1`, `DSH-2`.
- concurrent create gets unique identifiers.
- patch increments version; stale version 409.
- invalid status 400.
- unauthenticated 401.

Run `node --test tests/projects.test.js tests/tasks.test.js`.

Commit `feat: add projects and tasks API`.

---

## Task 5: Docker Compose + Caddy

**Files:** `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.env.example`, `README.md`

**Compose:**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment: POSTGRES_DB=kanban, POSTGRES_USER=kanban, POSTGRES_PASSWORD
    volumes: pgdata
    healthcheck: pg_isready
  app:
    build: .
    env_file: .env
    depends_on: db healthy
    expose: 8080
  caddy:
    image: caddy:2-alpine
    ports: 80:80, 443:443
    volumes: Caddyfile, caddy_data, caddy_config
    depends_on: app
```

Caddyfile:

```text
{$APP_ORIGIN} {
  encode zstd gzip
  reverse_proxy app:8080
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options nosniff
    Referrer-Policy no-referrer
  }
}
```

Tests:

- `docker compose config` valid.
- `docker compose up -d db app`; `/healthz` 200.
- `docker compose up` Caddy serves HTTPS (manual DNS check).
- DB port not published.

Commit `feat: add docker compose and caddy deployment`.

---

## Task 6: Backup and restore

**Files:** `scripts/backup.sh`, `scripts/restore-check.sh`, `docs/RUNBOOK.md`

**Backup:**

- `pg_dump --format=custom` to `/backups/kanban-YYYYMMDD-HHMMSS.dump`.
- retention 14 days.
- optional `rclone copy` if `RCLONE_REMOTE` set.
- fail if dump < 1 KB.

**Restore check:**

- create temp database `kanban_restore_test`.
- `pg_restore` into it.
- `SELECT count(*) FROM projects/tasks`.
- drop temp DB.

Tests:

- backup creates file.
- restore into temp DB succeeds.
- counts match.
- restore-check exits 0.

Commit `feat: add backup and restore checks`.

---

## Task 7: Deploy and smoke

**Server prerequisites:**

- Ubuntu 24.04 VPS, 2 vCPU / 4 GB
- domain A record
- Docker + Compose
- SSH key only

**Deploy:**

```bash
git clone <repo> /opt/dsh-kanban-server
cd /opt/dsh-kanban-server
cp .env.example .env
# fill DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD_HASH, APP_ORIGIN
docker compose up -d --build
docker compose exec app node scripts/migrate.mjs
curl -fsS https://$APP_ORIGIN/healthz
```

**Smoke:**

```bash
scripts/smoke.sh https://$APP_ORIGIN "$ADMIN_PASSWORD"
```

Smoke:

1. login
2. create project `DSH`
3. create task `hello`
4. get task
5. patch version
6. print `PASS`

Exit criteria:

- [ ] HTTPS valid
- [ ] login works
- [ ] project/task create works
- [ ] restart app + db; data remains
- [ ] backup file exists
- [ ] restore-check passes
- [ ] DB port not public
- [ ] no secret in logs/repo

---

## H0 Out of Scope

- Web UI
- local DSH remote mode
- bot tokens
- A2A
- attachments
- activity/comments
- migration
- multi-tenant
- OIDC
- mobile

## Risks

| Risk | Mitigation |
| --- | --- |
| Server compromise | only board exposed; no DSH host; SSH key only |
| Password brute force | rate-limit login; strong password; fail2ban |
| Session theft | HttpOnly/Secure/SameSite; short expiry |
| DB loss | daily pg_dump + restore check |
| Migration drift | ordered SQL + schema_migrations |
| UUID/identifier races | transaction + `FOR UPDATE` |
| Caddy misconfig | `docker compose config` + smoke |
| Secret leak | env only; redacted logs |

## Definition of Done

> 打开 `https://kanban.example.com/healthz` 返回 200；  
> 登录后能建项目、建卡；  
> 重启后数据还在；  
> 备份能恢复。

H0 完成后再做 H1：完整 UI + 本地 DSH remote mode。
