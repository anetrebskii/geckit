# Configuration

GeckIt keeps reusable configuration in one `settings.json` with named sections. This format is in the working tree; it is not released yet. Existing settings, employees and Manager configuration migrate automatically when the updated service starts. The running service is not migrated by building the source.

## Location

| System | Default directory |
| --- | --- |
| macOS | `~/Library/Application Support/geckit/` |
| Windows | `%APPDATA%/geckit/` |
| Linux | `$XDG_CONFIG_HOME/geckit/`, or `~/.config/geckit/` |

Development copies use `geckit-local` alongside the installed app. `GECKIT_DATA` overrides the directory for the service and CLI.

## Sections

| Section | Contents |
| --- | --- |
| `version` | File format version, currently `1` |
| `general` | Theme, language, updates, notifications, concurrency and general preferences |
| `assistants` | Enabled assistants, provider-library registrations, chosen models, reasoning and permission modes |
| `projects` | Project folders, profiles, project assistants, colors and current filters |
| `conversation` | Board/list preferences, file-opening rules, window bounds and sidebar size |
| `speech` | Selected microphone |
| `integrations` | Assistant guides, Chrome bridge, phone enablement and VPN rules |
| `hosts` | SSH host definitions, without saved passwords |
| `shortcuts` | Saved prompts, assistant settings, employee assignments and timetables |
| `phrases` | Reusable instructions |
| `employees` | Employee IDs, names, roles, instructions, portraits, revisions and archived state |
| `manager` | Manager enablement, assistant/model choice, instructions and delegation policy |

Example of a partial configuration; omitted fields use normal defaults:

```json
{
  "version": 1,
  "general": {
    "theme": "dark",
    "workingAtOnce": 6
  },
  "assistants": {
    "chatProviders": ["claude", "codex"],
    "chatProvider": "codex"
  },
  "projects": {
    "projects": ["/work/app"]
  },
  "phrases": ["Check the observable result"],
  "employees": [],
  "manager": {
    "enabled": false,
    "instructions": "Use the project's existing patterns."
  }
}
```

The file uses standard JSON. Comments and trailing commas are not supported. Existing APIs retain their flat Settings contract; section names belong to the file format. Preference edits still update open windows. For edits to employees or Manager in the file, restart the service after saving. Stop the service before replacing the whole configuration.

## Copy to another installation

1. Stop both GeckIt services, including background work. Closing the desktop window alone leaves the service running.
2. Back up the destination's `settings.json` and `local-state.json`.
3. Copy the source's `settings.json` into the destination data directory, replacing its configuration file. Both installations must support format version 1.
4. Check project paths, SSH configuration, microphone availability, VPN rules, enabled Manager and schedules. The destination must have the referenced provider libraries and assistant programs installed and signed in; the JSON includes registrations, not their binaries or accounts.
5. Start the destination service. Its own credentials and pairing identity remain in place; a fresh installation creates its own identity and needs its own phone pairing. New shortcut history starts at the destination's first load, without replaying past scheduled occurrences. Shortcuts already known on that destination retain their local history.

This is a configuration copy, not a conversation or account backup. A different product needs an adapter for this format. There are no new export/import buttons in this change.

## Local state and credentials

`local-state.json` keeps device identity, phone pairing key, audio-device discovery, transcription history, favorites, board ordering, provider-update state and shortcut execution history. `sessions.json` keeps conversation metadata. `manager.json` keeps Manager queues, receipts, approvals, session references and recovery state, without Manager configuration. Conversations themselves and provider libraries remain in their existing stores. SSH passwords, Telegram credentials and vault keys retain their existing protected storage.

## Migration and recovery

Before replacing a legacy flat settings file, migration copies the original `settings.json`, `employees.json` and `manager.json`, when present, to `backups/configuration-v1/`. Backups are private files and may contain legacy pairing keys and private work; keep them local. Existing employee IDs, shortcut assignments, Manager instructions and runtime state survive. The old top-level `employees.json` is retained as a historical copy and is no longer read once versioned configuration exists. Manager's runtime record drops its old configuration after the new section has been saved.

A malformed file or unsupported version is never silently replaced with defaults. Fix it or restore a supported backup with the service stopped. While editing preferences, an unreadable file leaves the last usable in-memory settings active; saves fail until the file is repaired. Unknown fields in supported sections survive normal sibling-section writes.

To roll back to a pre-consolidation build, stop the service, preserve current files separately, then restore the original three files from `backups/configuration-v1/`. Those backups represent the pre-migration setup; later configuration changes need to be transferred deliberately. Never run two services against the same data directory.
