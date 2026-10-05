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

## Windows folder names and paths

Alex reported that New task shows `C:\Users\niraj\Downloads\hypergen` as the folder name on Windows. The name helper currently separates only `/`. Use the final nonempty segment of either `/` or `\` as the display name for local Windows folders; POSIX folders on SSH hosts keep POSIX parsing.

New task shows the folder name and selected path as secondary text in its selector. The example is "hypergen", then "C:\Users\niraj\Downloads\hypergen". Long paths truncate within the control and their complete text is available on hover. Empty selection shows no path; switching folders updates both the name and the path. Cancel, focus, task dispatch and stored roots retain their existing behavior. No new state or timing applies.

The shared name fix also applies to board cards, scope pickers, profiles, shortcuts and the phone, wherever those surfaces already call the helper. Local drive paths, UNC paths, mixed separators and trailing separators receive regression coverage. Filesystem paths remain unchanged.

### Shared picker for one folder

Alex requested reusing the board's folder selector with props for single selection. New task uses the same searchable menu and folder rows: name first, path second, with Local/SSH host grouping. A single-selection prop supplies the selected root and callback; choosing a folder updates the task draft and closes the menu without changing the board scope. The selected button also shows name and path.

Single mode omits "All folders", multiselect checkboxes, scope selection for host headers, work counts, color editing, removing folders, adding hosts and hidden conversations. Existing board selection keeps those actions. "Add a folder..." selects the native chooser's returned folder for the task; adding a folder on a connected SSH host uses the existing HostFolders sheet and selects its result. Cancel preserves the previous selection.

Typing filters by folder name and path. Arrow keys move between selectable folder/add rows, skipping group headers; Enter selects one; Escape closes only the folder menu and restores focus to its button. Empty results say "No folder by that name." The phone retains its existing PhoneProject single-folder sheet, with the Windows name fix applied through the shared name helper.

Reviewed the shared picker in Chrome with real NewTask, Projects, Board and PhoneProject components: desktop 1352x706, compact desktop 760x520, phone 390x844, light and dark themes. Verified single selection leaves board scope unchanged, name/path filtering, empty search, Enter, Escape from the input and footer with focus return, connected/disconnected SSH groups, board multiselect and management actions, long Windows paths, and a 34-folder scrolling menu. Selected rows remain visible during keyboard navigation and the single picker's search field stays visible while scrolling. The phone sheet selects one Windows folder and returns to the task form. Native filesystem chooser, actual SSH enumeration and physical Windows/iPhone execution were unavailable in the browser preview.

Performance review: no performance problems found. Shared menu rows and pointer highlight behavior retain the existing implementation, including guarded flushSync. Single mode skips conversation work/wait scans, and placement/scroll measurements are limited to the open menu. Conversation memoization, callbacks, identity, formatters, virtualization and animations are unchanged. No new conversation list or per-card work was introduced; runtime profiling was not required.

Width correction after Alex's screenshot: in New task the single-folder menu matches the Folder button width, capped to the viewport minus the existing 8px edge margins. Board mode retains its existing 420px menu width. This is an alignment correction; selection, placement, filtering and keyboard behavior are unchanged. Browser control was unavailable for this follow-up, so rendered light/dark alignment was not reverified. No performance problems found: this adds one constant-time width calculation when the menu renders; no list, formatter, callback, memo or animation changes.
