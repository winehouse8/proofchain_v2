# Open Questions

## tree-view-sidebar - 2026-03-03

- [ ] Should group collapsed/expanded state be per-user or per-project? -- Currently planned as per-project (stored in DB). If multi-user support is added later, this may need revisiting.
- [ ] Should the tree view support multi-select (Ctrl+click multiple nodes)? -- Existing canvas supports multi-select via `SELECT_NODE` with `multi: true`. Tree view could mirror this, but adds complexity to group assignment UX.
- [ ] Should the sidebar width increase to accommodate the tree view, or stay at 220px? -- 220px is tight for node names + frequency display. Consider 260px or a resizable splitter.
- [ ] Is drag-and-drop between groups a v1 requirement or can it be deferred? -- Plan currently defers this to keep scope minimal. User assigns groups via PropertyPanel dropdown instead.
- [ ] Should ungrouped nodes appear at the top or bottom of the tree? -- Plan puts them at the bottom. User preference may differ.
- [ ] HITL reentry: confirm that this requires Scenario A (SPEC change) vs. Scenario B (code bug fix). -- Plan assumes Scenario A since this is a new feature, not a bug fix. This means full cycle through spec/tc/code/test.

## repo-reorganization - 2026-03-15

- [ ] Should `archiver` stay in root package.json or move to project? -- It is unclear whether `archiver` is used by the framework or only by the Clock Canvas app's export/import feature.
- [ ] Should HITL state support multiple projects? -- Currently `hitl-state.json` is a single file tracking one project. If future projects are added under `projects/`, should each get its own hitl-state, or should the single file grow an outer `projects` key?
- [ ] How to handle the `code.files` arrays in hitl-state.json? -- Currently these arrays are not populated (areas have `code: { status: "implemented" }` without file listings). If they get populated later, they need project-relative paths.
- [ ] Should `.omc/specs/` and `.omc/test-cases/` directories stay at root (empty) or be removed? -- Keeping them signals "framework convention." Removing them is cleaner but requires future projects to create them.
- [ ] Do the db files (clock-canvas.db, .test-e2e.db) need to be in `data/` subdirectory or project root? -- Plan puts them in `data/` but the server code references `DB_PATH` env var which defaults to a root-relative path. Needs server code update.
- [ ] Should the root `tests/` directory be kept or removed after migration? -- Framework has `src/phase0.test.ts` but no files in `tests/`. If root `tests/` is empty after moving app tests, it can be removed.
