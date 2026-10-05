---
type: spec
status: approved
owner: Alex
created: 2026-10-05
---

# UX: Call folders folders

## 1. Why

GeckIt runs conversations in filesystem folders. Calling them projects suggests an extra object to create or manage. Alex requested "folder" and "folders" instead.

## 2. Surfaces

| Existing surface | Wording |
|---|---|
| Desktop and phone board, list, scope picker and search | "All folders", "Switch to a folder", "Folder" |
| New task and shortcut forms, conversation info | "Folder", "Choose a folder" |
| Settings and profiles | "Folders", "Folders in this profile" |
| Welcome, empty states, hidden conversations | "A folder", "Add a folder", "Folder added" |
| Composer, MCP, shortcuts help, voice and provider errors | Refer to the conversation's folder |
| System folder picker | "Choose a folder" |

## 3. States

Existing states and actions stay the same. No folders: add or choose a folder. One folder selected: its name. Several selected: "N folders". All selected: "All folders". Profiles and hosts keep their existing grouping and names.

## 4. Transitions

No new transitions; a diagram is not applicable to a terminology change. Picking, adding, removing, filtering and restoring folders use the existing controls and return paths.

## 5. What stays silent

Settings keys, component names, CSS classes, assistant protocol fields and CLI flags stay internal. No migration notice: existing folders and conversations appear normally.

## 6. Thresholds and timing

Not applicable: this change adds no thresholds, timers or loading behavior.

## 7. Exact wording

| Context | Text |
|---|---|
| All folders | "All folders" |
| Scope picker search | "Switch to a folder" |
| Picker empty result | "No folder by that name." |
| Task field and phone info | "Folder" |
| Add action | "Add a folder" |
| Hidden folder added | "Folder added" |
| Profile selection | "Folders in this profile" |
| Welcome heading | "A folder" |
| Welcome explanation | "Everything asked in a folder runs there, with access to its files." |
| Voice matching failure | "No folder fits what was said. Name the folder and try again." |

## 8. Edge cases

Folder names supplied by users, including a folder named "Projects", remain unchanged. Local and SSH folders use the same term. Singular/plural counts say "1 folder" and "2 folders". Existing settings and CLI clients retain compatibility.

## 9. Intentionally absent

No filesystem rename, data migration, new project abstraction or CLI contract rename. The request changes what people read in the app.

## 10. Decision

Use "folder" rather than "project" because the selected object is a filesystem folder. This supersedes "project" in older UX documents' descriptions of GeckIt controls; quoted third-party terminology and historical evidence retain their original wording.

## 11. Requirements and review

Covers Alex's request to rename projects to folders across desktop and phone. Review real components in Chrome in light and dark themes, with keyboard focus, picker filtering, task entry, profile settings and phone navigation. Preserve existing components and styles.

Reviewed in Chrome with the real Board, folder picker, NewTask, SettingsDialog, PhoneSettings, PhoneScope and PhoneProject components and the app styles. Desktop 1352x706 and phone 390x844: light/dark layout, alignment, focus, picker filtering and ArrowDown/Escape, task entry, profile selection, phone settings scrolling and Cancel return. Singular profile counts were corrected after visual review. Existing filesystem paths containing "Projects" remain literal paths.

No performance problems found in this wording change: memo comparisons, callbacks, list computation, object identities, virtualization, formatters, pointer updates and animations are unchanged. Runtime profiling was not needed for string-only edits. Native Electron system dialog and physical iPhone were not reviewed; phone folder enumeration is unavailable in the synthetic preview.

Publication checkout validation on current main: all 23 code files change only literal wording; syntax structure and CSS classes are identical to the base. Typecheck, changed-file ESLint, 58 focused tests, desktop build and mobile build pass.
