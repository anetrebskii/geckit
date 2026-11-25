# Implementation Plan: Tags on tasks

**Branch**: `038-task-tags` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/038-task-tags/spec.md`

## Summary

Tasks carry the person's own tags: a catalog of named, coloured tags in settings and a list of tag ids on each task's note. One picker, reused on the card menu, conversation header, details panel, New task form and phone sheet, adds, creates, renames, recolours and deletes them. Board, list and phone rows show up to three chips; Filters narrows by any of the chosen tags or by none; Search matches tag names; the CLI lets Manager and workers read and write tags. Design: [design.md](design.md), UX [docs/ux/task-tags.md](../../docs/ux/task-tags.md), prototype [docs/design/task-tags.html](../../docs/design/task-tags.html).

## Technical Context

**Language/Version**: TypeScript (ESM), Node 22+, React 19

**Primary Dependencies**: Electron with electron-vite; existing `ui/Menu.tsx`, `ui/Sheet.tsx`, client view (`core/client-view.ts`)

**Storage**: service settings JSON (`main/store.ts`) for the catalog and filter; session notes (`SessionNote` in `main/sessions/index.ts`) for each task's tags

**Testing**: vitest against fixtures and pure functions (`client/test/`), renderer preview harness in a browser for UI review

**Target Platform**: macOS, Windows, Linux desktop; iPhone and Android through Capacitor; headless service

**Project Type**: desktop app with a service, phone app and CLI

**Performance Goals**: chips add no per-card lookup beyond a prebuilt map; board of 200 cards filters without visible delay (SC-003)

**Constraints**: wording verbatim from UX section 7; tokens only; no new dependency; files under ~400 lines (new `TagPicker.tsx`, `TaskTags.tsx`, `core/tags.ts` rather than growing `Board.tsx`)

**Scale/Scope**: tens of tags, hundreds of tasks per computer

## Constitution Check

| Principle | Status |
|---|---|
| I. The Person's Own Plan | Not affected: no process, credential or environment change |
| II. One Contract Between Main and Windows | Pass: new methods `chat:tag`, `tags:edit`, `tags:delete` go through `shared/api.ts` / `renderer-api.ts` / `core/application.ts` and `CORE_CHANNELS`; catalog and filter live in service settings, never `localStorage` |
| III. Recorded Output, Not Live Calls | Pass: validation, filter matching and delete clean-up are pure in `core/tags.ts` with vitest coverage; CLI covered by the existing `product-sessions` test style |
| IV. UX Before Pixels | Pass with a condition: UX document and prototype exist; implementation starts only after Alex approves the UX document (design.md Open Decisions) |
| V. Every System, One Word | Pass: one term "tag"; no system-specific copy; the details panel toggle reads the same everywhere |
| VI. Tokens Only | Pass: chips and picker use `--project-N` and existing tokens; no literal colour |

Post-design re-check: unchanged; no exception for Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/038-task-tags/
├── spec.md
├── design.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── service-and-cli.md
│   └── ui-surfaces.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
client/src/
├── shared/api.ts                     # TaskTag, Settings.taskTags/tagFilter, ChatSession.tags, SessionMessage.tags, defaults
├── shared/renderer-api.ts            # chat.tag, tags.edit, tags.delete
├── core/tags.ts                      # new: validate name, resolve/create, edit, delete clean-up, matchesTags
├── core/application.ts               # service methods
├── core/product-sessions.ts          # sessions tag, list --tag, tags in list rows
├── main/store.ts                     # normalise taskTags and tagFilter
├── main/sessions/index.ts            # SessionNote.tags, row builder, tags on new tasks, setTags/stripTag
├── main/index.ts                     # CORE_CHANNELS
└── renderer/src/
    ├── chat/Tags.tsx                 # chips with dot and "+N"
    ├── chat/TagPicker.tsx            # new: picker, row options, rename, colour, delete dialog, phone sheet
    ├── chat/TaskTags.tsx             # new: details panel section
    ├── chat/Board.tsx                # card menu "Tags", resolved tags map
    ├── chat/Chat.tsx                 # header chips, inspector for every task, New task Tags control
    ├── chat/TaskFilters.tsx          # Tags page
    ├── chat/Switcher.tsx             # tag names in search
    ├── chat/useChat.ts               # tag filter in visibleSessions
    ├── chat/PhoneBoard.tsx, PhoneInfo.tsx  # phone chips, info row, row menu
    ├── tags-preview.html, tags-preview.tsx # review harness
    └── styles.css                    # chip dot, picker rows, panel section

client/test/
├── tags.test.ts                      # core/tags.ts
├── tags-sessions.test.ts             # notes, row builder, delete clean-up
└── tags-cli.test.ts                  # sessions tag / list --tag
```

**Structure Decision**: existing single client package; new logic in `core/tags.ts`, new UI in two components, everything else is small additions to the files that own each surface.

## Validation constraints from the design

- Wording verbatim from UX section 7; chips 3 then "+N" on cards and headers, all in the panel; names 1..32; 8 colours.
- Review in light and dark at 1440x900, 1024x768, 390x844, 320x568; keyboard reach of each row's "..."; Escape closes the innermost layer.
- `performance-review` with 200 cards before calling the UI done.
- UX document approval by Alex before implementation (constitution IV).

## Complexity Tracking

None.
