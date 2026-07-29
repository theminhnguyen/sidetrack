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

Not built: Miro export (explicitly deferred in the plan — MVP is complete without it).

## Development

```bash
npm install
npm run dev      # start dev server
npm test         # run unit tests
npm run build    # production build
```

Data is stored in the browser's localStorage; use the Export/Import JSON
buttons to back up or move data between browsers.
