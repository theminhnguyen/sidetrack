# SideTrack — Technical Concept & Development Plan

> **Handover document.** Architecture and specification by **Fable 5** (AI architect).
> Implementation by **Sonnet 5** (lead developer). Build the tool exactly as specified here;
> where this document is silent, prefer the simplest solution that respects the design
> principles below.

---

## 1. Product Summary

**SideTrack** is an internal team-management tool for tracking **side-projects** that run
in parallel to the team's regular day job. The day job always takes priority, so the tool
must embrace two realities:

1. **Capacity fluctuates.** People get pulled into the day job for days or weeks.
2. **Maintenance must be near-zero.** If updating the tool takes more than a few clicks,
   nobody will use it.

The team lead must be able to answer at any time: **who plans to finish what, and when —
and how realistic is that right now?**

**UI language: English.** All labels, messages, and generated reports are in English.

### Design principles (apply everywhere)

- **Low friction beats precision.** T-shirt sizes instead of hour estimates, 1-click
  snooze instead of date pickers, quick-pick reasons instead of mandatory essays.
- **Honesty over pressure.** Moving a deadline is a normal, logged event — not a failure.
  The audit log exists for transparency, not blame.
- **Client-only, zero cost.** Static web app, free hosting, no server, no credit card,
  no accounts in v1.

---

## 2. Architecture Overview

- **Single-page web app**: React 18 + TypeScript + Vite.
- **Hosting**: GitHub Pages (free, static). Deploy via `gh-pages` branch or Actions
  deploy workflow (on push — **no scheduled/cron workflows**).
- **Persistence v1**: browser `localStorage` behind a `StorageAdapter` interface, plus
  manual **JSON export/import** for backup and sharing.
- **Persistence v2 (optional, later)**: `SupabaseAdapter` implementing the same
  interface for real multi-user sync. ⚠️ The Supabase free tier of this account has a
  2-project slot limit — before creating a project, confirm a slot is free or reuse an
  existing project with a new schema. Do **not** build this in the MVP; just keep the
  adapter seam clean.
- **All exports are client-side** (PPTX generation, digest text). The only optional
  network dependency is the Miro REST API (feature-flagged, off by default).

```
┌─────────────────────────────────────────────┐
│                  React SPA                  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Board /  │ │  Gantt   │ │  Exports    │  │
│  │ List UI  │ │  View    │ │ PPTX/Digest │  │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       └─────┬──────┴──────────────┘         │
│      ┌──────▼───────┐                       │
│      │ Zustand store│  (single AppState)    │
│      └──────┬───────┘                       │
│      ┌──────▼───────────┐                   │
│      │ StorageAdapter   │                   │
│      │  v1: localStorage│                   │
│      │  v2: Supabase    │                   │
│      └──────────────────┘                   │
└─────────────────────────────────────────────┘
```

---

## 3. Data Model (JSON)

One single serializable `AppState` object. All persistence and export/import operate on
this shape.

```json
{
  "schemaVersion": 1,
  "users": [],
  "tasks": [],
  "auditLog": [],
  "settings": {
    "lastDigestAt": "2026-07-17T08:00:00Z",
    "miro": { "enabled": false, "boardId": null }
  }
}
```

### Conventions

- **IDs**: prefixed nanoid-style strings — `u_` (user), `t_` (task), `m_` (milestone),
  `log_` (audit entry). Generate with `nanoid(8)`.
- **Calendar dates** (deadlines, milestones) are **date-only strings `YYYY-MM-DD`** —
  never `Date` objects with time, never UTC-converted. This kills a whole class of
  timezone off-by-one bugs.
- **Timestamps** (audit log, updatedAt) are ISO 8601 UTC strings.
- The audit log is **append-only**. Nothing is ever edited or deleted from it.

### 3.1 User

```json
{
  "id": "u_9f3kq2ab",
  "name": "Alex Chen",
  "initials": "AC",
  "color": "#7C5CFF",
  "capacity": {
    "status": "yellow",
    "note": "Quarter-end reporting until Aug 8",
    "updatedAt": "2026-07-24T09:15:00Z"
  },
  "active": true
}
```

- `capacity.status`: `"green"` (side-project time available) | `"yellow"` (limited) |
  `"red"` (fully consumed by day job). This is the **day-job traffic light** — it
  describes day-job load, not side-project progress.
- `capacity.note`: optional free text, shown as tooltip (e.g. *why* red and until when).
- Changing the capacity status writes a `capacity_changed` audit entry (global, no
  taskId).
- `active: false` = person left the team. **Never hard-delete users** — tasks and audit
  entries reference them forever.

### 3.2 Task

