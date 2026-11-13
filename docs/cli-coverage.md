# CLI and configuration coverage

Implementation in this branch, not a claim about a released build. Audited against base `d09b0c11` and the final source contracts below. Ordinary product commands use one typed dispatcher locally and through the existing identity-bound full-control remote channel. `--computer` remains an alias of `--host`; `--host local` stays local. A registered computer is different from an SSH execution host.

| Area | Local CLI | Registered `--host` | Restrictions / required native permissions |
| --- | --- | --- | --- |
| Preferences | `settings schema/show/edit` | Same validated patch contract | Every field classified below; credentials and internal bookkeeping excluded; native OS rights unchanged |
| Providers | `providers list/models/account/enable/disable/install/reinstall/uninstall/update/check-updates/failures` | Same dispatcher | Install/reinstall disabled; toggles require expected enabled array; last/default/project/shortcut/Manager/live/held/closing dependencies refuse disable; auth remains native |
| Projects | `projects list/add/create/remove/provider` | Paths belong to target | Registered exact roots; remove keeps files and refuses pending work; native filesystem permissions apply |
| Employees | Existing `employees list/show/current/create/edit/archive/restore/memory/shortcuts/shortcut/manager`, plus `rename/retry-instructions` | Operator uses typed dispatcher; source files read before relay | Manager team mutations stay restricted to expected-name rename and saved shortcuts; existing revisions and guide synchronization retained |
| Saved prompts/schedules | Existing employee shortcut verbs; `shortcuts list/save/remove/run` with full JSON recurrence | Same dispatcher | Exact previous draft CAS; registered root, enabled provider, employee and recurrence/cron validation |
| Sessions | Legacy `sessions/show/linked/start`; new `sessions schema` enumerates all commands/flags | Legacy relay and shared product dispatcher | Operator control only; Manager remote writes use target `manager send`, preserving ownership; native permission/team answers excluded; questions only can be answered |
| SSH execution hosts | `hosts list/known/add/edit/remove/forget/install/connect/reconnect/disconnect/folders/add-folder/running/working/conversations` | Manages target's SSH registrations | Password/passphrase/MFA/key trust via native prompts; no terminal shell command surface |
| Channels | `channels list/install/remove/configure/check-updates` | Same dispatcher | Nonsecret config, enabled/projects/Manager grants explicit; secret fields excluded from reads and writes; native setup supplies credentials |
| Manager | `manager view/configure/history/inspect/receipt/send/pause/resume/retry/restart/voice-memos`; `settings manager/manager-edit` | Same dispatcher | Restart is Manager conversation recovery, never application restart; source Manager writes use exact-ID bound Allow/Refuse; intake automatic mode retired; retained disabled source settings supported |
| Paired computers | Existing `computers/add/forget` and `computers list` | Target list/forget via dispatcher | Creating trust/pair codes/approving devices stays source operator/native; no rename exists in product API |
| Device access | Existing `pair/devices/access`; typed target `devices list/revoke`, `access status/disable` | Existing full-control trust required | Observation grants cannot call product RPC; creating/expanding trust needs native/operator pairing; revoke/disabling own connection can produce uncertain delivery |
| Browser | Existing `browser` help, profiles/start/status/pages/open/go/close/read/find/text/click/type/key/scroll/eval/shot/hover/style/view/record | Existing fixed CLI relay, alias supported | Existing profile/tab ownership and paused bridge rules; browser eval remains browser-scoped existing functionality, no shell added |
| Secrets | `secrets request/wait/list/show/status/revoke/run`; `browser type --secret` | Local only in this branch | Values never printed or returned; the person enters each one on its link page; use is limited to the secret's places, program and task; output cleaned |
| Browser configuration | `browser-config status/fetch-model/delete-model/start-test/delete-test` | Same dispatcher | Supported bridge required; deletion requires explicit bridge disable; interactive sign-in stays native; local-model availability reported |
| Speech model | `speech status/fetch`; provider/model/language/microphone preferences via settings | Same dispatcher | Model download does not grant microphone/Full Disk Access; native capture/transcription input stays native |
| Desktop setup/update/config transfer | Safe individual settings/entities above; existing local `service call` operator API unchanged | No generic service relay | Bulk import is restart/backup native flow, app update install/restart and privacy links require native desktop; export can contain user data and is not printed by product CLI |
| Native capture/approval | Existing desktop/phone input and bound cards | Existing native UI only | Accessibility, microphone, screen capture, files, SSH secrets, provider sign-in and permission/team approval cannot be granted through new CLI |

