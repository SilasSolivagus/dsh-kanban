# Idea: chat-driven kanban creation and configuration

- **Status:** parked / waiting for real usage feedback
- **Recorded:** 2026-10-22
- **Decision:** discuss again after the board has been used for a while; do not build now
- **Scope:** future interaction layer, not part of v2.0.0

## Context

DSH Kanban is currently a visual board. Projects are created from the project switcher, tasks from a column footer, and configuration happens in dialogs. The DSH conversation is already the place where agents and humans coordinate, so a natural question is whether board creation and configuration should also start from chat.

Example:

> “Create a board for the marketing site. Ask me what you need to know first.”

The agent could use `ask_user_question` to lock down a few choices, then create the project and optionally seed tasks through native tools.

## Direction

Chat is the **authoring / command layer**; the board is the **state layer**.

- **Chat is good at:** intent, trade-offs, choosing a template, bulk creation, summarizing “what needs me”.
- **Board is good at:** scanning columns, dragging cards, ordering work, approving one card at a time.
- **Do not add a second full chat panel inside the board.** It duplicates the DSH conversation and creates two places to talk to the same agent.
- A small “ask agent” affordance that focuses the DSH chat with a prefilled prompt is acceptable later; a full embedded chat surface is not.

## askuser is for decisions, not forms

`ask_user_question` is a bounded-choice tool, not a form builder.

Use it for:

- Which template? Four-column default / agent queue / custom.
- Default view: all projects / current project.
- New-task defaults: Backlog / Running / other.
- Agent policy: may create tasks? require confirmation? may move cards?
- Bulk import: create directly / preview first.

Do **not** use it for:

- project name
- workspace path
- task title or description

Those are free text. Use a form (preferred) or ordinary chat text.

## Proposed v1, if and when we build it

1. **Native Host tools** for the agent:
   - `kanban_create_project`
   - `kanban_create_task`
   - `kanban_query_board`
   - `kanban_update_task` (later; transitions and bulk updates need stronger confirmation)
2. **A thin kanban skill** that tells the agent when to use a tool, when to ask a question, and when to preview before writing.
3. **`project.config`** persisted on the project:

```json
{
  "version": 1,
  "defaultView": "all",
  "defaultTask": {
    "status": "backlog",
    "priority": "none",
    "labels": []
  },
  "agentPolicy": {
    "canCreateTasks": true,
    "requireConfirmation": true
  },
  "workflowPreset": "four-column"
}
```

4. On later project creation, offer to reuse the last template instead of asking every question again.
5. For bulk writes, show a preview (project, task count, first few titles) and require confirmation.

## Non-goals for v1

- Custom columns
- Custom status mapping
- WIP limits
- Replacing drag/drop with chat
- An embedded chat panel in the board
- Autonomous agents approving their own tasks or permanently deleting cards

Custom workflow is a separate, larger design: it changes `statuses.js`, `rules.js`, the domain schema and the four-column rendering.

## Safety and permissions

- Every write still carries `version`; stale writes return `TASK_VERSION_CONFLICT`.
- Destructive operations (archive project, permanent delete, bulk move) require explicit confirmation.
- `agentPolicy` should be stored per project, not inferred from a single chat message.
- Do not let an agent approve a question it created; approvals remain human decisions.
- The Host tools should return identifiers and links so the chat can refer to “DSH-3” unambiguously.

## Open questions

- Is `project.config` enough, or do we need reusable **templates** shared across projects?
- Should agent-created tasks land in Backlog by default, even if the template says otherwise, so a human can review them first?
- Which destructive actions are allowed with one confirmation vs two?
- Do we need an “agent inbox” for tasks created by an agent but not yet acknowledged?
- Is a “preview” rendered as a chat table, a temporary board, or a separate confirmation card?

## Revisit triggers

Consider this again when any of these is true:

- creating a project/task through the UI feels repetitive during real use
- multiple boards share the same setup
- an agent is already being asked to create tasks through chat and fumbles the API
- the board has been used for a few weeks with real projects

Until then, this stays parked. v2.0.0 remains a visual board with a stable HTTP API for automation.