```json
{
  "id": "t_a1b2c3d4",
  "title": "Vendor comparison for OCR service",
  "description": "Compare 3–5 OCR vendors on price, quality, DSGVO compliance.",
  "deliverable": "One-pager with a clear recommendation, posted in the team channel",
  "size": "M",
  "status": "in_progress",
  "assigneeId": "u_9f3kq2ab",
  "startDate": "2026-07-01",
  "dueDate": "2026-08-15",
  "completedAt": null,
  "milestones": [
    { "id": "m_x1", "title": "Shortlist of 3 vendors", "dueDate": "2026-07-20", "done": true },
    { "id": "m_x2", "title": "Trial accounts evaluated", "dueDate": "2026-08-05", "done": false }
  ],
  "dependsOn": ["t_e5f6g7h8"],
  "blockedReason": null,
  "snoozeCount": 0,
  "createdAt": "2026-06-28T14:02:00Z",
  "updatedAt": "2026-07-24T09:20:00Z"
}
```

- `size`: `"S" | "M" | "L" | "XL"` — T-shirt estimate, deliberately fuzzy.
- `status`: `"todo" | "in_progress" | "blocked" | "done"`.
  - `blocked` **requires** `blockedReason` (short text).
  - Setting `done` sets `completedAt` (timestamp) — the digest uses this.
- `deliverable`: the concrete expected outcome. Shown prominently; this is the field
  that keeps side-projects honest.
- `dependsOn`: array of task IDs that must finish before this task can finish.
- `snoozeCount`: incremented by each snooze — a cheap "how often has this slipped"
  signal (render as ⏰×3 badge when ≥ 2).

### 3.3 Audit Log Entry

```json
{
  "id": "log_7k2m1n9p",
  "taskId": "t_a1b2c3d4",
  "timestamp": "2026-07-24T10:00:00Z",
  "actorId": "u_9f3kq2ab",
  "type": "deadline_shifted",
  "payload": {
    "field": "dueDate",
    "from": "2026-08-15",
    "to": "2026-08-29",
    "delta": "+2w",
    "reason": "Day job escalation"
  }
}
```

`type` values and their payloads:

| type                | payload fields                          | written when |
|---------------------|-----------------------------------------|--------------|
| `task_created`      | `{}`                                    | new task |
| `status_changed`    | `{ from, to, reason? }`                 | any status change (`reason` required for → blocked) |
| `deadline_shifted`  | `{ field, from, to, delta, reason }`    | snooze button **or** manual due-date edit **or** Gantt drag (`delta: "manual"` for the latter two) |
| `milestone_shifted` | `{ milestoneId, from, to, reason }`     | milestone date change |
| `assignee_changed`  | `{ from, to }`                          | reassignment |
| `capacity_changed`  | `{ from, to, note? }` (taskId = null)   | traffic-light change |

The per-task audit log shown **under the task detail** is simply
`auditLog.filter(e => e.taskId === task.id)` rendered newest-first as human sentences:
*“Alex moved the deadline from Aug 15 to Aug 29 (+2 weeks) — ‘Day job escalation’ · Jul 24”*.

---

## 4. Tech Stack Recommendation

| Concern | Choice | Why |
|---|---|---|
| Framework | **React 18 + TypeScript + Vite** | Fast setup, typed AppState end-to-end |
| State | **Zustand** | Single store, no boilerplate, easy persistence middleware |
| Styling | **Tailwind CSS** | Fast, consistent; no component-library lock-in |
| Dates | **date-fns** | Tree-shakeable; use only date-only helpers |
| IDs | **nanoid** | Tiny, collision-safe |
| **Gantt** | **`gantt-task-react`** (MIT) | React-native Gantt with dependencies, progress, drag-to-reschedule; good enough for ≤ ~100 tasks. |
| Gantt fallback | `frappe-gantt` (MIT) | If `gantt-task-react` proves too limiting, wrap frappe-gantt instead. **Avoid dhtmlx-gantt** (GPL/commercial). |
| Gantt → image | **`html-to-image`** | Rasterize the Gantt DOM to PNG (2× scale) for the PPTX slide |
| **PPT export** | **`pptxgenjs`** (MIT) | Mature, fully client-side .pptx generation — no server, no cost |
| **Miro export** | Miro REST API v2 (optional) | Needs a free Miro dev app + personal access token entered by the user in Settings. Feature-flagged, OFF by default. |
| Digest | Hand-rolled string builder + Clipboard API | Output as Markdown and plain text |
| Hosting | GitHub Pages | Free, already used by the owner’s other projects |

**Explicitly rejected:** any backend/server in v1 (cost + maintenance), dhtmlx (license),
Mermaid Gantt (not interactive), PowerPoint via server-side conversion (needs a server).

---

## 5. Step-by-Step Development Plan

