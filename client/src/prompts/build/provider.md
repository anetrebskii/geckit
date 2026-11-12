# Build a GeckIt AI provider library

A provider is a public GitHub repository containing geckit-plugin.json and a prebuilt index.mjs. GeckIt loads it in Electron's main process. It does not run npm install or build scripts while installing.

## Start here

Author guide: https://github.com/anetrebskii/geckit/blob/main/docs/provider-plugins.md
Public contract: client/src/main/sessions/plugin-api.ts in the GeckIt source.
Independent Codex example: examples/codex-provider in the GeckIt source.

The example includes a copy of the Codex implementation. It owns its own Codex app-server and instruction setup; GeckIt gives a library nothing of its builtin providers. Copy the whole example directory into your repository; edit its src/provider.mjs and copied runtime sources, run npm ci, npm run build and npm test, then commit index.mjs with your sources. Keep the license and provenance file.

## Identity

Use apiVersion: 1, entry: index.mjs, and matching id/family plugin:<slug>, for example plugin:my-codex. Return sessions as plugin:<slug>:<native-id> from create, list and fork; translate back at your CLI boundary. Rewrite started signals into the same namespace. Every installed library adds an independent assistant with its own enable switch. The legacy replaces field is accepted for compatibility but does not replace built-in assistants.

## Complete contract

Return every method and capability in LlmProvider. Implement account, program, models, limits, history/list/search/read, create/fork, hold and Driver controls, goals, correction, browsers/MCP, setInstructions, delete and dispose. Return empty/undefined results for unsupported optional features. Never claim capabilities your implementation does not have.

models returns selectable values, display names, optional resolved IDs/version, contextWindow/maxOutputTokens, reasoning, supported modes and optional pricing. Pricing is in the stated currency per million tokens: input/output/cacheRead/cacheWrite. Zero is free; absent is unknown. Include source/asOf when known. Do not guess current prices or context capacities.

limits returns windows (a Map keyed by model ID/value) and optional quotas. A quota has id/name and optional part (0..1), used/limit/unit, resetsAt (Unix milliseconds). Legacy plan and Codex limits remain supported. Unknown is omitted; never a made-up zero. account can return usage with quotas/measuredAt; program returns the CLI version separately.

Stream transcript and control changes through hear({ items, gone, signals }). Emit spend for current context used/window and cumulative cost for the current driver run; set currency and costKind (api-equivalent or billed). Emit usage for account quotas. Emit ended once a turn finishes and call left when the driver exits. Persist sufficient data for list/read to restore conversations.

Driver may optionally implement inject(text, images?, before?): Promise<void>, using the same arguments as send. Resolve after the active transport accepts guidance; this does not mean the model applied it. Reject when idle, disconnected, awaiting permission, or unable to deliver. Never start a new turn or interrupt as a fallback. GeckIt keeps the queued message until acceptance and offers Send now only for a supporting live driver. Existing apiVersion: 1 libraries without inject keep working.

setInstructions(enabled, browserNames, browser) owns instruction setup/cleanup. browser is { pluginDir, rule } while Chrome through GeckIt is on, undefined otherwise: a Claude-based library starts claude with --no-chrome, --plugin-dir pluginDir and the rule appended to its system prompt. Select instructions: own for an independent switch, or codex/claude only when sharing that provider's global instructions. Remove only files and references your library owns. dispose must release only your resources.

## Local diagnostics

The apiVersion: 1 factory receives create(context), where PluginContext provides only context.log: PluginLogger. Existing create() factories still work. Use optional context?.log?.write(level, event, fields) for compatibility with older GeckIt versions. Levels are debug/info/warn/error; event names are stable identifiers; fields contain scalar string/number/boolean/null values. Never log prompts, responses, tool arguments, images, credentials or raw backend bodies. Log counts, timings, skip reasons and failure categories instead.

context.log.path is the local file under userData/provider-logs/<normalized-plugin-id>.jsonl (colon becomes hyphen). Writes are asynchronous and nonfatal; the current file and one .1 backup each retain at most 2 MiB. Plugin events receive loadId/loadKind automatically so active snapshots and validation candidates can share a log. Host plugin.load.* and limits.host.* events exist even for older libraries. A limits.host.requested event records a host request, not an actual backend measurement; log backend checks and cache/skip outcomes separately.

## Build and verify

Use Node 22+. Bundle dependencies as ESM for Node/Electron into index.mjs; externalize only Node builtins and Electron. Do not import files from the GeckIt checkout at runtime. Keep TypeScript strict and derive types from the public contract. Avoid import-time side effects: GeckIt validates update candidates while the old provider still runs.

Run your build and deterministic tests with a fake CLI. Test namespace round trips, streaming, permissions, stop/end/dispose, model metadata, quotas, pricing, instructions and failures. Verify GeckIt's typecheck, lint, provider/session tests and desktop/mobile builds when changing the host contract. Review real components in Chrome in light/dark and at desktop/phone sizes when changing UI.

Publish a public repository with geckit-plugin.json, index.mjs, source, lockfile, license and README. In GeckIt use Settings > Assistants > Add assistant, then turn the new assistant on in the same list. Updates are staged and loaded after restart. Removal moves the installed copy to Trash; never deletes the native conversation history.
