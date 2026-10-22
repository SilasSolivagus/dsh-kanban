# M1 live acceptance

## 前置条件

- [ ] M1 分支代码已构建，并且当前 DSH 实例加载的是 M1 的 Kanban 插件
- [ ] 插件重启后读到了 `~/.dsh/kanban-agents.json`
- [ ] 配置文件权限是 `600`
- [ ] 配置里有 `role: "office"` 和 `role: "builder"` 两个 agent

如果 GUI 还加载 main 分支，M1 的 actor auth 不存在，下面的脚本会失败。

## 当前实例配置

文件：`~/.dsh/kanban-agents.json`

```text
office    掌柜     projects: ["*"]
builder   扳子     projects: ["dsh-kanban"]
researcher 眼镜    projects: ["dsh-kanban"]
```

token 只在这个文件里，不提交。  
`actors.js` 不会把 token 返回给前端或任务卡。

## 自动验收

```bash
cd /Users/silas/Documents/deepseek-harness/default-workspace/dsh-kanban/.worktrees/m1-office-chief

DSH_KANBAN_URL=http://127.0.0.1:61849/kanban-api \
node scripts/m1-live-acceptance.mjs
```

脚本会：

1. 读取配置
2. 找项目 `dsh-kanban`；没有就创建一个
3. 掌柜建卡，assignee=扳子
4. 扳子更新 `in_progress` 并评论
5. 验证 activity 是掌柜 / 扳子
6. 验证负向：
   - 扳子建卡 → 403
   - 扳子改掌柜的卡 → 403
   - 扳子改 assignee → 403

最后输出 `PASS`。

## 手工 UI 验收

打开看板：

- [ ] 卡在项目 `DSH Kanban` 里
- [ ] assignee 显示 **扳子**
- [ ] 评论作者是 **扳子**
- [ ] 活动记录出现 **掌柜** 和 **扳子**
- [ ] 扳子看不到别的项目

## 如果失败

### 401 Invalid agent token

- 插件没读到配置
- 或 token 复制错了
- 重启插件后再试

### 201 但 activity 是“本地用户”

- 当前 GUI 还在跑 main 分支，不是 M1
- 换到 M1 构建后重启

### 403 on create

- `office` 没有 `board:create`
- 或配置里的 `role` 不是 `office`

### 项目不是 `dsh-kanban`

用环境变量覆盖：

```bash
DSH_KANBAN_PROJECT=<project-id> node scripts/m1-live-acceptance.mjs
```

## 清理

验收会留下两张卡：

- `M1 live acceptance ...`
- `M1 office-only card`

从 UI 归档即可。