`capabilities`, `<domain> schema`, `settings schema`, and targeted `--help` query the selected running target. Unsupported versions/commands, unknown/ambiguous/unreachable hosts fail explicitly. Commands are never replayed or sent locally on remote failure. A post-dispatch disconnect/timeout says **Delivery is uncertain** and requires state readback before retry. Source operator RPC authentication and encrypted remote identity/channel binding are unchanged. Manager uses its authenticated session/operation grant and rechecks authority immediately after dial; mutations require immutable registered computer ID. Worker processes cannot borrow the operator gateway.

## Existing CLI inventory

The entrypoint `cli/index.ts`, browser help, `cli/remote.ts`, `shared/service.ts`, and authenticated Manager capabilities were inspected. Existing argument spelling and output are retained unless a typed product subcommand is explicitly selected.

| Existing family/verbs | Local | Registered target | Boundary |
| --- | --- | --- | --- |
| `help`, `--help`, `instructions providers/app` | Yes | Target help/capabilities; instructions via existing relay | Build guidance only; internal launchers are not user commands |
| `sessions` filters (`today/since/project/provider/status/favorites/json`), `show --last/json`, `linked --json` | Yes | Existing fixed relay | Plugin history uses the target service; no implicit provider enable |
| `start --project/--conversations`, title/goal/provider/app | Yes | Existing native request relay | Bound human request before starting; product `sessions start` is operator control |
| `migrate-codex --imports/--dry-run/--json` | Existing local operator migration | Refused | Local manifest paths, metadata backup and destructive ownership boundary; no new remote bulk migration |
| `settings schema/show/edit`, `employees` reads/team/assignment/memory/shortcut/Manager verbs | Existing contracts | Typed dispatcher; worker-safe reads retain legacy relay | Role/revision/native approval rules; source `*-file` text expansion |
| `browser profiles/create/note/signin/start/stop/pages/open/go/text/read/find/click/type/key/scroll/eval/shot/hover/style/view/record/status/help` | Existing CLI | Existing fixed relay | Profile/tab ownership, paused bridge, native interactive account sign-in unchanged |
| `pair/create/pending/approve/cancel`, `access enable/disable`, `computers add/list/forget`, `devices list/revoke` | Existing operator surface | Safe list/forget/revoke/status/disable via product; creating or expanding trust refused | No remote pairing invitation, phrase approval or grant creation |
| `service run/status/projects/settings/sessions/manager/employees/methods/call/shutdown` | Existing privileged operator | Refused | Native-answer and raw RPC facilities remain source operator only; never available as Manager or arbitrary remote RPC |
| Authenticated Manager `capabilities/providers/projects/files/sessions/settings/attachments/telegram`, owned worker/control and memory operations | Existing bound Manager session | Configuration/common reads via product; session writes use target `manager send` | Ownership/session operation grants, native confirmation and revocation checks retained |
| `browser-host`, `browser-test` | Internal native messaging/test driver entrypoints | Refused | Process plumbing; not a general CLI execution capability |

The complete new product catalog is in `shared/product-cli.ts`; exact session flags and authority are returned by `sessions schema` for the selected target. Core and service method inventories below account for the remaining internal protocols individually.

## Exact core API inventory

Local/target availability and native boundaries inherit the area table. Protocol/subscription and UI-data plumbing are classified separately from configuration actions; listing a method does not add it to a generic remote CLI allowlist.

