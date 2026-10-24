# Evidence: Manager and Telegram

Reviewed 2026-10-17. Initial findings below are historical planning evidence. Working-tree implementation and verified boundaries are recorded in verification.md; no released capability is claimed.

## Existing GeckIt foundations

- `client/src/cli/index.ts`: lists/reads conversations, lists parent/children and requests new sessions. It does not expose follow-up, stop, priority or event subscription to a coordinator.
- `client/src/cli/start.ts` and `client/src/main/asked.ts`: provider-qualified caller identity and approval-backed task starts. Manager automatic delegation needs explicit manager authority across all projects; existing ordinary-session approval behavior must stay intact.
- `client/src/main/orders.ts`: existing voice-order vocabulary covers start, say, stop and mark, with user review. Reuse underlying session operations, not the voice prompt as the manager's authority boundary.
- `docs/ux/claude-starts-conversation.md` and `docs/ux/started-conversations.md`: parent/worker tracing and reviewable start requests.
- `client/src/renderer/src/ui/SettingsDialog.tsx`, `chat/Sidebar.tsx`, `chat/PhoneSettings.tsx` and `styles.css`: desktop settings sections, sidebar entry, phone settings pages, shared tokens and quiet controls.
- `docs/features.md`: approved current feature inventory. No manager or Telegram entry is added before implementation.
- `.specify/memory/constitution.md`: main owns credentials/network/state, shared contracts, the person's provider plan, UX before UI, cross-platform language and theme tokens.

## Telegram constraints verified against primary sources

