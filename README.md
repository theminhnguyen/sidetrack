# SideTrack

Internal team-management tool for tracking side-projects that run alongside the
regular day job — capacity-aware, low-friction, zero-cost.

**Live demo:** https://theminhnguyen.github.io/sidetrack/

See [PLAN.md](./PLAN.md) for the full technical concept and development plan
(handover document from Fable 5 to Sonnet 5).

## Status

All MVP phases from the plan are implemented:

- Task & team management (board view, capacity traffic light per person)
- Snooze with quick-pick reasons, dependency cycle & conflict detection, cascade suggestions
- Interactive Gantt view (drag to reschedule, milestones, per-assignee colors)
- 1-click status digest and PowerPoint export
- Light/dark mode
- Deployed to GitHub Pages via GitHub Actions

See [PLAN-V2.md](./PLAN-V2.md) for the post-launch review and what it found —
data-integrity fixes to the cascade/import flow, the local-storage-visibility
nudge below, and what's still open.

## Development

```bash
npm install
npm run dev      # start dev server
npm test         # run unit tests
npm run build    # production build
```

Data is stored in the browser's localStorage; use the Export/Import JSON
buttons to back up or move data between browsers. **This is the only copy —
it lives in this one browser profile and nowhere else.** Clearing site data,
switching browsers, or moving to a different machine loses it unless you've
exported first. The app nudges you to export if a board with tasks hasn't
been backed up in 14 days; there's no cloud sync and, by design, no backend.
