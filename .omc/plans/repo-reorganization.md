# Plan: Repository Reorganization — ProofChain Framework + Clock Canvas App Separation

**Created:** 2026-03-15
**Complexity:** HIGH
**Scope:** ~30 files moved/modified, 6 config files split/rewritten, 2 hook files updated

---

## Context

The repository currently mixes two distinct systems in a single directory:
1. **ProofChain Framework** -- ISO 26262 HITL development methodology (hooks, TS engine, skills, V-model)
2. **Clock Canvas App (p1)** -- React + Express web application for clock tree modeling

This creates coupling between framework and application concerns in `package.json`, `tsconfig.json`, and the `src/` directory. The goal is to isolate the Clock Canvas app into `projects/p1_clock_canvas/` while keeping the ProofChain framework at the repo root, so future projects can be added under `projects/`.

### Critical Findings from Investigation

1. **Cross-dependency**: `src/client/types.ts` imports from `../server/models/types.js`. After migration, since both `client/` and `server/` move together under `projects/p1_clock_canvas/src/`, this relative path remains valid.
2. **Hook path matching**: `check-phase.sh` uses `*/src/*`, `*/tests/*` pattern matching. The patterns `\bsrc/`, `\btests/` in grep will match `projects/p1_clock_canvas/src/` since `src/` appears as a word boundary. However, `$CWD/tests` in `verified_gate()` is hardcoded to root-level `tests/`.
3. **hitl-state.json paths**: Contains `.omc/specs/SPEC-CC-CV.md` and `.omc/test-cases/TC-CC-CV.json` -- these need updating after specs/TCs move to the project directory.
4. **All 3 areas (CV, CT, CG) are in `test` phase** -- migration touches paths that hooks enforce. Must be done carefully.
5. **`index.html`** references `/src/client/main.tsx` -- after migration, this becomes a project-local path.

---

## Work Objectives

- Separate Clock Canvas app files into `projects/p1_clock_canvas/`
- Split `package.json` and `tsconfig*.json` into framework-only (root) and app-specific (project)
- Update ProofChain hooks to support project subdirectories
- Update `hitl-state.json` paths to point to new spec/TC locations
- Verify the app builds and runs from its new location

---

## Guardrails

### Must Have
- App runs via `cd projects/p1_clock_canvas && npm install && npm run dev`
- Framework `npm run build` still compiles the TS engine at root
- HITL phase enforcement continues to work for files under `projects/p1_clock_canvas/src/`
- All existing tests pass from the project directory
- Git history preserved (use `git mv` for moves)
- `hitl-state.json` updated with correct paths to migrated specs/TCs

### Must NOT Have
- No changes to hook logic beyond path resolution updates
- No changes to ProofChain framework source code (`src/bridge/`, `src/core/`, etc.)
- No changes to HITL phase state (areas stay in `test` phase)
- No architectural changes to the Clock Canvas app itself

---

## Task Flow

```
Phase 1 (Scaffold)
  Create projects/p1_clock_canvas/ directory structure
  ↓
Phase 2 (Move Files)
  git mv app files: src/client/, src/server/, tests/, index.html,
  vite.config.ts, vitest.config.ts, playwright.config.ts, public/,
  CLOCKCANVAS.md, clock-canvas.db*, .test-e2e.db
  Move specs/TCs: .omc/specs/SPEC-CC-* → projects/p1_clock_canvas/docs/specs/
  Move TCs: .omc/test-cases/TC-CC-* → projects/p1_clock_canvas/docs/test-cases/
  Move doc: docs/itda-clock-canvas-research.md → projects/p1_clock_canvas/docs/research/
  ↓
Phase 3 (Config Split)
  Create project package.json (app deps only)
  Create project tsconfig.json, tsconfig.server.json
  Update project vite.config.ts, vitest.config.ts, playwright.config.ts paths
  Strip app deps from root package.json
  Strip app paths from root tsconfig.json
  ↓
Phase 4 (Hook Updates)
  Update check-phase.sh: verified_gate() test dir resolution
  Update check-phase.sh: area-to-file mapping for project paths
  Update trace-change.sh: test file area detection for project paths
  ↓
Phase 5 (State Updates)
  Update hitl-state.json: spec.file, tc.file paths
  Update hitl-state.json: project.paths
  ↓
Phase 6 (Verification)
  Framework: npm run build (root)
  App: cd projects/p1_clock_canvas && npm install && npm run dev
  App tests: npm test (vitest), npx playwright test
  Hook enforcement: verify HITL phase checks still trigger for project src/
```