| Core method | CLI mapping or explicit boundary |
| --- | --- |
| `service:bootstrap` | Runtime snapshot/subscription/bootstrap protocol; target `capabilities`, settings and session status expose actionable state |
| `core:state` | Runtime snapshot/subscription/bootstrap protocol; target `capabilities`, settings and session status expose actionable state |
| `core:resume` | Runtime snapshot/subscription/bootstrap protocol; target `capabilities`, settings and session status expose actionable state |
| `settings:get` | `settings show/schema/edit` safe fields; raw settings API is operator/native, never exposed as arbitrary product patch |
| `settings:set` | `settings show/schema/edit` safe fields; raw settings API is operator/native, never exposed as arbitrary product patch |
| `phone:settings` | `settings show/schema/edit` safe fields; raw settings API is operator/native, never exposed as arbitrary product patch |
| `phone:list` | `sessions list/search`; phone presentation protocol remains internal |
| `phone:search` | `sessions list/search`; phone presentation protocol remains internal |
| `phone:telegram` | `channels list/configure` for nonsecret state; channel native setup/actions keep their existing authentication |
| `phone:telegramAction` | `channels list/configure` for nonsecret state; channel native setup/actions keep their existing authentication |
| `employees:list` | `employees` commands above; same common dispatcher |
| `employees:save` | `employees` commands above; same common dispatcher |
| `employees:archive` | `employees` commands above; same common dispatcher |
| `employees:restore` | `employees` commands above; same common dispatcher |
| `employees:retryInstructions` | `employees` commands above; same common dispatcher |
| `employees:memory` | `employees` commands above; same common dispatcher |
| `manager:view` | `manager` commands above; same common dispatcher |
| `manager:configure` | `manager` commands above; same common dispatcher |
| `manager:history` | `manager` commands above; same common dispatcher |
| `manager:inspect` | `manager` commands above; same common dispatcher |
| `manager:sendApp` | `manager send`; client-specific envelopes remain native protocol |
| `manager:sendAppPhone` | `manager send`; client-specific envelopes remain native protocol |
| `manager:receipt` | `manager` commands above; same common dispatcher |
| `manager:answerApp` | Bound human Manager/native decision flow; deliberately no approval-answer CLI |
| `manager:answerCard` | Bound human Manager/native decision flow; deliberately no approval-answer CLI |
| `manager:voice-memos` | `manager` commands above; same common dispatcher |
| `telegram:view` | `channels list/configure` for nonsecret state; channel native setup/actions keep their existing authentication |
| `channels:view` | `channels` commands above; same common dispatcher |
| `channels:install` | `channels` commands above; same common dispatcher |
| `channels:configure` | `channels` commands above; same common dispatcher |
| `channels:remove` | `channels` commands above; same common dispatcher |
| `channels:checkUpdates` | `channels` commands above; same common dispatcher |
| `telegram:action` | `channels list/configure` for nonsecret state; channel native setup/actions keep their existing authentication |
| `correct` | Native text/audio capture and processing; configuration is settings + speech model, not a hidden arbitrary-input CLI |
| `transcribe` | Native text/audio capture and processing; configuration is settings + speech model, not a hidden arbitrary-input CLI |
| `speech:model` | `speech status` |
| `speech:fetch` | `speech fetch` |
| `browser:state` | `browser-config status` |
| `browser:fetchModel` | `browser-config fetch-model/delete-model/start-test/delete-test` |
| `browser:deleteModel` | `browser-config fetch-model/delete-model/start-test/delete-test` |
| `browser:openTest` | `browser-config fetch-model/delete-model/start-test/delete-test` |
| `browser:deleteTest` | `browser-config fetch-model/delete-model/start-test/delete-test` |
| `browser:account` | Native interactive browser-account/sign-in viewer protocol; no credential or sign-in-token output |
| `browser:signInLink` | Native interactive browser-account/sign-in viewer protocol; no credential or sign-in-token output |
| `browser:viewStart` | Native interactive browser-account/sign-in viewer protocol; no credential or sign-in-token output |
| `browser:viewFrame` | Native interactive browser-account/sign-in viewer protocol; no credential or sign-in-token output |
| `browser:viewInput` | Native interactive browser-account/sign-in viewer protocol; no credential or sign-in-token output |
| `browser:viewEnd` | Native interactive browser-account/sign-in viewer protocol; no credential or sign-in-token output |
| `cli:product` | Shared validated operator/Manager product dispatcher |
| `cli:run` | Existing fixed CLI subprocess remote relay; nested targets/operator/native commands refused; no shell |
| `voice:video` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `recording:start` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `recording:part` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `recording:keep` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `recording:drop` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `push:token` | Native push registration/delivery protocol, not user configuration |
| `push:send` | Native push registration/delivery protocol, not user configuration |
| `voice:videoPart` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `voice:keepRecording` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `voice:dropRecording` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `orders:read` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `orders:recorded` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `voice:ask` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `orders:do` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `orders:cancel` | Native capture/draft execution protocol; existing native permissions and explicit user action retained |
| `shortcuts:save` | `shortcuts` commands above; same common dispatcher |
| `shortcuts:remove` | `shortcuts` commands above; same common dispatcher |
| `shortcuts:run` | `shortcuts` commands above; same common dispatcher |
| `chat:list` | `sessions list` |
| `chat:listStatus` | `sessions status` |
| `chat:search` | `sessions search` |
| `chat:hidden` | `sessions hidden` |
| `chat:forgetProject` | `projects remove/add/create` |
| `chat:rememberProject` | `projects remove/add/create` |
| `chat:delete` | `sessions delete` |
| `chat:hide` | `sessions hide` |
| `chat:exportConversation` | `sessions export` |
| `chat:continueConversation` | `sessions continue` |
| `chat:copyConversation` | `sessions copy` |
| `chat:waiting` | `sessions waiting` |
| `chat:cutOff` | Startup interrupted-turn discovery protocol; `sessions list/status`, `sessions proceed` request recovery |
| `chat:proceed` | `sessions proceed` |
| `lineup:state` | Runtime snapshot/subscription/bootstrap protocol; target `capabilities`, settings and session status expose actionable state |
| `chat:terminalCommand` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `hosts:terminalCommand` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `chat:plan` | `sessions plans/show` |
| `chat:plans` | `sessions plans` |
| `chat:git` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:upload` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:exists` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:file` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:repo` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:files` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:commands` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:folders` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:firstAsked` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `local:fetch` | Existing scoped phone/share content protocols; `settings phone`, `devices`, `access` control configuration; no secret-key output |
| `share:rooms` | Existing scoped phone/share content protocols; `settings phone`, `devices`, `access` control configuration; no secret-key output |
| `share:about` | Existing scoped phone/share content protocols; `settings phone`, `devices`, `access` control configuration; no secret-key output |
| `share:fetch` | Existing scoped phone/share content protocols; `settings phone`, `devices`, `access` control configuration; no secret-key output |
| `share:read` | Existing scoped phone/share content protocols; `settings phone`, `devices`, `access` control configuration; no secret-key output |
| `hosts:list` | `hosts` commands above; same common dispatcher |
| `hosts:known` | `hosts` commands above; same common dispatcher |
| `hosts:check` | `hosts` commands above; same common dispatcher |
| `hosts:update` | `hosts` commands above; same common dispatcher |
| `hosts:remove` | `hosts` commands above; same common dispatcher |
| `hosts:forget` | `hosts` commands above; same common dispatcher |
| `hosts:connect` | `hosts` commands above; same common dispatcher |
| `hosts:reconnect` | `hosts` commands above; same common dispatcher |
| `hosts:disconnect` | `hosts` commands above; same common dispatcher |
| `hosts:folders` | `hosts` commands above; same common dispatcher |
| `hosts:addFolder` | `hosts` commands above; same common dispatcher |
| `hosts:addFolderSaying` | `hosts add-folder`; optional native UI wording is not a separate configuration operation |
| `hosts:prompts` | User-bound SSH password/passphrase/MFA/host-key approval; native flow only |
| `hosts:answer` | User-bound SSH password/passphrase/MFA/host-key approval; native flow only |
| `hosts:install` | `hosts` commands above; same common dispatcher |
| `hosts:trustNewKey` | User-bound SSH password/passphrase/MFA/host-key approval; native flow only |
| `hosts:running` | `hosts` commands above; same common dispatcher |
| `hosts:working` | `hosts` commands above; same common dispatcher |
| `hosts:conversations` | `hosts` commands above; same common dispatcher |
| `hosts:terminal` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `hosts:resumeLine` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `hosts:forwardLink` | Existing native SSH localhost browser forwarding; not registration/configuration |
| `chat:account` | `providers account` |
| `chat:models` | `providers models` |
| `chat:bring` | `sessions bring` |
| `chat:items` | `sessions show` |
| `chat:schedule` | `sessions schedule` |
| `chat:preparedDraft` | `sessions draft` |
| `chat:savePreparedDraft` | `sessions save-draft` |
| `chat:links` | `sessions links` |
| `chat:steer` | `sessions steer` |
| `chat:retry` | `sessions retry` |
| `chat:send` | `sessions start/send` |
| `chat:answer` | `sessions answer (current question only)` |
| `chat:answerRequest` | Native bound human permission/team/start-all approvals; no CLI answer bypass |
| `chat:startAll` | Native bound human permission/team/start-all approvals; no CLI answer bypass |
| `chat:answerTeamRequest` | Native bound human permission/team/start-all approvals; no CLI answer bypass |
| `chat:stop` | `sessions stop` |
| `chat:unqueue` | `sessions unqueue` |
| `chat:injectQueued` | `sessions inject-queued` |
| `chat:queuedPicture` | Existing renderer content/repository/attachment plumbing; Manager `files list/read/write/mkdir/remove` retains registered-project restrictions; not configuration |
| `chat:requeue` | `sessions requeue` |
| `chat:reorderQueued` | `sessions reorder` |
| `chat:delegate` | `sessions delegate` |
| `chat:mode` | `sessions mode` |
| `chat:transport` | `sessions transport (only supported idle local Claude transition)` |
| `chat:rename` | `sessions rename` |
| `chat:mark` | `sessions mark` |
| `chat:markPhone` | `sessions mark` |
| `chat:keep` | `sessions keep (general questions)` |
| `chat:watching` | Renderer focus/subscription bookkeeping; `sessions read` handles explicit read state |
| `chat:read` | `sessions read` |
| `chat:remote` | Native Claude Remote Control sign-in/lifecycle; distinct from GeckIt --host, no new credential/control bypass |
| `chat:mcp` | `sessions mcp` |
| `chat:browsers` | `sessions browsers` |
| `chat:handOver` | `sessions release` |
| `chat:shell` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `chat:stopShell` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `chat:typeShell` | Native terminal/shell interaction; intentionally no arbitrary shell exposed |
| `chat:toBackground` | `sessions background (requested receipt)` |
| `chat:stopTask` | `sessions stop-task (requested receipt)` |
| `chat:clearTask` | `sessions clear-task` |
| `chat:taskOutput` | `sessions task-output` |
| `chat:assignEmployee` | `sessions assign` |
| `chat:snapshot` | `sessions show/export` |
| `chat:prepare` | `sessions prepare` |
| `manager:pause` | `manager` commands above; same common dispatcher |
| `manager:resume` | `manager` commands above; same common dispatcher |
| `manager:retry` | `manager` commands above; same common dispatcher |
| `manager:restart` | `manager` commands above; same common dispatcher |
| `manager:send` | `manager` commands above; same common dispatcher |
| `manager:answer` | Bound human Manager/native decision flow; deliberately no approval-answer CLI |
| `chat:installProvider` | `providers install/reinstall/uninstall/update/check-updates/failures`; no implicit enable in CLI |
| `chat:reinstallProvider` | `providers install/reinstall/uninstall/update/check-updates/failures`; no implicit enable in CLI |
| `chat:uninstallProvider` | `providers install/reinstall/uninstall/update/check-updates/failures`; no implicit enable in CLI |
| `chat:applyProviderUpdate` | `providers install/reinstall/uninstall/update/check-updates/failures`; no implicit enable in CLI |
| `chat:checkProviderUpdates` | `providers install/reinstall/uninstall/update/check-updates/failures`; no implicit enable in CLI |
| `chat:providerPluginFailures` | `providers install/reinstall/uninstall/update/check-updates/failures`; no implicit enable in CLI |

