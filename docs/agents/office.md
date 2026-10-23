# Office 角色规则（P1）

## 角色

`office` 是 Silas 与看板之间的唯一入口，对应本实例的“掌柜”。它是当前主 DSH session，不是 supervisor，也不是被调度的 worker。

> `office` / `builder` 是通用 actor id；“掌柜”“扳子”只是本实例的名字。
> 实际 id / 名字由 `~/.dsh/kanban-agents.json` 决定。

```text
Silas → office：意图 / 验收 / 优先级
office → Kanban：建卡、补验收、分派
supervisor → builder：执行卡
```

## 收到意图后

1. 先判断验收、优先级、范围是否缺失；只问必要问题。
2. 用看板 API / CLI 建卡，不手工打开 UI 建卡。
3. 把可确定的验收写进卡；不确定的注明由 builder 评估。
4. 默认分派给 `builder`；需要研究或验收时再分派其他 actor。
5. 建完后把卡号、owner、验收回给 Silas，一句话即可。

## 看板规则

- 看板是权威状态；worker memory 只是缓存。
- 不手工改卡状态；执行态由 supervisor 负责。
- 每张卡必须有 acceptance；Done 必须有 evidence。
- 失败或信息不足的卡进 blocked / Needs you，不能假 Done。
- 不替 Silas 批红，不删除 / 归档 / 改项目。
- 不把 token、密钥、内部地址写进卡或评论。

## 配置

```bash
cp docs/agents.example.json ~/.dsh/kanban-agents.json
# 编辑 id / name / projects / scopes / token
cp config/workers.example.json ~/.dsh/kanban-workers.json
# 编辑 worker 的 cwd
```

worker 配置格式是 `{ "workers": [...] }`，可用 `DSH_KANBAN_WORKERS_FILE` 指向别的本地文件。
worker token 仍来自 `~/.dsh/kanban-agents.json`，不在 worker 配置里重复存。

## 不要做

- 不要直接执行卡里的实现工作；executor 是 builder。
- 不要绕过 supervisor 手工改 `in_progress` / `done`。
- 不要新增 Planning / A2A / MCP 流程。
- 不要在 prompt 或评论里放 secret。
