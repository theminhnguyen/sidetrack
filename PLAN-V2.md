# SideTrack — Improvement Plan (v2)

> **Handover document.** Review and specification by **Fable 5** (AI architect).
> Implementation by **Sonnet 5** (lead developer).
>
> The MVP from [PLAN.md](./PLAN.md) is complete and deployed. This document covers
> what a post-launch review found: real defects, gaps that already caused bugs, and
> hygiene items. It does **not** propose new features beyond what closes those gaps.

## Ground rules (unchanged from PLAN.md)

- **Zero cost, no accounts, no credit card.** Everything stays client-side.
- **No backend.** Do not introduce a server, database, or auth to solve anything here.
- **UI language: English.** Commit messages: German.
- Every item below ships with tests where the behaviour is testable in Node.
- After each priority block: `tsc`, `oxlint`, `vitest`, `build`, browser check, commit, push.

## How to read this

Items are ordered by value, not by effort. Each has **Problem → Evidence → Fix →
Acceptance**. "Evidence" points at the actual code so nothing here is speculative —
verify before you change it, and if the evidence no longer matches, stop and re-assess.

---

## P0 — Data integrity and trust

SideTrack's core promise is *"who moved what, when, and why."* These three defects
break that promise, so they outrank everything else.

### P0.1 — Cascade applies a stale plan and records a false "from"

**Problem.** `confirmCascadeSuggestion` applies a plan that was computed earlier,
without checking whether the affected tasks still hold the dates the plan assumed.
If anything changed in between, it silently overwrites the newer value **and** writes
an audit entry claiming it moved the date from a value that was no longer there.
A wrong audit entry is worse than a missing one.

**Evidence.** `src/store/useAppStore.ts`, `confirmCascadeSuggestion`:

```ts
return { ...t, dueDate: shift.to, snoozeCount: t.snoozeCount + 1, updatedAt: nowTimestamp() }
```

`shift.from` is written straight into the log; `t.dueDate` is never compared against it.

**Reproduction.** Snooze a task that has a dependent → toast appears. Before clicking
"Shift them too", open the dependent and change its due date manually with a reason.
Now click "Shift them too": the manual change is overwritten, and the history shows a
shift from a date that task never had at that moment.

**Fix.** Re-validate each shift against current state at apply time:

- Drop any shift whose `from` no longer equals the task's current `dueDate`.
- Apply and log only the shifts that still match.
- If **every** shift was dropped, apply nothing and clear the suggestion.
- If **some** were dropped, apply the rest. Do not silently pretend the plan was
  complete — surface a short note (see P0.2, which gives you the place to put it).

Prefer dropping over recomputing: recomputing would apply changes the user never
previewed, which is the same trust problem in a different shape.

**Acceptance.**
- Unit test: plan with two shifts, one task's date changed in between → only the
  still-valid shift is applied, only one `deadline_shifted` entry is logged.
- Unit test: all shifts stale → no task mutated, no audit entry, suggestion cleared.
- Existing cascade tests still pass.

### P0.2 — A stale cascade toast survives an unrelated action

**Problem.** When a snooze produces no conflicts, the previous suggestion is
deliberately kept. So snoozing task A (conflicts → toast), then snoozing unrelated
task B (no conflicts), leaves A's toast on screen. The user then confirms a plan they
associate with the action they just took, but which belongs to an older one.

**Evidence.** `src/store/useAppStore.ts`, `snoozeTask`:

```ts
cascadeSuggestion:
  cascadePlan.length > 0 ? { rootTaskId: id, rootTitle: task.title, plan: cascadePlan } : state.cascadeSuggestion,
```

**Fix.** Any action that shifts a deadline replaces the suggestion outright — set it
to the new plan, or to `null` when there is none. A suggestion should never outlive
the action that produced it. Apply the same rule in `shiftDueDate` and `snoozeTask`.

**Acceptance.**
- Unit test: snooze A (conflicting) → suggestion set; snooze B (non-conflicting) →
  suggestion is `null`.
