window.__ModuleLoader__.load({
  id: "@local/dsh-kanban",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react11 = __toESM(require("react"), 1);

// src/client/components/App.js
var import_react10 = __toESM(require("react"), 1);

// src/shared/rules.js
function attentionReason(task) {
  if (task.archivedAt) return null;
  if (task.pendingQuestion && !task.questionResolution) return "question";
  if (task.blockedReason) return "blocked";
  if (task.status === "in_review") return "review";
  return null;
}
function columnForTask(task) {
  const attention = attentionReason(task);
  if (attention) return "needs";
  if (task.status === "backlog" || task.status === "todo") return "backlog";
  if (task.status === "in_progress") return "running";
  if (task.status === "done") return "done";
  return null;
}
function elapsedStart(task) {
  const attention = attentionReason(task);
  if (attention === "question") return task.pendingQuestion.createdAt;
  if (attention === "blocked") return task.blockedSince || task.statusSince;
  return task.statusSince;
}
function canDrop(task, columnId) {
  if (columnId === "needs") return { ok: false, reason: "Needs you is automatic" };
  if (attentionReason(task) && columnForTask(task) === "needs") {
    return { ok: false, reason: "Resolve attention before moving" };
  }
  if (columnId === "done" && attentionReason(task)) {
    return { ok: false, reason: "Resolve attention before Done" };
  }
  return { ok: true };
}

// src/shared/statuses.js
var STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled"
];
var PRIORITIES = ["none", "low", "medium", "high", "urgent"];
var COLUMN_IDS = ["backlog", "running", "needs", "done"];

// src/client/api.js
async function request(path, options = {}) {
  const response = await fetch(`/kanban-api${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers ?? {} }
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? response.statusText);
    error.code = body?.error?.code;
    error.details = body?.error?.details;
    throw error;
  }
  return body;
}
var api = {
  bootstrap: () => request("/bootstrap"),
  createProject: (body) => request("/projects", { method: "POST", body: JSON.stringify(body) }),
  renameProject: (id, body) => request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveProject: (id) => request(`/projects/${id}/archive`, { method: "POST", body: "{}" }),
  restoreProject: (id) => request(`/projects/${id}/restore`, { method: "POST", body: "{}" }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  createTask: (body) => request("/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  taskDetail: (id) => request(`/tasks/${id}`),
  archiveTask: (id, body) => request(`/tasks/${id}/archive`, { method: "POST", body: JSON.stringify(body) }),
  restoreTask: (id, body) => request(`/tasks/${id}/restore`, { method: "POST", body: JSON.stringify(body) }),
  deleteTask: (id, body) => request(`/tasks/${id}`, { method: "DELETE", body: JSON.stringify(body) }),
  askQuestion: (id, body) => request(`/tasks/${id}/question`, { method: "POST", body: JSON.stringify(body) }),
  answerQuestion: (id, body) => request(`/tasks/${id}/answer`, { method: "POST", body: JSON.stringify(body) }),
  addComment: (id, body) => request(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify(body) }),
  deleteComment: (taskId, commentId) => request(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
  addAttachment: (id, body) => request(`/tasks/${id}/attachments`, { method: "POST", body: JSON.stringify(body) }),
  deleteAttachment: (taskId, attachmentId) => request(`/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" }),
  archivedTasks: (projectId) => request(`/archived-tasks${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`)
};

// src/client/board-state.js
var DEFAULT_STATUS_BY_COLUMN = {
  backlog: "backlog",
  running: "in_progress",
  needs: "in_review",
  done: "done"
};
var COLUMN_ID_SET = new Set(COLUMN_IDS);
function sortByOrder(tasks) {
  return [...tasks].sort((left, right) => {
    const delta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (delta !== 0) return delta;
    return String(left.id).localeCompare(String(right.id));
  });
}
function computeDropSortOrder(columnTasks, beforeTaskId) {
  const ordered = sortByOrder(columnTasks);
  if (ordered.length === 0) return 1e3;
  const index = beforeTaskId ? ordered.findIndex((task) => task.id === beforeTaskId) : -1;
  if (index === 0) return ordered[0].sortOrder - 1e3;
  if (index > 0) {
    const previous = ordered[index - 1].sortOrder;
    const next = ordered[index].sortOrder;
    const candidate2 = previous + (next - previous) / 2;
    if (Number.isFinite(candidate2) && candidate2 > previous && candidate2 < next) return candidate2;
    return null;
  }
  const candidate = ordered[ordered.length - 1].sortOrder + 1e3;
  return Number.isFinite(candidate) ? candidate : null;
}
function planDropSortOrder(columnTasks, beforeTaskId, draggedTask, gap = 1e3) {
  const sortOrder = computeDropSortOrder(columnTasks, beforeTaskId);
  if (sortOrder !== null) return { sortOrder, updates: [] };
  const ordered = sortByOrder(columnTasks).filter((task) => task.id !== draggedTask?.id);
  const index = beforeTaskId ? ordered.findIndex((task) => task.id === beforeTaskId) : -1;
  const insertAt = index === -1 ? ordered.length : index;
  const fullOrder = [...ordered];
  fullOrder.splice(insertAt, 0, draggedTask);
  const updates = fullOrder.map((task, position) => ({
    id: task.id,
    version: task.version,
    sortOrder: (position + 1) * gap,
    original: task.sortOrder
  })).filter((entry) => entry.id === draggedTask.id || entry.sortOrder !== entry.original).map(({ id, version, sortOrder: value }) => ({ id, version, sortOrder: value }));
  return { sortOrder: null, updates };
}
function reconcileProjectFilter(selectedProjectId, filterProjectId, allProjectsId = "__all__") {
  if (filterProjectId && selectedProjectId !== allProjectsId && filterProjectId !== selectedProjectId) {
    return allProjectsId;
  }
  return selectedProjectId;
}
function statusForColumn(columnId, currentStatus) {
  if (columnId === "backlog") {
    return currentStatus === "backlog" || currentStatus === "todo" ? currentStatus : "backlog";
  }
  if (columnId === "running") {
    return currentStatus === "in_progress" ? currentStatus : "in_progress";
  }
  if (columnId === "done") {
    return currentStatus === "done" ? currentStatus : "done";
  }
  return null;
}
function parseCollapsedColumns(raw) {
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const ids = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? Object.keys(parsed).filter((id) => parsed[id]) : [];
  const collapsed = {};
  for (const id of COLUMN_IDS) if (ids.includes(id)) collapsed[id] = true;
  return collapsed;
}
function serializeCollapsedColumns(collapsed) {
  return JSON.stringify(COLUMN_IDS.filter((id) => Boolean(collapsed?.[id])));
}
function toggleCollapsedColumn(collapsed, id) {
  if (!COLUMN_ID_SET.has(id)) return collapsed;
  const next = { ...collapsed };
  if (next[id]) delete next[id];
  else next[id] = true;
  return next;
}
function matchesFilters(task, filters = {}) {
  if (filters.projectId && task.projectId !== filters.projectId) return false;
  if (filters.priority && task.priority !== filters.priority) return false;
  if (filters.label && !(Array.isArray(task.labels) ? task.labels : []).includes(filters.label)) return false;
  if (filters.assignee && task.assignee?.id !== filters.assignee) return false;
  return true;
}
function activeFilterCount(filters = {}) {
  return ["projectId", "priority", "label", "assignee"].filter((key) => Boolean(filters[key])).length;
}

// src/client/components/Board.js
var import_react5 = __toESM(require("react"), 1);

// src/client/store-state.js
function groupTasks(tasks) {
  return {
    backlog: tasks.filter((task) => task.column === "backlog"),
    running: tasks.filter((task) => task.column === "running"),
    needs: tasks.filter((task) => task.column === "needs"),
    done: tasks.filter((task) => task.column === "done")
  };
}

// src/client/components/Column.js
var import_react4 = __toESM(require("react"), 1);

// src/client/components/TaskCard.js
var import_react3 = __toESM(require("react"), 1);

// src/client/time.js
function toMillis(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function elapsedParts(start, now = Date.now()) {
  const startMs = toMillis(start);
  const nowMs = toMillis(now);
  if (startMs === null || nowMs === null) return null;
  const totalMinutes = Math.max(0, Math.floor((nowMs - startMs) / 6e4));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor(totalMinutes % (60 * 24) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}
function formatElapsed(start, now, t) {
  const parts = elapsedParts(start, now);
  if (!parts) return "";
  const { days, hours, minutes } = parts;
  if (days > 0) {
    return hours > 0 ? `${t("elapsedDays", { count: days })} ${t("elapsedHours", { count: hours })}` : t("elapsedDays", { count: days });
  }
  if (hours > 0) {
    return minutes > 0 ? `${t("elapsedHours", { count: hours })} ${t("elapsedMinutes", { count: minutes })}` : t("elapsedHours", { count: hours });
  }
  if (minutes > 0) return t("elapsedMinutes", { count: minutes });
  return t("elapsedUnderMinute");
}

// src/client/components/QuestionBlock.js
var import_react2 = __toESM(require("react"), 1);

// src/client/components/icons.js
var import_react = __toESM(require("react"), 1);
var stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
function ChevronDown({ size = 12 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 12 12", "aria-hidden": "true", ...stroke, strokeWidth: "1.4" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m2.5 4.5 3.5 3.5 3.5-3.5" }));
}
function ChevronRight({ size = 12 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 12 12", "aria-hidden": "true", ...stroke, strokeWidth: "1.4" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m4.5 2.5 3.5 3.5-3.5 3.5" }));
}
function PlusIcon({ size = 13 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 13 13", "aria-hidden": "true", ...stroke, strokeWidth: "1.5" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M6.5 2.4v8.2M2.4 6.5h8.2" }));
}
function BacklogIcon({ size = 15 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("rect", { x: "2.2", y: "3.2", width: "11.6", height: "9.6", rx: "2" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M2.4 8.6h3l1 1.7h3.2l1-1.7h3" }));
}
function RunningIcon({ size = 15 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "8", cy: "8", r: "5.8" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m6.6 5.3 4 2.7-4 2.7z", fill: "currentColor", stroke: "none" }));
}
function NeedsIcon({ size = 15 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 2.3 14 13H2z" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 6.2v3.1M8 11.3v.1", strokeWidth: "1.5" }));
}
function DoneIcon({ size = 15 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "8", cy: "8", r: "5.8" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m5.2 8.2 2 2 3.7-4.2", strokeWidth: "1.5" }));
}
var COLUMN_ICONS = {
  backlog: BacklogIcon,
  running: RunningIcon,
  needs: NeedsIcon,
  done: DoneIcon
};
function ColumnIcon({ tone = "backlog", size = 15 }) {
  const Icon = COLUMN_ICONS[tone] ?? BacklogIcon;
  return /* @__PURE__ */ import_react.default.createElement(Icon, { size });
}
function CommentIcon({ size = 12 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 14 14", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M2.2 3.5A1.3 1.3 0 0 1 3.5 2.2h7A1.3 1.3 0 0 1 11.8 3.5v5.1a1.3 1.3 0 0 1-1.3 1.3H6.2L3.6 12V9.9h-.1a1.3 1.3 0 0 1-1.3-1.3z" }));
}
function AttachmentIcon({ size = 12 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 14 14", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M8.6 3.4 4.9 7.1a2 2 0 0 0 2.8 2.8l4.1-4.1a3 3 0 0 0-4.2-4.2L3.2 5.9a3.7 3.7 0 0 0 5.2 5.2l3.2-3.2" }));
}
function LinkIcon({ size = 12 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 14 14", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M5.7 8.3a2.6 2.6 0 0 0 3.7 0l1.6-1.6a2.6 2.6 0 0 0-3.7-3.7l-.8.8" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M8.3 5.7a2.6 2.6 0 0 0-3.7 0L3 7.3a2.6 2.6 0 0 0 3.7 3.7l.8-.8" }));
}
function QuestionIcon({ size = 14 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "8", cy: "8", r: "5.8" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.2M8 11.2v.1", strokeWidth: "1.4" }));
}
function ReviewIcon({ size = 14 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "8", cy: "8", r: "5.8" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m5.2 8.1 2 2 3.6-4", strokeWidth: "1.5" }));
}
function ClockIcon({ size = 12 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 14 14", "aria-hidden": "true", ...stroke, strokeWidth: "1.3" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "7", cy: "7", r: "5.2" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M7 3.9V7l2 1.4" }));
}

// src/client/components/QuestionBlock.js
function QuestionBlock({
  task,
  t,
  onAnswer,
  readOnly = false,
  namePrefix = "dkb-question"
}) {
  const [selected, setSelected] = (0, import_react2.useState)(null);
  const [note, setNote] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const question = task.pendingQuestion;
  if (!question) return null;
  const disabled = busy || readOnly;
  const submit = async (decision) => {
    if (!selected || busy || readOnly) return;
    setBusy(true);
    try {
      await onAnswer(task, decision, selected, note);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "dkb-question", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ import_react2.default.createElement("p", { className: "dkb-question-prompt" }, /* @__PURE__ */ import_react2.default.createElement(QuestionIcon, null), /* @__PURE__ */ import_react2.default.createElement("span", null, t("questionNeedsAnswer"))), /* @__PURE__ */ import_react2.default.createElement("p", { className: "dkb-question-text" }, question.prompt), question.note ? /* @__PURE__ */ import_react2.default.createElement("p", { className: "dkb-question-context" }, question.note) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dkb-question-options", role: "radiogroup", "aria-label": t("questionOptions") }, question.options.map((option) => /* @__PURE__ */ import_react2.default.createElement("label", { className: "dkb-question-option", key: option.id }, /* @__PURE__ */ import_react2.default.createElement(
    "input",
    {
      type: "radio",
      name: `${namePrefix}-${task.id}`,
      value: option.id,
      checked: selected === option.id,
      onChange: () => setSelected(option.id),
      disabled
    }
  ), /* @__PURE__ */ import_react2.default.createElement("span", { className: "dkb-question-option-text" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dkb-question-option-label" }, option.label), option.detail ? /* @__PURE__ */ import_react2.default.createElement("span", { className: "dkb-question-option-detail" }, option.detail) : null)))), /* @__PURE__ */ import_react2.default.createElement(
    "input",
    {
      className: "dkb-input dkb-input-small",
      value: note,
      onChange: (event) => setNote(event.target.value),
      placeholder: t("questionNotePlaceholder"),
      "aria-label": t("questionNote"),
      disabled
    }
  ), !selected ? /* @__PURE__ */ import_react2.default.createElement("p", { className: "dkb-question-hint" }, t("questionSelectOption")) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dkb-question-actions" }, /* @__PURE__ */ import_react2.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small",
      onClick: () => submit("reject"),
      disabled: disabled || !selected
    },
    busy ? t("submitting") : t("reject")
  ), /* @__PURE__ */ import_react2.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small dkb-button-primary",
      onClick: () => submit("approve"),
      disabled: disabled || !selected
    },
    t("approve")
  )));
}
function ReviewBlock({ task, t, onAnswer, readOnly = false }) {
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const disabled = busy || readOnly;
  const submit = async (decision) => {
    if (busy || readOnly) return;
    setBusy(true);
    try {
      await onAnswer(task, decision, null, "");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "dkb-review", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ import_react2.default.createElement("p", { className: "dkb-review-prompt" }, /* @__PURE__ */ import_react2.default.createElement(ReviewIcon, null), /* @__PURE__ */ import_react2.default.createElement("span", null, t("reviewPrompt"))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dkb-review-actions" }, /* @__PURE__ */ import_react2.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small",
      onClick: () => submit("reject"),
      disabled
    },
    busy ? t("submitting") : t("returnToWork")
  ), /* @__PURE__ */ import_react2.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small dkb-button-primary",
      onClick: () => submit("approve"),
      disabled
    },
    t("confirm")
  )));
}

// src/client/components/TaskCard.js
function Metric({ icon, count, label, onOpen, task }) {
  return /* @__PURE__ */ import_react3.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-metric",
      onClick: () => onOpen(task),
      "aria-label": label,
      title: label
    },
    icon,
    /* @__PURE__ */ import_react3.default.createElement("span", null, count)
  );
}
function TaskCard({
  task,
  t,
  now = Date.now(),
  projectName = "",
  showProject = false,
  readOnly = false,
  selected = false,
  dropBefore = false,
  onOpen,
  onFilterProject,
  onFilterPriority,
  onAnswer,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}) {
  const attention = task.attentionReason ?? attentionReason(task);
  const hasQuestion = Boolean(task.pendingQuestion) && !task.questionResolution;
  const timer = formatElapsed(elapsedStart(task), now, t);
  const statusLabel = t(`status_${task.status}`);
  const attentionLabel = attention === "question" ? t("attentionQuestion") : attention === "blocked" ? t("attentionBlocked") : attention === "review" ? t("attentionReview") : "";
  const labels = Array.isArray(task.labels) ? task.labels : [];
  const activity = formatElapsed(task.updatedAt ?? task.statusSince, now, t);
  const rootClass = [
    "dkb-card",
    `dkb-card-tone-${task.column ?? "backlog"}`,
    selected ? "dkb-card-selected" : "",
    attention ? "dkb-card-attention" : "",
    dropBefore ? "dkb-card-drop-before" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ import_react3.default.createElement(
    "article",
    {
      className: rootClass,
      "data-task-id": task.id,
      draggable: !readOnly,
      onDragStart: (event) => {
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.(task, event);
      },
      onDragEnd: () => onDragEnd?.(),
      onDragOver: (event) => onDragOver?.(event),
      onDrop: (event) => onDrop?.(event)
    },
    /* @__PURE__ */ import_react3.default.createElement("div", { className: "dkb-card-top" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", className: "dkb-card-title", onClick: () => onOpen?.(task), title: t("openTask") }, task.identifier ? /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-card-identifier" }, task.identifier) : null, /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-card-title-text" }, task.title)), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        className: "dkb-card-open",
        onClick: () => onOpen?.(task),
        "aria-label": t("openTaskAria", { title: task.title }),
        title: t("openTask")
      },
      /* @__PURE__ */ import_react3.default.createElement(ChevronRight, null)
    )),
    task.description ? /* @__PURE__ */ import_react3.default.createElement("p", { className: "dkb-card-desc" }, task.description) : null,
    /* @__PURE__ */ import_react3.default.createElement("div", { className: "dkb-card-chips" }, showProject && projectName ? /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        className: "dkb-chip dkb-chip-project",
        onClick: () => onFilterProject?.(task.projectId),
        title: t("filterByProject", { name: projectName })
      },
      projectName
    ) : null, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        className: `dkb-chip dkb-priority-${task.priority}`,
        onClick: () => onFilterPriority?.(task.priority),
        title: t("filterByPriority", { priority: t(`priority_${task.priority}`) })
      },
      t(`priority_${task.priority}`)
    ), labels.map((label) => /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-chip dkb-label-chip", key: label }, label)), task.archivedAt ? /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-badge" }, t("archived")) : null, readOnly && !task.archivedAt ? /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-badge" }, t("readOnly")) : null),
    task.blockedReason ? /* @__PURE__ */ import_react3.default.createElement("p", { className: "dkb-card-blocker" }, /* @__PURE__ */ import_react3.default.createElement("strong", null, t("attentionBlocked"), ":"), " ", task.blockedReason) : activity ? /* @__PURE__ */ import_react3.default.createElement("p", { className: "dkb-card-activity" }, /* @__PURE__ */ import_react3.default.createElement(ClockIcon, null), " ", t("updatedAgo", { elapsed: activity })) : null,
    hasQuestion ? /* @__PURE__ */ import_react3.default.createElement(QuestionBlock, { task, t, onAnswer, readOnly }) : attention === "review" ? /* @__PURE__ */ import_react3.default.createElement(ReviewBlock, { task, t, onAnswer, readOnly }) : null,
    /* @__PURE__ */ import_react3.default.createElement("footer", { className: "dkb-card-footer" }, /* @__PURE__ */ import_react3.default.createElement(
      "span",
      {
        className: `dkb-card-status dkb-status-${task.column ?? "backlog"}${attention ? " dkb-status-attention" : ""}`,
        title: attentionLabel || statusLabel
      },
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-status-dot", "aria-hidden": "true" }),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-card-status-label" }, attentionLabel || statusLabel),
      timer ? /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-card-timer" }, "\xB7 ", timer) : null
    ), /* @__PURE__ */ import_react3.default.createElement("span", { className: "dkb-card-metrics" }, /* @__PURE__ */ import_react3.default.createElement(
      Metric,
      {
        icon: /* @__PURE__ */ import_react3.default.createElement(CommentIcon, null),
        count: task.commentCount ?? 0,
        label: t("commentsCount", { count: task.commentCount ?? 0 }),
        onOpen,
        task
      }
    ), /* @__PURE__ */ import_react3.default.createElement(
      Metric,
      {
        icon: /* @__PURE__ */ import_react3.default.createElement(AttachmentIcon, null),
        count: task.attachmentCount ?? 0,
        label: t("attachmentsCount", { count: task.attachmentCount ?? 0 }),
        onOpen,
        task
      }
    ), /* @__PURE__ */ import_react3.default.createElement(
      Metric,
      {
        icon: /* @__PURE__ */ import_react3.default.createElement(LinkIcon, null),
        count: task.linkCount ?? (Array.isArray(task.links) ? task.links.length : 0),
        label: t("linksCount", { count: task.linkCount ?? (Array.isArray(task.links) ? task.links.length : 0) }),
        onOpen,
        task
      }
    )))
  );
}

