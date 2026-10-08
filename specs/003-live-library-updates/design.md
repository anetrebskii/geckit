# Design: Live provider library updates

The Libraries row owns the action and transient state. Apply only the selected ready update. Keep the existing compact row and shared button styles; no new theme tokens.

## Runtime flow

1. Resolve the installed and staged directories for the provider ID.
2. Revalidate the staged manifest, identity, and `LlmProvider` contract in the running main process.
3. Move the installed directory to a backup and move the staged directory into place. Load the new provider from a private immutable snapshot so Node cannot reuse helper modules cached from the previous version. Restore both the backup and staged update if the new instance fails to load. Keep active snapshots for the rest of the run; remove stale snapshots at next launch.
4. Swap the provider used for new conversations. Pin every existing `Live` session to its current provider. Mark active sessions for handoff; finish their current turn, then end the old idle driver and resume with the new provider on the next message.
5. Update settings and clear the ready marker only after runtime activation succeeds.

Module imports use a unique query, and each active provider loads from a unique snapshot path. This prevents both the entry module and its helper imports from colliding in Node's ESM cache.

## UI states

Ready rows show `Update ready` and `Apply update`. The action changes to `Applying…` and disables row actions. Success removes the ready state; focus moves to Remove. Failure keeps the row ready and reports an actionable error.

## Prototype

Use the existing real-component harness: `client/src/renderer/settings-preview.html?libraries=1&theme=light` and `?libraries=1&theme=dark`. `&applyDelay=1` exercises progress; `&applyFail=1` exercises retryable failure.
