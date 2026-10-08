# AI provider libraries

A library is a public GitHub repository that implements GeckIt's provider contract. Builtin Claude Code, builtin Codex, independent plugins and Claude's tmux transport all use that contract. GeckIt owns the board, renderer and IPC; the provider owns its AI integration.

## For users

1. Open **Settings > Libraries**, choose **Add library**, paste the repository URL and press **Add**.
2. Enable the new assistant in **Settings > Assistants**. Independent assistants have independent switches; installing a library does not replace Codex.
3. Select it in the composer. **Model details** shows reported model identity, version, context capacity, maximum output, reasoning, supported modes, token rates, CLI version and account limits. The phone has the same control in Conversation info.

Several libraries can be attached. Their code runs with GeckIt's local access; add repositories you trust. Automatic updates check on startup and every 24 hours, stage and validate a candidate, then load it after restart. **Check now** checks manually. Current conversations keep their loaded implementation until restart.

**Remove** asks for confirmation, moves the installed repository to Trash and clears staged updates. The assistant disappears from new choices immediately. Restart to unload code already in memory. GeckIt retains conversation notes and native history. Reinstalling the same library in the current process requires a restart. Removal does not wait for update checks, and an in-flight update cannot restore the removed library.

## Start with the independent Codex example

[`examples/codex-provider`](../examples/codex-provider/README.md) contains a complete, standalone Codex Mirror library: manifest, editable provider adapter, copied Codex runtime, model overrides, build script, lockfile, built entry, license and fake-CLI test. Its own code launches and controls Codex; it does not forward AI requests to `host.codex`.

Copy that directory into a new repository:

```sh
npm ci
npm run build
npm test
```

Change the identity in **both** `geckit-plugin.json` and `src/provider.mjs`; change the session prefix with it. Edit `src/codex-runtime.mjs` for protocol/AI behavior, `src/provider.mjs` for provider operations, and `src/model-overrides.mjs` for verified metadata. Commit the rebuilt `index.mjs` so GeckIt can install without executing scripts.

