# Implementation Plan: Manager token economy

**Branch**: `037-manager-token-economy` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/037-manager-token-economy/spec.md`

## Summary

Manager spent most of a Claude Max 5x plan unattended: each background command of a working worker woke it, each update was its own turn, its conversation grew to about 760,000 tokens, and it woke itself after a limit reset. The fix narrows worker updates to milestones with short task labels, groups queued updates into one turn, compacts each Manager thread when its context reaches `compactAt` (default 240,000, a Manager setting) through a new `compacts`/`compact()` pair in the assistant contract, and replaces the unattended limit recovery with "deliver waiting messages, otherwise wait". Decisions and evidence: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (ESM), Node 22+, Electron with electron-vite, React 19

**Primary Dependencies**: Existing only. Claude Code stream-json (`/compact`, `compact_boundary`), Codex app-server (`thread/compact/start`)

**Storage**: Existing Manager store `manager.json` and settings in the service data directory

**Testing**: vitest against recorded output (`client/test/`, `client/test/fixtures/`)

**Target Platform**: macOS, Windows, Linux desktop and the headless service (EntechBot, TwinsAIbot)

**Project Type**: Desktop app with headless service

**Performance Goals**: One Manager turn per worker milestone; one turn per burst of updates; no Manager turn rereads more than `compactAt` plus one turn's growth

**Constraints**: No turn started without a waiting message after a limit reset; kept channel messages still answered at the reset; older `manager.json` and plugins load unchanged

**Scale/Scope**: Manager core (`client/src/main/manager.ts`), sessions and drivers (`client/src/main/sessions/`), the plugin contract doc, the Manager Setup row, Manager instructions, CLI schema

## Design handoff

[design.md](design.md): one Setup row and two thread states, wording in [contracts/manager-setting-and-wording.md](contracts/manager-setting-and-wording.md). `docs/ux/manager-threads.md` gets the "Keeping Manager cheap" section before code (Constitution IV). Validation: light and dark, desktop and phone widths, no automatic channel message at a reset or during compaction.

## Constitution Check

| Principle | Check | Result |
|---|---|---|
| I. The Person's Own Plan | Compaction runs in the person's own `claude`/`codex`; nothing adds an API key path. | Pass |
| II. One Contract Between Main and Windows | `compactAt` travels in `ManagerConfig` through the existing `manager.configure`/`view` contract; the phone reaches it through the existing Manager calls. | Pass |
| III. Recorded Output, Not Live Calls | Milestone filter, line shape, grouping and compaction decision are pure functions tested in vitest; driver `compact` tested against recorded Claude and Codex output. | Pass |
| IV. UX Before Pixels | UX section in `docs/ux/manager-threads.md` precedes the Setup row and states. | Pass (task ordered first) |
| V. Every System, One Word | Wording has no system names; "Compacting" and "Limit reset" are used in code, copy and docs alike. | Pass |
| VI. Tokens Only | The Setup row reuses existing `ManagerSettings` row classes; no new colours. | Pass |
| Constraint: files under about 400 lines | `manager.ts` is already far past it. New logic goes into a new `main/manager-economy.ts` (pure: milestone filter, update line, grouping, compaction decision); `manager.ts` only calls it. | Pass with note, see Complexity Tracking |

Re-check after Phase 1: unchanged; the contracts add no new IPC channel and no new dependency.

## Project Structure

### Documentation (this feature)

```text
specs/037-manager-token-economy/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── design.md
├── quickstart.md
├── contracts/
│   ├── assistant-compaction.md
│   └── manager-setting-and-wording.md
├── checklists/requirements.md
└── tasks.md              (/speckit-tasks)
```

### Source Code

```text
client/src/
├── shared/
│   ├── manager.ts                 # ManagerConfig.compactAt, DEFAULT_MANAGER_CONFIG, validation
│   └── configuration.ts           # export/import of compactAt
├── core/product-cli.ts            # manager.patch schema gains compactAt
├── main/
│   ├── manager-economy.ts         # NEW: isMilestone, updateLine, groupUpdates, shouldCompact
│   ├── manager.ts                 # observeSessions, #dispatch, #output, #awaitLimit, configure, load
│   ├── sessions/
│   │   ├── provider.ts            # LlmProvider.compacts
│   │   ├── heard.ts               # Driver.compact?
│   │   ├── plugin-api.ts          # re-export, compacts default false
│   │   ├── index.ts               # Sessions.compactManager
│   │   ├── claude.ts              # driver.compact via /compact
│   │   └── codex.ts               # driver.compact via thread/compact/start
├── prompts/                       # Manager rule on not scheduling own continuation
└── renderer/src/
    ├── chat/Manager.tsx           # Setup row "Compact conversation at"
    └── chat/manager-label.ts      # "Limit reset", "Compacting" states
client/test/
├── manager.test.ts                # US1-US4 scenarios
├── manager-economy.test.ts        # NEW: pure functions
├── claude-compact.test.ts         # NEW: recorded /compact turn
└── codex-compact.test.ts          # NEW: recorded thread/compact/start
docs/
├── provider-plugins.md            # compacts / compact()
├── ux/manager-threads.md          # "Keeping Manager cheap"
├── features.md                    # proposed entry, after Alex approves
└── feature-audit.md
```

**Structure Decision**: Existing `client/` layout. Pure logic in one new module next to `manager.ts`; assistant capability in the sessions layer beside `inject`.

## Implementation order

1. UX section in `docs/ux/manager-threads.md` (wording from the contract).
2. `manager-economy.ts` with tests: milestone filter and update line (US1), grouping (US2).
3. Wire US1 into `observeSessions` and US2 into `#dispatch`. Ship-ready alone: biggest saving.
4. Assistant contract: `compacts`, `Driver.compact`, Claude and Codex implementations with recorded-output tests, `Sessions.compactManager`, plugin docs.
5. `compactAt` in config, CLI schema, configuration transfer; compaction trigger in `#output`, hold in `#dispatch`, restore record on next turn (US3).
6. Limit reset (US4): `#awaitLimit` sets `reset`, `#dispatch` delivers only real waiting messages, `managerStand` wording, Manager instruction rule.
7. Setup row (desktop and phone), visual check in light/dark and both widths, `performance-review`.
8. `npm run lint`, `npm run typecheck`, `npm test`; live local check from [quickstart.md](quickstart.md).
9. Propose the `docs/features.md` entry to Alex; release and deploy to EntechBot only when asked.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `manager.ts` grows beyond the 400-line guideline | It is already about 1,400 lines; the hooks for dispatch, output and limits live there | Splitting `manager.ts` first would be a large refactor unrelated to the incident; new logic goes into `manager-economy.ts` instead, keeping additions in `manager.ts` to call sites |