// src/client/components/Column.js
function Column({
  id,
  tone,
  title,
  tasks = [],
  collapsed = false,
  isOver = false,
  dropInvalid = false,
  dropBeforeTaskId = null,
  readOnly = false,
  projects = [],
  showProject = false,
  selectedTaskId = null,
  now = Date.now(),
  onToggle,
  onAdd,
  onOpenTask,
  onFilterProject,
  onFilterPriority,
  onAnswer,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  t
}) {
  const projectName = (projectId) => projects.find((project) => project.id === projectId)?.name ?? "";
  const dropClass = [
    "dkb-column",
    `dkb-tone-${tone}`,
    collapsed ? "dkb-column-collapsed" : "",
    isOver ? "dkb-column-drop-target" : "",
    dropInvalid ? "dkb-column-drop-invalid" : ""
  ].filter(Boolean).join(" ");
  const dragHandlers = {
    onDragOver: (event) => onColumnDragOver?.(event, id),
    onDragLeave: (event) => onColumnDragLeave?.(event, id),
    onDrop: (event) => onColumnDrop?.(event, id)
  };
  if (collapsed) {
    return /* @__PURE__ */ import_react4.default.createElement("section", { className: dropClass, "aria-label": title, "data-column-id": id, ...dragHandlers }, /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        type: "button",
        className: "dkb-icon-button dkb-collapsed-toggle",
        onClick: onToggle,
        "aria-expanded": false,
        "aria-label": t("expandColumn", { column: title }),
        title: t("expandColumn", { column: title })
      },
      /* @__PURE__ */ import_react4.default.createElement(ChevronRight, null)
    ), /* @__PURE__ */ import_react4.default.createElement("span", { className: `dkb-collapsed-icon dkb-column-icon-${tone}`, "aria-hidden": "true" }, /* @__PURE__ */ import_react4.default.createElement(ColumnIcon, { tone })), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dkb-collapsed-count", "aria-label": t("columnCountAria", { column: title, count: tasks.length }) }, tasks.length), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dkb-collapsed-label" }, title));
  }
  return /* @__PURE__ */ import_react4.default.createElement("section", { className: dropClass, "aria-label": title, "data-column-id": id, ...dragHandlers }, /* @__PURE__ */ import_react4.default.createElement("header", { className: "dkb-column-head" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: `dkb-column-icon dkb-column-icon-${tone}`, "aria-hidden": "true" }, /* @__PURE__ */ import_react4.default.createElement(ColumnIcon, { tone })), /* @__PURE__ */ import_react4.default.createElement("h3", { className: "dkb-column-title" }, title), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dkb-column-count", "aria-label": t("columnCountAria", { column: title, count: tasks.length }) }, tasks.length), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-icon-button dkb-column-toggle",
      onClick: onToggle,
      "aria-expanded": true,
      "aria-label": t("collapseColumn", { column: title }),
      title: t("collapseColumn", { column: title })
    },
    /* @__PURE__ */ import_react4.default.createElement(ChevronDown, null)
  ), /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-icon-button dkb-column-add",
      onClick: onAdd,
      disabled: readOnly,
      "aria-label": t("addCardTo", { column: title }),
      title: t("addCardTo", { column: title })
    },
    /* @__PURE__ */ import_react4.default.createElement(PlusIcon, null)
  )), /* @__PURE__ */ import_react4.default.createElement("div", { className: "dkb-column-body" }, tasks.length === 0 ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dkb-column-empty" }, readOnly ? t("readOnly") : t("dropHint")) : tasks.map((task) => /* @__PURE__ */ import_react4.default.createElement(
    TaskCard,
    {
      key: task.id,
      task,
      t,
      now,
      projectName: showProject ? projectName(task.projectId) : "",
      showProject,
      readOnly,
      selected: selectedTaskId === task.id,
      dropBefore: dropBeforeTaskId === task.id,
      onOpen: onOpenTask,
      onFilterProject,
      onFilterPriority,
      onAnswer,
      onDragStart,
      onDragEnd,
      onDragOver: (event) => onCardDragOver?.(event, id, task.id),
      onDrop: (event) => onCardDrop?.(event, id, task.id)
    }
  ))), /* @__PURE__ */ import_react4.default.createElement("footer", { className: "dkb-column-foot" }, /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", className: "dkb-new-card", onClick: onAdd, disabled: readOnly }, /* @__PURE__ */ import_react4.default.createElement(PlusIcon, null), /* @__PURE__ */ import_react4.default.createElement("span", null, t("newCard")))));
}

// src/client/components/Board.js
var COLUMNS = [
  { id: "backlog", tone: "backlog", labelKey: "backlog" },
  { id: "running", tone: "running", labelKey: "running" },
  { id: "needs", tone: "needs", labelKey: "needs" },
  { id: "done", tone: "done", labelKey: "done" }
];
function Board({
  tasks = [],
  collapsed = {},
  projects = [],
  showProject = false,
  readOnly = false,
  selectedTaskId = null,
  onToggleColumn,
  onOpenTask,
  onDropTask,
  onAddTask,
  onFilterProject,
  onFilterPriority,
  onAnswerQuestion,
  t
}) {
  const [dragging, setDragging] = (0, import_react5.useState)(null);
  const [over, setOver] = (0, import_react5.useState)(null);
  const [now, setNow] = (0, import_react5.useState)(() => Date.now());
  (0, import_react5.useEffect)(() => {
    const timer = setInterval(() => setNow(Date.now()), 3e4);
    return () => clearInterval(timer);
  }, []);
  const grouped = (0, import_react5.useMemo)(() => groupTasks(sortByOrder(tasks)), [tasks]);
  const commitDrop = (columnId, beforeTaskId) => {
    const task = dragging;
    setDragging(null);
    setOver(null);
    if (readOnly || !task || beforeTaskId === task.id) return;
    onDropTask?.(task, columnId, beforeTaskId ?? null);
  };
  const handleDragStart = (task) => {
    if (readOnly) return;
    setDragging(task);
    setOver(null);
  };
  const handleDragEnd = () => {
    setDragging(null);
    setOver(null);
  };
  const handleColumnDragOver = (event, columnId) => {
    if (readOnly || !dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOver((current) => current?.columnId === columnId && current?.beforeTaskId === null ? current : { columnId, beforeTaskId: null });
  };
  const handleColumnDragLeave = (event, columnId) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    setOver((current) => current?.columnId === columnId ? null : current);
  };
  const handleColumnDrop = (event, columnId) => {
    if (readOnly) return;
    event.preventDefault();
    const beforeTaskId = over?.columnId === columnId ? over.beforeTaskId : null;
    commitDrop(columnId, beforeTaskId);
  };
  const handleCardDragOver = (event, columnId, taskId) => {
    if (readOnly || !dragging) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setOver({ columnId, beforeTaskId: taskId });
  };
  const handleCardDrop = (event, columnId, taskId) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    commitDrop(columnId, taskId);
  };
  return /* @__PURE__ */ import_react5.default.createElement("div", { className: "dkb-columns" }, COLUMNS.map((column) => {
    const check = dragging ? canDrop(dragging, column.id) : null;
    return /* @__PURE__ */ import_react5.default.createElement(
      Column,
      {
        key: column.id,
        id: column.id,
        tone: column.tone,
        title: t(column.labelKey),
        tasks: grouped[column.id],
        collapsed: Boolean(collapsed[column.id]),
        projects,
        showProject,
        readOnly,
        selectedTaskId,
        now,
        isOver: over?.columnId === column.id,
        dropInvalid: Boolean(dragging && over?.columnId === column.id && check && !check.ok),
        dropBeforeTaskId: over?.columnId === column.id ? over.beforeTaskId : null,
        onToggle: () => onToggleColumn?.(column.id),
        onAdd: () => onAddTask?.(column.id),
        onOpenTask,
        onFilterProject,
        onFilterPriority,
        onAnswer: onAnswerQuestion,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEnd,
        onCardDragOver: handleCardDragOver,
        onCardDrop: handleCardDrop,
        onColumnDragOver: handleColumnDragOver,
        onColumnDragLeave: handleColumnDragLeave,
        onColumnDrop: handleColumnDrop,
        t
      }
    );
  }));
}

// src/client/components/FiltersMenu.js
var import_react6 = __toESM(require("react"), 1);
function FilterField({ label, children }) {
  return /* @__PURE__ */ import_react6.default.createElement("label", { className: "dkb-filter-field" }, /* @__PURE__ */ import_react6.default.createElement("span", { className: "dkb-filter-label" }, label), children);
}
function FiltersMenu({
  t,
  filters = {},
  projects = [],
  priorities = [],
  labels = [],
  assignees = [],
  onChange,
  onClear
}) {
  const [open, setOpen] = (0, import_react6.useState)(false);
  const rootRef = (0, import_react6.useRef)(null);
  const triggerRef = (0, import_react6.useRef)(null);
  const count = activeFilterCount(filters);
  (0, import_react6.useEffect)(() => {
    if (!open) return void 0;
    const onPointerDown = (event) => {
      if (rootRef.current === null || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const set = (key) => (event) => onChange?.(key, event.target.value);
  return /* @__PURE__ */ import_react6.default.createElement("div", { className: "dkb-filters-wrap", ref: rootRef }, /* @__PURE__ */ import_react6.default.createElement(
    "button",
    {
      type: "button",
      ref: triggerRef,
      className: "dkb-button dkb-button-ghost dkb-filters",
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-label": count > 0 ? t("filtersCountAria", { count }) : t("filters"),
      title: count > 0 ? t("filtersCountAria", { count }) : t("filters"),
      onClick: () => setOpen((value) => !value)
    },
    /* @__PURE__ */ import_react6.default.createElement("span", null, t("filters")),
    count > 0 ? /* @__PURE__ */ import_react6.default.createElement("span", { className: "dkb-filter-count" }, count) : null
  ), open ? /* @__PURE__ */ import_react6.default.createElement("div", { className: "dkb-filter-popover", role: "dialog", "aria-label": t("filters") }, /* @__PURE__ */ import_react6.default.createElement("p", { className: "dkb-filter-title" }, t("filters")), /* @__PURE__ */ import_react6.default.createElement(FilterField, { label: t("filterProject") }, /* @__PURE__ */ import_react6.default.createElement("select", { className: "dkb-select", value: filters.projectId ?? "", onChange: set("projectId") }, /* @__PURE__ */ import_react6.default.createElement("option", { value: "" }, t("filterAny")), projects.map((project) => /* @__PURE__ */ import_react6.default.createElement("option", { key: project.id, value: project.id }, project.name)))), /* @__PURE__ */ import_react6.default.createElement(FilterField, { label: t("filterPriority") }, /* @__PURE__ */ import_react6.default.createElement("select", { className: "dkb-select", value: filters.priority ?? "", onChange: set("priority") }, /* @__PURE__ */ import_react6.default.createElement("option", { value: "" }, t("filterAny")), priorities.map((priority) => /* @__PURE__ */ import_react6.default.createElement("option", { key: priority, value: priority }, t(`priority_${priority}`))))), /* @__PURE__ */ import_react6.default.createElement(FilterField, { label: t("filterLabel") }, /* @__PURE__ */ import_react6.default.createElement("select", { className: "dkb-select", value: filters.label ?? "", onChange: set("label") }, /* @__PURE__ */ import_react6.default.createElement("option", { value: "" }, t("filterAny")), labels.map((label) => /* @__PURE__ */ import_react6.default.createElement("option", { key: label, value: label }, label)))), /* @__PURE__ */ import_react6.default.createElement(FilterField, { label: t("filterAssignee") }, /* @__PURE__ */ import_react6.default.createElement("select", { className: "dkb-select", value: filters.assignee ?? "", onChange: set("assignee") }, /* @__PURE__ */ import_react6.default.createElement("option", { value: "" }, t("filterAny")), assignees.map((assignee) => /* @__PURE__ */ import_react6.default.createElement("option", { key: assignee.id, value: assignee.id }, assignee.name)))), /* @__PURE__ */ import_react6.default.createElement("div", { className: "dkb-filter-actions" }, /* @__PURE__ */ import_react6.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small",
      onClick: () => onClear?.(),
      disabled: count === 0
    },
    t("clearFilters")
  ), /* @__PURE__ */ import_react6.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small dkb-button-primary",
      onClick: () => setOpen(false)
    },
    t("close")
  ))) : null);
}

// src/client/components/ProjectSwitcher.js
var import_react7 = __toESM(require("react"), 1);
function ChevronDown2() {
  return /* @__PURE__ */ import_react7.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement("path", { d: "M2.5 4.5 6 8l3.5-3.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function Check() {
  return /* @__PURE__ */ import_react7.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement("path", { d: "m2.2 6.3 2.4 2.4 5.2-5.4", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function MenuItem({ children, count, selected, onSelect, role = "menuitemradio" }) {
  return /* @__PURE__ */ import_react7.default.createElement(
    "button",
    {
      type: "button",
      role,
      className: "dkb-menu-item",
      "aria-checked": role === "menuitemradio" ? selected === true : void 0,
      onClick: onSelect
    },
    /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-menu-item-check", "aria-hidden": "true" }, selected ? /* @__PURE__ */ import_react7.default.createElement(Check, null) : null),
    /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-menu-item-label" }, children),
    count === void 0 ? null : /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-menu-item-count" }, count)
  );
}
function ProjectSwitcher({
  projects = [],
  archivedProjects = [],
  selectedId,
  onSelect,
  onCreate,
  onManage,
  onArchivedProjects,
  onArchivedTasks,
  t
}) {
  const [open, setOpen] = (0, import_react7.useState)(false);
  const rootRef = (0, import_react7.useRef)(null);
  const triggerRef = (0, import_react7.useRef)(null);
  const menuRef = (0, import_react7.useRef)(null);
  const selectedProject = [...projects, ...archivedProjects].find((project) => project.id === selectedId) ?? null;
  const selectedArchived = Boolean(selectedProject?.archivedAt);
  const label = selectedProject?.name ?? t("allProjects");
  const totalTasks = projects.reduce((sum, project) => sum + (project.taskCount ?? 0), 0);
  (0, import_react7.useEffect)(() => {
    if (!open) return void 0;
    const onPointerDown = (event) => {
      if (rootRef.current === null || rootRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const first = menuRef.current?.querySelector('[role="menuitem"], [role="menuitemradio"]');
    first?.focus?.();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const runAction = (action) => {
    setOpen(false);
    triggerRef.current?.focus();
    action?.();
  };
  return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-switcher", ref: rootRef }, /* @__PURE__ */ import_react7.default.createElement(
    "button",
    {
      type: "button",
      ref: triggerRef,
      className: `dkb-project-trigger${selectedArchived ? " dkb-project-trigger-archived" : ""}`,
      "aria-haspopup": "menu",
      "aria-expanded": open,
      "aria-label": `${t("menuLabel")}: ${label}${selectedArchived ? ` (${t("archived")})` : ""}`,
      onClick: () => setOpen((value) => !value)
    },
    /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-project-mark", "aria-hidden": "true" }),
    /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-project-trigger-label" }, label),
    selectedArchived ? /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-badge" }, t("archived")) : null,
    /* @__PURE__ */ import_react7.default.createElement("span", { className: "dkb-project-trigger-chevron", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement(ChevronDown2, null))
  ), open ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-menu", role: "menu", "aria-label": t("menuLabel"), ref: menuRef }, /* @__PURE__ */ import_react7.default.createElement(
    MenuItem,
    {
      selected: selectedProject === null,
      count: t("taskCount", { count: totalTasks }),
      onSelect: () => runAction(() => onSelect?.("__all__"))
    },
    t("allProjects")
  ), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-menu-section", role: "presentation" }, t("activeProjects")), projects.length === 0 ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-menu-empty" }, t("noActiveProjects")) : projects.map((project) => /* @__PURE__ */ import_react7.default.createElement(
    MenuItem,
    {
      key: project.id,
      selected: selectedId === project.id,
      count: t("taskCount", { count: project.taskCount ?? 0 }),
      onSelect: () => runAction(() => onSelect?.(project.id))
    },
    project.name
  )), archivedProjects.length > 0 ? /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-menu-divider", role: "separator" }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-menu-section", role: "presentation" }, t("archivedProjects")), archivedProjects.map((project) => /* @__PURE__ */ import_react7.default.createElement(
    MenuItem,
    {
      key: project.id,
      selected: selectedId === project.id,
      count: t("taskCount", { count: project.taskCount ?? 0 }),
      onSelect: () => runAction(() => onSelect?.(project.id))
    },
    project.name
  ))) : null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dkb-menu-divider", role: "separator" }), /* @__PURE__ */ import_react7.default.createElement(MenuItem, { role: "menuitem", onSelect: () => runAction(onCreate) }, t("createProject")), /* @__PURE__ */ import_react7.default.createElement(MenuItem, { role: "menuitem", onSelect: () => runAction(onManage) }, t("manageProjects")), /* @__PURE__ */ import_react7.default.createElement(
    MenuItem,
    {
      role: "menuitem",
      count: archivedProjects.length > 0 ? String(archivedProjects.length) : void 0,
      onSelect: () => runAction(onArchivedProjects)
    },
    t("archivedProjects")
  ), /* @__PURE__ */ import_react7.default.createElement(MenuItem, { role: "menuitem", onSelect: () => runAction(onArchivedTasks) }, t("archivedTasks"))) : null);
}

// src/client/components/TaskDrawer.js
var import_react9 = __toESM(require("react"), 1);