Telegram supports private bot deep links and inline action buttons. Pairing can use a temporary start payload, followed by account confirmation inside GeckIt. [Bot features](https://core.telegram.org/bots/features#deep-linking)

BotFather creates bots and issues revocable tokens; tokens must be treated as credentials. [Official tutorial](https://core.telegram.org/bots/tutorial#obtain-your-bot-token)

Incoming updates can be received through long polling or a webhook, exclusively. Telegram retains undelivered updates for at most 24 hours. A dedicated local receiver is feasible without a public inbound server, but cannot promise responses while GeckIt is closed. Persist the accepted update position and reconcile uncertain effects before replay. [Bot API: Getting updates](https://core.telegram.org/bots/api#getting-updates)

## Planning questions

- Establish provider permission for the exact manager integration, authentication and distribution model before offering an assistant; the presence of a working CLI login does not establish permission for a third-party product.
- Validate GeckIt CLI control for every offered assistant: manager identity, all-project discovery, authorized project/file/app mutations and native approval handoffs. Deep work stays delegated; do not limit the role to today's read-only CLI coverage.
- Choose protected credential storage for macOS, Windows and Linux, with a usable failure state when secure storage is unavailable.
- Establish crash-safe acknowledgement, dispatch and outbox reconciliation. Never describe an uncertain external message send as exactly-once transport delivery.
- Verify actual Telegram receipts, callbacks, revoked-token/receiver conflicts and outage recovery with a dedicated test bot during implementation; a prototype proves none of these integrations.

## Provider terms review: 2026-10-17

The initial assumption that a manager requires no new API account is withdrawn. A manager role is not itself evidence of prohibited use; the authentication route and product distribution need separate assessment. Telegram transport does not establish provider permission.

OpenAI documents continued app-server authentication for local/open-source applications, excludes commercial/hosted services from that authentication path, and points those use cases to Sign in with ChatGPT partnerships. Its current plan-usage documentation covers open-source/locally hosted apps and directs paid or remotely hosted apps to an interest form. GeckIt's exact distribution and deployment must be assessed before selecting a route. [App-server authentication](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source)

Anthropic directs third-party Claude products/Agent SDK integrations to API keys or supported cloud providers and restricts subscription-credential routing. It separately permits customers to offer the unmodified Claude Code binary under stated commercial terms, with users authenticating themselves and paying their own usage. Whether the proposed custom manager UI and Telegram relay fit that exception is unresolved; do not equate either a working CLI or a blanket subscription ban with a permission decision. [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)

Planning must document the eligible path for each offered configuration or exclude it until resolved. These source findings are not provider confirmation of GeckIt's proposed integration, and no real account integration was tested.

## Revision: assistant model and full CLI management

### Enabled providers and project routing

Alex clarified that Manager must control GeckIt through GeckIt CLI and enabled providers only. `client/src/shared/providers.ts` exposes enabled builtins/libraries through `selectableProviders`; `client/src/shared/api.ts` currently stores projects as roots plus global `chatProvider`/`chatProviders`, with `assistantFor` checking host compatibility. There is no project-provider preference in that settings contract. `client/src/cli/start.ts` already accepts `--provider`; `client/src/main/sessions/index.ts:answerRequest` otherwise inherits the parent provider. Manager must therefore dispatch an explicit provider ID instead of inheriting its own assistant accidentally.

FR-033 proposes persistent, user-approved project preferences via CLI, explicit task overrides and GeckIt-default inheritance; it does not describe shipped per-project routing. Planning must add CLI discovery/resolution/preference persistence, validate enabled IDs and host/operation support at dispatch, and test blockers without automatic fallback, enabling or a separate inference backend. Existing ordinary-session inheritance remains unchanged.

Alex requested all projects automatically, model selection, project/file management and use of the GeckIt CLI for all app aspects. This supersedes the first draft's per-project checkboxes and denial of direct file-management operations.

On this revision, `/Users/alex/.geckit/bin/geckit --help` confirmed sessions/show/start/linked, migration and build-instructions commands. The installed CLI does not yet advertise project/file/settings/schedule control. `client/src/cli/index.ts` agrees with that boundary. These operations are proposed requirements, not shipped capabilities; planning must extend the CLI rather than invent current commands.

`client/src/main/sessions/models.ts` gets model availability from the assistant and does not maintain a fixed model table. Manager settings must reuse the assistant/account model source. Prototype Reasoning/Fast labels are examples, not claims about available models or account plans.

| Required CLI area | User-visible examples | Planning obligation |
| --- | --- | --- |
| Sessions and work | Start/read/message/stop, queue/priority, status, goals, attach workers | Preserve provider limits, manager identity and ordinary-session behavior |
| Projects and files | Discover/add/create/remove projects; read/create/edit/move/rename/remove files | All current/future registered projects, supported host routing and existing file/destructive rules |
| Organization | Profiles, favorites, schedules and shortcuts | Same saved state as UI; profile filters do not restrict manager discovery |
| Assistant configuration | Assistants, models and libraries | Account-provided choices, no silent fallback, trusted credential handoff |
| Application configuration | Hosts and supported app settings | Capability discovery, permission enforcement, explicit unsupported results |
| Manager introspection | Current backing ID/model/state, activity and restart | Same session in UI, durable task record independent of runtime |


## Initial first-version runtime findings: 2026-10-17 (superseded below)

The installed `claude --help` advertises safe mode and explicit tool/MCP restrictions. Manager starts the existing Claude session driver with `--safe-mode --tools '' --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands --no-chrome` and a fixed system role. Safe mode disables project customizations, hooks, skills/plugins and inherited MCP configuration. `--bare` is intentionally absent because it changes authentication behavior. Existing provider/account handling remains in the session layer; this is execution-boundary evidence, not a provider-terms determination.

Codex and libraries have no verified equivalent restricted Manager adapter in this version, so setup explains why they cannot run Manager. They remain eligible enabled workers where host support allows. Manager output requests are validated and launched through the compiled GeckIt CLI with literal argv and `shell:false`; no shell or provider credential is exposed to the manager. Tests must inspect actual driver options, rather than just prompt text.

The first implementation adds authenticated project/file/provider-preference and managed-worker CLI commands. `capabilities` returns supported commands and explicit unsupported domains. Installed/released CLI support is unchanged until this source is built and delivered. Telegram uses Electron safeStorage; Linux's `basic_text` backend is rejected. Dedicated user bot/private account pairing is implemented locally, with fake Bot API verification distinguished from live account tests in the implementation verification record.


## Enabled-provider correction: 2026-10-17

Alex clarified Manager is a special GeckIt session with instructions and UX, and requested support for every enabled provider. The initial Claude-only tool-restriction gate is superseded. Existing `LlmProvider.create` supplies provider-qualified session identity. `Driver.send(text, images, before)` is shared by builtin Codex/Claude and library adapters; the checked tmux library consumes its context argument. For compatibility with libraries that ignore the optional context argument, Manager instead prefixes its role and preferences to ordinary message text, with a marker stripped at provider-history ingress. This preserves the normal visible user message without requiring a library update. No new provider extension is required to run the role. Normal provider permissions, account state and tools are retained; model instructions are not presented as mechanical tool isolation. Structured manager requests still pass through the authenticated, validated GeckIt CLI gateway. Provider changes replace the backing session with durable task/decision context, without migrating workers. This records local runtime architecture, not a new provider-terms conclusion; exact account/distribution eligibility and live integration remain unverified.

## Telegram-only correction - 2026-10-17

Alex removed Desktop/phone Manager chat because he manages sessions directly at his computer. No provider or Telegram protocol change is implied: the internal special session and durable coordinator remain. Desktop Settings supplies trusted setup and lifecycle recovery; Telegram is the sole user conversation. Current/archived Manager backing sessions must be excluded from ordinary discovery/chat while normal workers remain accessible. Existing account, integration and provider-terms verification limits remain.

## Native approval and shared-bot findings - 2026-10-19

The screenshot's Computer Use request is an existing zero-field native elicitation with a session-scoped remembered answer. The live Sessions registry already validates that exact answer and applies the native VPN check and grant behavior. Telegram now projects supported pending cards through that same answer path. Typed forms, URLs, native schema errors and oversized requests retain an explicit handoff; no empty form acceptance is invented. The exact historical Telegram payload is unavailable. Tests reproduced leading/trailing blank output, excess prose gaps after hidden CLI blocks and newline-edge splits; outgoing normalization repairs those paths while preserving paragraphs and fenced-code whitespace.

One shared bot is possible: Telegram's [deep-link start payload](https://core.telegram.org/bots/features#deep-linking) can bind each account to a pairing flow. Telegram [updates](https://core.telegram.org/bots/api#getupdates) have one consuming receiver, and [webhooks and long polling are exclusive](https://core.telegram.org/bots/faq). Architectural inference: GeckIt needs a hosted receiver and authenticated account-to-computer routing for a shared bot; distributing one shared credential to independent local pollers is not that architecture. This version improves the direct personal-bot flow. It does not add or deploy a relay. Bot creation follows the [official BotFather tutorial](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).
