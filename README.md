# DSH 看板

DeepSeek Harness 的原生任务看板插件。它不是 iframe，也不是独立网页，而是直接注册到 DSH 的 `main` 页面和侧边栏的原生 Cordis 插件。

- 四列看板：**Backlog / Running / Needs you / Done**
- 项目、任务、审批、评论、附件、活动记录
- 项目归档只读、任务归档恢复
- Host 端持久化，刷新、重启后数据仍在
- 中英文界面，跟随 DSH 主题

当前版本：`2.0.0`  
验证环境：DSH `0.2.1-rc.2`、Node `22`、pnpm `10`

界面结构：

```text
┌──────────────────────────────────────────────────────────────┐
│  DSH 看板   [项目 ▾]   [搜索任务…]  [筛选]   2 个运行中  [刷新] │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ Backlog   3  │ Running   2  │ Needs you 1  │ Done        5   │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌─────────────┐ │
│ │ 任务卡片  │ │ │ 任务卡片  │ │ │ 待回答…   │ │ │ 已完成任务   │ │
│ │ 标签/优先级│ │ │ 计时器    │ │ │ 选项/按钮 │ │ │ 完成时间     │ │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └─────────────┘ │
│ + 新建卡片   │ + 新建卡片    │ + 新建卡片   │ + 新建卡片      │
└──────────────┴──────────────┴──────────────┴─────────────────┘
```

> 仓库暂未内嵌真实运行截图；上方是结构示意。运行后的实际界面请在 DSH 窗口中查看/截取。

## 功能

| 模块 | 能力 |
| --- | --- |
| 项目 | 新建、重命名、归档、恢复；只有空项目可以永久删除 |
| 任务 | 新建、编辑、拖拽换列/排序、归档、恢复、永久删除 |
| 看板 | 四列分组、列折叠、搜索、项目/优先级/标签/负责人筛选 |
| Needs you | 自动汇聚未回答问题、阻塞、待审核任务，优先级：问题 > 阻塞 > 审核 |
| 审批 | 卡片内直接选择选项、备注、Approve / Reject；也支持抽屉内操作 |
| 任务详情 | 状态、优先级、标签、描述、阻塞、链接、问题、评论、附件、活动 |
| 协作 | 评论、附件上传/下载/删除、链接、活动流 |
| 归档 | 归档任务列表按项目分组、搜索、恢复、永久删除；归档项目只读 |
| 体验 | 中英文切换、浅色/深色主题、键盘焦点管理、Escape 关闭、减少动画 |

## 安装

### 前置条件

- 已安装 DeepSeek Harness（桌面版或带 Web UI 的 Host）
- Node.js 22+
- pnpm 10+

### 从源码安装

```bash
git clone https://github.com/SilasSolivagus/dsh-kanban.git
cd dsh-kanban
pnpm install
pnpm check
```

`pnpm check` 会先构建 `index.js` / `client.js`，再运行测试。构建产物已提交在仓库里，所以普通安装不需要自己构建；修改源码后才需要重新 `pnpm build`。

然后在 DSH 的插件管理页面安装本地 bundle：

1. 打开 **设置 → 插件**（Plugins）。
2. 选择安装本地目录 / Install local bundle。
3. 选择克隆下来的 `dsh-kanban` 目录（包含 `package.json` 的那一层）。
4. 启用 `@local/dsh-kanban`。
5. 刷新 DSH 页面。

安装后，插件会以 `link:` 形式挂到当前 profile，例如：

```json
{
  "dependencies": {
    "@local/dsh-kanban": "link:/path/to/dsh-kanban"
  }
}
```

刷新后，侧边栏会出现「看板 / Kanban」入口；点击即可打开四列看板。

### 升级

```bash
cd dsh-kanban
git pull
pnpm install
pnpm check
```

然后在 DSH 插件页禁用再启用一次 `@local/dsh-kanban`，或重启 DSH，最后刷新页面。

> 如果升级后仍看到旧界面，先强制刷新页面；再不行就在插件页禁用/启用一次，让 Host 和 Client 重新加载 bundle。

## 快速使用

1. 打开侧边栏「看板」。
2. 顶部项目菜单 → **创建项目**，填项目名称（可选填工作区路径）。
3. 在 **Backlog** 列点 **+ 新建卡片** 创建第一个任务。
4. 把卡片拖到 **Running**；需要输入/确认时，任务会自动出现在 **Needs you**。
5. 在卡片或任务抽屉里处理问题、阻塞或审核，再拖到 **Done**。
6. 点卡片标题打开任务详情，继续添加评论、附件、链接或查看活动。

完整操作说明见 **[docs/usage.md](docs/usage.md)**。

## 看板规则

### 四列与内部状态