## Service operator API inventory

| Service method | CLI mapping or boundary |
| --- | --- |
| `remote:pair` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `remote:enable` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `remote:disable` | Existing local operator CLI; safe list/forget/revoke/disable through target registry dispatcher |
| `remote:create` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `remote:pending` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `remote:approve` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `remote:cancel` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `remote:devices` | Existing local operator CLI; safe list/forget/revoke/disable through target registry dispatcher |
| `remote:revoke` | Existing local operator CLI; safe list/forget/revoke/disable through target registry dispatcher |
| `computers:product` | Typed --host dispatch; authenticated operator, registered identity, full device trust |
| `computers:add` | Existing local operator pairing/access CLI; creation/approval of trust stays user-bound, no product remote escalation |
| `computers:list` | Existing local operator CLI; safe list/forget/revoke/disable through target registry dispatcher |
| `computers:forget` | Existing local operator CLI; safe list/forget/revoke/disable through target registry dispatcher |
| `configuration:export` | Existing local operator service API/native export; no product CLI prints bulk user data |
| `service:importConfiguration` | Existing local operator/native staged import; backup/restart flow deliberately not triggered by product commands |
| `service:shutdownForUpdate` | Native app updater only; no automatic GeckIt restart |
| `desktop:hello` | Desktop handshake/native completion/secret migration only; no product CLI approval or secret bypass |
| `desktop:completeNative` | Desktop handshake/native completion/secret migration only; no product CLI approval or secret bypass |
| `desktop:migrateSecrets` | Desktop handshake/native completion/secret migration only; no product CLI approval or secret bypass |