---

## Detailed TODOs

### Phase 1: Scaffold Project Directory

Create the directory structure:
```
projects/p1_clock_canvas/
├── src/
├── tests/
├── docs/
│   ├── specs/
│   ├── test-cases/
│   └── research/
├── public/
└── data/
```

**Acceptance Criteria:**
- All directories exist
- No files moved yet

---

### Phase 2: Move Files via `git mv`

**App source code:**
```bash
git mv src/client projects/p1_clock_canvas/src/client
git mv src/server projects/p1_clock_canvas/src/server
```

**Tests:**
```bash
git mv tests/unit projects/p1_clock_canvas/tests/unit
git mv tests/component projects/p1_clock_canvas/tests/component
git mv tests/e2e projects/p1_clock_canvas/tests/e2e
git mv tests/client projects/p1_clock_canvas/tests/client  # if exists
git mv tests/server projects/p1_clock_canvas/tests/server  # if exists
```

**Config files (to project root):**
```bash
git mv index.html projects/p1_clock_canvas/index.html
git mv vite.config.ts projects/p1_clock_canvas/vite.config.ts
git mv vitest.config.ts projects/p1_clock_canvas/vitest.config.ts
git mv playwright.config.ts projects/p1_clock_canvas/playwright.config.ts
git mv CLOCKCANVAS.md projects/p1_clock_canvas/README.md
git mv public projects/p1_clock_canvas/public
```

**tsconfig files:**
```bash
git mv tsconfig.client.json projects/p1_clock_canvas/tsconfig.json
git mv tsconfig.server.json projects/p1_clock_canvas/tsconfig.server.json
```

**Database files:**
```bash
git mv clock-canvas.db projects/p1_clock_canvas/data/clock-canvas.db  # if tracked
# .db-shm, .db-wal, .test-e2e.db are likely gitignored; add to project .gitignore
```

**Specs and TCs (copy then remove from .omc/):**
```bash
cp .omc/specs/SPEC-CC-CV.md projects/p1_clock_canvas/docs/specs/
cp .omc/specs/SPEC-CC-CT.md projects/p1_clock_canvas/docs/specs/
cp .omc/specs/SPEC-CC-CG.md projects/p1_clock_canvas/docs/specs/
cp .omc/specs/SYSTEM-CONTEXT.md projects/p1_clock_canvas/docs/specs/
cp .omc/test-cases/TC-CC-CV.json projects/p1_clock_canvas/docs/test-cases/
cp .omc/test-cases/TC-CC-CT.json projects/p1_clock_canvas/docs/test-cases/
cp .omc/test-cases/TC-CC-CG.json projects/p1_clock_canvas/docs/test-cases/
# Remove originals after hitl-state.json is updated (Phase 5)
```

**Docs:**
```bash
git mv docs/itda-clock-canvas-research.md projects/p1_clock_canvas/docs/research/
```

**Acceptance Criteria:**
- `src/client/` and `src/server/` no longer exist at root
- `tests/unit/`, `tests/component/`, `tests/e2e/` no longer at root (root `tests/` may remain empty or be removed)
- All files appear under `projects/p1_clock_canvas/` with git history preserved
- Root `src/` contains only framework directories (bridge/, core/, hooks/, etc.)

---

### Phase 3: Config File Split

#### 3a. Create `projects/p1_clock_canvas/package.json`

New file with app-specific dependencies extracted from root:

**dependencies** (move from root):
- `@vitejs/plugin-react`, `@xyflow/react`, `better-sqlite3`, `cors`, `express`, `react`, `react-dom`, `uuid`, `vite`

**devDependencies** (move from root):
- `@playwright/test`, `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event`, `@types/better-sqlite3`, `@types/cors`, `@types/express`, `@types/react`, `@types/react-dom`, `@types/supertest`, `@types/uuid`, `jsdom`, `supertest`, `tsx`, `typescript`, `vitest`

