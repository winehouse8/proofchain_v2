# Plan: Tree-View Component Hierarchy in Left Sidebar

**Created:** 2026-03-03
**Area:** CV (Canvas Editor)
**Complexity:** MEDIUM
**HITL Impact:** Currently in test phase (cycle 1). Source modifications will trigger auto-backward to code phase. Reentry path: Scenario C (test code error) or new SPEC + TC cycle depending on scope decision below.

---

## Context

The left sidebar currently contains only a Palette component (`Palette.tsx`) -- a flat list of 6 draggable component types used as drag sources for placing nodes on the canvas. Users want to see and manage **already-placed** components in a tree-view hierarchy with grouping capabilities.

**Current state:**
- `Palette.tsx`: 6 static entries, DnD via `application/clock-canvas-type` dataTransfer
- `AppState.nodes: ClockNode[]`: flat array, no parent/group concept
- DB `nodes` table: flat (id, project_id, type, properties, position_x, position_y)
- Sidebar width: 220px (`--sidebar-width` CSS variable)
- 1024 vitest + 32 playwright tests currently passing

---

## Work Objectives

1. Add a tree-view panel below the existing Palette showing all placed nodes
2. Support client-side grouping (create, rename, delete, drag-to-reorder)
3. Clicking a node in the tree selects it on canvas; selecting on canvas highlights in tree
4. Persist group assignments to backend (lightweight schema addition)

---

## Guardrails

### Must Have
- Existing Palette DnD to canvas continues to work unchanged
- Tree view reflects real-time node additions/removals from canvas
- Selecting a node in tree selects it on canvas (and vice versa)
- Collapse/expand groups
- All existing 1024 vitest + 32 playwright tests remain green

### Must NOT Have
- No drag-and-drop reordering of nodes between groups in v1 (keep scope small)
- No nested groups (single-level grouping only)
- No changes to `ClockNode` server type or node DB schema columns
- No breaking changes to existing REST API contracts

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sidebar layout | Palette (top, collapsible) + TreeView (bottom, flex-grow) | Keeps palette accessible; tree view gets remaining space |
| Grouping persistence | New `node_groups` DB table + `group_id` on nodes | Lightweight; no existing column changes; survives reload |
| Default tree organization | Ungrouped nodes listed flat; user creates groups manually | Simple mental model; no auto-categorization surprises |
| Group features (v1) | Create, rename, delete group; assign node to group via property panel | Avoids complex DnD between tree items |
| Selection sync | Bidirectional -- tree click dispatches `SELECT_NODE`; `selectedNodeIds` highlights tree row | Uses existing selection infrastructure |

---

## Task Flow

```
Step 1: Backend (groups table + API)
   |
   v
Step 2: State management (groups in AppState + reducer actions)
   |
   v
Step 3: LeftSidebar container (Palette + TreeView layout)
   |
   v
Step 4: TreeView component (render nodes/groups, selection sync, collapse/expand)
   |
   v
Step 5: Group management UI (create/rename/delete + assign via PropertyPanel)
   |
   v
Step 6: Tests + regression
```

---

## Detailed TODOs

### Step 1: Backend -- Group Persistence Layer

**Files to modify:**
- `src/server/db.ts` -- add `node_groups` table, add `group_id` column to nodes
- `src/server/models/types.ts` -- add `NodeGroup` type, update `ClockNode` with optional `group_id`
- `src/server/routes/` -- add group CRUD endpoints

**What to do:**
- Create `node_groups` table: `id TEXT PK, project_id TEXT FK, name TEXT, sort_order INTEGER, collapsed INTEGER DEFAULT 0`
- Add nullable `group_id TEXT REFERENCES node_groups(id) ON DELETE SET NULL` to `nodes` table
- Add REST endpoints:
  - `GET /api/projects/:id/groups` -- list groups for project
  - `POST /api/projects/:id/groups` -- create group
  - `PATCH /api/groups/:id` -- rename group, update collapsed state
  - `DELETE /api/groups/:id` -- delete group (nodes become ungrouped)
