# Research

- Decision: reuse provider deletion via Sessions.remove, as the existing Chat action does. UI remove handler opens a new chat only for IDs confirmed removed; core wrapper clears favorites for those IDs.
- Existing defect: remove hides rows even when provider returns false; fixes are required for truthful Manager results.
- Decision: preserve existing Manager operation authentication, approval binding and durable operation replay. Automatic delegation does not waive deletion confirmation.
- Decision: cancel queued work before teardown, wait for driver end/handOver and invalidate in-flight starts. Retain visible host record/ownership on failure; cleanup them after confirmed success. Provider-side partial failure does not promise transcript rollback.
- Cleanup inventory below was completed; user scope remains unanswered. Archive is status-only; project removal keeps files; files remove targets individual files/empty directories. No inferred bulk cleanup feature.
- No library how-to matches this internal CLI engineering change; library index was inspected.

## Existing cleanup inventory (read-only inspection)

| Operation | Current scope and evidence | Relation to this change |
| --- | --- | --- |
| Conversation Delete in Chat | `renderer/src/chat/DeleteChats.tsx`, `useChat.ts`, `core/application.ts`: confirmation, Sessions.remove and favorites cleanup | Reused provider-removal semantics; truthful failure and teardown corrected |
| Archive | `Sessions.mark` in `main/sessions/index.ts`: changes status, keeps provider transcript | Separate reversible status; no deletion |
| Claude deletion | `main/sessions/disk.ts:deleteClaude`: transcript `.jsonl` and same-name side directory (helpers/tool output) | Existing adapter; project files untouched |
| Codex deletion | `main/sessions/codex.ts:delete`: native thread/delete, or unsubscribe newly-created unsent thread | Existing native adapter; no provider-wide erase promise |
| Library deletion | `main/sessions/provider.ts`, `plugins.ts`: library delete contract | Existing library defines conversation storage; no direct bypass |
| SSH conversation deletion | `main/hosts/disk.ts`, `hosts/run-script.ts:deleteScript`: remote transcript/side directory plus local mirror and cached listing | Reused; failed SSH result now preserves mirror/listing |
| Background-task Clear | `Sessions.clearTask`: drops completed task metadata; doesn't erase conversation/project | Not a message-history cleanup feature |
| Screen recording lifecycle | `main/recordings.ts`: drop unkept recording; sweep retained recordings older than seven days on startup (`core/runtime.ts`) | Existing automatic retention, not exposed to Manager here |
| Telegram attachments | `main/telegram-attachments.ts`: expire unpinned cache after24h on put/read; explicit disconnect clears cache in telegram.ts | Copied project inputs are separately retained; not deleted with conversation |
| Browser test profile Delete | `cli/testing.ts:deleteTestProfile`, `core/application.ts:browser:deleteTest`: stop selected browser, remove profile/sign-ins and test log | Separate destructive settings action; no Manager capability added |
| Browser search model removal | `core/application.ts:browser:deleteModel`: remove model only while bridge off | No relation to transcript deletion |
| Project/files removal | Manager capabilities/operations: project unregister keeps files; selected file/empty folder deletion has confirmation and protected-path checks | No bulk directory cleanup inferred |
| Conversation exports / message history | Existing export copies and provider-owned history are separate artifacts; no Manager-wide message-history purge identified | Must not claim removed by single-session deletion |

No broad cleanup route was added or invoked. Alex's outstanding scope question (completed/archived sessions, history or temporary files) remains unanswered as of local implementation. The worker completed the independent deletion change without substituting a bulk default.

## Assigned employee memory

Read assigned Максим entry and all45 memory pages through next=null, availability complete, via read-only GeckIt CLI. Raw snapshot kept only in /private/tmp/geckit-manager-memory.json, outside Git. No prior separate cleanup-scope answer found. Existing status-confirmation instructions from codex:01a1ad78-818e-7720-94d1-cc610bf381b9 are scoped to status moves; they do not authorize deleting transcripts without the existing destructive decision.