- Manual: the toast never refers to a task other than the one just acted on.

### P0.3 — Import can destroy everything, silently and irreversibly

**Problem.** `importJSON` replaces the entire state the moment a file is picked.
There is no confirmation and no undo, and because the only copy of the data lives in
this browser's `localStorage`, a mis-click on "Import JSON" is unrecoverable total
data loss.

**Evidence.** `src/store/useAppStore.ts`, `importJSON` — validates shape, then
`set(next); persist(migrated)` with no user gate. `src/App.tsx` calls it directly
from the file input's `onChange`.

**Fix.**
- Before replacing, show a confirmation dialog (use the app's own `Modal`, not
  `window.confirm`) stating what is about to be replaced: current task/user counts
  vs. the counts found in the file.
- Auto-export the current state to a download first, so the previous state is always
  recoverable. Name it `sidetrack-before-import-<date>.json`.
- Only then apply.

**Acceptance.**
- Importing a valid file shows the dialog; cancelling leaves state untouched.
- Confirming triggers the safety backup download, then applies the import.
- Unit test on the store action is not required for the dialog, but the
  "replace" path must keep its existing validation tests green.

### P0.4 — An import without `settings` crashes the status report

**Problem.** `importJSON` validates `schemaVersion`, `users`, `tasks`, and `auditLog`
— but not `settings`. A hand-edited or truncated export missing that key is accepted,
and then the digest dereferences `state.settings.lastDigestAt` and throws.

**Evidence.** `src/store/useAppStore.ts` `importJSON` (no `settings` check) →
`src/lib/digest.ts` `buildDigest`:

```ts
const isFirstEver = state.settings.lastDigestAt === null
```

**Fix.** Harden the boundary rather than the consumer. In `migrate()`
(`src/storage/StorageAdapter.ts`), normalise the result so every field the app relies
on is guaranteed present — fill missing `settings` from `createEmptyState()`. This
covers both import *and* a corrupted `localStorage`, which has the same failure mode.

While you are there: `migrate()` currently returns state whose `schemaVersion` is
*higher* than `CURRENT_SCHEMA_VERSION` unchanged (the `while` loop simply never runs).
That is a future-version file being loaded by an older build. Treat it as unreadable
and return `createEmptyState()` rather than guessing.

**Acceptance.**
- Unit test: `migrate({schemaVersion: 1, users: [], tasks: [], auditLog: []})` returns
  a state with a valid `settings` object.
- Unit test: `migrate({schemaVersion: 99, ...})` returns an empty state.
- Unit test: importing a payload without `settings` leaves the app able to build a digest.

---

## P1 — Data safety: make the localStorage reality visible

**Problem.** All data lives in one browser profile. Clearing site data, switching
browsers, or using a different machine loses everything, and nothing in the UI says so.
The Export button exists but nothing prompts anyone to use it. This is the single
largest structural risk in the product, and it is invisible until it bites.

**Constraint.** Do **not** solve this with a backend. The zero-cost, no-account rule
stands. Make the risk visible and the mitigation one click away instead.

**Fix.**
- Add `lastExportAt: Timestamp | null` to `AppSettings`, set by `exportJSON`.
  This is a schema change: bump `CURRENT_SCHEMA_VERSION` to 2 and write the first
  real entry in the `migrations` map — that seam exists precisely for this.
- Show a quiet, dismissible banner when there are tasks and either no export has ever
  happened or the last one is older than 14 days. Wording should state the actual
  situation plainly ("This data lives only in this browser") and offer the Export
  button inline. No red, no alarm styling — this is a nudge, not an error.
- Extend the README's storage note with the same one-line warning.

**Acceptance.**
- Migration test: a v1 state loads as v2 with `lastExportAt: null`, all other data intact.
- Exporting sets `lastExportAt` and hides the banner.
- Banner does not appear on an empty board.

---

## P2 — UI gaps that already produced bugs

### P2.1 — The start date cannot be set anywhere in the UI