## Every persisted Settings field

Safe patch fields use target validation, optional expected-values and readback. Entity fields use their dedicated contracts; native/internal fields cannot be patched.

| Settings field | Configuration path / boundary |
| --- | --- |
| `employeeFilter` | `settings show/edit` (see `settings schema` validation) |
| `theme` | `settings show/edit` (see `settings schema` validation) |
| `vpnIpCheck` | `settings show/edit` (see `settings schema` validation) |
| `vpnAllowedIps` | `settings show/edit` (see `settings schema` validation) |
| `nativeLanguage` | `settings show/edit` (see `settings schema` validation) |
| `secondLanguage` | `settings show/edit` (see `settings schema` validation) |
| `microphoneDeviceId` | `settings show/edit` (see `settings schema` validation) |
| `audioDevices` | native enumerated microphone cache; microphoneDeviceId is configurable |
| `correctPlanModel` | `settings show/edit` (see `settings schema` validation) |
| `correctProvider` | `settings show/edit` (see `settings schema` validation) |
| `correctCodexModel` | `settings show/edit` (see `settings schema` validation) |
| `projects` | `projects list/add/create/remove` |
| `projectAssistants` | `settings show/edit` (see `settings schema` validation) |
| `newTaskRoot` | `settings show/edit` (see `settings schema` validation) |
| `profiles` | `settings show/edit` (see `settings schema` validation) |
| `profile` | `settings show/edit` (see `settings schema` validation) |
| `projectColors` | `settings show/edit` (see `settings schema` validation) |
| `browserNames` | `settings show/edit` (see `settings schema` validation) |
| `chatModel` | `settings show/edit` (see `settings schema` validation) |
| `providerModels` | `settings show/edit` (see `settings schema` validation) |
| `chatTransport` | `settings show/edit` (see `settings schema` validation) |
| `chatProvider` | `settings show/edit` (see `settings schema` validation) |
| `chatProviders` | `providers enable/disable with expected array` |
| `providerPlugins` | `providers install/reinstall/update/uninstall (disabled installation)` |
| `providerAutoUpdate` | `settings show/edit` (see `settings schema` validation) |
| `providerUpdatesReady` | runtime downloaded update bookkeeping |
| `providerRemovalPending` | runtime library-removal bookkeeping |
| `channels` | `channels nonsecret configuration; credentials native` |
| `channelAutoUpdate` | `settings show/edit` (see `settings schema` validation) |
| `codexModel` | `settings show/edit` (see `settings schema` validation) |
| `codexReasoning` | `settings show/edit` (see `settings schema` validation) |
| `chatMode` | `settings show/edit` (see `settings schema` validation) |
| `chatGrouping` | `settings show/edit` (see `settings schema` validation) |
| `chatView` | `settings show/edit` (see `settings schema` validation) |
| `conversationPlace` | `settings show/edit` (see `settings schema` validation) |
| `boardHeight` | `settings show/edit` (see `settings schema` validation) |
| `boardColumns` | `settings show/edit` (see `settings schema` validation) |
| `chatAll` | `settings show/edit` (see `settings schema` validation) |
| `chatProjects` | `settings show/edit` (see `settings schema` validation) |
| `favorites` | `settings show/edit` (see `settings schema` validation) |
| `openWith` | `settings show/edit` (see `settings schema` validation) |
| `transcriptions` | runtime transcription history, not preferences |
| `chatBounds` | `settings show/edit` (see `settings schema` validation) |
| `panelBounds` | `settings show/edit` (see `settings schema` validation) |
| `geckoBounds` | `settings show/edit` (see `settings schema` validation) |
| `sidebarWidth` | `settings show/edit` (see `settings schema` validation) |
| `client` | installation identity bookkeeping |
| `analytics` | `settings show/edit` (see `settings schema` validation) |
| `analyticsAsked` | native first-start consent bookkeeping; analytics preference is configurable |
| `managerAvatar` | `settings show/edit` (see `settings schema` validation) |
| `sendErrors` | `settings show/edit` (see `settings schema` validation) |
| `showGecko` | `settings show/edit` (see `settings schema` validation) |
| `autoUpdate` | `settings show/edit` (see `settings schema` validation) |
| `updateChannel` | `settings show/edit` (see `settings schema` validation) |
| `guideClaude` | `settings show/edit` (see `settings schema` validation) |
| `guideCodex` | `settings show/edit` (see `settings schema` validation) |
| `guidePlugins` | `settings show/edit` (see `settings schema` validation) |
| `chromeBridge` | `settings show/edit` (see `settings schema` validation) |
| `chromeBridgeDefault` | one-time migration marker |
| `anywhereOff` | `settings show/edit` (see `settings schema` validation) |
| `flashFor` | `settings show/edit` (see `settings schema` validation) |
| `soundFor` | `settings show/edit` (see `settings schema` validation) |
| `workingAtOnce` | `settings show/edit` (see `settings schema` validation) |
| `progressOrder` | `settings show/edit` (see `settings schema` validation) |
| `columnOrders` | `settings show/edit` (see `settings schema` validation) |
| `welcomed` | `settings show/edit` (see `settings schema` validation) |
| `phone` | `settings show/edit` (see `settings schema` validation) |
| `phoneKey` | secret native pairing code; never output by product CLI |
| `shortcuts` | `shortcuts full draft + expected-values; employee shortcut commands` |
| `calendarTimeZone` | Derived from target OS timezone; read in capabilities.target, not a writable preference |
| `calendarRecurrenceVersion` | migration marker |
| `cronStartWindowVersion` | migration marker |
| `managerShortcutsVersion` | migration marker |
| `phrases` | `settings show/edit` (see `settings schema` validation) |
| `hosts` | `hosts nonsecret draft + native SSH prompts` |