- Update `GET /api/projects/:id` response to include `groups` array
- Update `PATCH /api/nodes/:id` to accept optional `group_id`

**Acceptance criteria:**
- `node_groups` table is created on DB init
- Group CRUD endpoints return correct HTTP status codes
- Deleting a group sets `group_id = NULL` on its nodes (not deleting nodes)
- `ProjectData` response includes `groups: NodeGroup[]`
- Existing node/edge API contracts unchanged (group_id is optional/additive)

---

### Step 2: Client State Management -- Groups in AppState

**Files to modify:**
- `src/client/types.ts` -- re-export `NodeGroup`, add `groups` to `AppState`, add group-related `AppAction` variants
- `src/client/store.ts` -- add group-related reducer cases, update `SET_PROJECT` to load groups

**What to do:**
- Add to `AppState`: `groups: NodeGroup[]`
- Add `AppAction` variants: `SET_GROUPS`, `ADD_GROUP`, `UPDATE_GROUP`, `REMOVE_GROUP`, `ASSIGN_NODE_TO_GROUP`
- `SET_PROJECT` action includes groups from server response
- `ASSIGN_NODE_TO_GROUP` updates the node's `group_id` in state
- Add selector hook: `useGroups(): NodeGroup[]`, `useNodesByGroup(groupId: string | null): ClockNode[]`

**Acceptance criteria:**
- `initialState.groups` is `[]`
- `SET_PROJECT` populates groups from server
- `ADD_GROUP` / `REMOVE_GROUP` / `UPDATE_GROUP` correctly mutate `groups` array
- `ASSIGN_NODE_TO_GROUP` updates the target node's `group_id`
- `REMOVE_GROUP` also clears `group_id` from all nodes in that group

---

### Step 3: LeftSidebar Container -- Layout Restructure

**Files to create:**
- `src/client/components/LeftSidebar.tsx` -- container component

**Files to modify:**
- `src/client/App.tsx` -- replace `<Palette />` with `<LeftSidebar />`
- `src/client/styles.css` -- add `.left-sidebar`, adjust `.palette` styles

**What to do:**
- `LeftSidebar` renders a vertical split: collapsible `Palette` section (top) and `TreeView` section (bottom, flex-grow)
- Palette section has a clickable header to collapse/expand (local state)
- CSS: `.left-sidebar` gets `width: var(--sidebar-width)`, flexbox column layout
- Palette keeps all existing styles but becomes a child of `.left-sidebar`

**Acceptance criteria:**
- `App.tsx` renders `<LeftSidebar />` instead of `<Palette />`
- Palette DnD to canvas still works exactly as before
- Palette section can collapse to just its header
- TreeView section fills remaining vertical space
- Visual appearance of palette items unchanged

---

### Step 4: TreeView Component -- Node Hierarchy Display

**Files to create:**
- `src/client/components/TreeView.tsx` -- tree view with groups and nodes
- `src/client/components/TreeNodeItem.tsx` -- single node row in tree

**Files to modify:**
- `src/client/styles.css` -- tree view styles

**What to do:**
- TreeView reads `nodes` and `groups` from `useAppState()`
- Renders groups as collapsible sections, ungrouped nodes at root level
- Each node row shows: colored type icon (same as palette), node name (from `properties.name`), computed frequency
- Clicking a node row dispatches `SELECT_NODE` action
- Selected nodes (`selectedNodeIds`) get a highlight class
- Groups show collapse/expand chevron + node count badge
- Group collapsed state stored in `NodeGroup.collapsed` (synced to server)
- Empty state: "No components placed yet" message

**Acceptance criteria:**
- All placed nodes appear in tree view, organized by their `group_id`
- Ungrouped nodes appear under an "Ungrouped" section at the bottom
- Clicking a tree node selects it on canvas (verified by `selectedNodeIds`)
- Selecting a node on canvas highlights it in tree view
- Adding/removing nodes on canvas immediately reflects in tree view
- Group collapse/expand works and persists