// src/client/drawer-state.js
var MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function attachmentHref(attachmentId) {
  return `/kanban-api/attachments/${encodeURIComponent(attachmentId)}`;
}
function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[index]}`;
}
function sortActivityDesc(events) {
  if (!Array.isArray(events)) return [];
  return [...events].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt) || 0;
    const rightTime = Date.parse(right?.createdAt) || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return String(right?.id ?? "").localeCompare(String(left?.id ?? ""));
  });
}
function formatActivityValue(field, value, t) {
  if (value === null || value === void 0 || value === "") return t("activityNone");
  if (field === "status" && typeof value === "string") return t(`status_${value}`);
  if (field === "priority" && typeof value === "string") return t(`priority_${value}`);
  if (field === "labels" && Array.isArray(value)) return value.length ? value.join(", ") : t("activityNone");
  if (field === "links" && Array.isArray(value)) {
    return value.length ? value.map((link) => link?.label || link?.url || "").filter(Boolean).join(", ") : t("activityNone");
  }
  if (field === "archivedAt") return value ? t("activityArchived") : t("activityActive");
  if (field === "pendingQuestion") {
    if (value && typeof value === "object") return value.prompt ?? t("activityNone");
    return String(value);
  }
  if (field === "questionResolution" && value && typeof value === "object") {
    const decision = value.decision === "approve" ? t("approve") : value.decision === "reject" ? t("reject") : "";
    return [decision, value.optionLabel].filter(Boolean).join(" \xB7 ") || t("activityNone");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// src/client/components/dialogs.js
var import_react8 = __toESM(require("react"), 1);
var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
var CREATE_STATUSES = STATUSES.filter((status) => status !== "canceled");
function projectErrorText(error, t) {
  if (error?.code === "PROJECT_NOT_EMPTY") {
    return t("projectNotEmpty", { count: error?.details?.taskCount ?? 0 });
  }
  if (error?.code === "PROJECT_EXISTS") return t("projectExists");
  if (error?.code === "PROJECT_ARCHIVED") return t("projectArchived");
  if (error?.code === "PROJECT_NOT_FOUND") return t("projectNotFound");
  if (error?.code === "INVALID_FIELD") {
    return t("invalidField", { field: error?.details?.field ?? "" });
  }
  return error?.message || t("actionFailed");
}
function taskErrorText(error, t) {
  if (error?.code === "TASK_VERSION_CONFLICT") return t("versionConflict");
  if (error?.code === "TASK_NEEDS_ATTENTION") return t("resolveAttention");
  if (error?.code === "TASK_NOT_IN_REVIEW") return t("reviewNotPending");
  if (error?.code === "TASK_ARCHIVED") return t("taskArchived");
  if (error?.code === "TASK_NOT_FOUND") return t("taskNotFound");
  if (error?.code === "QUESTION_ALREADY_PENDING") return t("questionAlreadyPending");
  if (error?.code === "QUESTION_NOT_PENDING") return t("questionNotPending");
  if (error?.code === "PROJECT_ARCHIVED") return t("projectArchived");
  if (error?.code === "PROJECT_NOT_FOUND") return t("projectNotFound");
  if (error?.code === "INVALID_FIELD") {
    return t("invalidField", { field: error?.details?.field ?? "" });
  }
  return error?.message || t("actionFailed");
}
function ErrorBanner({ children }) {
  return /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-form-error", role: "alert" }, children);
}
function Field({ label, children }) {
  return /* @__PURE__ */ import_react8.default.createElement("label", { className: "dkb-field" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-field-label" }, label), children);
}
function useMountedRef() {
  const mountedRef = (0, import_react8.useRef)(true);
  (0, import_react8.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}
function Modal({ title, t, onClose, layer = 0, wide = false, busy = false, children }) {
  const titleId = (0, import_react8.useId)();
  const layerRef = (0, import_react8.useRef)(null);
  const returnFocusRef = (0, import_react8.useRef)(null);
  (0, import_react8.useLayoutEffect)(() => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    const dialog = layerRef.current?.querySelector('[role="dialog"]');
    const target = dialog?.querySelector('[data-autofocus="true"]') ?? dialog?.querySelector("input, textarea, select, button");
    target?.focus?.();
  }, []);
  (0, import_react8.useEffect)(() => () => {
    const target = returnFocusRef.current;
    if (target?.isConnected && typeof target.focus === "function") target.focus();
  }, []);
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = layerRef.current?.querySelector('[role="dialog"]');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };
  const requestClose = () => {
    if (busy) return;
    onClose();
  };
  return /* @__PURE__ */ import_react8.default.createElement(
    "div",
    {
      className: "dkb-modal-layer",
      style: { zIndex: 1e3 + layer },
      ref: layerRef,
      onKeyDown,
      onClick: (event) => {
        if (busy) return;
        if (event.target === event.currentTarget) onClose();
      }
    },
    /* @__PURE__ */ import_react8.default.createElement(
      "div",
      {
        className: `dkb-modal${wide ? " dkb-modal-wide" : ""}`,
        role: "dialog",
        "aria-modal": "true",
        "aria-busy": busy || void 0,
        "aria-labelledby": titleId
      },
      /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-head" }, /* @__PURE__ */ import_react8.default.createElement("h2", { className: "dkb-modal-title", id: titleId }, title), /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-modal-close",
          onClick: requestClose,
          disabled: busy,
          "aria-disabled": busy || void 0,
          "aria-label": t("close"),
          title: t("close")
        },
        "\xD7"
      )),
      /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-body" }, children)
    )
  );
}
function CreateProjectDialog({ t, layer, onClose, onCreate }) {
  const [name, setName] = (0, import_react8.useState)("");
  const [workspacePath, setWorkspacePath] = (0, import_react8.useState)("");
  const [error, setError] = (0, import_react8.useState)("");
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const mountedRef = useMountedRef();
  const submit = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: cleanName, workspacePath: workspacePath.trim() });
    } catch (failure) {
      if (!mountedRef.current) return;
      setError(projectErrorText(failure, t));
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("createProject"), t, onClose, layer, busy }, /* @__PURE__ */ import_react8.default.createElement("form", { className: "dkb-form", onSubmit: submit, noValidate: true }, /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("projectName") }, /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      className: "dkb-input",
      "data-autofocus": "true",
      value: name,
      onChange: (event) => setName(event.target.value),
      placeholder: t("projectNamePlaceholder"),
      autoComplete: "off"
    }
  )), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("workspacePath") }, /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      className: "dkb-input",
      value: workspacePath,
      onChange: (event) => setWorkspacePath(event.target.value),
      placeholder: t("workspacePathPlaceholder"),
      spellCheck: false,
      autoComplete: "off"
    }
  )), error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", onClick: onClose, disabled: busy }, t("cancel")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "submit", className: "dkb-button dkb-button-primary", disabled: busy }, t("create")))));
}
function CreateTaskDialog({
  t,
  layer,
  projects = [],
  defaultProjectId = "",
  defaultStatus = "backlog",
  onClose,
  onCreate
}) {
  const [projectId, setProjectId] = (0, import_react8.useState)(defaultProjectId || "");
  const [title, setTitle] = (0, import_react8.useState)("");
  const [description, setDescription] = (0, import_react8.useState)("");
  const [status, setStatus] = (0, import_react8.useState)(defaultStatus);
  const [priority, setPriority] = (0, import_react8.useState)("none");
  const [labels, setLabels] = (0, import_react8.useState)("");
  const [error, setError] = (0, import_react8.useState)("");
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const mountedRef = useMountedRef();
  const submit = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(t("titleRequired"));
      return;
    }
    if (!projectId) {
      setError(t("projectRequired"));
      return;
    }
    const cleanLabels = labels.split(",").map((label) => label.trim()).filter(Boolean);
    setBusy(true);
    setError("");
    try {
      await onCreate({
        projectId,
        title: cleanTitle,
        description,
        status,
        priority,
        labels: cleanLabels,
        assigneeTarget: "current-user"
      });
    } catch (failure) {
      if (!mountedRef.current) return;
      setError(taskErrorText(failure, t));
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("createTask"), t, onClose, layer, busy }, /* @__PURE__ */ import_react8.default.createElement("form", { className: "dkb-form", onSubmit: submit, noValidate: true }, /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskProject") }, /* @__PURE__ */ import_react8.default.createElement(
    "select",
    {
      className: "dkb-select",
      value: projectId,
      onChange: (event) => setProjectId(event.target.value),
      disabled: busy
    },
    /* @__PURE__ */ import_react8.default.createElement("option", { value: "" }, t("selectProject")),
    projects.map((project) => /* @__PURE__ */ import_react8.default.createElement("option", { key: project.id, value: project.id }, project.name))
  )), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskTitle") }, /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      className: "dkb-input",
      "data-autofocus": "true",
      value: title,
      onChange: (event) => setTitle(event.target.value),
      placeholder: t("taskTitlePlaceholder"),
      maxLength: 240,
      autoComplete: "off",
      disabled: busy
    }
  )), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskDescription") }, /* @__PURE__ */ import_react8.default.createElement(
    "textarea",
    {
      className: "dkb-textarea",
      value: description,
      onChange: (event) => setDescription(event.target.value),
      placeholder: t("taskDescriptionPlaceholder"),
      rows: 3,
      disabled: busy
    }
  )), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskStatus") }, /* @__PURE__ */ import_react8.default.createElement("select", { className: "dkb-select", value: status, onChange: (event) => setStatus(event.target.value), disabled: busy }, CREATE_STATUSES.map((value) => /* @__PURE__ */ import_react8.default.createElement("option", { key: value, value }, t(`status_${value}`))))), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskPriority") }, /* @__PURE__ */ import_react8.default.createElement("select", { className: "dkb-select", value: priority, onChange: (event) => setPriority(event.target.value), disabled: busy }, PRIORITIES.map((value) => /* @__PURE__ */ import_react8.default.createElement("option", { key: value, value }, t(`priority_${value}`))))), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskLabels") }, /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      className: "dkb-input",
      value: labels,
      onChange: (event) => setLabels(event.target.value),
      placeholder: t("taskLabelsPlaceholder"),
      autoComplete: "off",
      disabled: busy
    }
  ), /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-field-hint" }, t("taskLabelsHint"))), /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("taskAssignee") }, /* @__PURE__ */ import_react8.default.createElement("select", { className: "dkb-select", defaultValue: "current-user", disabled: true }, /* @__PURE__ */ import_react8.default.createElement("option", { value: "current-user" }, t("currentUser")))), error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", onClick: onClose, disabled: busy }, t("cancel")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "submit", className: "dkb-button dkb-button-primary", disabled: busy }, t("create")))));
}
function RenameProjectDialog({ t, layer, project, onClose, onRename }) {
  const [name, setName] = (0, import_react8.useState)(project.name);
  const [error, setError] = (0, import_react8.useState)("");
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const mountedRef = useMountedRef();
  const submit = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onRename(project, cleanName);
    } catch (failure) {
      if (!mountedRef.current) return;
      setError(projectErrorText(failure, t));
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("renameProject"), t, onClose, layer, busy }, /* @__PURE__ */ import_react8.default.createElement("form", { className: "dkb-form", onSubmit: submit, noValidate: true }, /* @__PURE__ */ import_react8.default.createElement(Field, { label: t("projectName") }, /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      className: "dkb-input",
      "data-autofocus": "true",
      value: name,
      onChange: (event) => setName(event.target.value),
      onFocus: (event) => event.target.select(),
      autoComplete: "off"
    }
  )), error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", onClick: onClose, disabled: busy }, t("cancel")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "submit", className: "dkb-button dkb-button-primary", disabled: busy }, t("save")))));
}
function ArchiveProjectDialog({ t, layer, project, onClose, onConfirm }) {
  const [error, setError] = (0, import_react8.useState)("");
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const mountedRef = useMountedRef();
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onConfirm(project);
    } catch (failure) {
      if (!mountedRef.current) return;
      setError(projectErrorText(failure, t));
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("archiveProject"), t, onClose, layer, busy }, /* @__PURE__ */ import_react8.default.createElement("form", { className: "dkb-form", onSubmit: submit }, /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-dialog-text" }, t("archiveConfirm", { name: project.name })), error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", "data-autofocus": "true", onClick: onClose, disabled: busy }, t("cancel")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "submit", className: "dkb-button dkb-button-primary", disabled: busy }, t("archive")))));
}
function DeleteProjectDialog({ t, layer, project, onClose, onConfirm }) {
  const [error, setError] = (0, import_react8.useState)("");
  const [busy, setBusy] = (0, import_react8.useState)(false);
  const mountedRef = useMountedRef();
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onConfirm(project);
    } catch (failure) {
      if (!mountedRef.current) return;
      setError(projectErrorText(failure, t));
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("deleteProject"), t, onClose, layer, busy }, /* @__PURE__ */ import_react8.default.createElement("form", { className: "dkb-form", onSubmit: submit }, /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-dialog-text" }, t("deleteConfirm", { name: project.name })), project.taskCount > 0 ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-warning" }, t("deleteNonEmptyHint", { count: project.taskCount })) : null, error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", "data-autofocus": "true", onClick: onClose, disabled: busy }, t("cancel")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "submit", className: "dkb-button dkb-button-danger", disabled: busy }, t("delete")))));
}
function ManageProjectsDialog({
  t,
  layer,
  projects = [],
  initialView = "active",
  onClose,
  onCreate,
  onRename,
  onArchive,
  onRestore,
  onDelete
}) {
  const [view, setView] = (0, import_react8.useState)(initialView);
  const [busyId, setBusyId] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)("");
  const active = (0, import_react8.useMemo)(() => projects.filter((project) => !project.archivedAt), [projects]);
  const archived = (0, import_react8.useMemo)(() => projects.filter((project) => project.archivedAt), [projects]);
  const rows = view === "active" ? active : archived;
  const restore = async (project) => {
    setBusyId(project.id);
    setError("");
    try {
      await onRestore(project);
    } catch (failure) {
      setError(projectErrorText(failure, t));
    } finally {
      setBusyId(null);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("manageProjects"), t, onClose, layer, wide: true }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-tabs", role: "tablist", "aria-label": t("manageProjects") }, /* @__PURE__ */ import_react8.default.createElement(
    "button",
    {
      type: "button",
      role: "tab",
      className: "dkb-tab",
      "aria-selected": view === "active",
      "data-autofocus": view === "active" ? "true" : void 0,
      onClick: () => {
        setView("active");
        setError("");
      }
    },
    t("activeProjects"),
    " ",
    /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-tab-count" }, active.length)
  ), /* @__PURE__ */ import_react8.default.createElement(
    "button",
    {
      type: "button",
      role: "tab",
      className: "dkb-tab",
      "aria-selected": view === "archived",
      "data-autofocus": view === "archived" ? "true" : void 0,
      onClick: () => {
        setView("archived");
        setError("");
      }
    },
    t("archivedProjects"),
    " ",
    /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-tab-count" }, archived.length)
  )), error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, rows.length === 0 ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-list-empty" }, view === "active" ? t("noActiveProjects") : t("noArchivedProjects")) : /* @__PURE__ */ import_react8.default.createElement("ul", { className: "dkb-project-list" }, rows.map((project) => /* @__PURE__ */ import_react8.default.createElement("li", { className: "dkb-project-row", key: project.id }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-project-row-main" }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-project-row-name" }, /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-project-row-name-text" }, project.name), project.archivedAt ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-badge" }, t("archived")) : null), /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-project-row-meta" }, /* @__PURE__ */ import_react8.default.createElement("span", null, t("taskCount", { count: project.taskCount ?? 0 })), project.workspacePath ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-project-row-path", title: project.workspacePath }, project.workspacePath) : null)), /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-project-row-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button dkb-button-small", onClick: () => onRename(project) }, t("rename")), project.archivedAt ? /* @__PURE__ */ import_react8.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small",
      onClick: () => restore(project),
      disabled: busyId === project.id,
      "aria-busy": busyId === project.id
    },
    t("restore")
  ) : /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button dkb-button-small", onClick: () => onArchive(project) }, t("archive")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button dkb-button-small dkb-button-danger", onClick: () => onDelete(project) }, t("delete")))))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", onClick: onCreate }, t("createProject")), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button dkb-button-primary", onClick: onClose }, t("close"))));
}
function ArchivedTasksDialog({
  t,
  layer,
  projectId,
  projects = [],
  onClose,
  loadArchivedTasks,
  onOpenTask,
  onRestoreTask,
  onDeleteTask
}) {
  const [tasks, setTasks] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)("");
  const [actionError, setActionError] = (0, import_react8.useState)("");
  const [reloadToken, setReloadToken] = (0, import_react8.useState)(0);
  const [search, setSearch] = (0, import_react8.useState)("");
  const [pending, setPending] = (0, import_react8.useState)(null);
  const [busyId, setBusyId] = (0, import_react8.useState)(null);
  const [focusRequest, setFocusRequest] = (0, import_react8.useState)(0);
  const mountedRef = useMountedRef();
  const searchRef = (0, import_react8.useRef)(null);
  const hintBaseId = (0, import_react8.useId)();
  const busy = Boolean(busyId);
  (0, import_react8.useEffect)(() => {
    if (focusRequest === 0) return;
    searchRef.current?.focus();
  }, [focusRequest]);
  const focusSearch = () => setFocusRequest((value) => value + 1);
  (0, import_react8.useEffect)(() => {
    let cancelled = false;
    setTasks(null);
    setError("");
    setActionError("");
    Promise.resolve().then(() => loadArchivedTasks(projectId ?? void 0)).then((list) => {
      if (!cancelled) setTasks(Array.isArray(list) ? list : []);
    }).catch((failure) => {
      if (!cancelled) setError(t("archivedTasksLoadError", { message: failure?.message ?? t("actionFailed") }));
    });
    return () => {
      cancelled = true;
    };
  }, [loadArchivedTasks, projectId, reloadToken, t]);
  const projectById = (0, import_react8.useMemo)(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const scopedProject = projectId ? projectById.get(projectId) ?? null : null;
  const query = search.trim().toLowerCase();
  const groups = (0, import_react8.useMemo)(() => {
    const list = Array.isArray(tasks) ? tasks : [];
    const matches = !query ? list : list.filter((task) => `${task.identifier ?? ""} ${task.title ?? ""}`.toLowerCase().includes(query));
    const grouped = /* @__PURE__ */ new Map();
    for (const task of matches) {
      if (!grouped.has(task.projectId)) grouped.set(task.projectId, []);
      grouped.get(task.projectId).push(task);
    }
    const projectOrder = new Map(projects.map((project, index) => [project.id, index]));
    const rank = (id) => projectOrder.has(id) ? projectOrder.get(id) : Number.MAX_SAFE_INTEGER;
    return [...grouped.entries()].sort(([left], [right]) => {
      const delta = rank(left) - rank(right);
      return delta !== 0 ? delta : String(left).localeCompare(String(right));
    }).map(([groupProjectId, groupTasks2]) => {
      const project = projectById.get(groupProjectId) ?? null;
      return {
        id: groupProjectId,
        name: project?.name ?? t("unknownProject"),
        archived: Boolean(project?.archivedAt),
        tasks: [...groupTasks2].sort((left, right) => {
          const archivedDelta = String(right.archivedAt ?? "").localeCompare(String(left.archivedAt ?? ""));
          return archivedDelta !== 0 ? archivedDelta : String(left.identifier ?? "").localeCompare(String(right.identifier ?? ""));
        })
      };
    });
  }, [tasks, query, projects, projectById, t]);
  const matchedCount = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const runAction = async (task, action) => {
    if (!task || busyId) return;
    setBusyId(task.id);
    setActionError("");
    try {
      if (action === "restore") await onRestoreTask?.(task);
      else await onDeleteTask?.(task);
      setPending(null);
      setReloadToken((value) => value + 1);
      focusSearch();
    } catch (failure) {
      if (mountedRef.current) setActionError(taskErrorText(failure, t));
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };
  return /* @__PURE__ */ import_react8.default.createElement(Modal, { title: t("archivedTasks"), t, onClose, layer, wide: true, busy }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-archive-toolbar" }, /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      ref: searchRef,
      className: "dkb-input",
      "data-autofocus": "true",
      type: "search",
      value: search,
      onChange: (event) => setSearch(event.target.value),
      placeholder: t("searchArchivedTasks"),
      "aria-label": t("searchArchivedTasks")
    }
  ), tasks !== null ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-archive-count", "aria-live": "polite" }, t("taskCount", { count: matchedCount })) : null), scopedProject ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-dialog-text dkb-muted" }, t("archivedTasksFor", { project: scopedProject.name }), scopedProject.archivedAt ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-badge dkb-archive-scope-badge" }, t("archived")) : null) : null, error ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, error) : null, actionError ? /* @__PURE__ */ import_react8.default.createElement(ErrorBanner, null, actionError) : null, tasks === null && !error ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-list-empty" }, t("loading")) : null, tasks !== null && tasks.length === 0 ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-list-empty" }, t("noArchivedTasks")) : null, tasks !== null && tasks.length > 0 && groups.length === 0 ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-list-empty" }, t("noArchivedTasksMatch")) : null, groups.map((group, groupIndex) => {
    const hintId = `${hintBaseId}-hint-${groupIndex}`;
    return /* @__PURE__ */ import_react8.default.createElement("section", { className: "dkb-archive-group", key: group.id, "aria-label": group.name }, /* @__PURE__ */ import_react8.default.createElement("header", { className: "dkb-archive-group-head" }, /* @__PURE__ */ import_react8.default.createElement("h3", { className: "dkb-archive-group-title" }, group.name), group.archived ? /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-badge" }, t("archived")) : null, /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-archive-group-count" }, t("taskCount", { count: group.tasks.length }))), group.archived ? /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-archive-group-hint", id: hintId }, t("restoreProjectFirst")) : null, /* @__PURE__ */ import_react8.default.createElement("ul", { className: "dkb-archive-list" }, group.tasks.map((task) => {
      const confirming = pending?.task.id === task.id ? pending.action : null;
      const locked = group.archived;
      const busyRow = busyId === task.id;
      const lockedTitle = locked ? t("restoreProjectFirst") : void 0;
      const describedBy = locked ? hintId : void 0;
      return /* @__PURE__ */ import_react8.default.createElement("li", { className: "dkb-archive-row", key: task.id }, /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-archive-open",
          onClick: () => onOpenTask?.(task),
          title: t("openTask")
        },
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-archive-identifier" }, task.identifier),
        /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-archive-title" }, task.title)
      ), confirming ? null : /* @__PURE__ */ import_react8.default.createElement("span", { className: "dkb-archive-row-actions" }, /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => setPending({ task, action: "restore" }),
          disabled: busy || locked,
          title: lockedTitle,
          "aria-describedby": describedBy
        },
        t("restoreTask")
      ), /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small dkb-button-danger",
          onClick: () => setPending({ task, action: "delete" }),
          disabled: busy || locked,
          title: lockedTitle,
          "aria-describedby": describedBy
        },
        t("deleteTaskPermanently")
      )), confirming ? /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-archive-confirm", role: "group", "aria-label": confirming === "delete" ? t("deleteTaskPermanently") : t("restoreTask") }, /* @__PURE__ */ import_react8.default.createElement("p", { className: "dkb-archive-confirm-text" }, confirming === "delete" ? t("deleteTaskConfirm") : t("restoreTaskConfirm")), /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-archive-confirm-actions" }, /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => {
            setPending(null);
            focusSearch();
          },
          disabled: busyRow
        },
        t("cancel")
      ), /* @__PURE__ */ import_react8.default.createElement(
        "button",
        {
          type: "button",
          className: confirming === "delete" ? "dkb-button dkb-button-small dkb-button-danger" : "dkb-button dkb-button-small dkb-button-primary",
          onClick: () => {
            void runAction(task, confirming);
          },
          disabled: busyRow
        },
        busyRow ? t("submitting") : confirming === "delete" ? t("delete") : t("restore")
      ))) : null);
    })));
  }), /* @__PURE__ */ import_react8.default.createElement("div", { className: "dkb-modal-actions" }, error ? /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", className: "dkb-button", onClick: () => setReloadToken((value) => value + 1) }, t("retry")) : null, /* @__PURE__ */ import_react8.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-primary",
      onClick: onClose,
      disabled: busy,
      "aria-disabled": busy || void 0
    },
    t("close")
  )));
}

// src/client/components/TaskDrawer.js
var EDITABLE_STATUSES = STATUSES.filter((status) => status !== "canceled");
var FOCUSABLE2 = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
var DEFAULT_CONTENT_TYPE = "application/octet-stream";
var FIELD_LABEL_KEYS = {
  title: "field_title",
  description: "field_description",
  status: "field_status",
  priority: "field_priority",
  labels: "field_labels",
  links: "field_links",
  blockedReason: "field_blockedReason",
  pendingQuestion: "field_pendingQuestion",
  questionResolution: "field_questionResolution",
  attachment: "field_attachment",
  archivedAt: "field_archivedAt"
};
function detailErrorText(error, t) {
  if (error?.code === "TASK_VERSION_CONFLICT") return t("versionConflictDetail");
  if (error?.code === "ATTACHMENT_TOO_LARGE") return t("attachmentTooLarge");
  if (error?.code === "ATTACHMENT_LIMIT_REACHED") return t("attachmentLimitReached");
  if (error?.code === "TASK_NOT_ARCHIVED") return t("taskNotArchived");
  if (error?.code === "NOT_FOUND") return t("actionFailed");
  return taskErrorText(error, t);
}
function newLinkId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `link-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function formatDateTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "";
  try {
    return new Date(parsed).toLocaleString(void 0, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return new Date(parsed).toLocaleString();
  }
}
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
function fieldLabel(field, t) {
  const key = FIELD_LABEL_KEYS[field];
  return key ? t(key) : field;
}
function Field2({ label, children, wide = false }) {
  return /* @__PURE__ */ import_react9.default.createElement("div", { className: `dkb-drawer-field${wide ? " dkb-drawer-field-wide" : ""}` }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-field-label" }, label), children);
}
function TaskDrawer({ taskId, projects = [], onClose, onChanged, onArchived, t }) {
  const titleId = (0, import_react9.useId)();
  const drawerRef = (0, import_react9.useRef)(null);
  const closeRef = (0, import_react9.useRef)(null);
  const returnFocusRef = (0, import_react9.useRef)(null);
  const fileInputRef = (0, import_react9.useRef)(null);
  const mountedRef = (0, import_react9.useRef)(true);
  const busyRef = (0, import_react9.useRef)(false);
  const [detail, setDetail] = (0, import_react9.useState)(null);
  const [loading, setLoading] = (0, import_react9.useState)(true);
  const [loadError, setLoadError] = (0, import_react9.useState)("");
  const [actionError, setActionError] = (0, import_react9.useState)("");
  const [reloadToken, setReloadToken] = (0, import_react9.useState)(0);
  const [busy, setBusy] = (0, import_react9.useState)(false);
  const [editingDescription, setEditingDescription] = (0, import_react9.useState)(false);
  const [descriptionDraft, setDescriptionDraft] = (0, import_react9.useState)("");
  const [blockerDraft, setBlockerDraft] = (0, import_react9.useState)("");
  const [labelDraft, setLabelDraft] = (0, import_react9.useState)("");
  const [linkLabel, setLinkLabel] = (0, import_react9.useState)("");
  const [linkUrl, setLinkUrl] = (0, import_react9.useState)("");
  const [linkError, setLinkError] = (0, import_react9.useState)("");
  const [questionPrompt, setQuestionPrompt] = (0, import_react9.useState)("");
  const [questionNote, setQuestionNote] = (0, import_react9.useState)("");
  const [questionOptions, setQuestionOptions] = (0, import_react9.useState)(["", ""]);
  const [requestError, setRequestError] = (0, import_react9.useState)("");
  const [commentDraft, setCommentDraft] = (0, import_react9.useState)("");
  const [uploading, setUploading] = (0, import_react9.useState)(false);
  const [uploadError, setUploadError] = (0, import_react9.useState)("");
  const [confirm, setConfirm] = (0, import_react9.useState)(null);
  const closeBlocked = Boolean(busy) || uploading;
  const task = detail?.task ?? null;
  const project = (0, import_react9.useMemo)(
    () => projects.find((item) => item.id === task?.projectId) ?? null,
    [projects, task?.projectId]
  );
  const projectArchived = Boolean(project?.archivedAt);
  const taskArchived = Boolean(task?.archivedAt);
  const readOnly = projectArchived || taskArchived;
  const controlsDisabled = Boolean(busy) || uploading || readOnly;
  const hasPendingQuestion = Boolean(task?.pendingQuestion) && !task?.questionResolution;
  const attention = task ? task.attentionReason ?? attentionReason(task) : null;
  const isReview = attention === "review" && !hasPendingQuestion;
  const labels = Array.isArray(task?.labels) ? task.labels : [];
  const links = Array.isArray(task?.links) ? task.links : [];
  const comments = Array.isArray(detail?.comments) ? detail.comments : [];
  const attachments = Array.isArray(detail?.attachments) ? detail.attachments : [];
  const activity = (0, import_react9.useMemo)(() => sortActivityDesc(detail?.activity), [detail?.activity]);
  (0, import_react9.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  (0, import_react9.useEffect)(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setActionError("");
    setDetail(null);
    api.taskDetail(taskId).then((data) => {
      if (cancelled) return;
      setDetail(data);
      setLoading(false);
    }).catch((failure) => {
      if (cancelled) return;
      setLoadError(t("taskDetailLoadError", { message: detailErrorText(failure, t) }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, taskId, t]);
  (0, import_react9.useEffect)(() => {
    setBlockerDraft(task?.blockedReason ?? "");
  }, [task?.blockedReason, taskId]);
  (0, import_react9.useEffect)(() => {
    if (!taskArchived) setConfirm(null);
  }, [taskArchived]);
  (0, import_react9.useLayoutEffect)(() => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    closeRef.current?.focus?.();
  }, []);
  (0, import_react9.useEffect)(() => () => {
    const target = returnFocusRef.current;
    if (target?.isConnected && typeof target.focus === "function") target.focus();
  }, []);
  (0, import_react9.useEffect)(() => {
    if (typeof document === "undefined") return void 0;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, []);
  const requestClose = () => {
    if (closeBlocked) return;
    onClose?.();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusable = [...drawer.querySelectorAll(FOCUSABLE2)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };
  const refreshDetail = (0, import_react9.useCallback)(async () => {
    try {
      const data = await api.taskDetail(taskId);
      if (mountedRef.current) setDetail(data);
      return true;
    } catch (failure) {
      if (mountedRef.current) setActionError(detailErrorText(failure, t));
      return false;
    }
  }, [taskId, t]);
  const mutate = (0, import_react9.useCallback)(async (action, options = {}) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    try {
      const result = await action();
      if (!mountedRef.current) return false;
      if (result && result.id === taskId && typeof result.version === "number") {
        setDetail((current) => current ? { ...current, task: result } : current);
      }
      if (!options.skipRefresh) await refreshDetail();
      if (!mountedRef.current) return false;
      options.onSuccess?.(result);
      onChanged?.();
      return true;
    } catch (failure) {
      if (!mountedRef.current) return false;
      setActionError(detailErrorText(failure, t));
      options.onError?.(failure);
      await refreshDetail();
      return false;
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [onChanged, refreshDetail, taskId, t]);
  const changeProperty = (field, value) => {
    if (!task || controlsDisabled) return void 0;
    return mutate(() => api.updateTask(task.id, { version: task.version, [field]: value }));
  };
  const addLabel = async () => {
    const label = labelDraft.trim();
    if (!label || !task || controlsDisabled) return;
    if (labels.includes(label)) {
      setLabelDraft("");
      return;
    }
    const ok = await mutate(() => api.updateTask(task.id, {
      version: task.version,
      labels: [...labels, label]
    }));
    if (ok) setLabelDraft("");
  };
  const removeLabel = async (label) => {
    if (!task || controlsDisabled) return;
    await mutate(() => api.updateTask(task.id, {
      version: task.version,
      labels: labels.filter((item) => item !== label)
    }));
  };
  const startDescriptionEdit = () => {
    setDescriptionDraft(task?.description ?? "");
    setEditingDescription(true);
  };
  const saveDescription = async () => {
    if (!task || controlsDisabled) return;
    const ok = await mutate(() => api.updateTask(task.id, {
      version: task.version,
      description: descriptionDraft
    }));
    if (ok) setEditingDescription(false);
  };
  const setBlocker = async () => {
    const reason = blockerDraft.trim();
    if (!task || !reason || controlsDisabled) return;
    await mutate(() => api.updateTask(task.id, { version: task.version, blockedReason: reason }));
  };
  const clearBlocker = async () => {
    if (!task || controlsDisabled || !task.blockedReason) return;
    await mutate(() => api.updateTask(task.id, { version: task.version, blockedReason: null }));
  };
  const addLink = async () => {
    const label = linkLabel.trim();
    const url = linkUrl.trim();
    if (!task || controlsDisabled) return;
    if (!label) {
      setLinkError(t("linkLabelRequired"));
      return;
    }
    if (!isHttpUrl(url)) {
      setLinkError(t("invalidLinkUrl"));
      return;
    }
    setLinkError("");
    const ok = await mutate(() => api.updateTask(task.id, {
      version: task.version,
      links: [...links, { id: newLinkId(), label, url }]
    }));
    if (ok) {
      setLinkLabel("");
      setLinkUrl("");
    }
  };
  const removeLink = async (linkId) => {
    if (!task || controlsDisabled) return;
    await mutate(() => api.updateTask(task.id, {
      version: task.version,
      links: links.filter((link) => link.id !== linkId)
    }));
  };
  const addOptionRow = () => {
    setQuestionOptions((current) => current.length >= 5 ? current : [...current, ""]);
  };
  const removeOptionRow = (index) => {
    setQuestionOptions((current) => current.length <= 2 ? current : current.filter((_, item) => item !== index));
  };
  const updateOptionRow = (index, value) => {
    setQuestionOptions((current) => current.map((item, position) => position === index ? value : item));
  };
  const submitQuestion = async (event) => {
    event.preventDefault();
    if (!task || controlsDisabled || hasPendingQuestion) return;
    const prompt = questionPrompt.trim();
    const cleanedOptions = questionOptions.map((option) => option.trim());
    if (!prompt) {
      setRequestError(t("requestPromptRequired"));
      return;
    }
    if (cleanedOptions.length < 2 || cleanedOptions.some((option) => !option)) {
      setRequestError(t("requestOptionsRequired"));
      return;
    }
    setRequestError("");
    const ok = await mutate(() => api.askQuestion(task.id, {
      version: task.version,
      prompt,
      note: questionNote,
      options: cleanedOptions.map((label, index) => ({ id: `option-${index + 1}`, label, detail: "" }))
    }));
    if (ok) {
      setQuestionPrompt("");
      setQuestionNote("");
      setQuestionOptions(["", ""]);
    }
  };
  const answerQuestion = async (currentTask, decision, selected, note) => {
    await mutate(() => api.answerQuestion(currentTask.id, {
      version: currentTask.version,
      decision,
      selected,
      note
    }));
  };
  const addComment = async (event) => {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body || !task || controlsDisabled) return;
    const ok = await mutate(() => api.addComment(task.id, { body }));
    if (ok) setCommentDraft("");
  };
  const removeComment = async (commentId) => {
    if (!task || controlsDisabled) return;
    await mutate(() => api.deleteComment(task.id, commentId));
  };
  const uploadFile = async (event) => {
    const file = event.target?.files?.[0];
    if (!file || !task || controlsDisabled) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setUploadError(t("attachmentTooLarge"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const data = await readFileAsBase64(file);
      await mutate(() => api.addAttachment(task.id, {
        filename: file.name,
        contentType: file.type || DEFAULT_CONTENT_TYPE,
        data
      }), {
        onError: (failure) => {
          if (mountedRef.current) setUploadError(detailErrorText(failure, t));
        }
      });
    } catch {
      if (mountedRef.current) setUploadError(t("attachmentReadFailed"));
    } finally {
      if (mountedRef.current) setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const removeAttachment = async (attachment) => {
    if (!task || controlsDisabled) return;
    await mutate(() => api.deleteAttachment(task.id, attachment.id));
  };
  const archiveTask = async () => {
    if (!task || busy || taskArchived || projectArchived) return;
    await mutate(() => api.archiveTask(task.id, { version: task.version }), {
      skipRefresh: true,
      onSuccess: () => onArchived?.()
    });
  };
  const restoreTask = async () => {
    if (!task || busy || !taskArchived || projectArchived) return;
    await mutate(() => api.restoreTask(task.id, { version: task.version }));
  };
  const deleteTask = async () => {
    if (!task || busy || !taskArchived || projectArchived) return;
    await mutate(() => api.deleteTask(task.id, { version: task.version }), {
      skipRefresh: true,
      onSuccess: () => onArchived?.()
    });
  };
  const projectName = project?.name ?? "";
  const updatedElapsed = task ? formatElapsed(task.updatedAt, Date.now(), t) : "";
  return /* @__PURE__ */ import_react9.default.createElement(
    "div",
    {
      className: "dkb-drawer-layer",
      onKeyDown,
      onClick: (event) => {
        if (event.target === event.currentTarget) requestClose();
      }
    },
    /* @__PURE__ */ import_react9.default.createElement(
      "aside",
      {
        className: "dkb-drawer",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "aria-busy": busy || void 0,
        ref: drawerRef
      },
      /* @__PURE__ */ import_react9.default.createElement("header", { className: "dkb-drawer-head" }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-head-main" }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-eyebrow" }, projectName ? /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-project" }, projectName) : null, task?.identifier ? /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-identifier" }, task.identifier) : null), /* @__PURE__ */ import_react9.default.createElement("h2", { className: "dkb-drawer-title", id: titleId }, task?.title ?? t("taskDetail")), /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-meta" }, task ? /* @__PURE__ */ import_react9.default.createElement("span", { className: `dkb-drawer-status dkb-status-${task.column ?? "backlog"}` }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-status-dot", "aria-hidden": "true" }), t(`status_${task.status}`)) : null, task && updatedElapsed ? /* @__PURE__ */ import_react9.default.createElement("span", null, t("updatedAgo", { elapsed: updatedElapsed })) : null, taskArchived ? /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-badge" }, t("archived")) : null, projectArchived && !taskArchived ? /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-badge" }, t("readOnly")) : null)), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-modal-close",
          onClick: requestClose,
          disabled: closeBlocked,
          "aria-disabled": closeBlocked || void 0,
          "aria-label": t("close"),
          title: t("close"),
          ref: closeRef
        },
        "\xD7"
      )),
      loading ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-state" }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-muted" }, t("loading"))) : null,
      !loading && loadError ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-state" }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-state-title" }, t("loadErrorTitle")), /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-muted", role: "alert" }, loadError), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-primary",
          onClick: () => setReloadToken((value) => value + 1)
        },
        t("retry")
      )) : null,
      !loading && task ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-body" }, actionError ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-form-error", role: "alert" }, actionError) : null, readOnly ? /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-notice" }, projectArchived ? t("projectArchivedNotice") : t("taskArchivedNotice")) : null, /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("properties") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("properties")), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-properties" }, /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("taskProject") }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-value" }, projectName || t("activityNone"))), /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("taskStatus") }, /* @__PURE__ */ import_react9.default.createElement(
        "select",
        {
          className: "dkb-select",
          value: task.status,
          onChange: (event) => {
            void changeProperty("status", event.target.value);
          },
          disabled: controlsDisabled,
          "aria-label": t("taskStatus")
        },
        EDITABLE_STATUSES.map((value) => /* @__PURE__ */ import_react9.default.createElement("option", { key: value, value }, t(`status_${value}`)))
      )), /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("taskPriority") }, /* @__PURE__ */ import_react9.default.createElement(
        "select",
        {
          className: "dkb-select",
          value: task.priority,
          onChange: (event) => {
            void changeProperty("priority", event.target.value);
          },
          disabled: controlsDisabled,
          "aria-label": t("taskPriority")
        },
        PRIORITIES.map((value) => /* @__PURE__ */ import_react9.default.createElement("option", { key: value, value }, t(`priority_${value}`)))
      )), /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("taskAssignee") }, /* @__PURE__ */ import_react9.default.createElement(
        "select",
        {
          className: "dkb-select",
          value: "current-user",
          disabled: true,
          title: t("assigneeOnlyCurrent"),
          "aria-label": t("taskAssignee")
        },
        /* @__PURE__ */ import_react9.default.createElement("option", { value: "current-user" }, task.assignee?.name || t("currentUser"))
      ), /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-field-hint" }, t("assigneeOnlyCurrent"))), /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("taskLabels"), wide: true }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-label-list" }, labels.length > 0 ? labels.map((label) => /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-chip dkb-label-chip", key: label }, label, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-drawer-label-remove",
          onClick: () => {
            void removeLabel(label);
          },
          disabled: controlsDisabled,
          "aria-label": t("removeLabel", { label }),
          title: t("removeLabel", { label })
        },
        "\xD7"
      ))) : /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-empty" }, t("noLabels"))), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline" }, /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          className: "dkb-input",
          value: labelDraft,
          onChange: (event) => setLabelDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void addLabel();
          },
          placeholder: t("labelPlaceholder"),
          "aria-label": t("addLabel"),
          disabled: controlsDisabled
        }
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => {
            void addLabel();
          },
          disabled: controlsDisabled || !labelDraft.trim()
        },
        t("add")
      ))))), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("taskDescription") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("taskDescription")), editingDescription ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-form" }, /* @__PURE__ */ import_react9.default.createElement(
        "textarea",
        {
          className: "dkb-textarea",
          value: descriptionDraft,
          onChange: (event) => setDescriptionDraft(event.target.value),
          rows: 4,
          disabled: controlsDisabled,
          "aria-label": t("taskDescription")
        }
      ), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline-actions" }, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => setEditingDescription(false),
          disabled: busy
        },
        t("cancel")
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small dkb-button-primary",
          onClick: () => {
            void saveDescription();
          },
          disabled: controlsDisabled
        },
        busy ? t("submitting") : t("save")
      ))) : /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-description" }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-text" }, task.description || t("noDescription")), !readOnly ? /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: startDescriptionEdit,
          disabled: busy
        },
        t("editDescription")
      ) : null)), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("blocker") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("blocker")), task.blockedReason ? /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-blocked" }, task.blockedReason) : /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-empty" }, t("notBlocked")), !readOnly ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline" }, /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          className: "dkb-input",
          value: blockerDraft,
          onChange: (event) => setBlockerDraft(event.target.value),
          placeholder: t("blockerPlaceholder"),
          "aria-label": t("blockedReasonLabel"),
          disabled: controlsDisabled
        }
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => {
            void setBlocker();
          },
          disabled: controlsDisabled || !blockerDraft.trim()
        },
        t("setBlocker")
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => {
            void clearBlocker();
          },
          disabled: controlsDisabled || !task.blockedReason
        },
        t("clearBlocker")
      )) : null), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("links") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("links")), links.length > 0 ? /* @__PURE__ */ import_react9.default.createElement("ul", { className: "dkb-drawer-list" }, links.map((link) => /* @__PURE__ */ import_react9.default.createElement("li", { className: "dkb-drawer-link-row", key: link.id }, /* @__PURE__ */ import_react9.default.createElement(
        "a",
        {
          className: "dkb-drawer-link",
          href: link.url,
          target: "_blank",
          rel: "noreferrer noopener",
          title: link.url
        },
        link.label
      ), !readOnly ? /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-icon-button dkb-drawer-row-action",
          onClick: () => {
            void removeLink(link.id);
          },
          disabled: controlsDisabled,
          "aria-label": t("removeLink"),
          title: t("removeLink")
        },
        "\xD7"
      ) : null))) : /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-empty" }, t("noLinks")), !readOnly ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-form" }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline" }, /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          className: "dkb-input",
          value: linkLabel,
          onChange: (event) => setLinkLabel(event.target.value),
          placeholder: t("linkLabel"),
          "aria-label": t("linkLabel"),
          disabled: controlsDisabled
        }
      ), /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          className: "dkb-input",
          value: linkUrl,
          onChange: (event) => setLinkUrl(event.target.value),
          placeholder: t("linkUrlPlaceholder"),
          "aria-label": t("linkUrl"),
          disabled: controlsDisabled,
          spellCheck: false
        }
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => {
            void addLink();
          },
          disabled: controlsDisabled || !linkLabel.trim() || !linkUrl.trim()
        },
        t("addLink")
      )), linkError ? /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-form-error", role: "alert" }, linkError) : null) : null), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("questionSection") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("questionSection")), hasPendingQuestion ? /* @__PURE__ */ import_react9.default.createElement(
        QuestionBlock,
        {
          task,
          t,
          onAnswer: answerQuestion,
          readOnly,
          namePrefix: "dkb-drawer-question"
        }
      ) : isReview ? /* @__PURE__ */ import_react9.default.createElement(
        ReviewBlock,
        {
          task,
          t,
          onAnswer: answerQuestion,
          readOnly
        }
      ) : null, !hasPendingQuestion && !readOnly ? /* @__PURE__ */ import_react9.default.createElement("form", { className: "dkb-drawer-form", onSubmit: submitQuestion, noValidate: true }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-form-title" }, t("requestInput")), /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("questionPrompt") }, /* @__PURE__ */ import_react9.default.createElement(
        "textarea",
        {
          className: "dkb-textarea",
          value: questionPrompt,
          onChange: (event) => setQuestionPrompt(event.target.value),
          placeholder: t("questionPromptPlaceholder"),
          rows: 2,
          disabled: controlsDisabled,
          "aria-label": t("questionPrompt")
        }
      )), /* @__PURE__ */ import_react9.default.createElement(Field2, { label: t("questionNote") }, /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          className: "dkb-input",
          value: questionNote,
          onChange: (event) => setQuestionNote(event.target.value),
          placeholder: t("questionNotePlaceholder"),
          "aria-label": t("questionNote"),
          disabled: controlsDisabled
        }
      )), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-options" }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-field-label" }, t("requestOptions")), questionOptions.map((option, index) => /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-option-row", key: `option-${index}` }, /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          className: "dkb-input",
          value: option,
          onChange: (event) => updateOptionRow(index, event.target.value),
          placeholder: t("optionPlaceholder", { index: index + 1 }),
          "aria-label": t("optionLabel", { index: index + 1 }),
          disabled: controlsDisabled
        }
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-icon-button dkb-drawer-row-action",
          onClick: () => removeOptionRow(index),
          disabled: controlsDisabled || questionOptions.length <= 2,
          "aria-label": t("removeOption", { index: index + 1 }),
          title: t("removeOption", { index: index + 1 })
        },
        "\xD7"
      ))), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline-actions" }, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: addOptionRow,
          disabled: controlsDisabled || questionOptions.length >= 5
        },
        t("addOption")
      ), /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-field-hint" }, t("requestOptionsHint")))), requestError ? /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-form-error", role: "alert" }, requestError) : null, /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline-actions" }, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "submit",
          className: "dkb-button dkb-button-small dkb-button-primary",
          disabled: controlsDisabled
        },
        busy ? t("submitting") : t("requestInputAction")
      ))) : null), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("comments") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("comments")), comments.length > 0 ? /* @__PURE__ */ import_react9.default.createElement("ul", { className: "dkb-drawer-list" }, comments.map((comment) => /* @__PURE__ */ import_react9.default.createElement("li", { className: "dkb-drawer-comment", key: comment.id }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-comment-head" }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-comment-author" }, comment.author?.name || ""), /* @__PURE__ */ import_react9.default.createElement("time", { className: "dkb-drawer-time", dateTime: comment.createdAt }, formatDateTime(comment.createdAt)), !readOnly ? /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-drawer-text-button",
          onClick: () => {
            void removeComment(comment.id);
          },
          disabled: controlsDisabled
        },
        t("deleteComment")
      ) : null), /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-comment-body" }, comment.body)))) : /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-empty" }, t("noComments")), !readOnly ? /* @__PURE__ */ import_react9.default.createElement("form", { className: "dkb-drawer-form", onSubmit: addComment }, /* @__PURE__ */ import_react9.default.createElement(
        "textarea",
        {
          className: "dkb-textarea",
          value: commentDraft,
          onChange: (event) => setCommentDraft(event.target.value),
          placeholder: t("commentPlaceholder"),
          rows: 2,
          "aria-label": t("commentPlaceholder"),
          disabled: controlsDisabled
        }
      ), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline-actions" }, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "submit",
          className: "dkb-button dkb-button-small dkb-button-primary",
          disabled: controlsDisabled || !commentDraft.trim()
        },
        t("addComment")
      ))) : null), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("attachments") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("attachments")), attachments.length > 0 ? /* @__PURE__ */ import_react9.default.createElement("ul", { className: "dkb-drawer-list" }, attachments.map((attachment) => /* @__PURE__ */ import_react9.default.createElement("li", { className: "dkb-drawer-attachment-row", key: attachment.id }, /* @__PURE__ */ import_react9.default.createElement(
        "a",
        {
          className: "dkb-drawer-attachment-name",
          href: attachmentHref(attachment.id),
          download: attachment.filename,
          title: t("downloadAttachment", { name: attachment.filename })
        },
        attachment.filename
      ), /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-time" }, formatBytes(attachment.size)), !readOnly ? /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-drawer-text-button",
          onClick: () => {
            void removeAttachment(attachment);
          },
          disabled: controlsDisabled
        },
        t("deleteAttachment")
      ) : null))) : /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-empty" }, t("noAttachments")), !readOnly ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-form" }, /* @__PURE__ */ import_react9.default.createElement("label", { className: "dkb-drawer-upload" }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-button dkb-button-small" }, uploading ? t("uploading") : t("uploadAttachment")), /* @__PURE__ */ import_react9.default.createElement(
        "input",
        {
          ref: fileInputRef,
          type: "file",
          className: "dkb-drawer-file-input",
          onChange: (event) => {
            void uploadFile(event);
          },
          disabled: controlsDisabled || uploading
        }
      )), uploadError ? /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-form-error", role: "alert" }, uploadError) : null, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-field-hint" }, t("attachmentLimitHint"))) : null), /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section", "aria-label": t("activity") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("activity")), activity.length > 0 ? /* @__PURE__ */ import_react9.default.createElement("ul", { className: "dkb-drawer-list dkb-drawer-activity" }, activity.map((event) => /* @__PURE__ */ import_react9.default.createElement("li", { className: "dkb-drawer-activity-item", key: event.id }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-activity-head" }, /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-comment-author" }, event.actor?.name || ""), /* @__PURE__ */ import_react9.default.createElement("time", { className: "dkb-drawer-time", dateTime: event.createdAt }, formatDateTime(event.createdAt))), /* @__PURE__ */ import_react9.default.createElement("ul", { className: "dkb-drawer-changes" }, (Array.isArray(event.changes) ? event.changes : []).map((change, index) => /* @__PURE__ */ import_react9.default.createElement(
        "li",
        {
          className: "dkb-drawer-change",
          key: `${event.id}-${index}`
        },
        /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-change-field" }, fieldLabel(change.field, t)),
        /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-change-before" }, formatActivityValue(change.field, change.before, t)),
        /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-change-arrow", "aria-hidden": "true" }, "\u2192"),
        /* @__PURE__ */ import_react9.default.createElement("span", { className: "dkb-drawer-change-after" }, formatActivityValue(change.field, change.after, t))
      )))))) : /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-empty" }, t("noActivity"))), !projectArchived ? /* @__PURE__ */ import_react9.default.createElement("section", { className: "dkb-drawer-section dkb-drawer-actions", "aria-label": t("taskActions") }, /* @__PURE__ */ import_react9.default.createElement("h3", { className: "dkb-drawer-section-title" }, t("taskActions")), !taskArchived && !projectArchived ? /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => setConfirm("archive"),
          disabled: busy
        },
        t("archiveTask")
      ) : null, taskArchived && !projectArchived ? /* @__PURE__ */ import_react9.default.createElement(import_react9.default.Fragment, null, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => {
            void restoreTask();
          },
          disabled: busy
        },
        t("restoreTask")
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small dkb-button-danger",
          onClick: () => setConfirm("delete"),
          disabled: busy
        },
        t("deleteTaskPermanently")
      )) : null, confirm === "archive" ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-confirm", role: "group", "aria-label": t("archiveTask") }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-confirm-text" }, t("archiveTaskConfirm")), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline-actions" }, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => setConfirm(null),
          disabled: busy
        },
        t("cancel")
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small dkb-button-primary",
          onClick: () => {
            void archiveTask();
          },
          disabled: busy
        },
        busy ? t("submitting") : t("archive")
      ))) : null, confirm === "delete" ? /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-confirm", role: "group", "aria-label": t("deleteTaskPermanently") }, /* @__PURE__ */ import_react9.default.createElement("p", { className: "dkb-drawer-confirm-text" }, t("deleteTaskConfirm")), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dkb-drawer-inline-actions" }, /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small",
          onClick: () => setConfirm(null),
          disabled: busy
        },
        t("cancel")
      ), /* @__PURE__ */ import_react9.default.createElement(
        "button",
        {
          type: "button",
          className: "dkb-button dkb-button-small dkb-button-danger",
          onClick: () => {
            void deleteTask();
          },
          disabled: busy
        },
        busy ? t("submitting") : t("delete")
      ))) : null) : null) : null
    )
  );
}