## Desktop actions and native-only boundaries

The Settings renderer, Team, Hosts, Projects, browser integration and service transfer APIs were audited alongside the method and Settings inventories. File/folder pickers become explicit target paths. Reveal/open configuration folders, system privacy panes, app update check/install/restart, microphone/screen/accessibility grants, phone QR/new-code, crash-report review/consent, clipboard, image picking, recording and interactive sign-in remain native UI actions. Their underlying configurable preferences are covered above. No claim is made that native platform dialogs can be automated. On unsupported platforms or missing native dependencies the actual target API refuses or reports readiness; the CLI does not grant OS permissions.

Registered GeckIt computer rename has no existing product API and is unsupported. Generic `service call` remains a pre-existing **local privileged operator** facility, including raw APIs: it is not a Manager capability and is refused by legacy remote relay. The new dispatcher never forwards arbitrary service methods. Automatic Voice Memos intake was removed in the base runtime: `enabled:true` remains refused; use saved Manager shortcuts. No imported runtime/model credentials are created for verification.

## Verification evidence

See `docs/cli.md` for invocation, MCode-only read/change/read sequence and native prerequisites. Automated assertions live in `host-cli`, `provider-settings`, `agent-settings`, `manager`, `rpc`, `product-rpc`, `product-remote-guard`, and existing `remote-access` tests. `client/test/cli-product/transport.mjs` runs actual built CLI/RPC plus encrypted WebRTC against two disposable localhost services with synthetic plugins. It does not establish a physical remote, NAT/TURN/Firebase, real model accounts or native authorization completion. Final command counts and run results are recorded in `specs/026-unified-host-cli/verification.md`.
