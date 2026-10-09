# Verification: OpenCode Llama

Date: 2026-10-09. Implementation: examples/opencode-provider. No GeckIt host-contract or renderer files changed by this task.

## Passed

- Clean npm ci using the lockfile, then npm run build.
- npm test: 16 deterministic tests pass. Covers complete provider/manifest identity, inert creation and bundled import, connected Llama catalog and metadata, unknown quotas, streaming/deltas/tools/thoughts, stable completed text against late events, cumulative spend, permission/question replies, conversation-scoped grants, Stop/send race, Stop during preparation, exact-once completion/end, Plan/manual behavior, instruction toggle, history restart, folder isolation/aliases, fork cutoff, correction cleanup, missing executable/recovery, OpenCode 2 compatibility diagnostics, model errors and stream disconnect.
- npm run test:native against OpenCode 1.18.35 installed in a temporary directory with an isolated configuration and a local mock OpenAI-compatible endpoint. Streamed native reply, native read tool, approval reply, persisted read/list/search/rename/fork/delete all pass. No paid model requests. Durable result: [native-result.json](native-result.json).
- GeckIt's existing client/test/plugins.test.ts: 5 tests pass.
- ESLint recommended rules plus Node globals and existing underscore-unused convention: all example source/test/build files pass.
- git diff --check passes.

## Limits

Ollama is installed and its model list was read; no Llama model is installed. Actual Llama inference, quality, tool reliability and hardware performance remain unverified. Native smoke ran on macOS; Windows/Linux runtime verification remains unavailable. The library is published as a public MIT repository at https://github.com/anetrebskii/geckit-opencode-llama. It has not been installed in GeckIt.

No renderer/shared/mobile files were changed by this task. Performance-review scope is therefore not applicable. Native full-screen installed-library review in light/dark at desktop/phone sizes, including keyboard/focus, scrolling, hierarchy and adjacent controls, remains unavailable because the library is not installed. Existing library, composer, transcript and permission controls are reused; deterministic tests do not substitute for this visual review.

## Spec consistency

FR-001 through FR-007 covered by T001 through T008. All implementation tasks complete. No unresolved blocking decisions or contract changes. Existing product feature list already covers independent assistant libraries; this example does not add a separate board/renderer workflow. Other sessions' changes and feature selector were preserved.

## Publication

Alex clarified that the deliverable must be an open-source repository accepted by Libraries. Published standalone source and prebuilt entry under MIT: https://github.com/anetrebskii/geckit-opencode-llama. Main commit: aacaff635d42c7fa1451cd6a95ca4db6e63675bd. Durable local checkout: /Users/alex/Projects/mine/geckit-opencode-llama.

GitHub confirms public visibility, main default branch and MIT license. Anonymous clone with no Git credentials loads its manifest and standalone provider contract without npm installation. Build/test CI passes: https://github.com/anetrebskii/geckit-opencode-llama/actions/runs/37890564347. Public README is assistant-written technical documentation; own-english checker run, vocabulary/punctuation clean. Contraction/list flags reflect technical instructions and capability lists and were reviewed without adding artificial casual language.

## Installed OpenCode 2 incompatibility

Alex installed the library into geckit-local and supplied a screenshot of the 15-second startup error. His Homebrew OpenCode is 2.0.25. Direct startup reproduces its `server listening on ...` banner; the library expected `opencode server listening on ...`. Recognizing the new banner alone exposed an incompatible HTTP API: the v1 `/global/health` request returned HTML. OpenCode 2 is not supported by this adapter.

The library now immediately reports "OpenCode 2.x is not supported by this library. Use OpenCode 1.x (tested with 1.18.35)." and stops its process. The real 2.0.25 binary returned this diagnostic in 142 ms with isolated XDG directories. Full native mock-model smoke passed again with 1.18.35. Published fix: https://github.com/anetrebskii/geckit-opencode-llama/commit/76d1b60. The installed library was not modified directly; it needs a library update. Actual Llama inference and rendered review of the new diagnostic remain unverified. No global OpenCode downgrade or configuration change was made.

## OpenCode 2 support - version 1.1.0

Supersedes the compatibility restriction above. Published https://github.com/anetrebskii/geckit-opencode-llama/commit/86a76c5. Native adapter detects the server version and maps v2 authentication, location queries, catalog readiness, paginated history, prompts/wait/interrupt, session permissions, question forms and owned instruction entries. OpenCode 1 behavior remains supported. No GeckIt host contract or renderer change.

Final main includes CI distribution fix https://github.com/anetrebskii/geckit-opencode-llama/commit/fd9265a. CI passes build, 20 deterministic tests, native OpenCode 1.18.35 on Linux and native Homebrew OpenCode 2 on macOS: https://github.com/anetrebskii/geckit-opencode-llama/actions/runs/37893373124. The initial native v2 CI attempt used an unavailable `opencode-ai@2.0.25` npm package; corrected to the official Homebrew distribution.

