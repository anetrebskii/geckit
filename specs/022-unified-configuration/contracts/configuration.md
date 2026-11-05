# Configuration contract

- `settings.json`: object with `version: 1` and named sections documented in `docs/configuration.md`.
- `general`, `assistants`, `projects`, `conversation`, `speech`, `integrations`: preference objects using existing Settings field names.
- `hosts`, `shortcuts`, `phrases`, `employees`: arrays using existing domain types (shortcut execution history is local).
- `manager`: configuration only, using existing ManagerConfig field names.
- Optional absent sections use defaults, without reviving legacy employees or Manager configuration after migration.
- Writes preserve other sections and unknown fields. No secret is newly moved into this document.
- Existing IPC, phone and service APIs remain unchanged.