---

### Step 5: Group Management UI

**Files to modify:**
- `src/client/components/TreeView.tsx` -- add group action buttons
- `src/client/components/PropertyPanel.tsx` -- add group assignment dropdown
- `src/client/styles.css` -- group management styles

**What to do:**
- TreeView header area: "+" button to create new group (inline text input)
- Group header: right-click context menu or inline icons for rename/delete
- PropertyPanel: when a node is selected, show a "Group" dropdown field listing all groups + "None"
- Changing the dropdown dispatches `ASSIGN_NODE_TO_GROUP` and PATCHes the server
- Deleting a group shows a brief confirmation (nodes are kept, just ungrouped)

**Acceptance criteria:**
- User can create a new group with a custom name
- User can rename an existing group (inline edit)
- User can delete a group (nodes become ungrouped, not deleted)
- User can assign a selected node to a group via PropertyPanel dropdown
- All group operations persist to server (survive page reload)

---

### Step 6: Tests + Regression

**Files to create:**
- `tests/unit/CV/tree-view.test.tsx` -- TreeView unit tests
- `tests/unit/CV/left-sidebar.test.tsx` -- LeftSidebar unit tests
- `tests/component/CV/group-management.test.tsx` -- group CRUD component tests

**Files to modify:**
- `tests/unit/CV/palette.test.tsx` -- update if Palette rendering context changes (may need LeftSidebar wrapper or remain unchanged if Palette is still independently renderable)

**What to do:**
- Unit tests for TreeView: renders nodes, handles empty state, selection sync, group collapse
- Unit tests for LeftSidebar: renders both Palette and TreeView, palette collapse
- Component tests for group management: create/rename/delete group, assign node to group
- Run full regression: all 1024 vitest + 32 playwright tests must pass
- Verify existing `palette.test.tsx` still passes (6 palette items check)

**Acceptance criteria:**
- New tests cover: tree view rendering, selection sync, group CRUD, empty states
- All existing 1024 vitest tests pass
- All existing 32 playwright tests pass
- No visual regressions in palette DnD behavior

---

## HITL Process Notes

**Current state:** CV area is in `test` phase, cycle 1.

**Required process:**
1. This is new feature work requiring SPEC changes (new REQs for tree view + grouping)
2. Reentry Scenario A: SPEC change needed -> reenter at `spec` phase, `cycle++` to 2
3. Full path: `spec` (update SPEC-CC-CV.md with tree view REQs) -> `tc` (generate supplementary TCs) -> `code` (implement) -> `test` (verify)
4. Since cycle > 1, full regression testing is mandatory (ISO 26262 Part 6 S9.4.6)

**Before implementation begins:**
- Transition CV area from `test` to `spec` via reentry
- Update SPEC-CC-CV.md with new requirements (REQ-CV-028+)
- Generate supplementary TCs for tree view functionality
- Then proceed through code and test phases

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Palette DnD breaks | Low | High | Palette component stays identical; only its container changes |
| Existing test failures | Low | High | Palette.test.tsx renders Palette directly, not via LeftSidebar |
| DB migration on existing data | Medium | Medium | `group_id` is nullable + `ON DELETE SET NULL`; safe additive migration |
| Performance with many nodes | Low | Low | MAX_NODES_PER_PROJECT is 200; tree rendering is trivial at this scale |
| Selection sync race conditions | Low | Medium | Both directions use same `selectedNodeIds` state; single source of truth |

---

## Success Criteria

1. Left sidebar shows Palette (collapsible) + TreeView (placed nodes)
2. Users can create/rename/delete groups and assign nodes to them
3. Clicking tree node selects on canvas; clicking canvas node highlights in tree
4. Groups persist across page reloads (backed by server)
5. All 1024 + 32 existing tests pass; new tests cover tree view functionality
6. Palette DnD to canvas works exactly as before
