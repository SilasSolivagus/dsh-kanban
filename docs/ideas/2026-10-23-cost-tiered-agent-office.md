# Idea: cost-tiered agent office — expensive boss, cheap workers

- **Status:** parked / P1.3 candidate
- **Recorded:** 2026-10-23
- **Decision:** do not build now. Revisit after P1.2 (Office entry + reviewer handoff + 7-day use).
- **Scope:** routing, review gate, task-card contract, worker visibility

## Context

The product already separates:

```text
Board = state
Supervisor = dispatch / lease
Worker = execution
```

This idea adds a fourth separation:

```text
expensive model = planning, delegation, review, escalation
cheap model     = execution: read, edit, run, report
```

The claim is not "cheap models are as good". The claim is:

> Most tokens are spent on reading files, editing, and running commands.
> Pay the expensive model to think and judge, not to move bricks.

The card is the unit of delegation. Do not forward a whole chat transcript.

## Task-card contract

A worker card must carry four things:

| Field | Meaning |
| --- | --- |
| **Goal** | What must change |
| **Material** | Only the files/background needed |
| **Acceptance** | How we know it is done; which test/command |
| **Boundary** | What must not be touched |

A card is splittable only if it can be completed and accepted on its own.
Small tasks and context-heavy tasks stay with the expensive model.

## Four patterns

1. **Split and parallelize** — big model decomposes; several cheap workers execute.
2. **Cheap first, upgrade on failure** — cheap attempt; if it fails review, retry with a stronger model.
3. **Cheap draft, expensive review** — cheap produces; expensive model checks tests and correctness.
4. **Unified review** — no matter who executed, one review gate decides Done.

These can be layered.

## Proposed flow

```text
Silas → Office (expensive model)
  → clarify goal / acceptance / boundary
  → write card
  → supervisor chooses worker model by task risk
  → cheap worker executes
  → reviewer (expensive model) checks evidence
      pass → Done
      fail → rework with comments
      2–3 failures → escalate to expensive worker
```

Review must be evidence-based:

- test/command output
- file path
- diff or preview
- no "应该可以"

## Operational pitfalls

### 1. Idle workers burn tokens

Do not run a model just to ask "any work?".
Wake only on a card/lease/event. A cheap poll is fine; a model loop is not.

### 2. Timeout is not failure

A timeout means "unknown state", not "worker failed".
Check the card, process state, and evidence before reassigning.
Blind retry creates duplicate work.

### 3. Do not split everything

Overhead and context loss can cost more than the saved tokens.
Small or context-heavy tasks should be done by the expensive model directly.

## What the board must show

Inspired by the "pixel cat office" image: who is working, who is idle, who is offline.

Minimum visible state:

- worker name / model tier
- working / idle / offline
- current card
- last heartbeat
- review state: pending / passed / rework
- cost/token estimate per card

Without this, routing is invisible and cannot be trusted.

## Prerequisites

Do not start with model routing alone.

1. **Office entry** — a pinned `掌柜 · Office` session and a `找掌柜` action on the board.
2. **Reviewer role** — 门神 / reviewer worker with a real review gate.
3. **Structured evidence** — not only a supervisor comment.
4. **Per-worker model config** — `provider` / `model` / `reasoning` in worker config.
5. **Cost telemetry** — tokens and elapsed time per card/attempt.
6. **7-day baseline** — know where tokens actually go before optimizing.

## Timing

### Not now

P1 has one builder, no reviewer, and no Office entry. Adding cheap workers now would only produce cheaper mistakes with no gate.

### P1.2 first

- Office entry
- reviewer / handoff
- 7-day real use
- structured evidence

### P1.3: cost-tiered office

After P1.2, run a 1–2 week spike:

- top model as office + reviewer
- cheap model as builder
- compare against baseline
- measure cost per verified Done, rework rate, escalation rate

If the economics do not improve, stop.

### Before P2

Prove the economics inside DSH first. P2 (second runtime) should reuse the routing policy, not invent it.

## Success metrics

- cost per **verified** Done (not per attempt)
- rework rate
- escalation rate
- human minutes per card
- percentage of cards with valid evidence

## Open questions

- Can the cheap worker use the same tools/preset?
- How is model tier chosen: static worker config, card risk, or supervisor policy?
- Who pays for review latency?
- What is the hard budget cap per card/day?
- Can the expensive reviewer reject without rewriting the work itself?
- How do we prevent the cheap worker from "passing" its own review?

## Revisit triggers

- P1.2 reviewer exists and has processed real cards
- 7-day usage shows token concentration in execution, not planning
- a card routinely needs rework that a stronger model would have avoided
- worker visibility exists (working/idle/offline)

Until then, this stays parked.