| 列 | 包含的状态 | 说明 |
| --- | --- | --- |
| Backlog | `backlog`、`todo` | 待立项 / 等待认领 |
| Running | `in_progress` | 正在处理 |
| Needs you | 派生列 | 有问题、阻塞或待审核的任务 |
| Done | `done` | 已完成 |

`canceled` 是 Host 支持的存储状态，但当前四列界面不展示，也不会出现在 UI 的状态选择器里，避免任务“消失”。

### 拖拽限制

- 不能直接拖入 **Needs you**：这一列由系统自动生成。
- 处于 Needs you 的任务不能拖出，除非先处理掉问题/阻塞/审核。
- 处于 Needs you 的任务不能直接拖入 Done。
- Backlog 内部拖动会保留 `backlog` / `todo` 的原状态。
- 拖拽排序使用 `sortOrder`；并列值会自动重排，失败会重新加载并提示。

### Needs you 的优先级

1. **未回答问题**（`question`）
2. **阻塞**（`blocked`）
3. **待审核**（`review`）

同一任务同时满足多个条件时，按上面的顺序展示。

### 审批

- 有未回答问题：选择选项 → 填写可选备注 → **Approve** 或 **Reject**。
- Approve → `done`；Reject → `backlog`。
- 无问题、仅处于 `in_review`：显示 **Confirm / Return**。
- 任务有阻塞时不能 Approve；先清除阻塞。
- 所有写操作携带 `version`；版本冲突会重新加载详情并提示。

## 数据与限制

- 项目、任务、评论、附件元数据、活动记录都存在 DSH `storageDomain` 中。
- 附件字节通过 DSH `ctx.attachments` 存储，下载走 `/kanban-api/attachments/:id`。
- 不使用 localStorage 保存业务数据；只有列折叠状态会用 localStorage 记住。
- 不使用 iframe、SQLite 或外部服务。

| 限制 | 值 |
| --- | --- |
| 项目名称 | 1–120 字符 |
| 任务标题 | 1–240 字符 |
| 任务描述 | ≤100,000 字符 |
| 评论 | 1–10,000 字符 |
| 标签 | 每任务 ≤20 个，每个 ≤64 字符 |
| 链接 | 每任务 ≤50 个，必须是 http(s) |
| 附件 | 单文件 ≤20 MiB，每任务 ≤50 个 |
| 问题选项 | 2–5 个 |

这是单用户、本地优先的看板：没有实时多人协作，也没有云端同步；数据跟随当前 DSH profile。

## 开发

### 常用命令

```bash
pnpm build      # 构建 Host index.js 和 Client client.js
pnpm test       # node --test
pnpm check      # build + test
```

### 目录结构

```text
src/
  host/
    entry.js      # DSH Host 入口：打开 domain、注册 /kanban-api
    domain.js     # storageDomain 表声明（纯对象，无运行时 DSH 依赖）
    schema.js     # zod 记录 schema
    store.js      # 项目/任务/评论/附件/活动的领域逻辑
    http.js       # /kanban-api 路由与附件下载
    __tests__/    # Host 测试
  client/
    index.jsx     # slot/locale 注册
    api.js        # Browser API 封装
    board-state.js
    drawer-state.js
    components/   # App / Board / Column / TaskCard / TaskDrawer / dialogs
    styles.css
  shared/         # 状态、列、attention 规则
scripts/build.mjs # esbuild：Host ESM + Client ModuleLoader 包装
locale/           # zh/en 插件元数据
```

### 构建产物

- `index.js`：Host bundle；只把 `@deepseek-ai/*` 当运行时外部依赖，当前版本已不直接 import DSH 包。
- `client.js`：Client bundle；由 `window.__ModuleLoader__.load({ id, factory })` 包装，React 为外部依赖。
- 两个文件都提交在仓库中；发布/安装前请确保它们与源码一致（`pnpm check`）。

### API

完整接口示例见 [docs/usage.md](docs/usage.md#12-api-速查)。最常用的：

```bash
curl http://127.0.0.1:51970/kanban-api/bootstrap
```

返回：

```json
{ "projects": [], "tasks": [] }
```

## 故障排查

### 侧边栏没有「看板」

1. 确认插件已启用：设置 → 插件 → `@local/dsh-kanban`。
2. 刷新页面。
3. 如果刚升级过，禁用再启用插件，或重启 DSH。

### 看板显示“无法加载”

```bash
curl -i http://127.0.0.1:51970/kanban-api/bootstrap
```

- `200`：Host 正常，刷新页面即可。
- `404`：插件没有注册路由，检查插件是否 active。
- `500`：查看 DSH 日志；通常是 Host 启动异常。

### 端口不是 51970

以当前 DSH 窗口地址为准；`51970` 只是本次运行示例。

### 数据会丢吗

不会。业务数据在 DSH storageDomain 中，按 profile 保存。卸载插件不会自动删除 domain；重装后仍会读回。

## 版本

`2.0.0` — 原生 DSH 版本，替代早期基于 localStorage 的原型。
