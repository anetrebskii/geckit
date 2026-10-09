# Tasks: OpenCode Llama

## Setup
- [x] T001 Create standalone manifest/build/package/license in examples/opencode-provider (FR-001).

## Foundation
- [x] T002 Implement owned authenticated lazy server and HTTP/SSE in examples/opencode-provider/src/transport.mjs (FR-004).
- [x] T003 Implement pure transcript/catalog conversion in examples/opencode-provider/src/transcript.mjs (FR-002/003).

## US1 - Work with Llama
- [x] T004 [US1] Implement streaming driver, permission/question replies and stop/end in examples/opencode-provider/src/driver.mjs (FR-003/004).
- [x] T005 [US1] Implement complete provider, catalog, correction, instruction and capability methods in examples/opencode-provider/src/provider.mjs (FR-001/002/006).

## US2 - Continue conversations
- [x] T006 [US2] Implement folder-scoped native history, namespace, rename, fork, search and delete in examples/opencode-provider/src/provider.mjs (FR-005).

## Validation and delivery
- [x] T007 Add deterministic fake-CLI/fetch tests in examples/opencode-provider/test (FR-001 through FR-006, SC-001/002/003).
- [x] T008 Write examples/opencode-provider/README.md and setup example, build index.mjs and run tests (FR-007, SC-004).

## Dependencies and strategy
T001 -> T002/T003 -> T004/T005 -> T006 -> T007/T008. US2 shares foundation; validate native history independently. Protocol research ran independently during planning; implementation files remain sequentially owned by this session. Source stays isolated in the new example. No renderer or host contract edits. Native inference and installed-library visual checks require OpenCode/model setup and publication.

## Publication requested by Alex
- [x] T009 Publish an independent public MIT repository with prebuilt entry, source, lockfile and CI; verify the public clone is installable by GeckIt.

## OpenCode 2 compatibility update
- [x] T010 Implement native v2 request, transcript and event adapter while preserving v1.
- [x] T011 Verify both versions with deterministic tests and native local mock-model smoke; verify Stop and permission/question replies.
- [x] T012 Publish updated standalone bundle and record verification and remaining limits. Apply instructions provided for installed library; computer control of GeckIt Local was not approved, so installed-copy activation remains Alex's action.

## OpenCode + Ollama correction
- [x] T013 Remove cancelled library configuration additions and update existing UX/design handoff.
- [x] T014 Return all connected Ollama model families; keep IDs stable and update assistant name.
- [x] T015 Wait for native v2 Ollama discovery, verify explicit model forwarding/defaults and native v1/v2 smoke with a non-Llama model.
- [x] T016 Publish version 1.2.0 and verify public bundle/CI; record visual review limits.

## Duplicate user message repair
- [x] T017 Suppress native user echoes in live output, preserve saved native history and repeated identical submissions; verify regression against old/new bundles and native v1/v2.
- [x] T018 Publish version 1.2.1, verify anonymous bundle/CI and review actual transcript/composer components in desktop/phone light/dark previews.

## Reasoning-only completion repair
- [x] T019 Inspect native response and report successful completions without final text through the existing failed state; preserve reasoning, errors and Stop.
- [x] T020 Verify missing reply cases/recovery, native v1/v2 mock inference and desktop/phone light/dark disclosures; publish version 1.2.2.