**scripts:**
```json
{
  "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "dev:server": "tsx src/server/index.ts",
  "dev:client": "vite",
  "build": "tsc -p tsconfig.server.json && vite build",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

#### 3b. Update root `package.json`

Strip all app-specific dependencies. Keep only:
- `archiver` (if used by framework)
- `typescript`, `@types/node` (framework compilation)
- Framework-specific deps

Update scripts: remove `build:server`, `dev:server`. Keep `build` (tsc for framework), `test`, `lint`.

#### 3c. Update `projects/p1_clock_canvas/tsconfig.json` (was tsconfig.client.json)

Change include paths from `src/client/**` to local:
```json
{
  "include": ["src/client/**/*.ts", "src/client/**/*.tsx", "vite.config.ts"]
}
```
(No change needed since relative paths are the same within the project dir.)

#### 3d. Update `projects/p1_clock_canvas/tsconfig.server.json`

Change:
- `outDir`: `dist/server` (relative to project)
- `rootDir`: `src` (relative to project)
- `include`: `["src/server/**/*.ts"]`

(No change needed since relative paths are the same.)

#### 3e. Update `projects/p1_clock_canvas/vite.config.ts`

Change `build.outDir` from `dist/client` -- stays the same (now relative to project root).
The `root: '.'` stays correct. No change needed.

#### 3f. Update `projects/p1_clock_canvas/vitest.config.ts`

Paths are relative (`src/**/*.test.ts`, `tests/**/*.test.ts`) -- stays correct. No change needed.

#### 3g. Update `projects/p1_clock_canvas/playwright.config.ts`

`testDir: './tests/e2e'` stays correct.
`command: 'npx tsx src/server/index.ts'` stays correct (relative to project root).

#### 3h. Update root `tsconfig.json`

Remove `src/client` and `src/server` from compilation. Currently `include: ["src/**/*.ts"]` -- this now only compiles framework code since client/server are gone.
No change needed since the directories no longer exist at root.

**Acceptance Criteria:**
- `cd projects/p1_clock_canvas && npm install` succeeds
- Root `npm install && npm run build` compiles only framework TS
- No duplicate dependencies between root and project `package.json`

---

### Phase 4: Hook Updates

#### 4a. `check-phase.sh` -- `verified_gate()` test directory

**Current (line 274):**
```bash
local test_dir="$CWD/tests"
```

**Change to:** Resolve test directory from `hitl-state.json` project paths, or scan both `$CWD/tests` and `$CWD/projects/*/tests`:
```bash
local test_dir="$CWD/tests"
local project_test_dir=$(jq -r '.project.paths.tests // empty' "$STATE" 2>/dev/null)
if [ -n "$project_test_dir" ]; then
  test_dir="$CWD/$project_test_dir"
fi
```

#### 4b. `check-phase.sh` -- area file mapping for `IS_SRC` / `IS_TEST`

**Current (line 1063-1073):** Area matching uses `endswith()` on `code.files[]` and regex on `tests/[^/]+/([A-Z]{2})`.

After migration, file paths will be like `/path/to/proofchain/projects/p1_clock_canvas/src/server/...`. The `endswith()` check should still work if `code.files` in hitl-state.json is updated. The test area extraction regex `tests/[^/]+/([A-Z]{2})` should still match since `projects/p1_clock_canvas/tests/unit/CV` still contains `tests/.../(CV)`.

**Change:** Update `hitl-state.json` `code.files` arrays to use project-relative paths (see Phase 5). No hook code change needed for this.

#### 4c. `check-phase.sh` -- `IS_SRC` / `IS_TEST` detection

**Current (line 1000-1005):**
```bash
*/src/*)             IS_SRC=true ;;
*/tests/*)           IS_TEST=true ;;
```

These already match `projects/p1_clock_canvas/src/*` and `projects/p1_clock_canvas/tests/*`. No change needed.

#### 4d. `check-phase.sh` -- Bash handler `src/` and `tests/` detection

**Current (line 747-750):**
```bash
echo "$CMD" | grep -qE '\bsrc/' && BASH_SRC=true
echo "$CMD" | grep -qE '\btests/' && BASH_TEST=true
```

These match `projects/p1_clock_canvas/src/` because `src/` is still present as a substring. No change needed.

#### 4e. `trace-change.sh` -- Test area detection

**Current (line 60):**
```bash
TEST_AREA=$(echo "$FILE_PATH" | grep -oE 'tests/[^/]+/([A-Z]{2})' | grep -oE '[A-Z]{2}$' || true)
```

Still matches `projects/p1_clock_canvas/tests/unit/CV/...`. No change needed.

**Acceptance Criteria:**
- HITL phase enforcement blocks writes to `projects/p1_clock_canvas/src/` when no area is in `code`/`test` phase
- `verified_gate()` scans the correct test directory for `@tc`/`@req` annotations
- Auto-backward triggers correctly when `projects/p1_clock_canvas/src/` is modified in `test` phase

---

### Phase 5: State File Updates

#### 5a. Update `hitl-state.json` -- project paths

```json
"project": {
  "code": "CC",
  "name": "Clock Canvas Web",
  "system_context": "projects/p1_clock_canvas/docs/specs/SYSTEM-CONTEXT.md",
  "paths": {
    "specs": "projects/p1_clock_canvas/docs/specs",
    "test_cases": "projects/p1_clock_canvas/docs/test-cases",
    "src": "projects/p1_clock_canvas/src",
    "tests": "projects/p1_clock_canvas/tests"
  }
}
```

#### 5b. Update `hitl-state.json` -- area spec/tc file paths

For each area (CV, CT, CG):
```json
"spec": { "file": "projects/p1_clock_canvas/docs/specs/SPEC-CC-CV.md", ... },
"tc": { "file": "projects/p1_clock_canvas/docs/test-cases/TC-CC-CV.json", ... }
```

#### 5c. Remove original specs/TCs from `.omc/`

After confirming hitl-state.json paths are updated and verified_gate() works:
```bash
rm .omc/specs/SPEC-CC-CV.md .omc/specs/SPEC-CC-CT.md .omc/specs/SPEC-CC-CG.md .omc/specs/SYSTEM-CONTEXT.md
rm .omc/test-cases/TC-CC-CV.json .omc/test-cases/TC-CC-CT.json .omc/test-cases/TC-CC-CG.json
```

Keep `.omc/specs/` and `.omc/test-cases/` directories (empty) for future framework use.

**Acceptance Criteria:**
- `hitl-state.json` paths resolve correctly to new locations
- `jq '.areas.CV.spec.file' .omc/hitl-state.json` returns `projects/p1_clock_canvas/docs/specs/SPEC-CC-CV.md`
- verified_gate() can find TC JSON files at new paths

---

### Phase 6: Verification

Run these checks in order:

1. **Framework build:**
   ```bash
   npm run build  # at root -- compiles framework TS only
   ```

2. **App install and build:**
   ```bash
   cd projects/p1_clock_canvas
   npm install
   npm run build
   ```

3. **App dev server:**
   ```bash
   cd projects/p1_clock_canvas
   npm run dev  # verify http://localhost:5173 loads
   ```

4. **Unit/component tests:**
   ```bash
   cd projects/p1_clock_canvas
   npm test
   ```

5. **E2E tests:**
   ```bash
   cd projects/p1_clock_canvas
   npx playwright test
   ```

6. **Hook enforcement test:**
   - Attempt to edit `projects/p1_clock_canvas/src/server/index.ts` while all areas are in `test` phase -- should trigger auto-backward
   - Attempt to edit `projects/p1_clock_canvas/src/client/App.tsx` -- should be allowed (areas in code/test)

7. **verified_gate test:**
   - Confirm `@tc`/`@req` scanning works against `projects/p1_clock_canvas/tests/`

8. **Root README update:**
   - Add section linking to `projects/p1_clock_canvas/` with brief description

**Acceptance Criteria:**
- All 7 checks pass
- No regressions in framework functionality
- Developer can work on Clock Canvas from `projects/p1_clock_canvas/` with full HITL enforcement

---

## Success Criteria

1. Clock Canvas app fully isolated in `projects/p1_clock_canvas/` with its own `package.json`, `tsconfig`, and build pipeline
2. ProofChain framework at root compiles and functions independently
3. HITL hooks enforce phase rules for project subdirectory files
4. `hitl-state.json` correctly tracks specs/TCs at new paths
5. All existing tests pass from the project directory
6. Git history preserved for moved files

---

## Risk Notes

- **Highest risk**: Hook path resolution. The `verified_gate()` function's `$CWD/tests` hardcoded path is the only hook code that MUST change. All other hook patterns match via substring/glob and work with the deeper path.
- **Medium risk**: `package.json` split. Some deps may be shared (e.g., `typescript`). Both root and project may need their own copy.
- **Low risk**: Relative imports within client/server. Since both move together, `../server/models/types.js` from client remains valid.