// src/client/styles.css
var styles_default = `.dkb {
  --dkb-surface: var(--dsw-alias-bg-base, var(--dsw-static-neutral-bluish-00));
  --dkb-panel: var(--dsw-alias-bg-layer-1, var(--dsw-static-neutral-bluish-00));
  --dkb-border: var(--dsw-alias-border-l2, #e4e4e7);
  --dkb-border-strong: var(--dsw-alias-border-l3, #d4d4d8);
  --dkb-text: var(--dsw-alias-label-primary, #18181b);
  --dkb-text-muted: var(--dsw-alias-label-secondary, #6b7280);
  --dkb-hover: var(--dsw-alias-interactive-bg-hover, #f4f4f5);
  --dkb-brand: var(--dsw-alias-brand-primary, #2f6fed);
  --dkb-danger: var(--dsw-alias-state-error-primary, #b42318);
  --dkb-warn: var(--dsw-alias-state-warn-primary, #b45309);
  --dkb-success: var(--dsw-alias-state-success-primary, #16794c);
  --dkb-radius-sm: var(--dsw-radius-sm, 6px);
  --dkb-radius-md: var(--dsw-radius-md, 10px);
  --dkb-radius-lg: var(--dsw-radius-lg, 14px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dkb-surface);
  color: var(--dkb-text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.45;
}

.dkb *,
.dkb *::before,
.dkb *::after {
  box-sizing: border-box;
}

.dkb button,
.dkb input,
.dkb select,
.dkb textarea {
  font: inherit;
}

.dkb button {
  cursor: pointer;
}

.dkb button:disabled {
  cursor: default;
  opacity: 0.55;
}

.dkb button:focus-visible,
.dkb input:focus-visible,
.dkb select:focus-visible,
.dkb textarea:focus-visible {
  outline: 2px solid var(--dkb-brand);
  outline-offset: 2px;
}

.dkb-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--dkb-border);
  background: var(--dkb-panel);
  flex: none;
}

.dkb-switcher {
  position: relative;
  flex: none;
}

.dkb-project-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  padding: 6px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  color: var(--dkb-text);
}

.dkb-project-trigger:hover {
  background: var(--dkb-hover);
}

.dkb-project-trigger-archived .dkb-project-mark {
  background: var(--dkb-warn);
}

.dkb-project-mark {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 2px;
  background: var(--dkb-brand);
}

.dkb-project-trigger-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 550;
}

.dkb-project-trigger-chevron {
  display: inline-flex;
  flex: none;
  color: var(--dkb-text-muted);
}

.dkb-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  min-width: 270px;
  max-height: min(440px, 65vh);
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  box-shadow: var(--dsw-shadow-lv2, 0 10px 28px rgb(0 0 0 / 18%));
}

.dkb-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--dkb-radius-sm);
  background: transparent;
  color: var(--dkb-text);
  text-align: left;
}

.dkb-menu-item:hover {
  background: var(--dkb-hover);
}

.dkb-menu-item[aria-checked="true"] {
  color: var(--dkb-brand);
}

.dkb-menu-item-check {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 14px;
  flex: none;
  color: var(--dkb-brand);
}

.dkb-menu-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dkb-menu-item-count {
  flex: none;
  color: var(--dkb-text-muted);
  font-size: 12px;
}

.dkb-menu-section {
  padding: 8px 8px 4px;
  color: var(--dkb-text-muted);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dkb-menu-empty {
  padding: 6px 8px 10px;
  color: var(--dkb-text-muted);
  font-size: 13px;
}

.dkb-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--dkb-border);
}

.dkb-search {
  position: relative;
  flex: 1 1 220px;
  max-width: 460px;
  min-width: 160px;
}

.dkb-search-icon {
  position: absolute;
  top: 50%;
  left: 10px;
  display: inline-flex;
  color: var(--dkb-text-muted);
  transform: translateY(-50%);
  pointer-events: none;
}

.dkb-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  color: var(--dkb-text);
}

.dkb-input::placeholder {
  color: var(--dkb-text-muted);
}

.dkb-input:hover {
  border-color: var(--dkb-border-strong);
}

.dkb-search-input {
  padding-left: 30px;
}

.dkb-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  color: var(--dkb-text);
  white-space: nowrap;
}

.dkb-button:hover:not(:disabled) {
  background: var(--dkb-hover);
}

.dkb-button-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, var(--dkb-brand));
  color: var(--dsw-alias-label-primary-inverted);
}

.dkb-button-primary:hover:not(:disabled) {
  background: color-mix(
    in srgb,
    var(--dsw-alias-button-primary-fill, var(--dkb-brand)) 80%,
    var(--dsw-alias-button-primary-hover, var(--dkb-brand))
  );
}

.dkb-button-ghost {
  background: transparent;
}

.dkb-button-small {
  padding: 4px 8px;
  font-size: 12px;
}

.dkb-button-danger {
  border-color: color-mix(in srgb, var(--dkb-danger) 35%, transparent);
  background: transparent;
  color: var(--dkb-danger);
}

.dkb-button-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dkb-danger) 10%, transparent);
}

.dkb-filters {
  flex: none;
}

.dkb-running {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--dkb-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.dkb-running-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dkb-success);
}

.dkb-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: var(--dkb-radius-sm);
  background: transparent;
  color: var(--dkb-text-muted);
}

.dkb-icon-button:hover:not(:disabled) {
  background: var(--dkb-hover);
  color: var(--dkb-text);
}

.dkb-spin {
  animation: dkb-spin 0.9s linear infinite;
}

@keyframes dkb-spin {
  to { transform: rotate(360deg); }
}

.dkb-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 18px 0;
  padding: 9px 12px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  flex: none;
}

.dkb-banner-error {
  border-color: color-mix(in srgb, var(--dkb-danger) 35%, transparent);
  color: var(--dkb-danger);
}

.dkb-banner-readonly {
  border-color: color-mix(in srgb, var(--dkb-warn) 30%, var(--dkb-border));
  background: color-mix(in srgb, var(--dkb-warn) 7%, var(--dkb-panel));
}

.dkb-banner-text {
  flex: 1;
  min-width: 0;
}

.dkb-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 20px 24px;
}

.dkb-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 320px;
  padding: 32px;
  text-align: center;
}

.dkb-state-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.dkb-muted {
  margin: 0;
  color: var(--dkb-text-muted);
}

.dkb-board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.dkb-board-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dkb-board-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.dkb-board-meta {
  margin: 2px 0 0;
  color: var(--dkb-text-muted);
  font-size: 12px;
}

.dkb-board-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 12px;
  border: 1px dashed var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  color: var(--dkb-text-muted);
  font-size: 12px;
}

.dkb-columns {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-height: 360px;
  padding-bottom: 6px;
  overflow-x: auto;
}

.dkb-column {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 210px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-lg);
  background: var(--dkb-panel);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.dkb-tone-backlog {
  background: color-mix(in srgb, var(--dkb-text-muted) 6%, var(--dkb-panel));
}

.dkb-tone-running {
  background: color-mix(in srgb, var(--dkb-brand) 8%, var(--dkb-panel));
  border-color: color-mix(in srgb, var(--dkb-brand) 22%, var(--dkb-border));
}

.dkb-tone-needs {
  background: color-mix(in srgb, var(--dkb-warn) 9%, var(--dkb-panel));
  border-color: color-mix(in srgb, var(--dkb-warn) 24%, var(--dkb-border));
}

.dkb-tone-done {
  background: color-mix(in srgb, var(--dkb-success) 8%, var(--dkb-panel));
  border-color: color-mix(in srgb, var(--dkb-success) 22%, var(--dkb-border));
}

.dkb-column-drop-target {
  border-color: color-mix(in srgb, var(--dkb-brand) 55%, var(--dkb-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dkb-brand) 20%, transparent);
}

.dkb-column-drop-invalid {
  border-color: color-mix(in srgb, var(--dkb-danger) 55%, var(--dkb-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dkb-danger) 16%, transparent);
}

.dkb-column-head {
  display: flex;
  align-items: center;
  flex: none;
  gap: 7px;
  padding: 11px 10px 8px;
}

.dkb-column-icon {
  display: inline-flex;
  flex: none;
  color: var(--dkb-text-muted);
}

.dkb-column-icon-running {
  color: var(--dkb-brand);
}

.dkb-column-icon-needs {
  color: var(--dkb-warn);
}

.dkb-column-icon-done {
  color: var(--dkb-success);
}

.dkb-column-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.dkb-column-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dkb-hover);
  color: var(--dkb-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dkb-column-toggle,
.dkb-column-add {
  width: 24px;
  height: 24px;
  flex: none;
}

.dkb-column-add {
  margin-left: auto;
}

.dkb-column-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 88px;
  padding: 2px 8px 8px;
}

.dkb-column-empty {
  margin: 0;
  padding: 18px 8px;
  border: 1px dashed var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  color: var(--dkb-text-muted);
  font-size: 12px;
  text-align: center;
}

.dkb-column-foot {
  flex: none;
  padding: 4px 8px 8px;
}

.dkb-new-card {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 8px;
  border: 1px dashed transparent;
  border-radius: var(--dkb-radius-sm);
  background: transparent;
  color: var(--dkb-text-muted);
  font-size: 12px;
  text-align: left;
}

.dkb-new-card:hover:not(:disabled) {
  border-color: var(--dkb-border-strong);
  background: var(--dkb-panel);
  color: var(--dkb-text);
}

.dkb-column-collapsed {
  flex: 0 0 50px;
  align-items: center;
  gap: 8px;
  min-width: 50px;
  max-width: 50px;
  padding: 8px 0;
}

.dkb-collapsed-toggle {
  width: 24px;
  height: 24px;
  flex: none;
}

.dkb-collapsed-icon {
  display: inline-flex;
  color: var(--dkb-text-muted);
}

.dkb-collapsed-count {
  color: var(--dkb-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dkb-collapsed-label {
  color: var(--dkb-text);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.dkb-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  box-shadow: var(--dsw-shadow-lv1);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.dkb-card:hover {
  border-color: var(--dkb-border-strong);
  box-shadow: var(--dsw-shadow-lv2);
}

.dkb-card-drop-before {
  position: relative;
}

.dkb-card-drop-before::before {
  position: absolute;
  top: -5px;
  right: -1px;
  left: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--dkb-brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dkb-brand) 18%, transparent);
  content: '';
}

.dkb-card-attention {
  border-color: color-mix(in srgb, var(--dkb-warn) 32%, var(--dkb-border));
}

.dkb-card-selected {
  border-color: var(--dkb-brand);
  box-shadow: 0 0 0 1px var(--dkb-brand);
}

.dkb-card[draggable="true"] {
  cursor: grab;
}

.dkb-card[draggable="true"]:active {
  cursor: grabbing;
}

.dkb-card-top {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.dkb-card-title {
  display: block;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dkb-text);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
}

.dkb-card-title:hover .dkb-card-title-text {
  color: var(--dkb-brand);
}

.dkb-card-identifier {
  display: inline-block;
  margin-right: 6px;
  color: var(--dkb-text-muted);
  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10.5px;
  font-weight: 500;
}

.dkb-card-title-text {
  overflow-wrap: anywhere;
}

.dkb-card-open {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: var(--dkb-radius-sm);
  background: transparent;
  color: var(--dkb-text-muted);
}

.dkb-card-open:hover {
  background: var(--dkb-hover);
  color: var(--dkb-text);
}

.dkb-card-desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--dkb-text-muted);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.dkb-card-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.dkb-chip {
  max-width: 100%;
  padding: 2px 7px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: var(--dkb-hover);
  color: var(--dkb-text-muted);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

button.dkb-chip:hover {
  background: color-mix(in srgb, var(--dkb-text-muted) 16%, transparent);
}

.dkb-chip-project {
  background: color-mix(in srgb, var(--dkb-brand) 12%, transparent);
  color: var(--dkb-brand);
}

button.dkb-chip-project:hover {
  background: color-mix(in srgb, var(--dkb-brand) 20%, transparent);
}

.dkb-label-chip {
  border: 1px solid var(--dkb-border);
  background: transparent;
}

.dkb-priority-none {
  background: var(--dkb-hover);
  color: var(--dkb-text-muted);
}

.dkb-priority-low {
  background: color-mix(in srgb, var(--dkb-success) 14%, transparent);
  color: var(--dkb-success);
}

.dkb-priority-medium {
  background: color-mix(in srgb, var(--dkb-brand) 14%, transparent);
  color: var(--dkb-brand);
}

.dkb-priority-high {
  background: color-mix(in srgb, var(--dkb-warn) 15%, transparent);
  color: var(--dkb-warn);
}

.dkb-priority-urgent {
  background: color-mix(in srgb, var(--dkb-danger) 15%, transparent);
  color: var(--dkb-danger);
}

.dkb-card-activity {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  color: var(--dkb-text-muted);
  font-size: 11px;
}

.dkb-card-blocker {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-warn) 11%, transparent);
  color: var(--dkb-warn);
  font-size: 11.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dkb-question,
.dkb-review {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--dkb-warn) 30%, transparent);
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-warn) 7%, var(--dkb-panel));
}

.dkb-question-prompt,
.dkb-review-prompt {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  color: var(--dkb-warn);
  font-size: 11.5px;
  font-weight: 600;
}

.dkb-question-text {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dkb-question-context {
  margin: 0;
  color: var(--dkb-text-muted);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dkb-question-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}

.dkb-question-option {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.35;
  cursor: pointer;
}

.dkb-question-option input {
  margin: 2px 0 0;
  accent-color: var(--dkb-brand);
}

.dkb-question-option-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.dkb-question-option-label {
  overflow-wrap: anywhere;
}

.dkb-question-option-detail {
  color: var(--dkb-text-muted);
  font-size: 10.5px;
  overflow-wrap: anywhere;
}

.dkb-input-small {
  padding: 4px 7px;
  font-size: 11.5px;
}

.dkb-question-hint {
  margin: 0;
  color: var(--dkb-text-muted);
  font-size: 10.5px;
}

.dkb-question-actions,
.dkb-review-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.dkb-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--dkb-border);
}

.dkb-card-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--dkb-text-muted);
  font-size: 10.5px;
  white-space: nowrap;
}

.dkb-card-status-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.dkb-status-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}

.dkb-status-running {
  color: var(--dkb-brand);
}

.dkb-status-needs,
.dkb-status-attention {
  color: var(--dkb-warn);
}

.dkb-status-done {
  color: var(--dkb-success);
}

.dkb-card-timer {
  color: var(--dkb-text-muted);
  font-variant-numeric: tabular-nums;
}

.dkb-card-metrics {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
}

.dkb-metric {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--dkb-radius-sm);
  background: transparent;
  color: var(--dkb-text-muted);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.dkb-metric:hover {
  background: var(--dkb-hover);
  color: var(--dkb-text);
}

.dkb-filters-wrap {
  position: relative;
  flex: none;
}

.dkb-filters {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dkb-filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dkb-brand);
  color: var(--dsw-alias-label-primary-inverted, var(--dkb-panel));
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dkb-filter-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 240px;
  padding: 12px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  box-shadow: var(--dsw-shadow-lv2);
}

.dkb-filter-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.dkb-filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dkb-filter-label {
  color: var(--dkb-text-muted);
  font-size: 11px;
}

.dkb-filter-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.dkb-select,
.dkb-textarea {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  color: var(--dkb-text);
}

.dkb-select:hover,
.dkb-textarea:hover {
  border-color: var(--dkb-border-strong);
}

.dkb-textarea {
  min-height: 72px;
  resize: vertical;
}

.dkb-field-hint {
  color: var(--dkb-text-muted);
  font-size: 11px;
}

.dkb-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 2000;
  max-width: min(540px, calc(100vw - 32px));
  padding: 9px 14px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-md);
  background: var(--dkb-panel);
  color: var(--dkb-text);
  box-shadow: var(--dsw-shadow-lv3);
  font-size: 12.5px;
  line-height: 1.4;
  transform: translateX(-50%);
}

.dkb-toast-error {
  border-color: color-mix(in srgb, var(--dkb-danger) 40%, transparent);
  color: var(--dkb-danger);
}

.dkb-toast-info {
  border-color: color-mix(in srgb, var(--dkb-brand) 40%, transparent);
  color: var(--dkb-brand);
}

.dkb-modal-layer {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--dsw-alias-bg-mask-1, rgb(15 23 42 / 45%));
  backdrop-filter: blur(var(--dsw-mask-blur, 0px));
}

.dkb-modal {
  display: flex;
  flex-direction: column;
  width: min(480px, 100%);
  max-height: calc(100vh - 48px);
  padding: 18px 20px 20px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-lg);
  background: var(--dkb-panel);
  box-shadow: var(--dsw-shadow-lv3, 0 24px 60px rgb(0 0 0 / 24%));
}

.dkb-modal-wide {
  width: min(680px, 100%);
}

.dkb-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: none;
}

.dkb-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.dkb-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: var(--dkb-radius-sm);
  background: transparent;
  color: var(--dkb-text-muted);
  font-size: 19px;
  line-height: 1;
}

.dkb-modal-close:hover {
  background: var(--dkb-hover);
  color: var(--dkb-text);
}

.dkb-modal-body {
  min-height: 0;
  overflow: auto;
}

.dkb-form {
  display: flex;
  flex-direction: column;
}

.dkb-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 14px;
}

.dkb-field-label {
  color: var(--dkb-text-muted);
  font-size: 12px;
}

.dkb-form-error {
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--dkb-danger) 35%, transparent);
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-danger) 8%, transparent);
  color: var(--dkb-danger);
  font-size: 12px;
}

.dkb-modal-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.dkb-dialog-text {
  margin: 14px 0 0;
  color: var(--dkb-text);
}

.dkb-warning {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-warn) 10%, transparent);
  color: var(--dkb-warn);
  font-size: 12px;
}

.dkb-tabs {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  border-bottom: 1px solid var(--dkb-border);
}

.dkb-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dkb-text-muted);
}

.dkb-tab[aria-selected="true"] {
  border-bottom-color: var(--dkb-brand);
  color: var(--dkb-text);
  font-weight: 550;
}

.dkb-tab-count {
  color: var(--dkb-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dkb-list-empty {
  margin: 18px 0;
  padding: 18px;
  border: 1px dashed var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
  color: var(--dkb-text-muted);
  text-align: center;
}

.dkb-project-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  max-height: 42vh;
  overflow: auto;
  list-style: none;
}

.dkb-project-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
}

.dkb-project-row-main {
  flex: 1 1 200px;
  min-width: 0;
}

.dkb-project-row-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dkb-project-row-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 550;
}

.dkb-project-row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-top: 2px;
  color: var(--dkb-text-muted);
  font-size: 12px;
}

.dkb-project-row-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

.dkb-project-row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.dkb-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dkb-hover);
  color: var(--dkb-text-muted);
  font-size: 11px;
  font-weight: 500;
}

.dkb-badge-archived {
  background: color-mix(in srgb, var(--dkb-warn) 14%, transparent);
  color: var(--dkb-warn);
}

.dkb-archive-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.dkb-archive-toolbar .dkb-input {
  flex: 1;
  min-width: 0;
}

.dkb-archive-count {
  flex: none;
  color: var(--dkb-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.dkb-archive-scope-badge {
  margin-left: 8px;
  vertical-align: middle;
}

.dkb-archive-group + .dkb-archive-group {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--dkb-border);
}

.dkb-archive-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 6px;
  padding: 0 2px;
}

.dkb-archive-group-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--dkb-text);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dkb-archive-group-count {
  margin-left: auto;
  flex: none;
  color: var(--dkb-text-muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.dkb-archive-group-hint {
  margin: 0 0 6px;
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, var(--dkb-warn) 26%, transparent);
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-warn) 8%, transparent);
  color: var(--dkb-warn);
  font-size: 11.5px;
  line-height: 1.4;
}

.dkb-archive-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dkb-archive-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
  background: var(--dkb-panel);
}

.dkb-archive-open {
  display: flex;
  align-items: baseline;
  flex: 1 1 220px;
  gap: 10px;
  min-width: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--dkb-text);
  text-align: left;
}

.dkb-archive-open:hover .dkb-archive-title {
  color: var(--dkb-brand);
}

.dkb-archive-identifier {
  flex: none;
  color: var(--dkb-text-muted);
  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.dkb-archive-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dkb-archive-row-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.dkb-archive-confirm {
  display: flex;
  flex: 1 0 100%;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--dkb-radius-sm);
  background: var(--dkb-hover);
}

.dkb-archive-confirm-text {
  margin: 0;
  font-size: 12.5px;
}

.dkb-archive-confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}

/* Task drawer */
.dkb-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  justify-content: flex-end;
  background: var(--dsw-alias-bg-mask-1, rgb(15 23 42 / 45%));
  backdrop-filter: blur(var(--dsw-mask-blur, 0px));
}

.dkb-drawer {
  display: flex;
  flex-direction: column;
  width: min(560px, 100vw);
  height: 100%;
  min-height: 0;
  border-left: 1px solid var(--dkb-border);
  background: var(--dkb-panel);
  box-shadow: var(--dsw-shadow-lv3);
  animation: dkb-drawer-in 0.16s ease-out;
}

@keyframes dkb-drawer-in {
  from {
    opacity: 0.6;
    transform: translateX(24px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.dkb-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--dkb-border);
}

.dkb-drawer-head-main {
  min-width: 0;
}

.dkb-drawer-eyebrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  color: var(--dkb-text-muted);
  font-size: 11.5px;
}

.dkb-drawer-identifier {
  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.dkb-drawer-title {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
}

.dkb-drawer-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0 0;
  color: var(--dkb-text-muted);
  font-size: 11.5px;
}

.dkb-drawer-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dkb-drawer-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px;
  text-align: center;
}

.dkb-drawer-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 18px 28px;
  overflow: auto;
}

.dkb-drawer-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--dkb-border);
}

.dkb-drawer-section:last-child {
  border-bottom: 0;
}

.dkb-drawer-section-title {
  margin: 0 0 10px;
  color: var(--dkb-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.dkb-drawer-notice {
  margin: 12px 0 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--dkb-warn) 30%, transparent);
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-warn) 8%, transparent);
  color: var(--dkb-warn);
  font-size: 12px;
}

.dkb-drawer-properties {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.dkb-drawer-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.dkb-drawer-field-wide {
  grid-column: 1 / -1;
}

.dkb-drawer-field-label {
  color: var(--dkb-text-muted);
  font-size: 11.5px;
}

.dkb-drawer-value {
  margin: 0;
  padding: 7px 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.dkb-drawer-inline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dkb-drawer-inline .dkb-input {
  flex: 1 1 160px;
  min-width: 0;
}

.dkb-drawer-inline-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.dkb-drawer-label-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 22px;
}

.dkb-drawer-label-remove {
  margin-left: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1;
}

.dkb-drawer-description {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.dkb-drawer-text {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.55;
}

.dkb-drawer-blocked {
  margin: 0 0 8px;
  padding: 7px 9px;
  overflow-wrap: anywhere;
  border-radius: var(--dkb-radius-sm);
  background: color-mix(in srgb, var(--dkb-warn) 11%, transparent);
  color: var(--dkb-warn);
  font-size: 12.5px;
}

.dkb-drawer-empty {
  margin: 0;
  color: var(--dkb-text-muted);
  font-size: 12px;
}

.dkb-drawer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dkb-drawer-link-row,
.dkb-drawer-attachment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
}

.dkb-drawer-link,
.dkb-drawer-attachment-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--dkb-brand);
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}

.dkb-drawer-link:hover,
.dkb-drawer-attachment-name:hover {
  text-decoration: underline;
}

.dkb-drawer-row-action {
  width: 22px;
  height: 22px;
  flex: none;
  font-size: 15px;
}

.dkb-drawer-text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dkb-text-muted);
  font-size: 11.5px;
}

.dkb-drawer-text-button:hover:not(:disabled) {
  color: var(--dkb-danger);
}

.dkb-drawer-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.dkb-drawer-form-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.dkb-drawer-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dkb-drawer-option-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dkb-drawer-option-row .dkb-input {
  flex: 1;
  min-width: 0;
}

.dkb-drawer-comment {
  padding: 8px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
}

.dkb-drawer-comment-head,
.dkb-drawer-activity-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dkb-drawer-comment-author {
  font-size: 12px;
  font-weight: 600;
}

.dkb-drawer-time {
  color: var(--dkb-text-muted);
  font-size: 11px;
}

.dkb-drawer-comment-head .dkb-drawer-text-button {
  margin-left: auto;
}

.dkb-drawer-comment-body {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 12.5px;
  line-height: 1.45;
}

.dkb-drawer-upload {
  position: relative;
  display: inline-flex;
  align-self: flex-start;
}

.dkb-drawer-upload .dkb-button {
  pointer-events: none;
}

.dkb-drawer-file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.dkb-drawer-file-input:disabled {
  cursor: default;
}

.dkb-drawer-activity-item {
  padding: 8px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
}

.dkb-drawer-changes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 5px 0 0;
  padding: 0;
  list-style: none;
}

.dkb-drawer-change {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 11.5px;
  line-height: 1.4;
}

.dkb-drawer-change-field {
  color: var(--dkb-text-muted);
}

.dkb-drawer-change-before {
  overflow-wrap: anywhere;
  color: var(--dkb-text-muted);
  text-decoration: line-through;
}

.dkb-drawer-change-arrow {
  color: var(--dkb-text-muted);
}

.dkb-drawer-change-after {
  overflow-wrap: anywhere;
}

.dkb-drawer-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.dkb-drawer-confirm {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--dkb-border);
  border-radius: var(--dkb-radius-sm);
  background: var(--dkb-hover);
}

.dkb-drawer-confirm-text {
  margin: 0;
  font-size: 12.5px;
}

.dkb-drawer-confirm .dkb-drawer-inline-actions {
  align-self: flex-end;
  margin-top: 2px;
}

@media (max-width: 720px) {
  .dkb-header {
    padding: 10px 12px;
  }

  .dkb-main {
    padding: 14px 12px 18px;
  }

  .dkb-column {
    flex: 0 0 230px;
  }

  .dkb-running {
    margin-left: 0;
  }


  .dkb-modal-layer {
    padding: 12px;
  }

  .dkb-drawer-properties {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dkb-spin,
  .dkb-drawer {
    animation: none;
  }
}

/*
 * The DSH shell overlays a compact sidebar rail over the main column when the
 * sidebar is collapsed. App measures the live rail and writes --dkb-rail-safe
 * on .dkb; this keeps the project switcher and board heading clear even when
 * the desktop client uses a different rail width from the web build.
 */
.dkb[data-sidebar-collapsed="true"] .dkb-header,
.dkb[data-sidebar-collapsed="true"] .dkb-main {
  padding-left: var(--dkb-rail-safe, 54px);
}
`;

