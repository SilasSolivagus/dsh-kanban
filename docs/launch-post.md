# Launch kit

Ready-to-post copy for DSH Kanban v2.0.0.

- Repo: https://github.com/SilasSolivagus/dsh-kanban
- Release: https://github.com/SilasSolivagus/dsh-kanban/releases/tag/v2.0.0
- Social image: [`docs/assets/social-preview.png`](assets/social-preview.png)
- Demo GIF: [`docs/assets/kanban-demo.gif`](assets/kanban-demo.gif)
- Board screenshot: [`docs/assets/kanban-board.png`](assets/kanban-board.png)

## The one-liner

> A native four-column task board for DeepSeek Harness. Your agent creates work and asks questions; you answer in the card; the board moves itself.

## X / Twitter (English)

**Post 1**

Your agent needs a queue. You need a board.

DSH Kanban is a native task board for DeepSeek Harness — four columns, real approvals, durable Host storage. No iframe, no second tab.

Open source, MIT. 🧵

![board](assets/kanban-board.png)

**Post 2**

The loop:

1. The agent creates work, records a blocker, or asks a question.
2. The card lands in **Needs you**.
3. You approve, reject, unblock, or comment.
4. The task moves to **Done**, with the full activity trail.

**Post 3**

Why native matters:

- registers in the DSH `main` slot + `sidebar.panellist`
- uses DSH theme tokens and locale
- persists through `storageDomain`
- streams attachments through the DSH attachment service

An iframe can look close. It cannot be the same thing.

**Post 4**

Install in two minutes:

```bash
git clone https://github.com/SilasSolivagus/dsh-kanban.git
cd dsh-kanban
pnpm install && pnpm check
```

Then: DSH → Settings → Plugins → Install local bundle → select the folder → refresh.

**Post 5**

If this saves you a Trello tab:

⭐ https://github.com/SilasSolivagus/dsh-kanban

Issues, PRs and “this is broken on my machine” reports are welcome.

## X / 微博 / 即刻 (中文)

**主帖**

给 agent 一个队列，给自己一个看板。

DSH Kanban 是 DeepSeek Harness 的原生任务看板：
四列 · 卡片内审批 · 阻塞 · 评论/附件 · Host 持久化。

不是 iframe，也不用再开第二个标签页。

开源 MIT：https://github.com/SilasSolivagus/dsh-kanban

![看板](assets/kanban-board.png)

**补充**

工作流很简单：

agent 建任务 / 提问 / 记录阻塞 → 卡片进入 **Needs you** → 你回答或批准 → 任务进入 **Done**，活动记录自动保留。

**安装**

```bash
git clone https://github.com/SilasSolivagus/dsh-kanban.git
cd dsh-kanban
pnpm install && pnpm check
```

DSH → 设置 → 插件 → 安装本地 bundle → 选择目录 → 刷新。

## Hacker News — Show HN

**Title**

Show HN: DSH Kanban – native task board for DeepSeek Harness

**Body**

DSH Kanban is a Cordis plugin for DeepSeek Harness. It adds a four-column board to the app's native `main` slot and a `sidebar.panellist` entry.

The design goal is the human/agent loop: an agent can create work, record a blocker, or ask a question; the card moves to a derived "Needs you" column; the human answers in the card; the task moves to Done. The board is not a separate web app inside an iframe.

Technical notes:

- Host/Client are separate bundles; the Host exposes `/kanban-api`.
- Projects, tasks, comments, attachments metadata and activity live in DSH `storageDomain`.
- Attachment bytes use the DSH attachment service; downloads stream through the Host.
- Every task write carries a `version`; stale writes return HTTP 409.
- Client registers in `main` and `sidebar.panellist`, uses DSH locale/theme tokens and ships zh/en.
- `pnpm check` runs 121 tests; CI is green.

The main limitation: it is currently a single-user, local-first plugin. Multi-user collaboration is on the roadmap.

Repo: https://github.com/SilasSolivagus/dsh-kanban

## Reddit — r/selfhosted / r/opensource

**Title**

DSH Kanban – a native four-column task board for DeepSeek Harness (MIT)

**Body**

I built a task board for DeepSeek Harness that runs as a native plugin rather than an iframe.

It covers:
- projects + archived/read-only projects
- Backlog / Running / Needs you / Done
- agent questions + human approvals
- blockers and review tasks
- comments, links, attachments, activity
- Host persistence and versioned writes

The "Needs you" column is derived: unresolved question > blocker > review.

It is local-first and single-user today; no cloud sync. MIT licensed.

Repo: https://github.com/SilasSolivagus/dsh-kanban

Happy to answer questions about the plugin architecture or the DSH storage/attachment APIs.

## GitHub Discussion (announcement)

**Title**

DSH Kanban v2.0.0 — the native task board for DeepSeek Harness

**Body**

We shipped v2.0.0.

DSH Kanban is now a native Cordis plugin with:
- a real `main` page and `sidebar.panellist` entry
- four-column board with drag/reorder
- automatic **Needs you** queue for questions, blockers and reviews
- inline approvals
- task drawer with comments, links, attachments and activity
- archive/restore and read-only archived projects
- durable Host `storageDomain` persistence

Install:

```bash
git clone https://github.com/SilasSolivagus/dsh-kanban.git
cd dsh-kanban
pnpm install && pnpm check
```

Then install the local bundle from DSH settings and refresh.

![demo](assets/kanban-demo.gif)

Feedback, bug reports and PRs are welcome. What should land next: saved filter views, command palette, import/export, or realtime collaboration?

## Launch checklist

- [x] Make the repository public
- [x] MIT license
- [x] README with real screenshots and GIF
- [x] CI badge green
- [x] v2.0.0 release
- [ ] Upload `docs/assets/social-preview.png` in GitHub → Settings → Social preview
- [ ] Pin the repository on the profile
- [ ] Post the X thread
- [ ] Post the Chinese version
- [ ] Submit Show HN
- [ ] Post to one relevant subreddit (check self-promo rules first)
- [ ] Reply to comments for the first 24 hours

## Notes

- Don't claim a hosted demo; this is a local-first plugin.
- Don't claim multi-user support; it is single-user today.
- The GIF and screenshots come from a real DSH session, not a mock.
- The board screenshot was taken with sample data; the data was removed afterward.
