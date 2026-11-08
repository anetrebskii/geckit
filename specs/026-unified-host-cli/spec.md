# Unified host CLI

## User scenarios and testing

1. Inspect a registered paired computer, then configure it using ordinary commands with `--host <id-or-name>`. Omitting the target preserves current local CLI behavior; `--host local` selects this computer explicitly.
2. Keep only an already installed and enabled MCode provider: discover IDs, select its defaults, disable other idle providers with expected-values protection, then read back. No real provider changes form part of implementation verification.
3. Manage preferences, providers/libraries, projects, employees/shortcuts, sessions, channels and registered hosts through the same product handlers locally and remotely. Interactive authentication and native approvals remain user-bound.

## Functional requirements

- FR-001: One host selector, compatible with existing `--computer`, resolves exact IDs before case-insensitive unique names; rejects unknown, ambiguous, unavailable and unsupported hosts without local fallback.
- FR-002: Target help, schema and capabilities report actual availability and permissions.
- FR-003: Audit every existing CLI command, core API and product configuration surface in a coverage matrix. Implement missing applicable commands using shared contracts and dispatch.
- FR-004: Provider enable/disable validates installation, at least one remaining provider, default/correct/project/Manager/shortcut dependencies and active or queued work. Expected values reject stale updates atomically.
- FR-005: Preserve authentication, project/device scopes and native approval bindings. Never transport Manager credentials as operator authority, expose secrets, add arbitrary shell or approve native permissions through assistant CLI.
- FR-006: Preserve legacy commands and user data; test isolated local and remote routing, errors, scopes, expected conflicts and MCode-only configuration over real transport on disposable targets.
- FR-007: Update Manager guide and docs; obtain independent review; run required repository gates. Document physical remote limitations.

## Success criteria

Every audited product action has a verified CLI implementation or a justified native-only boundary. Isolated end-to-end evidence proves routing and safe configuration. No real provider, credential, grant or remote machine is changed for testing.
