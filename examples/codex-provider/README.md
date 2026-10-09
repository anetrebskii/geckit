# Codex Mirror: independent GeckIt provider example

A complete library with an editable copy of GeckIt's Codex code. The adapter launches its own Codex app-server. AI requests, account, model catalog, quotas, history, streaming, approvals, goals, correction, Stop and cleanup execute inside this library. It does not forward them to `host.codex`.

## Install in GeckIt

Settings > Libraries > Add library: `https://github.com/anetrebskii/geckit-codex-mirror`. Enable Codex Mirror in Assistants. It adds an assistant; Codex remains available with its own switch. Both can show the same underlying Codex chats under different GeckIt IDs. Deleting a native chat affects both.

## Build your own

Copy this directory to a public repository. Node 22+:

```sh
npm ci
npm run build
npm test
```

Commit `index.mjs`. GeckIt installs the prebuilt entry and does not run scripts or install dependencies. Change matching identity in the manifest and `src/provider.mjs`, including the namespace functions, before publishing your own assistant.

| File | Ownership |
|---|---|
| `geckit-plugin.json` | Name, icon, identity, instructions policy |
| `src/provider.mjs` | Complete provider adapter; customize methods here |
| `src/codex-runtime.mjs` | Copied editable implementation: Codex RPC/process, events, permissions, history, goals, correction and helpers |
| `src/model-overrides.mjs` | Verified model metadata and token prices keyed by exact model ID |
| `index.mjs` | Built installable entry |
| `test/fake-codex.mjs` | Deterministic fake CLI; no paid model calls |
| `test/provider.test.mjs` | Built-entry account/catalog/limits/session/streaming/approval/Stop/cleanup and editable metadata checks |
| `UPSTREAM.md`, `LICENSE` | Provenance and license |

The copied runtime is standalone JavaScript bundled from GeckIt's TypeScript. It has no runtime imports from the GeckIt checkout. Edit it directly; building does not replace it from upstream. `create(host)` is side-effect free until an operation needs Codex. Only `setInstructions` delegates to GeckIt's builtin Codex instruction setup because both use `~/.codex/AGENTS.md`.

The live driver implements optional `inject(text, images?, before?)` for GeckIt's **Send now** queue action. It sends `turn/steer` with the current native turn ID, without starting or interrupting a turn. Older library builds without that method keep normal queue behavior. The fake-CLI test verifies text, attachments and the native IDs for steering.

## Model metadata

The overrides map starts empty. Do not invent rates or capacity. To test custom catalog code, add verified metadata in `src/model-overrides.mjs`, keyed by a model ID returned by your CLI. Supported fields include `version`, `says`, `contextWindow`, `maxOutputTokens`, capability flags and `pricing: { currency, input, output, cacheRead, cacheWrite, source, asOf }`. Prices are per million tokens; absent means unknown, zero means free. Rebuild and commit `index.mjs` after editing.

Full contract and author guide: [GeckIt provider libraries](https://github.com/anetrebskii/geckit/blob/main/docs/provider-plugins.md). Installed AI guidance: `geckit instructions providers` (or `geckit-local instructions providers`).