**Problem.** `Task.startDate` is only reachable by dragging a bar in the Gantt view.
The new-task modal has no field for it, and the detail drawer edits `dueDate` but
never `startDate`. This is what produced the Gantt crash fixed earlier: a task created
with a past due date silently got `startDate = today()`, i.e. start after end.

The store now enforces `startDate <= dueDate` in `addTask`, `shiftDueDate`, and
`shiftStartDate`, so the crash is contained — but the user still cannot express
"this ran from X to Y", which is the whole point of a timeline tool.

**Evidence.** `src/components/NewTaskModal.tsx` (no start-date input),
`src/components/TaskDetailDrawer.tsx` (due date only), `src/store/useAppStore.ts`
(`updateTaskFields` already accepts `startDate`).

**Fix.** Add a start-date field to the detail drawer next to the due date. Keep the
invariant enforced in the store — the UI should not be the only guard — and surface a
clear inline message if the user picks a start after the due date, rather than silently
snapping it.

Leave the new-task modal minimal (title + due date + size + assignee is deliberately
low-friction); the drawer is the right place for the full date range.

**Acceptance.**
- Setting a start date in the drawer persists and moves the Gantt bar's left edge.
- Picking a start after the due date shows an inline message and does not corrupt state.
- Existing invariant tests in `useAppStore.test.ts` stay green.

### P2.2 — Milestone dates cannot be edited

**Problem.** `shiftMilestone` exists in the store and is exercised by the snooze flow,
but no UI path reaches it. A milestone with a wrong date can only be deleted and
recreated, which loses its audit trail.

**Evidence.** `src/store/useAppStore.ts` exposes `shiftMilestone`; the only caller is
`snoozeTask`. `src/components/TaskDetailDrawer.tsx` renders milestones with toggle and
remove only.

**Fix.** Make the milestone date editable in place in the drawer, routed through
`shiftMilestone` so the change lands in the audit log like every other date change.
A reason prompt is not required here — milestones are finer-grained than deadlines and
prompting for each would violate the low-friction rule.

**Acceptance.**
- Editing a milestone date writes a `milestone_shifted` audit entry.
- The Gantt milestone marker moves accordingly.

### P2.3 — Draft state leaks between tasks in the drawer

**Problem.** When the drawer switches to a different task, it resets `title`,
`description`, `deliverable`, `draftDueDate`, and `blockReason` — but not
`dueDateReason` or `dependencyError`. Type a reason for task A, don't save, switch to
task B, change B's date: A's reason is pre-filled and one click away from being
recorded as the justification for B's change.

**Evidence.** `src/components/TaskDetailDrawer.tsx`, the `useEffect` keyed on
`task?.id` — compare the fields it resets against the full `useState` list above it.

**Fix.** Reset every draft field in that effect. Consider deriving the reset from a
single `draft` object so a future field cannot be forgotten the same way.

**Acceptance.**
- Switching tasks clears the reason field and any dependency error.
- Test is optional here (component-level, no jsdom in this project) — verify in browser.

---

## P3 — Accessibility

**Problem.** `Modal` and `Drawer` render as plain `div`s. There is no `role="dialog"`,
no `aria-modal`, no focus trap, and no focus restoration on close. Keyboard users can
tab straight out of an open dialog into the page behind it, and screen readers do not
announce it as a dialog at all. The rest of the app is careful about this
(`aria-label`s on icon buttons, `title`s on avatars), so this is an inconsistency
rather than a deliberate trade-off.

**Fix.** In both components:
- `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` wired to the title.
- Move focus to the dialog on open; restore it to the previously focused element on close.
- Trap Tab/Shift+Tab within the dialog.
- Escape already closes both — keep that.

Write this once as a small shared hook rather than twice.

Also replace the `window.confirm` used for task deletion
(`src/components/TaskDetailDrawer.tsx`) with the app's own `Modal`, so the destructive
action matches the rest of the UI and gets the same focus handling.

