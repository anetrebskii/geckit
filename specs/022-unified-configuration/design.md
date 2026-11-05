# Design handoff: Unified configuration

The original storage-only change consolidated configuration; it adds no screen, control, wording, notification or renderer state. Existing Settings, Team and Manager entry points continue to work. Therefore UX diagrams, HTML prototypes, theme/viewport review and UI performance review are not applicable. `apple-ux` was read; its prototype approval gate is not entered because no prototype or UI change is needed.

The file is `settings.json`, with a format version and named sections: `general`, `assistants`, `projects`, `conversation`, `speech`, `integrations`, `hosts`, `shortcuts`, `phrases`, `employees`, `manager`. Device and work history are kept separately. The person can copy this file after stopping both services; [the file contract](contracts/configuration.md) defines the boundary. Missing optional sections use normal defaults. Broken or unsupported files are never silently replaced. Existing external preference edits still reach open windows; employee and Manager file edits require restart.

FR-001/002/003: consolidation and migration. FR-004/005: all owners and sibling preservation. FR-006/007: copy instructions and isolated filesystem verification. No unresolved design decisions. Authorization is the user's explicit request to merge configuration into one file with sections.

## UI follow-up

The user subsequently requested Open configuration, Export and Import controls. [Approved UX](../../docs/ux/configuration-transfer.md) defines desktop General Settings, native file surfaces, validated confirmed replacement, backup and controlled restart. Alex approved the UX proposal on 2026-11-05. The [interactive prototype](../../docs/design/configuration-transfer.html) mounts the production SettingsDialog with fixture native boundaries. Run it from client with `npx vite --config configuration-review.vite.config.mjs`, then open `/docs/design/configuration-transfer.html`. The implementation follows the approved flow. FR-008 through FR-010 cover this extension.