// src/client/components/App.js
var ALL_PROJECTS = "__all__";
var COLLAPSED_STORAGE_KEY = "dsh-kanban.collapsed-columns";
var EMPTY_FILTERS = { projectId: "", priority: "", label: "", assignee: "" };
var COLUMN_ID_SET2 = new Set(COLUMN_IDS);
var DROP_REASON_KEYS = {
  "Needs you is automatic": "dropNeedsAutomatic",
  "Resolve attention before moving": "dropResolveAttention",
  "Resolve attention before Done": "dropResolveBeforeDone"
};
function loadCollapsedColumns() {
  if (typeof window === "undefined") return {};
  try {
    return parseCollapsedColumns(window.localStorage.getItem(COLLAPSED_STORAGE_KEY));
  } catch {
    return {};
  }
}
function SearchIcon() {
  return /* @__PURE__ */ import_react10.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react10.default.createElement("circle", { cx: "6.1", cy: "6.1", r: "4.1", stroke: "currentColor", strokeWidth: "1.4" }), /* @__PURE__ */ import_react10.default.createElement("path", { d: "m9.2 9.2 2.4 2.4", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }));
}
function RefreshIcon({ spinning }) {
  return /* @__PURE__ */ import_react10.default.createElement("svg", { className: spinning ? "dkb-spin" : void 0, width: "15", height: "15", viewBox: "0 0 15 15", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react10.default.createElement("path", { d: "M12.3 6.1A5 5 0 1 0 12.1 9.6", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }), /* @__PURE__ */ import_react10.default.createElement("path", { d: "M12.6 2.8v3.6H9", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function App({ t }) {
  const [projects, setProjects] = (0, import_react10.useState)([]);
  const [tasks, setTasks] = (0, import_react10.useState)([]);
  const [selectedProjectId, setSelectedProjectId] = (0, import_react10.useState)(ALL_PROJECTS);
  const [search, setSearch] = (0, import_react10.useState)("");
  const [filters, setFilters] = (0, import_react10.useState)(EMPTY_FILTERS);
  const [collapsed, setCollapsed] = (0, import_react10.useState)(loadCollapsedColumns);
  const [selectedTaskId, setSelectedTaskId] = (0, import_react10.useState)(null);
  const [toast, setToast] = (0, import_react10.useState)(null);
  const [loading, setLoading] = (0, import_react10.useState)(true);
  const [refreshing, setRefreshing] = (0, import_react10.useState)(false);
  const [restoringProject, setRestoringProject] = (0, import_react10.useState)(false);
  const [error, setError] = (0, import_react10.useState)(null);
  const [dialogs, setDialogs] = (0, import_react10.useState)([]);
  const tRef = (0, import_react10.useRef)(t);
  tRef.current = t;
  const dialogKey = (0, import_react10.useRef)(0);
  const toastKey = (0, import_react10.useRef)(0);
  const searchRef = (0, import_react10.useRef)(null);
  const rootRef = (0, import_react10.useRef)(null);
  const showToast = (0, import_react10.useCallback)((message, tone = "error") => {
    toastKey.current += 1;
    setToast({ id: toastKey.current, message, tone });
  }, []);
  (0, import_react10.useEffect)(() => {
    if (!toast) return void 0;
    const timer = setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current);
    }, 4e3);
    return () => clearTimeout(timer);
  }, [toast]);
  (0, import_react10.useEffect)(() => {
    if (typeof window === "undefined") return void 0;
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  (0, import_react10.useEffect)(() => {
    if (typeof window === "undefined") return void 0;
    const root = rootRef.current;
    if (!root) return void 0;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rail = document.querySelector('[class*="_root"][class*="_collapsed"]');
      const railRect = rail?.getBoundingClientRect();
      if (!railRect || railRect.width <= 0) {
        root.style.removeProperty("--dkb-rail-safe");
        delete root.dataset.sidebarCollapsed;
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const safe = Math.max(18, Math.ceil(railRect.right + 28 - rootRect.left));
      root.style.setProperty("--dkb-rail-safe", `${safe}px`);
      root.dataset.sidebarCollapsed = "true";
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-sidebar-collapsed", "data-animating"],
      subtree: true
    });
    const resize = typeof window.ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    resize?.observe(document.body);
    window.addEventListener("resize", schedule);
    const timer = window.setInterval(schedule, 1e3);
    return () => {
      mutation.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  const load = (0, import_react10.useCallback)(async ({ silent = false, selectProjectId } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.bootstrap();
      const nextProjects = Array.isArray(data?.projects) ? data.projects : [];
      setProjects(nextProjects);
      setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      setSelectedProjectId((current) => {
        if (selectProjectId !== void 0) return selectProjectId;
        if (current === ALL_PROJECTS) return current;
        return nextProjects.some((project) => project.id === current) ? current : ALL_PROJECTS;
      });
    } catch (failure) {
      setError(tRef.current("loadError", { message: failure?.message || tRef.current("actionFailed") }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  (0, import_react10.useEffect)(() => {
    void load();
  }, [load]);
  const activeProjects = (0, import_react10.useMemo)(() => projects.filter((project) => !project.archivedAt), [projects]);
  const archivedProjects = (0, import_react10.useMemo)(() => projects.filter((project) => project.archivedAt), [projects]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectArchived = Boolean(selectedProject?.archivedAt);
  const projectNames = (0, import_react10.useMemo)(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const activeProjectIds = (0, import_react10.useMemo)(() => new Set(activeProjects.map((project) => project.id)), [activeProjects]);
  const boardTasks = (0, import_react10.useMemo)(() => {
    const activeOnly = selectedProjectId === ALL_PROJECTS;
    return tasks.filter((task) => {
      if (!COLUMN_ID_SET2.has(task.column)) return false;
      return activeOnly ? activeProjectIds.has(task.projectId) : task.projectId === selectedProjectId;
    });
  }, [tasks, activeProjectIds, selectedProjectId]);
  const filterOptions = (0, import_react10.useMemo)(() => {
    const priorities = /* @__PURE__ */ new Set();
    const labels = /* @__PURE__ */ new Set();
    const assignees = /* @__PURE__ */ new Map();
    for (const task of boardTasks) {
      if (task.priority) priorities.add(task.priority);
      for (const label of Array.isArray(task.labels) ? task.labels : []) labels.add(label);
      const assignee = task.assignee;
      if (assignee?.id) assignees.set(assignee.id, assignee.name || assignee.id);
    }
    return {
      priorities: PRIORITIES.filter((priority) => priorities.has(priority)),
      labels: [...labels].sort((left, right) => left.localeCompare(right)),
      assignees: [...assignees].map(([id, name]) => ({ id, name }))
    };
  }, [boardTasks]);
  const visibleTasks = (0, import_react10.useMemo)(() => {
    const query = search.trim().toLowerCase();
    return boardTasks.filter((task) => {
      if (selectedProjectId !== ALL_PROJECTS && task.projectId !== selectedProjectId) return false;
      if (!matchesFilters(task, filters)) return false;
      if (!query) return true;
      const haystack = [
        task.title,
        task.description,
        projectNames.get(task.projectId) ?? "",
        ...Array.isArray(task.labels) ? task.labels : []
      ];
      return haystack.some((value) => String(value ?? "").toLowerCase().includes(query));
    });
  }, [boardTasks, selectedProjectId, filters, search, projectNames]);
  const runningCount = visibleTasks.filter((task) => task.status === "in_progress").length;
  const filterCount = activeFilterCount(filters);
  const openDialog = (0, import_react10.useCallback)((dialog) => {
    const key = `dkb-dialog-${dialogKey.current++}`;
    setDialogs((current) => [...current, { ...dialog, key }]);
  }, []);
  const closeDialog = (0, import_react10.useCallback)((key) => {
    setDialogs((current) => current.filter((dialog) => dialog.key !== key));
  }, []);
  const selectProject = (0, import_react10.useCallback)((projectId) => {
    setSelectedProjectId(projectId);
    setFilters((current) => current.projectId ? { ...current, projectId: "" } : current);
  }, []);
  const toggleColumn = (0, import_react10.useCallback)((columnId) => {
    setCollapsed((current) => {
      const next = toggleCollapsedColumn(current, columnId);
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, serializeCollapsedColumns(next));
      } catch {
      }
      return next;
    });
  }, []);
  const changeFilter = (0, import_react10.useCallback)((key, value) => {
    if (!Object.hasOwn(EMPTY_FILTERS, key)) return;
    setFilters((current) => ({ ...current, [key]: value }));
    if (key === "projectId") {
      setSelectedProjectId((current) => reconcileProjectFilter(current, value, ALL_PROJECTS));
    }
  }, []);
  const clearFilters = (0, import_react10.useCallback)(() => setFilters(EMPTY_FILTERS), []);
  const clearSearchAndFilters = (0, import_react10.useCallback)(() => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
  }, []);
  const createProject = (0, import_react10.useCallback)(async ({ name, workspacePath }, key) => {
    const body = { name };
    if (workspacePath) body.workspacePath = workspacePath;
    const created = await api.createProject(body);
    setProjects((current) => [...current, { ...created, taskCount: 0 }]);
    setSelectedProjectId(created.id);
    closeDialog(key);
    await load({ silent: true, selectProjectId: created.id });
  }, [closeDialog, load]);
  const renameProject = (0, import_react10.useCallback)(async (project, name, key) => {
    const updated = await api.renameProject(project.id, { name });
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    closeDialog(key);
  }, [closeDialog]);
  const archiveProject = (0, import_react10.useCallback)(async (project, key) => {
    const updated = await api.archiveProject(project.id);
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    setSelectedProjectId((current) => current === project.id ? ALL_PROJECTS : current);
    closeDialog(key);
    await load({ silent: true });
  }, [closeDialog, load]);
  const restoreProject = (0, import_react10.useCallback)(async (project, { select = false } = {}) => {
    const updated = await api.restoreProject(project.id);
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    const keepSelected = select || selectedProjectId === project.id;
    await load({ silent: true, ...keepSelected ? { selectProjectId: updated.id } : {} });
  }, [load, selectedProjectId]);
  const restoreSelectedProject = (0, import_react10.useCallback)(async () => {
    if (!selectedProject || !selectedProjectArchived) return;
    setRestoringProject(true);
    try {
      await restoreProject(selectedProject, { select: true });
    } catch (failure) {
      showToast(projectErrorText(failure, tRef.current));
    } finally {
      setRestoringProject(false);
    }
  }, [restoreProject, selectedProject, selectedProjectArchived, showToast]);
  const deleteProject = (0, import_react10.useCallback)(async (project, key) => {
    await api.deleteProject(project.id);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setSelectedProjectId((current) => current === project.id ? ALL_PROJECTS : current);
    closeDialog(key);
    await load({ silent: true });
  }, [closeDialog, load]);
  const createTask = (0, import_react10.useCallback)(async (payload, key) => {
    await api.createTask(payload);
    closeDialog(key);
    await load({ silent: true });
  }, [closeDialog, load]);
  const addTask = (0, import_react10.useCallback)((columnId) => {
    openDialog({ type: "createTask", status: DEFAULT_STATUS_BY_COLUMN[columnId] ?? "backlog" });
  }, [openDialog]);
  const openTask = (0, import_react10.useCallback)((task) => {
    setSelectedTaskId(task.id);
  }, []);
  const closeTask = (0, import_react10.useCallback)(() => {
    setSelectedTaskId(null);
  }, []);
  const refreshAfterTaskChange = (0, import_react10.useCallback)(() => {
    void load({ silent: true });
  }, [load]);
  const closeAfterTaskArchived = (0, import_react10.useCallback)(() => {
    setSelectedTaskId(null);
    void load({ silent: true });
  }, [load]);
  const filterByProject = (0, import_react10.useCallback)((projectId) => {
    const next = filters.projectId === projectId ? "" : projectId;
    setFilters((current) => ({ ...current, projectId: next }));
    setSelectedProjectId((current) => reconcileProjectFilter(current, next, ALL_PROJECTS));
  }, [filters.projectId]);
  const filterByPriority = (0, import_react10.useCallback)((priority) => {
    setFilters((current) => ({ ...current, priority: current.priority === priority ? "" : priority }));
  }, []);
  const dropTask = (0, import_react10.useCallback)(async (task, columnId, beforeTaskId) => {
    const check = canDrop(task, columnId);
    if (!check.ok) {
      showToast(tRef.current(DROP_REASON_KEYS[check.reason] ?? "dropRejected"));
      return;
    }
    const status = statusForColumn(columnId, task.status);
    if (!status) {
      showToast(tRef.current("dropRejected"));
      return;
    }
    const columnTasks = tasks.filter((item) => item.id !== task.id && item.column === columnId && activeProjectIds.has(item.projectId));
    const plan = planDropSortOrder(columnTasks, beforeTaskId, task);
    try {
      if (plan.sortOrder !== null) {
        await api.updateTask(task.id, { version: task.version, status, sortOrder: plan.sortOrder });
      } else {
        for (const update of plan.updates) {
          await api.updateTask(update.id, {
            version: update.version,
            sortOrder: update.sortOrder,
            ...update.id === task.id ? { status } : {}
          });
        }
      }
      await load({ silent: true });
    } catch (failure) {
      showToast(taskErrorText(failure, tRef.current));
      await load({ silent: true });
    }
  }, [tasks, activeProjectIds, load, showToast]);
  const answerTask = (0, import_react10.useCallback)(async (task, decision, selected, note) => {
    try {
      await api.answerQuestion(task.id, { version: task.version, decision, selected, note });
      await load({ silent: true });
    } catch (failure) {
      showToast(taskErrorText(failure, tRef.current));
      await load({ silent: true });
    }
  }, [load, showToast]);
  const loadArchivedTasks = (0, import_react10.useCallback)((projectId) => {
    return api.archivedTasks(projectId).then((data) => data?.tasks ?? []);
  }, []);
  const restoreArchivedTask = (0, import_react10.useCallback)(async (task) => {
    await api.restoreTask(task.id, { version: task.version });
    await load({ silent: true });
  }, [load]);
  const deleteArchivedTask = (0, import_react10.useCallback)(async (task) => {
    await api.deleteTask(task.id, { version: task.version });
    await load({ silent: true });
  }, [load]);
  const refresh = () => {
    void load({ silent: true });
  };
  const renderDialog = (dialog, layer) => {
    const close = () => closeDialog(dialog.key);
    if (dialog.type === "create") {
      return /* @__PURE__ */ import_react10.default.createElement(
        CreateProjectDialog,
        {
          key: dialog.key,
          t,
          layer,
          onClose: close,
          onCreate: (payload) => createProject(payload, dialog.key)
        }
      );
    }
    if (dialog.type === "createTask") {
      return /* @__PURE__ */ import_react10.default.createElement(
        CreateTaskDialog,
        {
          key: dialog.key,
          t,
          layer,
          projects: activeProjects,
          defaultProjectId: selectedProjectId !== ALL_PROJECTS ? selectedProjectId : filters.projectId || (activeProjects.length === 1 ? activeProjects[0].id : ""),
          defaultStatus: dialog.status,
          onClose: close,
          onCreate: (payload) => createTask(payload, dialog.key)
        }
      );
    }
    if (dialog.type === "rename") {
      return /* @__PURE__ */ import_react10.default.createElement(
        RenameProjectDialog,
        {
          key: dialog.key,
          t,
          layer,
          project: dialog.project,
          onClose: close,
          onRename: (project, name) => renameProject(project, name, dialog.key)
        }
      );
    }
    if (dialog.type === "archive") {
      return /* @__PURE__ */ import_react10.default.createElement(
        ArchiveProjectDialog,
        {
          key: dialog.key,
          t,
          layer,
          project: dialog.project,
          onClose: close,
          onConfirm: (project) => archiveProject(project, dialog.key)
        }
      );
    }
    if (dialog.type === "delete") {
      return /* @__PURE__ */ import_react10.default.createElement(
        DeleteProjectDialog,
        {
          key: dialog.key,
          t,
          layer,
          project: dialog.project,
          onClose: close,
          onConfirm: (project) => deleteProject(project, dialog.key)
        }
      );
    }
    if (dialog.type === "manage") {
      return /* @__PURE__ */ import_react10.default.createElement(
        ManageProjectsDialog,
        {
          key: dialog.key,
          t,
          layer,
          projects,
          initialView: dialog.view ?? "active",
          onClose: close,
          onCreate: () => openDialog({ type: "create" }),
          onRename: (project) => openDialog({ type: "rename", project }),
          onArchive: (project) => openDialog({ type: "archive", project }),
          onRestore: restoreProject,
          onDelete: (project) => openDialog({ type: "delete", project })
        }
      );
    }
    if (dialog.type === "archivedTasks") {
      return /* @__PURE__ */ import_react10.default.createElement(
        ArchivedTasksDialog,
        {
          key: dialog.key,
          t,
          layer,
          projectId: selectedProjectId === ALL_PROJECTS ? null : selectedProjectId,
          projects,
          onClose: close,
          loadArchivedTasks,
          onRestoreTask: restoreArchivedTask,
          onDeleteTask: deleteArchivedTask,
          onOpenTask: (task) => {
            close();
            openTask(task);
          }
        }
      );
    }
    return null;
  };
  return /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, /* @__PURE__ */ import_react10.default.createElement("style", null, styles_default), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb", ref: rootRef }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dkb-header" }, /* @__PURE__ */ import_react10.default.createElement(
    ProjectSwitcher,
    {
      projects: activeProjects,
      archivedProjects,
      selectedId: selectedProjectId,
      onSelect: selectProject,
      onCreate: () => openDialog({ type: "create" }),
      onManage: () => openDialog({ type: "manage", view: "active" }),
      onArchivedProjects: () => openDialog({ type: "manage", view: "archived" }),
      onArchivedTasks: () => openDialog({ type: "archivedTasks" }),
      t
    }
  ), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-search" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-search-icon", "aria-hidden": "true" }, /* @__PURE__ */ import_react10.default.createElement(SearchIcon, null)), /* @__PURE__ */ import_react10.default.createElement(
    "input",
    {
      ref: searchRef,
      className: "dkb-input dkb-search-input",
      type: "search",
      value: search,
      onChange: (event) => setSearch(event.target.value),
      placeholder: t("search"),
      "aria-label": t("search")
    }
  )), /* @__PURE__ */ import_react10.default.createElement(
    FiltersMenu,
    {
      t,
      filters,
      projects: activeProjects,
      priorities: filterOptions.priorities,
      labels: filterOptions.labels,
      assignees: filterOptions.assignees,
      onChange: changeFilter,
      onClear: clearFilters
    }
  ), /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-running", "aria-live": "polite" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-running-dot", "aria-hidden": "true" }), t("runningCount", { count: runningCount })), /* @__PURE__ */ import_react10.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-icon-button",
      onClick: refresh,
      disabled: refreshing,
      "aria-label": refreshing ? t("refreshing") : t("refresh"),
      title: refreshing ? t("refreshing") : t("refresh"),
      "aria-busy": refreshing
    },
    /* @__PURE__ */ import_react10.default.createElement(RefreshIcon, { spinning: refreshing })
  )), error ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-banner dkb-banner-error", role: "alert" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-banner-text" }, error), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dkb-button dkb-button-small", onClick: () => {
    void load();
  }, disabled: loading || refreshing }, t("retry"))) : null, selectedProjectArchived ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-banner dkb-banner-readonly", role: "status" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-badge dkb-badge-archived" }, t("archived")), /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-banner-text" }, t("archivedProjectBanner", { name: selectedProject?.name ?? "" })), /* @__PURE__ */ import_react10.default.createElement(
    "button",
    {
      type: "button",
      className: "dkb-button dkb-button-small dkb-button-primary",
      onClick: () => {
        void restoreSelectedProject();
      },
      disabled: restoringProject,
      "aria-busy": restoringProject || void 0
    },
    restoringProject ? t("submitting") : t("restoreProject")
  )) : null, /* @__PURE__ */ import_react10.default.createElement("main", { className: "dkb-main" }, loading && projects.length === 0 ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-state" }, /* @__PURE__ */ import_react10.default.createElement("p", { className: "dkb-muted" }, t("loading"))) : null, !loading && error && projects.length === 0 ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-state" }, /* @__PURE__ */ import_react10.default.createElement("p", { className: "dkb-state-title" }, t("loadErrorTitle")), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dkb-button dkb-button-primary", onClick: () => {
    void load();
  } }, t("retry"))) : null, !loading && !error && projects.length === 0 ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-state" }, /* @__PURE__ */ import_react10.default.createElement("p", { className: "dkb-state-title" }, t("noProjects")), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dkb-muted" }, t("noProjectsHint")), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dkb-button dkb-button-primary", onClick: () => openDialog({ type: "create" }) }, t("createProject"))) : null, projects.length > 0 ? /* @__PURE__ */ import_react10.default.createElement("section", { className: "dkb-board", "aria-label": t("nav") }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-board-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h2", { className: "dkb-board-title" }, /* @__PURE__ */ import_react10.default.createElement("span", null, selectedProject?.name ?? t("allProjects")), selectedProjectArchived ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dkb-badge dkb-badge-archived" }, t("archived")) : null), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dkb-board-meta" }, t("taskCount", { count: visibleTasks.length }), filterCount > 0 ? ` \xB7 ${t("filtersActive", { count: filterCount })}` : "", selectedProjectArchived ? ` \xB7 ${t("readOnly")}` : ""))), visibleTasks.length === 0 && (search.trim() || filterCount > 0) ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dkb-board-empty" }, /* @__PURE__ */ import_react10.default.createElement("span", null, t("noMatches")), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dkb-button dkb-button-small", onClick: clearSearchAndFilters }, t("clearSearchAndFilters"))) : null, /* @__PURE__ */ import_react10.default.createElement(
    Board,
    {
      tasks: visibleTasks,
      collapsed,
      projects: activeProjects,
      showProject: selectedProjectId === ALL_PROJECTS,
      readOnly: Boolean(selectedProject?.archivedAt),
      onToggleColumn: toggleColumn,
      onOpenTask: openTask,
      onDropTask: dropTask,
      onAddTask: addTask,
      onFilterProject: filterByProject,
      onFilterPriority: filterByPriority,
      onAnswerQuestion: answerTask,
      selectedTaskId,
      t
    }
  )) : null), toast ? /* @__PURE__ */ import_react10.default.createElement(
    "div",
    {
      className: `dkb-toast dkb-toast-${toast.tone}`,
      role: "status",
      "aria-live": "polite"
    },
    toast.message
  ) : null, dialogs.map(renderDialog), selectedTaskId ? /* @__PURE__ */ import_react10.default.createElement(
    TaskDrawer,
    {
      key: selectedTaskId,
      taskId: selectedTaskId,
      projects,
      onClose: closeTask,
      onChanged: refreshAfterTaskChange,
      onArchived: closeAfterTaskArchived,
      t
    }
  ) : null));
}

