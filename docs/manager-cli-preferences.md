# Manager CLI: instructions, employee names and new-worker models

These commands require the authenticated current Manager interface. Ordinary worker/terminal employee commands keep their existing approval flow. Manager preference writes and rename also require a host-bound user confirmation; no token, operation-ID or confirmation checks are bypassed. Arguments are literal strings, not shell expressions. See [UX](ux/manager-cli-preferences.md).

## Read, patch, read back

```text
settings manager
settings manager-edit --instructions <merged-text> --expected-instructions <exact-last-read-text>
settings manager
employees show <employee-id>
employees rename --id <employee-id> --name <new-name> --expected-name <exact-last-read-name>
employees show <employee-id>
```

`settings manager` returns JSON `{ "instructions": "..." }`. The source of truth is `ManagerRecord.config.instructions` in the existing durable `manager.json`, read on startup. `Manager.#instructions()` combines it with unchanged `MANAGER_INSTRUCTIONS`; `Manager.#dispatch()` updates the session prompt before every send, and `Sessions` supplies `managerContext(...)` to the provider's send. This is used by subsequent turns, including restored sessions. Editing preferences does not restart the current turn; they enter the next dispatched turn. The app also synchronizes the existing Claude/Codex guide through `keepManagerGuide`. A `guideError` means the durable value was written but the guide update failed; read back before taking further action.

`--expected-instructions` and `--expected-name` are mandatory exact comparisons. A mismatch fails without writing. Read fresh, merge and obtain confirmation for the new command; never silently replace intervening text. Empty instructions clear only this field. An empty name fails. Rename uses the latest employee record inside the host's existing serialized writer, changes only its name/revision and retains ID, role, description, portrait, archive state, other employees, memory and assignments. Unknown IDs and unsupported/repeated fields fail. Other settings remain unchanged.

After success or uncertain delivery, perform a new read with a fresh operation ID. A receipt does not replace readback. Retry of the same stable operation ID reconciles the existing receipt; it does not authorize a new mutation.

## Agreed values, not yet applied

Live read through the existing official `geckit-local employees manager --json` on 2026-11-01 returned `instructions: ""` and portrait `employee-05`. Re-read immediately before applying. The following command is valid only if fresh `settings manager` still returns the empty string. Otherwise append this policy to the existing text and use that existing text as expected.

```json
{"id":"manager-model-policy-v1","args":["settings","manager-edit","--instructions","TwinsAI и задачи дизайна используют Opus. Кодирование вне TwinsAI использует GPT-6.1-Sol. В маркетинге пробовать Opus и GPT-6.1-Sol и сравнивать результат. Уже запущенные сессии сохраняют модель.","--expected-instructions",""]}
```

Then read:

```json
{"id":"read-manager-policy-v1","args":["settings","manager"]}
```

First read each employee, then apply the matching command only if its name still matches the expected name below. Kate and Denys have no write commands.

```json
{"id":"rename-engineer-v1","args":["employees","rename","--id","967c2fa1-73eb-4e05-be90-8a8173ddccaf","--name","Максим","--expected-name","Senior Software Engineer"]}
{"id":"rename-devops-v1","args":["employees","rename","--id","988ac5c1-83ed-4ebf-a133-7bec9ed7d6db","--name","Илья","--expected-name","DevOps Engineer"]}
{"id":"rename-qa-v1","args":["employees","rename","--id","4c3c681c-0b58-40f1-bdfa-95e9fa025b43","--name","Анна","--expected-name","QA Engineer"]}
{"id":"rename-assistant-v1","args":["employees","rename","--id","3b7c1f0b-fdaf-4118-a1d2-b45ade72cf34","--name","Мария","--expected-name","Personal Assistant"]}
```

Each object is a separate host command in its own geckit fence. Readback commands (run separately after the writes):

```text
employees show 967c2fa1-73eb-4e05-be90-8a8173ddccaf
employees show 988ac5c1-83ed-4ebf-a133-7bec9ed7d6db
employees show 4c3c681c-0b58-40f1-bdfa-95e9fa025b43
employees show 3b7c1f0b-fdaf-4118-a1d2-b45ade72cf34
employees list
```

## Explicit model for new workers

```text
providers list
providers models --provider codex
sessions start --project <registered-project> --text <assignment> --goal <completion-condition> --provider codex --model gpt-6.1-sol --employee 967c2fa1-73eb-4e05-be90-8a8173ddccaf
```

Choose an available exact model ID from the selected provider's fresh model list. For Opus choose the enabled Claude provider and the Opus ID it actually advertises; do not assume every Claude library uses the same ID. The host checks availability/disabled status for that provider and project host before creating anything, then rechecks authorization/project/provider selection after the asynchronous model lookup. It never substitutes another provider or model. Omission retains the prior default selection behavior. Receipts expose `model` and `modelReason` (`task` or `default`); this is requested selection, not evidence of model execution. Existing workers retain their original settings. Use separate new workers for the marketing comparison; the preference is an instruction for Manager, not an automatic scheduler or enforced provider routing engine.

## Delivery boundary

Unit/integration tests use temporary state and fake provider drivers, including real CLI socket transport, host dispatch, durable reload and captured provider input. They do not prove live model recall. No live user mutation, application/session restart or phone installation is part of this change. The current host needs a separately authorized safe backend load after integration. Manager must then run capabilities, fresh reads, approved writes and final readbacks before reporting these values saved.