The public [Codex Mirror repository](https://github.com/anetrebskii/geckit-codex-mirror) is the installation example. Both Codex and Mirror can list the same native conversations under distinct GeckIt IDs. Both share the native Codex history/account; deleting a native conversation affects both. The processes and provider implementations are independent.

For a transport extension, see the separate [Claude tmux repository](https://github.com/anetrebskii/geckit-claude-tmux). It keeps Claude's conversation identity and disk history while changing the live transport.

## AI-readable build guidance

Installed commands provide self-contained guidance without opening an AI session:

```sh
geckit instructions providers
geckit instructions app
```

The Local copy uses `geckit-local`. With no topic, `instructions` returns the provider guide. These commands work from the built CLI and do not depend on documentation files being installed beside the app. GeckIt's generated AI instructions point to them.

## Repository layout and manifest

```text
geckit-plugin.json  # metadata and API version
index.mjs          # prebuilt ESM entry, committed
src/               # editable implementation
test/              # fake transport tests
package.json
package-lock.json
README.md
LICENSE
```

```json
{
  "apiVersion": 1,
  "entry": "index.mjs",
  "provider": {
    "id": "plugin:my-provider",
    "family": "plugin:my-provider",
    "name": "My Provider",
    "shortName": "My AI",
    "icon": "my-provider",
    "iconPath": "M2 2h12v12H2z",
    "browser": "none",
    "loginCommand": "my-ai login",
    "planName": "",
    "resumeCommand": "my-ai resume {id}",
    "localOnly": true,
    "instructions": "own"
  }
}
```

| Field | Meaning |
|---|---|
| `id`, `family` | Matching `plugin:<lowercase-slug>` for an independent assistant |
| `name`, `shortName`, `icon` | Provider-owned display identity |
| `iconPath` | Optional SVG path on the 16x16 grid, at most 2048 characters |
| `browser` | `none`, `claude` or `codex`; actual browser choices come from `browsers()` |
| `loginCommand` | Sign-in command shown when authentication is needed |
| `planName` | Subscription name; empty when other account types are accepted |
| `resumeCommand` | Optional terminal handover; `{id}` becomes a shell-quoted native ID |
| `localOnly` | Provider cannot run on an SSH host |
| `runtime` | Optional `codex` compatibility for existing reasoning/goal controls; not required for generic quotas or pricing |
| `instructions` | `own` for an independent switch, `claude`/`codex` for shared global instructions |

`claude-tmux` is a transport plugin with `family: claude`, `transport: tmux`. A deliberate Codex replacement can use `family: codex`, `replaces: codex`; only one replacement can be installed. Use independent identity for normal libraries.

## Public contract

Import types from [`plugin-api.ts`](../client/src/main/sessions/plugin-api.ts). It re-exports the actual contract and domain types; there is no second hand-maintained interface.

`index.mjs` exports `create(host)`, returning a complete `LlmProvider` or a promise for it. `PluginHost` exposes builtin providers and existing Claude protocol helpers. Extending them is optional; an independent implementation can ignore them. Avoid import/create-time AI requests because GeckIt loads update candidates while the current implementation is still in use.

| Area | Methods / fields |
|---|---|
| Identity | `LlmProviderInfo`, manifest fields above |
| Capabilities | `available`, `localOnly`, `subscriptionOnly`, `images`, `remoteControl`, `nativeGoals`, `idleMs`, `waitForExit` |
| Account/catalog | `account`, `program`, `models`, `limits` |
| History | `list`, `search`, `hidden`, `has`, `read`, `links`, `delete` |
| Conversations | `create`, `fork`, `hold`, `rename`, `remote` |
| Goals | `goal`, `setGoal`, `clearGoal` |
| Tools | `mcp`, `browsers`, `correct` |
| Instructions/lifecycle | `setInstructions`, `dispose` |

Implement every method. Unsupported optional features return `undefined`, empty lists or the contract's empty result; advertise only supported capabilities. `subscriptionOnly` controls GeckIt's API-key guard. `hold` returns a `Driver` with `send`, `answer`, `stop`, `end` and optional live permission/control/detach operations.

### Session identity and persistence

Return `plugin:<slug>:<native-id>` from `create`, `list` and `fork`. Translate it back only at the native CLI/API boundary. Rewrite `started.session` into the same namespace. GeckIt routes reads, messages, permissions and controls by this prefix. Keep `read` and `list` consistent after restart, including context/cost fields when persisted by your backend.

### Models and prices

`models(root?)` returns `ProviderModel[]` (the existing `ClaudeModel` shape). Required fields: `value` (selection token), `name` (display name). Optional metadata:

| Field | Meaning / unit |
|---|---|
| `id` | Exact resolved model ID |
| `version` | Model version, separate from CLI version |
| `says`, `isDefault`, `disabled` | Description, default status, unavailable model |
| `contextWindow`, `maxOutputTokens` | Token capacity and maximum generated output |
| `reasoning`, `defaultReasoning` | Supported reasoning options and default |
| `supportsAdaptiveThinking`, `supportsFastMode`, `supportsAutoMode` | True/false only when known; absence is unknown |
| `pricing` | Rates in `currency` per **million tokens** |

`pricing` has `currency` (ISO currency code), optional `input`, `output`, `cacheRead`, `cacheWrite`, and optional `source`/`asOf`. Zero is a reported free rate. Missing is unknown. Supply verified rates and provenance; GeckIt does not infer current vendor prices. Rates do not calculate a conversation bill from context occupancy.

`program()` returns `{ version, from?, path? }` for the CLI. Existing names remain supported; public aliases `ProviderModel`, `ProviderAccount`, `ProviderProgram` are available to new authors.

### Quotas, context and events

`limits(models)` returns `ProviderLimits`:

```js
{
  windows: new Map([['exact-model-id', 200000]]),
  quotas: [
    { id: 'daily', name: 'Daily requests', used: 25, limit: 100, unit: 'requests', resetsAt: 1900000000000 },
    { id: 'weekly', name: 'Week', part: 0.42 }
  ]
}
```

`part` is a fraction, 0..1. Alternatively provide `used`/`limit`/`unit`. `resetsAt` and `measuredAt` are Unix **milliseconds**. IDs must be stable and unique per quota. `account().usage` may return the same quotas plus `measuredAt` for account-based integrations.

API v1 legacy `plan` (Claude five-hour/seven-day windows) and `limits` (Codex primary/secondary windows) still normalize automatically. Codex legacy reset timestamps are seconds; the generic fields above are milliseconds. Provider/model measurements are isolated, concurrent requests coalesce, and the backend caches for one minute. Visible windows refresh every five minutes and on focus. Failed polling retains the previous successful measurement.

Context capacity comes from model metadata, measured `windows`, persisted conversation data, or a live `spend.window`. Live conversation capacity takes precedence. Unknown remains omitted, not zero.

Stream through `hear({ items, gone, signals })`; items are upserted by ID and `gone` removes provisional items. The [`Signal` contract](../client/src/main/sessions/heard.ts) covers started/model/reasoning, progress, permission requests/resolution, tasks, goals, usage and completion:

```js
hear({ items: [], gone: [], signals: [
  { kind: 'spend', used: 12000, window: 200000, cost: 0.25, currency: 'USD', costKind: 'api-equivalent' },
  { kind: 'usage', usage: { quotas: [{ id: 'daily', name: 'Daily requests', used: 26, limit: 100 }], measuredAt: Date.now() } }
] })
```

`spend.cost` is cumulative for the current driver run; GeckIt combines runs. `costKind` is `billed` or `api-equivalent` (legacy default); `currency` defaults to USD for existing plugins. Context used is occupancy, not total billable tokens. A provider's usage event does not change another provider's plan. Emit `ended` once per turn and call `left()` when the driver exits.

### Instructions and lifecycle

`setInstructions(enabled, browserNames)` installs/removes only the files/references the library owns. Shared Codex instructions may delegate to `host.codex.setInstructions`; AI requests need not delegate. `instructions: own` gives a separate switch. Old plugins missing this method retain their compatibility fallback.

`dispose()` releases only your own connections/processes. Candidate validation must not dispose a shared builtin provider. Bundle dependencies into the committed ESM entry; Node builtins and Electron can remain external. GeckIt never runs repository scripts or installs dependencies.

## Verification and maintenance

- Run build and fake-CLI tests in the standalone example. They prove AI calls use copied code, IDs round-trip, metadata/quotas arrive, output streams, permission replies work, Stop works and owned resources close.
- Change GeckIt's host contract: run typecheck, lint, provider/session/plugin/CLI tests, desktop and mobile builds.
- Change visible UI: mount actual components and app styles in Chrome; click through complete, partial, unavailable/loading and long-list states in both themes at desktop/phone sizes. Follow [performance checklist](performance.md).
- Keep source, lockfile, built entry and provenance together. GeckIt validates IDs and method signatures at load time; optional metadata is backward compatible under API v1.

Host organization: shared model/usage types in `shared/api.ts`, display normalization in `shared/provider-usage.ts` and `shared/model-details.ts`, scoped measurement cache in `main/sessions/provider-usage.ts`, renderer surfaces in `chat/ModelDetails.tsx` and `chat/ProviderUsage.tsx`.