Work strictly in phases. **End every phase with a self-review pass**: bugs, logical
inconsistencies, performance, dead code — fix findings before moving on.

### Phase 0 — Scaffold & Data Layer (foundation)
1. Vite + React + TS + Tailwind scaffold; ESLint + Prettier.
2. Define all types from §3 in `src/types.ts` (single source of truth).
3. `StorageAdapter` interface (`load(): AppState`, `save(state): void`) +
   `LocalStorageAdapter` with debounced writes (500 ms) and `schemaVersion` check +
   migration hook (`migrate(oldState): AppState`).
4. Zustand store wired to the adapter; seed data module with 3 users / 6 tasks for dev.
5. JSON export (download `sidetrack-backup-YYYY-MM-DD.json`) and import (validate
   `schemaVersion`, confirm-overwrite dialog).

**Acceptance:** reload-safe state; export→wipe→import round-trip is lossless.

### Phase 1 — Task & Team Management UI
1. **Team bar**: every user as avatar chip (initials + color) with traffic-light dot;
   click cycles green→yellow→red (with optional note popover); writes audit entry.
2. **Task list/board**: grouped by status; each card shows title, assignee avatar
   (with capacity dot), size chip, due date, snooze badge, blocked badge.
3. **Task detail drawer**: all fields editable inline; deliverable prominent;
   milestones as checklist with dates; dependency picker (searchable select of other
   tasks); **audit log rendered underneath** (newest first).
4. Create/edit task modal — keep it to one screen, only title + assignee required.
5. User management (add/rename/deactivate; no delete).

**Acceptance:** full CRUD without console errors; blocked requires reason; audit
entries appear for every mutation listed in §3.3.

### Phase 2 — Time Logic: Snooze, Milestones, Dependencies
1. **Snooze buttons** (`+1 week` / `+2 weeks`) on card *and* detail view: one click →
   small popover asking only for a reason via quick-pick chips
   (**Day job** · **Waiting on others** · **Underestimated** · **Other…**) → shifts
   `dueDate`, increments `snoozeCount`, writes `deadline_shifted` entry. Two clicks
   total, ever.
2. Snooze asks (checkbox, default **off**): “Also shift milestones that would end after
   the new due date?” — if checked, shift those milestones too (own audit entries).
3. **Dependency validation**: on save, run cycle detection (DFS) over `dependsOn`;
   reject cycles with a message naming the offending chain.
4. **Conflict detection** (pure function, reused by Gantt + list):
   a task is *in conflict* if any task in `dependsOn` has a `dueDate` later than its
   own `dueDate`, or is `blocked`. Conflicted tasks get a warning badge.
5. After a snooze, if dependent tasks fall into conflict, show a non-blocking toast:
   “2 dependent tasks now conflict — review?” with a one-click **“shift them too”**
   action (each shift gets its own audit entry, reason auto-set to
   “Cascade from <task title>”). **Never auto-shift silently.**

**Acceptance:** snooze is 2 clicks; cycles impossible; cascade only ever explicit.

### Phase 3 — Gantt View
1. Integrate `gantt-task-react`: one row per task, grouped by assignee; milestones as
   diamond markers; dependency arrows from `dependsOn`.
2. Row label = task title + assignee initials + **capacity dot** (the lead sees “this
   bar belongs to a red person” at a glance).
3. Color coding: bar = assignee color; `blocked` = striped/red border; `done` = muted;
   conflict = warning outline. Today-line always visible.
4. Interactions: click bar → opens detail drawer; drag bar/end → date change **must**
   write a `deadline_shifted` audit entry (reason dialog, same quick-picks).
5. View controls: day/week/month zoom; filter by assignee and status; hide-done toggle.

**Acceptance:** 50-task seed renders < 1 s; every date mutation via Gantt is audited.

### Phase 4 — Exports & 1-Click Digest
1. **Status digest button** (“Copy status report”): generates Markdown + plain text
   since `settings.lastDigestAt`:
   - ✅ **Newly done** — tasks with `completedAt` > lastDigestAt
   - 🚫 **Blocked** — currently blocked tasks + reasons + since when
   - 📅 **Shifted** — tasks whose `dueDate` changed since lastDigestAt: old → **new**
     date + latest reason (compare snapshot vs. now, **not** every intermediate entry)
   - 🚦 **Team capacity** — current traffic lights
   Copies to clipboard, shows preview, then asks “Mark this as the new report
   baseline?” → updates `lastDigestAt` only on confirm.
2. **PPTX export** (pptxgenjs): slide 1 = title + date + capacity summary;
   slide 2 = Gantt as PNG (via `html-to-image`, 2× scale, fit-to-slide);
   slide 3+ = task table per assignee (title, deliverable, size, status, due date).