- 20 deterministic tests pass; JS ESLint recommended rules pass.
- Real OpenCode 2.0.25 and 1.18.35 pass the expanded local mock-model smoke: incremental reply, native read permission, two question cards, Stop followed by a new turn, history/read/list/search/rename/fork/delete, Plan write denial, GeckIt instructions and correction. Reports: [native-v2-result.json](native-v2-result.json), [native-v1-result.json](native-v1-result.json). Temporary fixtures do not send paid requests or mutate user settings. Context fixtures advertise 131072 tokens for v2 and 16384 for v1 to accommodate their respective built-in prompts.
- The bundled update starts Alex's actual OpenCode 2.0.25 and reads the model catalog for `/Users/alex/Projects/mine/echopub`; zero configured Llama models returned. Actual Llama inference remains unverified and needs model configuration.
- Public README is assistant-written technical documentation. Own-english checker reports clean vocabulary/punctuation; contraction and parallel-list flags were reviewed as technical-document format.
- GeckIt Local computer control was not approved, so applying the published update and native full-screen review remain unavailable. Use Settings > Libraries > Check now, then Apply update for OpenCode (Llama). No running application was restarted or installed checkout patched behind its update lifecycle. Light/dark, keyboard/focus, scrolling and phone visual checks remain unverified.

## OpenCode + Ollama - version 1.2.0

Alex replaced proposed library parameters with OpenCode + Ollama in the existing Model selector. The cancelled host/UI/schema/storage work and its docs/spec are removed. No library configuration export is published. Assistant display names become OpenCode + Ollama / Ollama; plugin, session and repository IDs stay unchanged.

Published https://github.com/anetrebskii/geckit-opencode-llama/commit/b66c6d116553ac3b51a54803dfac2095f98f56b5. The plugin now returns all connected Ollama model families and excludes other providers. OpenCode 2 discovery waits for its asynchronous catalog, bounded by 15 seconds; empty discovery returns no models. Default uses the native Ollama default or first available Ollama model. Explicit missing selections fail. GeckIt's existing Model picker already consumes this contract and forwards the selection.

- 23 deterministic tests pass, including non-Llama models, other-provider exclusion, defaults, explicit selection forwarding/removal, first-request discovery and empty/failed discovery.
- Native OpenCode 1.18.35 and 2.0.25 smoke pass using a non-Llama Qwen mock through provider ID ollama: streamed reply, permissions, two questions, Stop/continue, native history operations, Plan denial, GeckIt instructions and correction. No paid inference or user configuration changes. Reports: [ollama-native-v1-result.json](ollama-native-v1-result.json), [ollama-native-v2-result.json](ollama-native-v2-result.json).
- The bundled plugin's first actual model request for echopub returns gemma4:26b, kimi-k2.7-code:cloud, qwen3.5:0.8b and qwen3.5:35b from OpenCode 2.0.25. Actual model inference and model quality remain unverified. Cloud-tagged models remain explicitly selectable and are not advertised as local inference.
- JS ESLint recommended rules pass. Clean standalone npm ci/build and 23 tests pass. README own-english checker: vocabulary/punctuation clean; contraction and parallel-list flags reviewed as technical-document structure.
- Cancelled host configuration removal: 167 targeted tests and scoped ESLint pass. Concurrent library failure reporting and independent provider work remain untouched. This plugin needs no host contract or renderer layout change. Performance: catalog requests run only on existing model discovery; no board/list hot-path changes.
- GeckIt Local computer control was previously not approved; applying the installed update and native full-screen light/dark desktop/phone review, keyboard/focus and scrolling remain unavailable. Existing native Model select and adjacent form components are reused. Supplied screenshot confirms the existing entry point; source inspection confirms it consumes the plugin catalog. No native app restart or direct installed-library patch was made. Cancelled preview tab is gone and browser viewport restored.

Public anonymous clone at b66c6d116553ac3b51a54803dfac2095f98f56b5 loads the prebuilt bundle without npm and matches manifest identity. CI passes build reproducibility, 23 deterministic tests and native v1/Linux plus v2/macOS smoke: https://github.com/anetrebskii/geckit-opencode-llama/actions/runs/37898717904.

## Duplicate user message fix - version 1.2.1

GeckIt displays submitted messages immediately. The plugin also emitted native user parts during live events and completion snapshots under different IDs. OpenCode 2 delivers user parts in the final history read, producing the reported message/reply/message order. The live driver now emits assistant, reasoning, tool and approval items only. Native history reads still include every submitted user message, including identical text sent in separate turns. No host contract or production renderer change.

