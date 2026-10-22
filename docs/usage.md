# DSH 看板使用说明

本文是 [README](../README.md) 的详细操作手册，覆盖项目、任务、看板规则、审批、抽屉、附件、归档和 API。

## 目录

- [1. 打开看板](#1-打开看板)
- [2. 项目](#2-项目)
- [3. 新建任务](#3-新建任务)
- [4. 四列与拖拽](#4-四列与拖拽)
- [5. Needs you 与审批](#5-needs-you-与审批)
- [6. 任务详情抽屉](#6-任务详情抽屉)
- [7. 评论、附件、链接、活动](#7-评论附件链接活动)
- [8. 搜索与筛选](#8-搜索与筛选)
- [9. 归档与只读](#9-归档与只读)
- [10. 主题与语言](#10-主题与语言)
- [11. 数据、限制与并发](#11-数据限制与并发)
- [12. API 速查](#12-api-速查)
- [13. 常见问题](#13-常见问题)

## 1. 打开看板

刷新 DSH 页面后，点击左侧侧边栏的 **看板 / Kanban**。

首次打开且没有任何项目时，会看到空状态；点 **创建项目** 开始。

看板顶部从左到右：

| 区域 | 作用 |
| --- | --- |
| 项目菜单 | 切换项目、所有项目、创建/管理项目、归档项目、归档任务 |
| 搜索框 | 搜索标题、描述、项目名、标签 |
| 筛选 | 按项目、优先级、标签、负责人筛选 |
| 运行中计数 | 当前视图里 `in_progress` 的任务数 |
| 刷新 | 重新从 Host 拉取数据 |

## 2. 项目

### 新建项目

1. 点顶部项目菜单。
2. 点 **创建项目**。
3. 填写 **项目名称**（必填，1–120 字符）。
4. 可选填写 **工作区路径**（≤4096 字符），用于记录这个看板对应的代码目录。
5. 点 **创建**。

创建后会自动切换到新项目。

### 切换项目

- **所有项目**：显示所有未归档项目的任务。
- 单个项目：只显示该项目的任务。
- 项目菜单底部的 **已归档项目**：列出归档项目，点击可进入只读看板；也可以点 **管理项目** 进行恢复/删除。

### 重命名项目

项目菜单 → **管理项目** → 找到项目 → **重命名**。

### 归档项目

项目菜单 → **管理项目** → **归档**。

归档后：

- 项目从活跃项目列表移出，进入 **已归档项目**。
- 项目里的任务不会被删除。
- 打开该项目时看板只读：不能新建、拖拽、编辑、评论或上传附件。
- 顶部显示只读横幅；点 **恢复项目** 后恢复编辑。

### 删除项目

项目菜单 → **管理项目** → **删除**。

限制：**只有空项目能删除**。如果项目里还有任务，会提示任务数量；需要先把任务归档并永久删除。

## 3. 新建任务

每一列底部都有 **+ 新建卡片**。点击后打开新建任务对话框：

| 字段 | 说明 |
| --- | --- |
| 项目 | 必填；在“所有项目”视图下必须选择 |
| 标题 | 必填，1–240 字符 |
| 描述 | 可选，≤100,000 字符 |
| 状态 | 默认由点击的列决定 |
| 优先级 | 无 / 低 / 中 / 高 / 紧急 |
| 标签 | 逗号分隔；每任务 ≤20 个 |
| 负责人 | 当前仅支持当前用户 |

点击的列与默认状态：

| 点击的列 | 默认状态 |
| --- | --- |
| Backlog | `backlog` |
| Running | `in_progress` |
| Needs you | `in_review` |
| Done | `done` |

取消（`canceled`）是 Host 支持的终止状态，但当前界面不提供该选项，避免任务从四列中消失。

## 4. 四列与拖拽

### 列的含义

| 列 | 含义 |
| --- | --- |
| **Backlog** | 待立项（`backlog`）或等待认领（`todo`） |
| **Running** | 正在处理（`in_progress`） |
| **Needs you** | 需要你处理：未回答问题、阻塞、待审核（自动派生） |
| **Done** | 已完成（`done`） |

### 拖拽规则

- **可以**在 Backlog、Running、Done 之间拖动。
- **不能**把卡片直接拖进 Needs you；这一列由系统自动生成。
- 处于 Needs you 的卡片**不能拖出**，除非先处理掉它的问题/阻塞/审核。
- 处于 Needs you 的卡片**不能直接拖进 Done**。
- 在 Backlog 内部拖动时，卡片会保留原来的 `backlog` 或 `todo` 状态，只改变顺序。
- 拖到卡片上表示插入到该卡片之前；拖到列空白处表示追加到末尾。
- 拖拽被拒绝时会显示提示；API 失败或版本冲突会重新加载看板。

### 折叠列

点列头的折叠按钮可以收起该列；状态会保存在浏览器 localStorage 的 `dsh-kanban.collapsed-columns` 中。

## 5. Needs you 与审批

### 自动进入 Needs you

一个任务满足以下任一条件就会出现在 Needs you：

1. 有未回答的问题（`pendingQuestion` 且没有 `questionResolution`）
2. 有阻塞原因（`blockedReason`）
3. 状态是 `in_review` 且没有其他 attention

优先级：**问题 > 阻塞 > 待审核**。

### 回答问题

卡片内会显示：

- 问题标题和上下文备注
- 2–5 个选项（单选）
- 备注输入框
- **Reject** / **Approve**

操作：

1. 选择一个选项。
2. 可填写备注。
3. 点 **Approve** 或 **Reject**。

结果：

| 操作 | 结果 |
| --- | --- |
| Approve | 任务进入 `done` |
| Reject | 任务回到 `backlog` |

如果任务有阻塞，Approve 会被拒绝；先清除阻塞，再 Approve。

### 请求输入

在任务抽屉的 **问题与请求** 区域：

1. 填写问题（必填）。
2. 可选填写备注。
3. 填写 2–5 个选项；可添加/删除选项行。
4. 点 **请求输入**。

任务会进入 Needs you。对已完成的 Done 任务请求输入，会把任务重新打开为 `in_review`，避免 Done 携带未处理的问题。

### 待审核任务

没有 pending question、但状态是 `in_review` 的任务，会显示 **Confirm / Return**：

- **Confirm** → `done`
- **Return** → `backlog`

### 阻塞

在任务抽屉的 **阻塞** 区域：

1. 输入阻塞原因。
2. 点 **设置阻塞**。
3. 任务进入 Needs you，卡片显示阻塞原因。
4. 处理完后点 **清除阻塞**。

## 6. 任务详情抽屉

点击卡片标题、右侧箭头，或评论/附件/链接数字，会打开右侧任务抽屉。

抽屉包含：

### 属性

- **状态**：Backlog 的 5 个可编辑状态（不含 `canceled`）
- **优先级**：无 / 低 / 中 / 高 / 紧急
- **标签**：输入后点添加；已有标签可移除
- **负责人**：当前仅支持当前用户
- **计时**：显示任务在该状态下的停留时间

### 描述

- 默认只读展示。
- 点 **编辑描述** 进入编辑，**保存** 或 **取消**。
- 描述支持多行文本。

### 链接

- 填写链接名称和 http(s) 地址。
- 点 **添加链接**。
- 已有链接可删除。

### 问题与请求

- 没有问题时：显示请求输入表单。
- 有 pending question 时：显示选项、备注、Reject/Approve。
- 处于待审核时：显示 Confirm/Return。

### 评论

- 输入评论并提交。
- 评论按时间显示。
- 可以删除评论。

### 附件

- 点 **上传附件**，选择文件。
- 单文件 ≤20 MiB；每任务 ≤50 个。
- 附件显示文件名、大小；可以下载或删除。
- 下载地址是 `/kanban-api/attachments/:id`。

### 活动

- 按时间倒序显示。
- 记录创建、字段变更、阻塞、问题、审批、附件、归档/恢复等事件（评论不写入活动流）。
- 每个事件显示字段名和变更前后值。

### 任务操作

- **归档任务**：任务从看板移入已归档任务。
- **恢复任务**：仅归档任务可用。
- **永久删除任务**：仅归档任务可用；删除后不可恢复。

## 7. 评论、附件、链接、活动

| 类型 | 位置 | 说明 |
| --- | --- | --- |
| 评论 | 抽屉 → 评论 | 纯文本，1–10,000 字符 |
| 附件 | 抽屉 → 附件 | 通过 DSH attachments 存储字节 |
| 链接 | 抽屉 → 链接 | 只接受 http/https |
| 活动 | 抽屉 → 动态 | Host 自动记录，不可编辑 |

卡片底部显示评论/附件/链接数量；点击数字会打开同一个任务抽屉。

## 8. 搜索与筛选

### 搜索

顶部搜索框会匹配：

- 任务标题
- 任务描述
- 项目名称
- 标签

搜索是当前视图内的过滤，不会修改数据。

### 筛选

点 **筛选** 打开筛选面板：

- **项目**
- **优先级**
- **标签**
- **负责人**

可以组合多个条件；面板会显示当前条件数量。点 **清除筛选** 重置。

如果项目筛选与顶部项目切换冲突，界面会自动切到“所有项目”，避免出现看起来像“数据丢了”的空看板。

### 卡片快捷筛选

- 点卡片上的**项目标签**：按该项目筛选。
- 点卡片上的**优先级标签**：按该优先级筛选。
- 再次点击同一标签可取消。

## 9. 归档与只读

### 归档任务

在任务抽屉底部点 **归档任务**。

归档后：

- 任务从四列看板消失。
- 进入项目菜单 → **已归档任务**。
- 已归档任务弹窗按项目分组，支持搜索。
- 可以 **打开**（只读抽屉）、**恢复**、**永久删除**。

### 恢复任务

在已归档任务弹窗点 **恢复**；任务回到原来的状态/列。

### 永久删除任务

1. 先归档任务。
2. 在已归档任务弹窗点 **删除**。
3. 二次确认后永久删除。

未归档任务不能直接永久删除；Host 会返回 `TASK_NOT_ARCHIVED`。

### 归档项目

归档项目后：

- 项目进入 **已归档项目**。
- 看板只读：不能新建任务、拖拽、编辑、评论、上传附件。
- 顶部显示只读横幅和 **恢复项目** 按钮。
- 归档项目里的任务仍保留；但任务级恢复/删除需要先恢复项目（Host 返回 `PROJECT_ARCHIVED`）。

### 删除项目

只有空项目可以删除。需要先处理完项目里的所有任务。

## 10. 主题与语言

- 界面颜色使用 DSH 主题 token，跟随 DSH 的浅色/深色主题切换。
- 插件提供中文和英文文案；语言跟随 DSH 当前 locale。
- 日期/时间目前使用浏览器本地格式，不强制跟随界面语言。

## 11. 数据、限制与并发

### 数据存哪里

- 项目、任务、评论、附件元数据、活动：DSH `storageDomain`，domain 名 `dsh_kanban`。
- 附件字节：DSH `ctx.attachments`。
- 列折叠：浏览器 localStorage（仅 UI 偏好）。

不使用 iframe、SQLite 或外部服务；刷新/重启后数据仍在。

### 限制

| 项目 | 限制 |
| --- | --- |
| 项目名称 | 1–120 字符 |
| 工作区路径 | ≤4096 字符 |
| 任务标题 | 1–240 字符 |
| 任务描述 | ≤100,000 字符 |
| 评论 | 1–10,000 字符 |
| 标签 | 每任务 ≤20 个，每个 ≤64 字符 |
| 链接 | 每任务 ≤50 个 |
| 附件 | 单文件 ≤20 MiB，每任务 ≤50 个 |
| 问题选项 | 2–5 个 |

项目 id 会自动截断到 64 字符；任务前缀会补齐/限制在 2–6 个大写字母或数字，保证 storageDomain 重启时能通过 schema 校验。

### 并发

所有修改都带 `version`。如果另一个操作先修改了同一任务：

- Host 返回 `TASK_VERSION_CONFLICT`（HTTP 409）。
- 界面提示“任务已被其他操作更新，已重新加载”，并刷新详情/看板。

## 12. API 速查

看板使用同源 `/kanban-api`，返回 JSON 信封：

```json
{ "error": { "code": "TASK_VERSION_CONFLICT", "message": "Task changed elsewhere", "details": {} } }
```

所有响应带 `Cache-Control: no-store`。

### 读取

```bash
# 所有未归档项目和任务
curl http://127.0.0.1:51970/kanban-api/bootstrap

# 任务详情（含 comments/attachments/activity）
curl http://127.0.0.1:51970/kanban-api/tasks/<taskId>

# 归档任务（可按项目过滤）
curl 'http://127.0.0.1:51970/kanban-api/archived-tasks?projectId=<projectId>'

# 下载附件
curl -OJ http://127.0.0.1:51970/kanban-api/attachments/<attachmentId>
```

> 端口以当前 DSH 窗口为准，`51970` 只是示例。

### 项目

```bash
# 创建
curl -X POST http://127.0.0.1:51970/kanban-api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"我的项目","workspacePath":"/path/to/workspace"}'

# 重命名
curl -X PATCH http://127.0.0.1:51970/kanban-api/projects/<projectId> \
  -H 'content-type: application/json' \
  -d '{"name":"新名称"}'

# 归档 / 恢复
curl -X POST http://127.0.0.1:51970/kanban-api/projects/<projectId>/archive
curl -X POST http://127.0.0.1:51970/kanban-api/projects/<projectId>/restore

# 删除（仅空项目）
curl -X DELETE http://127.0.0.1:51970/kanban-api/projects/<projectId>
```

### 任务

```bash
# 创建
curl -X POST http://127.0.0.1:51970/kanban-api/tasks \
  -H 'content-type: application/json' \
  -d '{"projectId":"<projectId>","title":"任务标题","status":"backlog","priority":"medium"}'

# 修改（必须带当前 version）
curl -X PATCH http://127.0.0.1:51970/kanban-api/tasks/<taskId> \
  -H 'content-type: application/json' \
  -d '{"version":1,"status":"in_progress"}'

# 归档 / 恢复
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/archive \
  -H 'content-type: application/json' -d '{"version":2}'
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/restore \
  -H 'content-type: application/json' -d '{"version":3}'

# 永久删除（仅归档任务）
curl -X DELETE http://127.0.0.1:51970/kanban-api/tasks/<taskId> \
  -H 'content-type: application/json' -d '{"version":4}'
```

### 问题与审批

```bash
# 提问
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/question \
  -H 'content-type: application/json' \
  -d '{"version":1,"prompt":"选哪个方案？","note":"","options":[{"id":"a","label":"方案 A"},{"id":"b","label":"方案 B"}]}'

# 批准 / 拒绝
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/answer \
  -H 'content-type: application/json' \
  -d '{"version":2,"decision":"approve","selected":"a","note":"可以"}'
```

### 评论与附件

```bash
# 评论
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/comments \
  -H 'content-type: application/json' -d '{"body":"看起来不错"}'

# 附件（base64；单文件 ≤20 MiB）
curl -X POST http://127.0.0.1:51970/kanban-api/tasks/<taskId>/attachments \
  -H 'content-type: application/json' \
  -d '{"filename":"note.txt","contentType":"text/plain","data":"aGVsbG8="}'

# 删除评论 / 附件
curl -X DELETE http://127.0.0.1:51970/kanban-api/tasks/<taskId>/comments/<commentId>
curl -X DELETE http://127.0.0.1:51970/kanban-api/tasks/<taskId>/attachments/<attachmentId>
```

错误码：

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `INVALID_FIELD` | 400 | 字段校验失败（`details.field`） |
| `INVALID_PATH` | 400 | URL 编码非法 |
| `PROJECT_ARCHIVED` | 403 | 项目已归档 |
| `TASK_NOT_FOUND` / `PROJECT_NOT_FOUND` / `NOT_FOUND` | 404 | 找不到记录 |
| `TASK_VERSION_CONFLICT` | 409 | 版本冲突，重新读取后重试 |
| `TASK_NEEDS_ATTENTION` | 409 | 任务有待处理事项，不能 Done |
| `QUESTION_ALREADY_PENDING` | 409 | 已有待回答问题 |
| `TASK_NOT_IN_REVIEW` | 409 | 任务不在审核中 |
| `TASK_ARCHIVED` / `TASK_NOT_ARCHIVED` | 409 | 归档状态不符合操作要求 |
| `PROJECT_NOT_EMPTY` | 409 | 项目非空，不能删除 |
| `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_LIMIT_REACHED` | 413 | 附件过大 / 数量超限 |
| `INTERNAL_ERROR` | 500 | Host 内部错误 |

## 13. 常见问题

### 刷新后看板是空的

先确认当前是“所有项目”还是某个空项目；再检查 `curl /kanban-api/bootstrap` 是否返回数据。

### 拖不动

- 目标列是 Needs you？不允许。
- 卡片在 Needs you？先回答问题/清除阻塞/处理审核。
- 目标列是 Done 且卡片仍有 attention？先处理。
- 项目是否已归档？归档项目只读。

### Approve 失败

任务可能有阻塞；先在抽屉里清除阻塞。错误码 `TASK_NEEDS_ATTENTION` 表示还有待处理事项。

### 附件上传失败

- 单文件是否超过 20 MiB？
- 任务附件是否已达 50 个？
- 文件名是否包含控制字符？
- Host 是否返回 `ATTACHMENT_TOO_LARGE` / `ATTACHMENT_LIMIT_REACHED`？

### 永久删除按钮不可用

任务必须先归档。先去任务抽屉点 **归档任务**，再到 **已归档任务** 里删除。

### 项目删不掉

项目必须为空。先归档并永久删除项目里的所有任务。

### 升级后仍显示旧界面

1. 强制刷新页面。
2. 在插件页禁用再启用 `@local/dsh-kanban`。
3. 仍不行则重启 DSH。

### 数据会因卸载插件丢失吗

不会自动删除。业务数据在 profile 的 `storageDomain` 中；卸载后重装仍会读回。若确实要清空，需要手动清理对应 domain 的存储。