// src/client/index.jsx
var inject = ["slots", "locale"];
var NS = "kanban";
var ZH = {
  nav: "\u770B\u677F",
  allProjects: "\u6240\u6709\u9879\u76EE",
  activeProjects: "\u8FDB\u884C\u4E2D\u9879\u76EE",
  createProject: "\u521B\u5EFA\u9879\u76EE",
  manageProjects: "\u7BA1\u7406\u9879\u76EE",
  archivedProjects: "\u5DF2\u5F52\u6863\u9879\u76EE",
  archivedTasks: "\u5DF2\u5F52\u6863\u4EFB\u52A1",
  search: "\u641C\u7D22\u6807\u9898 / \u6458\u8981 / \u9879\u76EE / \u6807\u7B7E",
  filters: "\u7B5B\u9009",
  runningCount: "{count} \u4E2A\u8FD0\u884C\u4E2D",
  newCard: "\u65B0\u5EFA\u5361\u7247",
  backlog: "Backlog",
  running: "Running",
  needs: "Needs you",
  done: "Done",
  refresh: "\u5237\u65B0",
  refreshing: "\u5237\u65B0\u4E2D\u2026",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  loadError: "\u65E0\u6CD5\u52A0\u8F7D\u770B\u677F\uFF1A{message}",
  loadErrorTitle: "\u65E0\u6CD5\u52A0\u8F7D\u770B\u677F",
  archivedTasksLoadError: "\u65E0\u6CD5\u52A0\u8F7D\u5DF2\u5F52\u6863\u4EFB\u52A1\uFF1A{message}",
  retry: "\u91CD\u8BD5",
  noProjects: "\u8FD8\u6CA1\u6709\u9879\u76EE",
  noProjectsHint: "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u9879\u76EE\uFF0C\u5F00\u59CB\u8DDF\u8E2A\u4EFB\u52A1\u3002",
  boardPlaceholder: "\u4EFB\u52A1\u5361\u7247\u5C06\u5728\u8FD9\u91CC\u663E\u793A\u3002",
  boardEmpty: "\u6B64\u89C6\u56FE\u6682\u65E0\u4EFB\u52A1",
  noMatches: "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1",
  clearSearchAndFilters: "\u6E05\u9664\u641C\u7D22\u548C\u7B5B\u9009",
  taskCount: "{count} \u4E2A\u4EFB\u52A1",
  projectName: "\u9879\u76EE\u540D\u79F0",
  projectNamePlaceholder: "\u4F8B\u5982\uFF1A\u5E02\u573A\u7F51\u7AD9",
  workspacePath: "\u5DE5\u4F5C\u533A\u8DEF\u5F84\uFF08\u53EF\u9009\uFF09",
  workspacePathPlaceholder: "/path/to/workspace",
  cancel: "\u53D6\u6D88",
  create: "\u521B\u5EFA",
  save: "\u4FDD\u5B58",
  close: "\u5173\u95ED",
  renameProject: "\u91CD\u547D\u540D\u9879\u76EE",
  rename: "\u91CD\u547D\u540D",
  archiveProject: "\u5F52\u6863\u9879\u76EE",
  archive: "\u5F52\u6863",
  archiveConfirm: "\u5F52\u6863\u201C{name}\u201D\uFF1F\u4EFB\u52A1\u4F1A\u88AB\u4FDD\u7559\uFF0C\u4F46\u9879\u76EE\u4F1A\u4ECE\u5207\u6362\u5668\u4E2D\u79FB\u51FA\uFF0C\u76F4\u5230\u6062\u590D\u3002",
  restoreProject: "\u6062\u590D\u9879\u76EE",
  restore: "\u6062\u590D",
  deleteProject: "\u5220\u9664\u9879\u76EE",
  delete: "\u5220\u9664",
  deleteConfirm: "\u5220\u9664\u201C{name}\u201D\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
  deleteNonEmptyHint: "\u8BE5\u9879\u76EE\u5305\u542B {count} \u4E2A\u4EFB\u52A1\u3002\u8BF7\u5148\u5220\u9664\u6216\u79FB\u51FA\u8FD9\u4E9B\u4EFB\u52A1\u3002",
  projectNotEmpty: "\u9879\u76EE\u4ECD\u6709 {count} \u4E2A\u4EFB\u52A1\u3002\u8BF7\u5148\u5220\u9664\u6216\u79FB\u51FA\u8FD9\u4E9B\u4EFB\u52A1\u3002",
  projectExists: "\u540C\u540D\u9879\u76EE\u5DF2\u5B58\u5728\u3002",
  projectArchived: "\u9879\u76EE\u5DF2\u5F52\u6863\uFF0C\u8BF7\u5148\u6062\u590D\u3002",
  projectNotFound: "\u627E\u4E0D\u5230\u8BE5\u9879\u76EE\u3002",
  nameRequired: "\u8BF7\u8F93\u5165\u9879\u76EE\u540D\u79F0\u3002",
  invalidField: "\u5B57\u6BB5\u65E0\u6548\uFF1A{field}",
  actionFailed: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  noActiveProjects: "\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u9879\u76EE\u3002",
  noArchivedProjects: "\u6CA1\u6709\u5DF2\u5F52\u6863\u9879\u76EE\u3002",
  noArchivedTasks: "\u6CA1\u6709\u5DF2\u5F52\u6863\u4EFB\u52A1\u3002",
  archived: "\u5DF2\u5F52\u6863",
  menuLabel: "\u9879\u76EE\u83DC\u5355",
  workspaceLabel: "\u5DE5\u4F5C\u533A",
  archivedTasksFor: "\u663E\u793A\u201C{project}\u201D\u7684\u5DF2\u5F52\u6863\u4EFB\u52A1\u3002",
  archivedProjectBanner: "\u201C{name}\u201D\u5DF2\u5F52\u6863\uFF0C\u770B\u677F\u4E3A\u53EA\u8BFB\u3002\u6062\u590D\u9879\u76EE\u540E\u53EF\u7EE7\u7EED\u7F16\u8F91\u3002",
  searchArchivedTasks: "\u6309\u6807\u9898\u6216\u7F16\u53F7\u641C\u7D22\u5DF2\u5F52\u6863\u4EFB\u52A1",
  noArchivedTasksMatch: "\u6CA1\u6709\u5339\u914D\u7684\u5DF2\u5F52\u6863\u4EFB\u52A1\u3002",
  restoreTaskConfirm: "\u6062\u590D\u6B64\u4EFB\u52A1\uFF1F",
  restoreProjectFirst: "\u9879\u76EE\u5DF2\u5F52\u6863\uFF0C\u8BF7\u5148\u6062\u590D\u9879\u76EE\u3002",
  unknownProject: "\u672A\u77E5\u9879\u76EE",
  openTask: "\u6253\u5F00\u4EFB\u52A1",
  openTaskAria: "\u6253\u5F00\u4EFB\u52A1\uFF1A{title}",
  taskDetail: "\u4EFB\u52A1\u8BE6\u60C5",
  taskDetailLoadError: "\u65E0\u6CD5\u52A0\u8F7D\u4EFB\u52A1\u8BE6\u60C5\uFF1A{message}",
  properties: "\u5C5E\u6027",
  noDescription: "\u6682\u65E0\u63CF\u8FF0\u3002",
  editDescription: "\u7F16\u8F91\u63CF\u8FF0",
  blocker: "\u963B\u585E",
  blockedReasonLabel: "\u963B\u585E\u539F\u56E0",
  blockerPlaceholder: "\u8BF4\u660E\u963B\u585E\u539F\u56E0\u2026",
  setBlocker: "\u8BBE\u7F6E\u963B\u585E",
  clearBlocker: "\u6E05\u9664\u963B\u585E",
  notBlocked: "\u672A\u963B\u585E",
  linkLabel: "\u94FE\u63A5\u540D\u79F0",
  linkLabelRequired: "\u8BF7\u8F93\u5165\u94FE\u63A5\u540D\u79F0\u3002",
  linkUrl: "\u94FE\u63A5\u5730\u5740",
  linkUrlPlaceholder: "https://\u2026",
  invalidLinkUrl: "\u8BF7\u8F93\u5165 http(s) \u94FE\u63A5\u3002",
  addLink: "\u6DFB\u52A0\u94FE\u63A5",
  removeLink: "\u5220\u9664\u94FE\u63A5",
  noLinks: "\u6682\u65E0\u94FE\u63A5\u3002",
  questionSection: "\u95EE\u9898\u4E0E\u8BF7\u6C42",
  requestInput: "\u8BF7\u6C42\u8F93\u5165",
  questionPrompt: "\u95EE\u9898",
  questionPromptPlaceholder: "\u9700\u8981\u786E\u8BA4\u4EC0\u4E48\uFF1F",
  requestOptions: "\u9009\u9879",
  optionPlaceholder: "\u9009\u9879 {index}",
  optionLabel: "\u9009\u9879 {index}",
  removeOption: "\u5220\u9664\u9009\u9879 {index}",
  addOption: "\u6DFB\u52A0\u9009\u9879",
  requestOptionsHint: "\u9009\u9879\u6570\u91CF\u987B\u4E3A 2\u20135 \u4E2A\u3002",
  requestOptionsRequired: "\u8BF7\u586B\u5199\u81F3\u5C11\u4E24\u4E2A\u9009\u9879\u3002",
  requestPromptRequired: "\u8BF7\u8F93\u5165\u95EE\u9898\u3002",
  requestInputAction: "\u8BF7\u6C42\u8F93\u5165",
  comments: "\u8BC4\u8BBA",
  commentPlaceholder: "\u5199\u4E0B\u8BC4\u8BBA\u2026",
  addComment: "\u6DFB\u52A0\u8BC4\u8BBA",
  noComments: "\u6682\u65E0\u8BC4\u8BBA\u3002",
  deleteComment: "\u5220\u9664\u8BC4\u8BBA",
  attachments: "\u9644\u4EF6",
  uploadAttachment: "\u4E0A\u4F20\u9644\u4EF6",
  uploading: "\u4E0A\u4F20\u4E2D\u2026",
  attachmentLimitHint: "\u5355\u4E2A\u6587\u4EF6\u6700\u5927 20 MiB\u3002",
  attachmentTooLarge: "\u6587\u4EF6\u8D85\u8FC7 20 MiB \u4E0A\u9650\u3002",
  attachmentLimitReached: "\u9644\u4EF6\u6570\u91CF\u5DF2\u8FBE\u4E0A\u9650\u3002",
  attachmentReadFailed: "\u65E0\u6CD5\u8BFB\u53D6\u8BE5\u6587\u4EF6\u3002",
  noAttachments: "\u6682\u65E0\u9644\u4EF6\u3002",
  downloadAttachment: "\u4E0B\u8F7D {name}",
  deleteAttachment: "\u5220\u9664\u9644\u4EF6",
  activity: "\u52A8\u6001",
  noActivity: "\u6682\u65E0\u52A8\u6001\u3002",
  activityNone: "\u65E0",
  activityArchived: "\u5DF2\u5F52\u6863",
  activityActive: "\u672A\u5F52\u6863",
  field_title: "\u6807\u9898",
  field_description: "\u63CF\u8FF0",
  field_status: "\u72B6\u6001",
  field_priority: "\u4F18\u5148\u7EA7",
  field_labels: "\u6807\u7B7E",
  field_links: "\u94FE\u63A5",
  field_blockedReason: "\u963B\u585E\u539F\u56E0",
  field_pendingQuestion: "\u5F85\u56DE\u7B54\u7684\u95EE\u9898",
  field_questionResolution: "\u95EE\u9898\u5904\u7406\u7ED3\u679C",
  field_attachment: "\u9644\u4EF6",
  field_archivedAt: "\u5F52\u6863\u72B6\u6001",
  taskActions: "\u4EFB\u52A1\u64CD\u4F5C",
  archiveTask: "\u5F52\u6863\u4EFB\u52A1",
  archiveTaskConfirm: "\u5F52\u6863\u6B64\u4EFB\u52A1\uFF1F\u4EFB\u52A1\u4ECD\u53EF\u6062\u590D\u3002",
  restoreTask: "\u6062\u590D\u4EFB\u52A1",
  deleteTaskPermanently: "\u6C38\u4E45\u5220\u9664\u4EFB\u52A1",
  deleteTaskConfirm: "\u6C38\u4E45\u5220\u9664\u6B64\u4EFB\u52A1\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002",
  taskNotArchived: "\u4EFB\u52A1\u5C1A\u672A\u5F52\u6863\u3002",
  projectArchivedNotice: "\u6B64\u4EFB\u52A1\u6240\u5728\u9879\u76EE\u5DF2\u5F52\u6863\uFF0C\u6240\u6709\u7F16\u8F91\u5DF2\u7981\u7528\u3002",
  taskArchivedNotice: "\u6B64\u4EFB\u52A1\u5DF2\u5F52\u6863\uFF0C\u7F16\u8F91\u5DF2\u7981\u7528\u3002\u53EF\u6062\u590D\u6216\u6C38\u4E45\u5220\u9664\u3002",
  assigneeOnlyCurrent: "\u5F53\u524D\u4EC5\u652F\u6301\u6307\u6D3E\u7ED9\u5F53\u524D\u7528\u6237\u3002",
  versionConflictDetail: "\u4EFB\u52A1\u5DF2\u88AB\u5176\u4ED6\u64CD\u4F5C\u66F4\u65B0\uFF0C\u5DF2\u91CD\u65B0\u52A0\u8F7D\u6700\u65B0\u8BE6\u60C5\u3002",
  add: "\u6DFB\u52A0",
  noLabels: "\u6682\u65E0\u6807\u7B7E",
  labelPlaceholder: "\u8F93\u5165\u6807\u7B7E",
  addLabel: "\u6DFB\u52A0\u6807\u7B7E",
  removeLabel: "\u79FB\u9664\u6807\u7B7E {label}",
  addCardTo: "\u5728\u201C{column}\u201D\u65B0\u5EFA\u5361\u7247",
  collapseColumn: "\u6536\u8D77\u201C{column}\u201D",
  expandColumn: "\u5C55\u5F00\u201C{column}\u201D",
  columnCountAria: "{column}\uFF1A{count} \u4E2A\u4EFB\u52A1",
  dropHint: "\u62D6\u62FD\u5361\u7247\u5230\u8FD9\u91CC",
  dropNeedsAutomatic: "\u201CNeeds you\u201D\u7531\u7CFB\u7EDF\u81EA\u52A8\u751F\u6210\uFF0C\u4E0D\u80FD\u76F4\u63A5\u62D6\u5165\u3002",
  dropResolveAttention: "\u8BF7\u5148\u5904\u7406\u8BE5\u4EFB\u52A1\uFF0C\u518D\u79FB\u52A8\u5B83\u3002",
  dropResolveBeforeDone: "\u8BF7\u5148\u5904\u7406\u8BE5\u4EFB\u52A1\uFF0C\u518D\u79FB\u5165 Done\u3002",
  dropRejected: "\u65E0\u6CD5\u653E\u7F6E\u8BE5\u5361\u7247\u3002",
  updatedAgo: "\u66F4\u65B0\u4E8E {elapsed} \u524D",
  attentionQuestion: "\u5F85\u56DE\u7B54",
  attentionBlocked: "\u53D7\u963B",
  attentionReview: "\u5F85\u786E\u8BA4",
  readOnly: "\u53EA\u8BFB",
  taskArchived: "\u4EFB\u52A1\u5DF2\u5F52\u6863\u3002",
  taskNotFound: "\u627E\u4E0D\u5230\u8BE5\u4EFB\u52A1\u3002",
  versionConflict: "\u4EFB\u52A1\u5DF2\u88AB\u5176\u4ED6\u64CD\u4F5C\u66F4\u65B0\uFF0C\u5DF2\u91CD\u65B0\u52A0\u8F7D\u3002",
  resolveAttention: "\u8BF7\u5148\u5904\u7406\u8BE5\u4EFB\u52A1\u7684\u5F85\u529E\u4E8B\u9879\u3002",
  reviewNotPending: "\u8BE5\u4EFB\u52A1\u5F53\u524D\u4E0D\u5728\u5BA1\u6838\u4E2D\u3002",
  questionAlreadyPending: "\u8BE5\u4EFB\u52A1\u5DF2\u6709\u5F85\u56DE\u7B54\u7684\u95EE\u9898\u3002",
  questionNotPending: "\u8BE5\u4EFB\u52A1\u6CA1\u6709\u5F85\u56DE\u7B54\u7684\u95EE\u9898\u3002",
  questionNeedsAnswer: "\u9700\u8981\u4F60\u7684\u56DE\u7B54",
  questionOptions: "\u95EE\u9898\u9009\u9879",
  questionSelectOption: "\u5148\u9009\u62E9\u4E00\u4E2A\u9009\u9879",
  questionNote: "\u5907\u6CE8",
  questionNotePlaceholder: "\u53EF\u9009\u5907\u6CE8\u2026",
  reject: "\u62D2\u7EDD",
  approve: "\u6279\u51C6",
  submitting: "\u63D0\u4EA4\u4E2D\u2026",
  reviewPrompt: "\u8BE5\u4EFB\u52A1\u7B49\u5F85\u786E\u8BA4",
  returnToWork: "\u9000\u56DE",
  confirm: "\u786E\u8BA4",
  commentsCount: "{count} \u6761\u8BC4\u8BBA",
  attachmentsCount: "{count} \u4E2A\u9644\u4EF6",
  linksCount: "{count} \u4E2A\u94FE\u63A5",
  links: "\u94FE\u63A5",
  filterAny: "\u5168\u90E8",
  filterProject: "\u9879\u76EE",
  filterPriority: "\u4F18\u5148\u7EA7",
  filterLabel: "\u6807\u7B7E",
  filterAssignee: "\u8D1F\u8D23\u4EBA",
  clearFilters: "\u6E05\u9664\u7B5B\u9009",
  filtersActive: "{count} \u4E2A\u7B5B\u9009\u6761\u4EF6",
  filtersCountAria: "\u7B5B\u9009\uFF08{count} \u4E2A\u6761\u4EF6\uFF09",
  filterByProject: "\u6309\u9879\u76EE\u7B5B\u9009\uFF1A{name}",
  filterByPriority: "\u6309\u4F18\u5148\u7EA7\u7B5B\u9009\uFF1A{priority}",
  elapsedUnderMinute: "<1m",
  elapsedMinutes: "{count}m",
  elapsedHours: "{count}h",
  elapsedDays: "{count}d",
  createTask: "\u65B0\u5EFA\u4EFB\u52A1",
  taskProject: "\u9879\u76EE",
  selectProject: "\u9009\u62E9\u9879\u76EE",
  projectRequired: "\u8BF7\u9009\u62E9\u9879\u76EE\u3002",
  taskTitle: "\u6807\u9898",
  taskTitlePlaceholder: "\u4EFB\u52A1\u6807\u9898",
  titleRequired: "\u8BF7\u8F93\u5165\u6807\u9898\u3002",
  taskDescription: "\u63CF\u8FF0",
  taskDescriptionPlaceholder: "\u8865\u5145\u8BF4\u660E\uFF08\u53EF\u9009\uFF09",
  taskStatus: "\u72B6\u6001",
  taskPriority: "\u4F18\u5148\u7EA7",
  taskLabels: "\u6807\u7B7E",
  taskLabelsPlaceholder: "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u4F8B\u5982\uFF1Aui, api",
  taskLabelsHint: "\u591A\u4E2A\u6807\u7B7E\u7528\u9017\u53F7\u5206\u9694\u3002",
  taskAssignee: "\u8D1F\u8D23\u4EBA",
  currentUser: "\u5F53\u524D\u7528\u6237",
  status_backlog: "\u5F85\u7ACB\u9879",
  status_todo: "\u7B49\u5F85\u8BA4\u9886",
  status_in_progress: "\u5904\u7406\u4E2D",
  status_in_review: "\u7B49\u4F60\u786E\u8BA4",
  status_done: "\u5B8C\u6210",
  status_canceled: "\u53D6\u6D88",
  priority_none: "\u65E0",
  priority_low: "\u4F4E",
  priority_medium: "\u4E2D",
  priority_high: "\u9AD8",
  priority_urgent: "\u7D27\u6025"
};
var EN = {
  nav: "Kanban",
  allProjects: "All projects",
  activeProjects: "Active projects",
  createProject: "Create project",
  manageProjects: "Manage projects",
  archivedProjects: "Archived projects",
  archivedTasks: "Archived tasks",
  search: "Search title / summary / project / label",
  filters: "Filters",
  runningCount: "{count} running",
  newCard: "New card",
  backlog: "Backlog",
  running: "Running",
  needs: "Needs you",
  done: "Done",
  refresh: "Refresh",
  refreshing: "Refreshing\u2026",
  loading: "Loading\u2026",
  loadError: "Could not load the board: {message}",
  loadErrorTitle: "Could not load the board",
  archivedTasksLoadError: "Could not load archived tasks: {message}",
  retry: "Retry",
  noProjects: "No projects yet",
  noProjectsHint: "Create your first project to start tracking work.",
  boardPlaceholder: "Task cards will render here.",
  boardEmpty: "No tasks in this view",
  noMatches: "No matching tasks",
  clearSearchAndFilters: "Clear search and filters",
  taskCount: "{count} tasks",
  projectName: "Project name",
  projectNamePlaceholder: "e.g. Marketing site",
  workspacePath: "Workspace path (optional)",
  workspacePathPlaceholder: "/path/to/workspace",
  cancel: "Cancel",
  create: "Create",
  save: "Save",
  close: "Close",
  renameProject: "Rename project",
  rename: "Rename",
  archiveProject: "Archive project",
  archive: "Archive",
  archiveConfirm: 'Archive "{name}"? Its tasks are kept, but the project leaves the switcher until restored.',
  restoreProject: "Restore project",
  restore: "Restore",
  deleteProject: "Delete project",
  delete: "Delete",
  deleteConfirm: 'Delete "{name}"? This cannot be undone.',
  deleteNonEmptyHint: "This project contains {count} tasks. Delete or move them first.",
  projectNotEmpty: "The project still contains {count} tasks. Delete or move them first.",
  projectExists: "A project with this name already exists.",
  projectArchived: "The project is archived. Restore it first.",
  projectNotFound: "Project not found.",
  nameRequired: "Enter a project name.",
  invalidField: "Invalid field: {field}",
  actionFailed: "Something went wrong. Try again.",
  noActiveProjects: "No active projects.",
  noArchivedProjects: "No archived projects.",
  noArchivedTasks: "No archived tasks.",
  archived: "Archived",
  menuLabel: "Project menu",
  workspaceLabel: "Workspace",
  archivedTasksFor: 'Showing archived tasks for "{project}".',
  archivedProjectBanner: '"{name}" is archived. The board is read-only until you restore the project.',
  searchArchivedTasks: "Search archived tasks by title or identifier",
  noArchivedTasksMatch: "No archived tasks match this search.",
  restoreTaskConfirm: "Restore this task?",
  restoreProjectFirst: "The project is archived. Restore the project first.",
  unknownProject: "Unknown project",
  openTask: "Open task",
  openTaskAria: "Open task: {title}",
  taskDetail: "Task details",
  taskDetailLoadError: "Could not load task details: {message}",
  properties: "Properties",
  noDescription: "No description yet.",
  editDescription: "Edit description",
  blocker: "Blocker",
  blockedReasonLabel: "Blocked reason",
  blockerPlaceholder: "Describe what is blocking\u2026",
  setBlocker: "Set blocker",
  clearBlocker: "Clear blocker",
  notBlocked: "Not blocked",
  linkLabel: "Link label",
  linkLabelRequired: "Enter a link label.",
  linkUrl: "Link URL",
  linkUrlPlaceholder: "https://\u2026",
  invalidLinkUrl: "Enter an http(s) URL.",
  addLink: "Add link",
  removeLink: "Remove link",
  noLinks: "No links yet.",
  questionSection: "Question and request",
  requestInput: "Request input",
  questionPrompt: "Prompt",
  questionPromptPlaceholder: "What needs a decision?",
  requestOptions: "Options",
  optionPlaceholder: "Option {index}",
  optionLabel: "Option {index}",
  removeOption: "Remove option {index}",
  addOption: "Add option",
  requestOptionsHint: "Use 2\u20135 options.",
  requestOptionsRequired: "Fill in at least two options.",
  requestPromptRequired: "Enter a prompt.",
  requestInputAction: "Request input",
  comments: "Comments",
  commentPlaceholder: "Write a comment\u2026",
  addComment: "Add comment",
  noComments: "No comments yet.",
  deleteComment: "Delete comment",
  attachments: "Attachments",
  uploadAttachment: "Upload attachment",
  uploading: "Uploading\u2026",
  attachmentLimitHint: "Up to 20 MiB per file.",
  attachmentTooLarge: "The file exceeds the 20 MiB limit.",
  attachmentLimitReached: "The attachment limit has been reached.",
  attachmentReadFailed: "Could not read that file.",
  noAttachments: "No attachments yet.",
  downloadAttachment: "Download {name}",
  deleteAttachment: "Delete attachment",
  activity: "Activity",
  noActivity: "No activity yet.",
  activityNone: "None",
  activityArchived: "Archived",
  activityActive: "Active",
  field_title: "Title",
  field_description: "Description",
  field_status: "Status",
  field_priority: "Priority",
  field_labels: "Labels",
  field_links: "Links",
  field_blockedReason: "Blocked reason",
  field_pendingQuestion: "Pending question",
  field_questionResolution: "Question resolution",
  field_attachment: "Attachment",
  field_archivedAt: "Archive state",
  taskActions: "Task actions",
  archiveTask: "Archive task",
  archiveTaskConfirm: "Archive this task? It can still be restored.",
  restoreTask: "Restore task",
  deleteTaskPermanently: "Delete task permanently",
  deleteTaskConfirm: "Delete this task permanently? This cannot be undone.",
  taskNotArchived: "The task is not archived.",
  projectArchivedNotice: "The project containing this task is archived. Editing is disabled.",
  taskArchivedNotice: "This task is archived. Editing is disabled; you can restore or delete it.",
  assigneeOnlyCurrent: "Only the current user can be assigned right now.",
  versionConflictDetail: "The task changed elsewhere. The latest details were reloaded.",
  add: "Add",
  noLabels: "No labels",
  labelPlaceholder: "Type a label",
  addLabel: "Add label",
  removeLabel: "Remove label {label}",
  addCardTo: "Add card to {column}",
  collapseColumn: "Collapse {column}",
  expandColumn: "Expand {column}",
  columnCountAria: "{column}: {count} tasks",
  dropHint: "Drag cards here",
  dropNeedsAutomatic: "Needs you is automatic and cannot be a drop target.",
  dropResolveAttention: "Resolve this task before moving it.",
  dropResolveBeforeDone: "Resolve this task before moving it to Done.",
  dropRejected: "This card cannot be dropped there.",
  updatedAgo: "Updated {elapsed} ago",
  attentionQuestion: "Question",
  attentionBlocked: "Blocked",
  attentionReview: "Review",
  readOnly: "Read-only",
  taskArchived: "The task is archived.",
  taskNotFound: "Task not found.",
  versionConflict: "The task changed elsewhere. The board was reloaded.",
  resolveAttention: "Resolve this task before continuing.",
  reviewNotPending: "The task is not awaiting review.",
  questionAlreadyPending: "The task already has a pending question.",
  questionNotPending: "The task has no pending question.",
  questionNeedsAnswer: "Needs your answer",
  questionOptions: "Question options",
  questionSelectOption: "Select an option first",
  questionNote: "Note",
  questionNotePlaceholder: "Optional note\u2026",
  reject: "Reject",
  approve: "Approve",
  submitting: "Submitting\u2026",
  reviewPrompt: "This task is awaiting confirmation",
  returnToWork: "Return",
  confirm: "Confirm",
  commentsCount: "{count} comments",
  attachmentsCount: "{count} attachments",
  linksCount: "{count} links",
  links: "Links",
  filterAny: "Any",
  filterProject: "Project",
  filterPriority: "Priority",
  filterLabel: "Label",
  filterAssignee: "Assignee",
  clearFilters: "Clear filters",
  filtersActive: "{count} filters active",
  filtersCountAria: "Filters ({count} active)",
  filterByProject: "Filter by project: {name}",
  filterByPriority: "Filter by priority: {priority}",
  elapsedUnderMinute: "<1m",
  elapsedMinutes: "{count}m",
  elapsedHours: "{count}h",
  elapsedDays: "{count}d",
  createTask: "Create task",
  taskProject: "Project",
  selectProject: "Select a project",
  projectRequired: "Choose a project.",
  taskTitle: "Title",
  taskTitlePlaceholder: "Task title",
  titleRequired: "Enter a title.",
  taskDescription: "Description",
  taskDescriptionPlaceholder: "Add details (optional)",
  taskStatus: "Status",
  taskPriority: "Priority",
  taskLabels: "Labels",
  taskLabelsPlaceholder: "Comma separated, e.g. ui, api",
  taskLabelsHint: "Separate multiple labels with commas.",
  taskAssignee: "Assignee",
  currentUser: "Current user",
  status_backlog: "Backlog",
  status_todo: "To do",
  status_in_progress: "In progress",
  status_in_review: "In review",
  status_done: "Done",
  status_canceled: "Canceled",
  priority_none: "None",
  priority_low: "Low",
  priority_medium: "Medium",
  priority_high: "High",
  priority_urgent: "Urgent"
};
function SidebarIcon({ size = 18 }) {
  return /* @__PURE__ */ import_react11.default.createElement("svg", { width: size, height: size, viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react11.default.createElement("rect", { x: "2.2", y: "2.5", width: "3.3", height: "13", rx: "1.2", fill: "currentColor", opacity: ".38" }), /* @__PURE__ */ import_react11.default.createElement("rect", { x: "7.35", y: "2.5", width: "3.3", height: "13", rx: "1.2", fill: "currentColor", opacity: ".66" }), /* @__PURE__ */ import_react11.default.createElement("rect", { x: "12.5", y: "2.5", width: "3.3", height: "13", rx: "1.2", fill: "currentColor" }));
}
function apply(ctx) {
  ctx.effect(() => {
    const offZh = ctx.locale.register(NS, "zh", ZH);
    const offEn = ctx.locale.register(NS, "en", EN);
    return () => {
      offZh();
      offEn();
    };
  }, "dsh-kanban: locale");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: "kanban",
    locale: NS
  }, App));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: "kanban",
    order: 20,
    label: () => t("nav")
  }, SidebarIcon));
}

    return module.exports;
  },
});
