# Contract: UI surfaces

The wording, states and transitions are [docs/ux/task-tags.md](../../../docs/ux/task-tags.md); this lists which component owns each surface.

| Surface | Component (client/src/renderer/src) | What it renders |
|---|---|---|
| Card chips | `chat/Tags.tsx` (extended), used by `chat/Board.tsx`, `chat/PhoneBoard.tsx`, `chat/Sidebar.tsx` list | Up to 3 `TagChip`, then "+N" with the rest in its tooltip |
| Card menu "Tags" | `chat/Board.tsx` menu, PhoneBoard row menu | Opens `TagPicker` for `targets(menu.id)` |
| Tag picker | new `chat/TagPicker.tsx` | Field, rows with check / dash, `Create tag "<typed>"`, per-row "..." (Rename, Colour, Delete), delete dialog; phone renders as a sheet |
| Conversation header | `chat/Chat.tsx` head, after the project | Chips (3, "+N"); press opens `TagPicker` |
| Details panel | `chat/Chat.tsx` inspector + new `chat/TaskTags.tsx` above `chat/TaskChecklist.tsx` panel | "Tags", every chip with "Remove <name>", "Add tag"; toggle "Show details" / "Hide details" |
| Phone conversation info | `chat/PhoneInfo.tsx` | "Tags" cell with chips, opens the picker sheet |
| New task form | the new-task controls in `chat/Chat.tsx` and phone new-task sheet | "Tags" control beside Employee |
| Filters | `chat/TaskFilters.tsx`, phone filter sheet | "Tags" page: "All tags", "No tags", each tag |
| Search | `chat/Switcher.tsx` `named()` | Tag names matched |

Styling: new rules in `styles.css` using existing tokens only (`--project-N`, `--border`, `--text-*`, `--bg-hover`, `--accent`, `--danger`). Chips reuse `.tag`; the picker reuses `.menu`, `.menu-search`, `.menu-side`, `.menu-note`; the dialog reuses `.dialog` and `.dialog-actions`.
