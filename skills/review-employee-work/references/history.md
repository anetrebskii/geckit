# Read employee work sources

Use this copy's `GECKIT_SOURCE_CLI` when set; otherwise use the command rendered below. These commands read GeckIt history without starting or unhiding a conversation. Do not inspect provider-private transcript directories.

```text
{{said}} employees current
{{said}} employees list
{{said}} employees show <employee-id>
{{said}} employees memory <employee-id>
{{said}} employees memory <employee-id> --cursor <returned-next>
{{said}} employees tasks <employee-id>
{{said}} show <conversation-id>
{{said}} show <conversation-id> --last 30
{{said}} linked
```

Resolve the employee ID from current assignment or live employee lookup. Memory returns source conversations currently assigned to that employee across registered projects, including hidden, completed and archived sources. It is not a guarantee that every task the employee ever touched is still assigned or available. An empty memory result does not prove that the employee never did the work.

Memory contains user and assistant text; tool outputs are not included, and attachment contents may be omitted. Inspect referenced artifacts directly before relying on claims that require those missing contents.

Continue the exact returned cursor until no next cursor remains. A continuation may belong to the same conversation rather than a new one. Do not fabricate or edit a cursor. If it is invalid, reread from the beginning and report any gap that remains. Do not claim complete coverage after reading only the first page.

Use task listings to locate candidate work and conversation IDs. Use the conversation's original request and later corrections to establish continuity. `show --last 30` is a window, not the complete original assignment; use full Show when required. Task status, final summary and memory are pointers to evidence, not independent proof that an artifact works.

For a named task outside available employee memory, read its explicitly supplied conversation ID through GeckIt. Load manage-conversations for broader project/history search or linked-task tracing. Keep computer identity explicit for a supplied remote source; use that skill's computer-selection rules and stop on access failure instead of silently reading local history.

For a code result, inspect the stated checkout and current diff/commit before interpreting test evidence. For a document or other artifact, open the referenced version and verify the requested content. For a live account or deployed service, use the project's supported connector or verification workflow. Never infer deployment from a build, publication from a saved draft, or authentication from a profile note.

The authenticated Manager has a different bounded `sessions show --id ... --last 30` interface and coordination authority. These worker/operator examples do not grant Manager additional commands or access. Manager delegates artifact verification and uses its own lifecycle skills to decide Done.