Published https://github.com/anetrebskii/geckit-opencode-llama/commit/7ba071e9efe011171e926e414361244fb2e0704d. CI passes: https://github.com/anetrebskii/geckit-opencode-llama/actions/runs/37899963964. Fresh anonymous clone of version 1.2.1 loads the prebuilt entry and provider contract without npm installation.

- 24 deterministic tests pass. New regression reproduces late native user snapshots and verifies message/reply ordering over two identical submissions. Running that regression against published 1.2.0 fails with the extra user item after the reply. Native read preserves both legitimate submissions.
- Native OpenCode 1.18.35 and 2.0.25 smoke pass with isolated mock Ollama inference. Live output emits no user echo; persisted native history contains exactly one user submission for the checked turn. Reports: [duplicate-native-v1-result.json](duplicate-native-v1-result.json), [duplicate-native-v2-result.json](duplicate-native-v2-result.json). No paid calls or user configuration changes.
- Scoped JS ESLint, standalone build and git diff --check pass. README is assistant-written technical documentation; own-english checker vocabulary/punctuation clean, technical list/contraction flags reviewed.
- Visually reviewed real Transcript and Composer components using output captured from the corrected live driver, in full desktop context at 1352 x 675 and phone context at 390 x 844, light/dark themes. One user message precedes one reply. Hierarchy, alignment, density, spacing and adjacent composer controls remain consistent. Tab moves from the composer to Manual with visible focus. The short transcript needs no vertical scrolling; phone composer uses its existing horizontal control strip. Longer transcript scrolling and installed native app activation remain unverified. Temporary preview files/server/tab removed and viewport restored.
- Performance review: the plugin suppresses redundant emissions; no layout, board/list hot path or production renderer code changes. Apply through Settings > Libraries > Check now > Apply update. Reload conversation history after applying. GeckIt Local computer control was previously not approved, so the installed update was not applied by this session.

## Reasoning-only completion - version 1.2.2

Alex's next screenshot showed Hi followed by a reasoning step and no answer. Read-only inspection of the native OpenCode 2 database confirms the current assistant message contains one reasoning fragment, finish stop and a succeeded idle outcome, with no text fragment. The installed plugin files report version 1.2.1. The renderer's steps disclosure accurately displays reasoning; there is no missing final answer to recover from that native turn. No inference request or user-history mutation was made during diagnosis.

The driver now checks the last new assistant message in the authoritative completion history. Successful native completion without nonblank, nonignored, nonsynthetic final text emits one failed signal with detail "OpenCode finished without a final text reply. Try another model or send again." Previous turns and intermediate text cannot satisfy the check. Native errors and Stop retain their existing outcomes. Reasoning is preserved and never promoted to an answer; no automatic retries or model selection changes occur.

Published version 1.2.2: https://github.com/anetrebskii/geckit-opencode-llama/commit/84726e3b59c6f0ac565b65df6423121ba099f474. CI passes build reproducibility, deterministic tests and native v1/Linux plus v2/macOS smoke: https://github.com/anetrebskii/geckit-opencode-llama/actions/runs/37902462630. Fresh anonymous clone loads the prebuilt provider without npm installation.

- 30 deterministic tests pass, including reasoning-only, blank, ignored, synthetic and missing assistant output, prior-turn/intermediate text exclusion and another successful turn after each incomplete response. All five new cases failed against unchanged 1.2.1 behavior before the driver fix.
- Native OpenCode 1.18.35 and 2.0.25 pass mock Ollama smoke with reasoning_content and stop but no text, followed by normal successful recovery. Existing native permissions, questions, Stop, Plan denial, instructions, history and correction checks also pass. Reports: [incomplete-native-v1-result.json](incomplete-native-v1-result.json), [incomplete-native-v2-result.json](incomplete-native-v2-result.json). No paid requests or global configuration changes.
- Standalone build and 30 tests pass. Scoped JS ESLint and diff whitespace checks pass. Assistant-written README checked with own-english: vocabulary/punctuation clean; technical contraction/list flags reviewed.
- Reviewed real Transcript and Composer in full desktop context at 1352 x 675 and phone context at 390 x 844, light/dark themes, collapsed and expanded reasoning/error disclosures. The failed state is visible outside the steps fold. Expanded diagnostic wraps within phone width. Enter activates both disclosures and Tab reaches Manual with visible focus. Hierarchy, alignment, density, spacing and adjacent controls remain consistent. Short transcript requires no vertical scroll; longer-history scrolling and native installed activation remain unverified. Temporary preview files, server and tab removed; browser viewport restored.
- Performance-review scope is not applicable: no production renderer/shared/mobile code change. The new check scans native completion history once per completed turn. Applying the installed library update remains Alex's action because native GeckIt computer control was previously unavailable. Actual model quality and generation of a final answer cannot be guaranteed by this diagnostic fix.
