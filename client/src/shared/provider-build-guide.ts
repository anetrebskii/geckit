export const PROVIDER_BUILD_GUIDE = `# Build a GeckIt AI provider library

A provider is a public GitHub repository containing geckit-plugin.json and a prebuilt index.mjs. GeckIt loads it in Electron's main process. It does not run npm install or build scripts while installing.

## Start here

Author guide: https://github.com/anetrebskii/geckit/blob/main/docs/provider-plugins.md
Public contract: client/src/main/sessions/plugin-api.ts in the GeckIt source.
Independent Codex example: examples/codex-provider in the GeckIt source.

The example includes a copy of the Codex implementation. It owns its own Codex app-server and does not call host.codex for AI requests. Copy the whole example directory into your repository; edit its src/provider.mjs and copied runtime sources, run npm ci, npm run build and npm test, then commit index.mjs with your sources. Keep the license and provenance file.

## Identity

Use apiVersion: 1, entry: index.mjs, and matching id/family plugin:<slug>, for example plugin:my-codex. Return sessions as plugin:<slug>:<native-id> from create, list and fork; translate back at your CLI boundary. Rewrite started signals into the same namespace. Every installed library adds an independent assistant with its own enable switch. The legacy replaces field is accepted for compatibility but does not replace built-in assistants.

## Complete contract

Return every method and capability in LlmProvider. Implement account, program, models, limits, history/list/search/read, create/fork, hold and Driver controls, goals, correction, browsers/MCP, setInstructions, delete and dispose. Return empty/undefined results for unsupported optional features. Never claim capabilities your implementation does not have.

models returns selectable values, display names, optional resolved IDs/version, contextWindow/maxOutputTokens, reasoning, supported modes and optional pricing. Pricing is in the stated currency per million tokens: input/output/cacheRead/cacheWrite. Zero is free; absent is unknown. Include source/asOf when known. Do not guess current prices or context capacities.

limits returns windows (a Map keyed by model ID/value) and optional quotas. A quota has id/name and optional part (0..1), used/limit/unit, resetsAt (Unix milliseconds). Legacy plan and Codex limits remain supported. Unknown is omitted; never a made-up zero. account can return usage with quotas/measuredAt; program returns the CLI version separately.

Stream transcript and control changes through hear({ items, gone, signals }). Emit spend for current context used/window and cumulative cost for the current driver run; set currency and costKind (api-equivalent or billed). Emit usage for account quotas. Emit ended once a turn finishes and call left when the driver exits. Persist sufficient data for list/read to restore conversations.

setInstructions(enabled, browserNames) owns instruction setup/cleanup. Select instructions: own for an independent switch, or codex/claude only when sharing that provider's global instructions. Remove only files and references your library owns. dispose must release only your resources.

## Build and verify

Use Node 22+. Bundle dependencies as ESM for Node/Electron into index.mjs; externalize only Node builtins and Electron. Do not import files from the GeckIt checkout at runtime. Keep TypeScript strict and derive types from the public contract. Avoid import-time side effects: GeckIt validates update candidates while the old provider still runs.

Run your build and deterministic tests with a fake CLI. Test namespace round trips, streaming, permissions, stop/end/dispose, model metadata, quotas, pricing, instructions and failures. Verify GeckIt's typecheck, lint, provider/session tests and desktop/mobile builds when changing the host contract. Review real components in Chrome in light/dark and at desktop/phone sizes when changing UI.

Publish a public repository with geckit-plugin.json, index.mjs, source, lockfile, license and README. In GeckIt use Settings > Libraries > Add library, then enable the new assistant in Settings > Assistants. Updates are staged and loaded after restart. Removal moves the installed copy to Trash; never deletes the native conversation history.
`

export const APP_BUILD_GUIDE = `# Build GeckIt from source

Repository: https://github.com/anetrebskii/geckit
Read AGENTS.md and CLAUDE.md in the checkout before editing. Node 22+ is required.

Desktop:
  cd client
  npm ci
  npm run typecheck
  npm run lint
  npm test
  npm run build
  npm run dev

npm run build writes out/main, out/preload and out/renderer, including out/main/cli.js. npm run dev runs GeckIt Local with separate geckit-local user data and a geckit-local command. Do not restart active conversations just to load a backend change. npm run package creates installers; it is not a deployment.

Phone (uses client/node_modules):
  cd mobile
  npm run build
  npm run ios

npm run ios syncs Capacitor and opens Xcode. Signing and installing on a device needs the person's configured Apple development identity. Dictation additionally requires client/scripts/whisper.sh and cmake. The signal/ Firebase service is a separate deployment.

For provider libraries run geckit instructions providers. Review visible changes interactively in Chrome, light/dark, at the requested viewport, and follow docs/performance.md before calling them done.
`
