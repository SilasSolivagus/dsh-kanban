# P1.0 — DSH persistent session spike

**Date:** 2026-10-23  
**Result:** PASS for continuable child + memory + interrupt.  
**Not yet proven:** plugin-level `ctx.subagents` / `ctx.agentTeams` access, process-restart resume.

## What was tested

### 1. Continuable child

Created a child agent with the model-facing subagent tool:

```text
child id: 41e63c03-2604-458d-ba48-3e11dd6b3262
```

Turn 1 prompt: remember `SPIKE-7F3A`, reply `PONG`.

Result:

```text
PONG
```

### 2. Same session, second prompt

The same child id was messaged again:

```text
What nonce did I give you?
```

Result:

```text
SPIKE-7F3A
```

Conclusion: the child is continuable; the second prompt resumed the same session and context, not a fresh one.

### 3. Interrupt

Created a second child:

```text
child id: bc008a42-73a9-455d-baa6-30a4bf0fb808
```

Prompt: run `sleep 60`, then reply `DONE`.

After ~3 seconds, `interrupt_agent` was called.

Result: child stopped before `DONE`; final message was only "I'll run the sleep command as instructed."

Conclusion: a long-running child can be interrupted.

### 4. Catalog

`list_agents` shows both children with stable ids and inactive status after completion. The child id is a durable handle suitable for a supervisor state file.

## What this proves

- DSH supports continuable child sessions.
- A child can be prompted again after going idle.
- Context/memory persists across turns for the same child id.
- A running child can be interrupted.
- A supervisor can persist a child session id and reuse it.

## What this does not prove

- A **Cordis plugin** can get a live parent `Agent` and call `ctx.subagents` / `ctx.agentTeams`.
- Child session survives a full DSH process restart (cold resume from persistence).
- Tool permissions / workspace isolation per child.
- Token/ACL injection per child.
- Cost/lease behavior.

## Implication for P1

P1.0 is a **conditional pass**.

- The session primitive exists and behaves correctly.
- The next spike must prove the **plugin-facing API**, not just the model-facing subagent tool.

If the plugin cannot get a live parent Agent, fallback options:

1. Supervisor runs as a DSH skill/tool invoked by 掌柜, not as a background host plugin.
2. Supervisor uses one-shot subagents (P1-lite), loses persistent memory.
3. Supervisor creates a hidden root agent and owns children through `agentLoop` (needs API proof).

## Next

P1.0b: plugin-level spike

- a tiny Cordis plugin
- `ctx.get('subagents')` / `ctx.get('agentTeams')`
- create or resume a child
- prompt it
- read result
- interrupt
- persist child id

Do not build the full supervisor until P1.0b passes.