3. **Miro export** (optional, feature-flag in Settings): user pastes a personal access
   token + board ID; export creates one sticky per task (color by status) laid out in
   status columns. Ship this **last**; the MVP is complete without it.

**Acceptance:** digest correct against a hand-checked scenario; .pptx opens cleanly in
PowerPoint & Keynote; Miro failures never break anything else (see §6).

### Phase 5 — Hardening & Deploy
1. Empty states (no users / no tasks / nothing to report) with friendly copy.
2. Walk the full edge-case list in §6; write unit tests for: cycle detection, conflict
   detection, digest diffing, snooze/cascade, migrations.
3. Performance pass (memoized selectors; Gantt re-renders only on relevant changes).
4. Deploy to GitHub Pages; verify deep-reload works (SPA base path!).
5. Final self-review: bugs, dead code, inconsistent naming.

---

## 6. Edge Cases & Pitfalls (read carefully, Sonnet 5)

**Snooze & dependencies**
- Snoozing a task **never silently moves** dependent tasks. Detect resulting conflicts,
  badge them, offer explicit one-click cascade (each with its own audit entry). The
  audit log must always answer “who moved this and why” — a silent cascade breaks that.
- Cascades can chain (A→B→C). Apply the cascade transitively but show the full list of
  affected tasks in the confirmation toast/dialog before applying.
- Snoozing a `done` task makes no sense — hide snooze on done tasks.

**Dependencies**
- Cycle detection must run on **every** `dependsOn` edit, including edits made while
  creating a new task.
- A dependency on a `done` task is fine and satisfies the conflict check by definition.
- Deleting a task that others depend on: warn, then remove the stale IDs from all
  `dependsOn` arrays in the same transaction. Never leave dangling task IDs.

**Dates & time**
- Compare calendar dates as `YYYY-MM-DD` strings (lexicographic order is correct) or
  parse at **local noon** — never `new Date("2026-08-15")` (UTC-midnight shifts a day
  in western timezones).
- A milestone dated after the task `dueDate` is a **warning, not an error** (reality
  happens). Render it as an overdue marker past the bar end in the Gantt.
- Overdue tasks (dueDate < today, not done): red date text everywhere; never auto-shift.

**Status & log**
- `done` with open milestones → confirmation dialog (“2 milestones are open — mark done
  anyway?”); if confirmed, leave milestones as-is (audit trail of what was skipped).
- Reopening a done task (done → in_progress) must clear `completedAt` and write a
  `status_changed` entry — otherwise it ghosts through the next digest as “newly done”.
- The audit log is append-only; a “wrong” entry is corrected by the next entry, never
  by editing history.

**Digest**
- First digest ever (`lastDigestAt` null): use the last 7 days and say so in the header.
- Zero changes: still produce a report (“No changes since Jul 17. Team capacity: …”) —
  an empty clipboard feels like a bug.
- A task snoozed +2w and later pulled back −2w has **no net shift**: diff snapshot
  vs. now, don’t replay every audit entry.
- Tasks created *and* completed between two digests must still appear under
  “Newly done”.

**Exports**
- PPTX: rasterize the Gantt at 2× and fit-to-slide; if the visible range exceeds ~6
  months, export per-quarter slices onto separate slides instead of one unreadable
  strip. Wrap generation in try/catch — a failed image capture must fall back to a
  table-only deck, never a corrupt file.
- Miro: handle 401 (token invalid → clear message, link to Settings), 429 (respect
  `Retry-After`, then give up gracefully), and partial failures (report “14 of 17
  cards created”). Miro must **never** be in the critical path of digest or PPTX.
  Never log or export the token; it lives only in localStorage.

**Storage**
- `schemaVersion` + migration function from day one — retrofitting migrations onto
  live localStorage data is misery.
- localStorage quota (~5 MB) is ample here, but wrap `save()` in try/catch; on failure
  show a persistent warning banner and offer JSON download.
- v1 is effectively single-device; JSON export/import **is** the sharing mechanism.
  Say so in the UI (small hint in Settings) so nobody expects live sync. The
  `StorageAdapter` seam is where a later `SupabaseAdapter` adds real sync — that phase
  must then handle `updatedAt`-based conflicts, which v1 deliberately ignores.

**Users**
- Deactivating a user with open tasks → prompt to reassign or leave assigned (badge
  “inactive assignee” in list + Gantt).
- Avatar colors: assign from a fixed 10-color palette round-robin; never random per
  render.

---

## 7. Out of Scope (MVP)

Authentication / roles · real-time multi-user sync · notifications & reminders ·
mobile app (responsive web is enough) · time tracking in hours · attachments/comments.

---

*Concept by Fable 5 · July 2026 · Implementation handover to Sonnet 5.*