**Acceptance.**
- Tab cycles only within an open dialog.
- Closing returns focus to the control that opened it.
- Deleting a task uses the styled dialog and still warns about dependents.

---

## P4 — Consistency and hygiene

### P4.1 — Rebuilt Map on every drawer render

`src/components/TaskDetailDrawer.tsx` builds `new Map(allTasks.map(...))` inline on
every render. The identical pattern was already memoised in `TaskBoard.tsx` during the
last review; this one was missed. Wrap it in `useMemo` keyed on `allTasks`.

### P4.2 — Two intentional lint warnings drown out real ones

`TaskDetailDrawer.tsx:53` and `GanttChart.tsx:84` both carry deliberate
`exhaustive-deps` warnings, each justified by a comment. Because they are permanent,
every lint run is noisy and a genuinely new warning would not stand out. Silence these
two with targeted `// oxlint-disable-next-line` comments that keep the existing
explanation, so the lint output returns to clean.

### P4.3 — Decide on the Miro scaffolding

`MiroSettings` sits in the schema, in `createEmptyState()`, and in the seed, but is
never read or written. README documents Miro export as deliberately deferred, so this
is intentional groundwork rather than dead code — but it has been carried in every
persisted state since launch with no consumer.

**Decide explicitly, do not leave it ambiguous:** either implement the export, or
remove the field as part of the schema-v2 migration in P1 (which is already touching
`AppSettings`, so the cost is near zero). Recommendation: **remove it.** Re-adding a
settings field later is trivial; carrying unused shape in persisted user data is not
free. Ask the user before removing, since it reverses a documented decision.

---

## P5 — Deployment reliability

### P5.1 — `cancel-in-progress` fights the Pages publish step

**Problem.** `.github/workflows/deploy.yml` sets:

```yaml
concurrency:
  group: pages
  cancel-in-progress: true
```

The Pages publish is asynchronous: `actions/deploy-pages` creates a deployment and
then polls GitHub for its status. Cancelling that job kills the *poller*, not the
deployment. The deployment keeps running server-side, and the next run is then rejected
with `due to in progress deployment`. This is exactly the failure chain observed in
production: six consecutive "failed" runs, several stuck deployment slots needing
manual API cancellation — and one deployment that had actually succeeded while its own
action reported failure.

**Fix.** Set `cancel-in-progress: false`. For a deploy workflow, queueing is correct;
cancelling mid-publish is what creates the inconsistency. This is GitHub's own
recommendation for Pages workflows.

**Acceptance.** Two pushes in quick succession queue rather than cancel, and both runs
end in a consistent state.

### P5.2 — Deprecated Node 20 actions

Every run warns that `actions/checkout@v4`, `actions/setup-node@v4`,
`actions/upload-artifact@v4`, and `actions/deploy-pages@v4` target Node 20 and are
being forced onto Node 24. Bump to the current major versions and set
`node-version: 22` (or the current LTS) in `setup-node`. Verify the build still passes
before pushing — this touches the only path to production.

---

## Explicitly out of scope

State these back to the user if they come up, rather than quietly building them:

- **Notifications / reminders for overdue tasks.** Impossible without a server or an
  always-open tab. The status report now covers this need; anything more needs a
  backend and breaks the zero-cost rule.
- **Multi-user sync.** Same constraint. Export/Import is the sanctioned path for moving
  data between people and machines. If real shared state ever becomes a requirement,
  that is a new architecture decision (Supabase free tier is the obvious candidate) and
  needs the user's explicit sign-off, not an incremental change.
- **Undo/redo.** The audit log records what happened but is not a command log, so undo
  would be a substantial redesign. Not worth it for the current usage.

## Suggested sequencing

P0 first — it is the smallest block and closes real correctness holes. P1 next, because
it changes the schema and P4.3 wants to ride along on the same migration. P5 is
independent and cheap; do it whenever the deploy pipeline is calm. P2 and P3 are the
largest UI blocks and can be split across sessions.

Commit each priority block separately with a German commit message describing the
defect, not just the change.
