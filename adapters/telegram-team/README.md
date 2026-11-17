# Telegram team adapter

Optional Channel API v2 library. Its source lives in the main GeckIt repository; it does not patch application code. It provides a shared Telegram forum topic and isolated direct messages for explicitly admitted numeric user IDs. No separate panel, browser or launcher is required. GeckIt runs the library inside its service after installation.

## Setup

Requires GeckIt Channel API v2 and Node 22.13+ with built-in SQLite (source integration tested against this checkout). This is a local library package, not an application installer. The library was loaded and used on a headless GeckIt 1.242.0 installation. Messages, incoming screenshots and outgoing files were confirmed by the operator. This is not a claim of compatibility with older API v1 installations.

1. Copy `geckit-plugin.json`, `index.mjs`, `config.mjs`, `store.mjs`, and `telegram.mjs` into `<GeckIt service data>/channel-libraries/channel-telegram-team/`. An owner must arrange local library discovery on service startup. Installation and restart are not performed by these sources or tests. The GitHub channel installer expects a repository root; do not paste the main GeckIt repository URL expecting it to select this subdirectory.
2. Put a private copy of `config.example.json` outside the repository. Set absolute paths, the bot's immutable numeric ID, admitted DM user IDs, and the optional forum topic. Use an empty users list for topic-only operation; omit topic for DMs only. Topic actors and decision approvers are explicit numeric lists. Make the bot a forum administrator so membership lookup is reliable.
3. Store just the bot credential in a private file readable by the service account:

```dotenv
TELEGRAM_BOT_TOKEN=123456789:replace_with_private_token
```

4. In the existing Channels settings choose Telegram team adapter, enter the absolute configuration path in its one `configFile` field, then enable it. There is no custom settings panel. To reread JSON, use the explicit owner-run reload helper below. It waits for both channel state `off` and release of the state lock before enabling, then waits for `connected`. Do not click disable/enable rapidly: the host can overlap lifecycle reconciliation. Read-only polling is cancelled on stop; in-flight writes are allowed to settle without blind retries.

Copy `reload.mjs` beside the library modules if using this helper:

```sh
node reload.mjs --cli /opt/geckit/current/cli.js --data /var/lib/geckit --config /absolute/private/config.json
```

This reloads only this channel, not the whole service. If a mutation times out, the helper stops rather than retrying it. Inspect channel state and locks before another attempt.

Use a new private SQLite state path. Old Python request history and the previous prototype database are not imported. A migration must preserve the next polling offset; see the offline procedure below. Only one receiver may use a bot token: stop the old receiver as a separately authorized migration step before enabling this one. A configured webhook is refused, never deleted. Local state and token locks prevent duplicate local receivers; Telegram polling conflict pauses intake. A stale lock must be inspected by the owner, not automatically removed.

## What participants see

An admitted person writes to the bot in a private chat and receives answers and files there. Another person has another Manager thread and cannot use Manager tools to read or stop that person's tasks. The forum topic has its own shared Manager thread and receives its own results. Reply references stay within their originating thread. Supported inputs are text, photos and documents; unsupported message types are ignored.

`/help`, `/start` and `/status` provide local information. An authorized approver can use `/pending` to replace expired approval cards. An unexpired card is not duplicated. Unknown outgoing card delivery is not retried; inspect it locally. A replacement has new one-use tokens, while expired tokens remain invalid. `/stop`, `/resume` and `/clear` do not control the installation or erase shared history: these actions belong to the owner in GeckIt. Natural-language task management is restricted by native Manager tools to the current thread. Members of the same topic can manage that topic's tasks, including another member's task. Only configured topic approvers can answer approval buttons; in a DM only its owner can. Buttons expire after ten minutes and are bound to a specific question, chat, topic, generation and bot message.

All routes use the public shared Manager scope without owner privileges. Separate threads protect conversation/task ownership; they are not operating-system or project-file sandboxes. The public library API exposes the installation's configured projects, with no per-user project allowlist. Use this with trusted teammates and appropriately scoped project folders. Removing access blocks queued dispatch and future delivery; it does not forcibly terminate an already running worker. The owner can stop such work in GeckIt.

## Parallel work and capacity

There is no adapter-imposed default limit on active conversations: `maxActiveConversations: null`. Each private chat and the common topic can progress independently. Permanent file-read failures reject only that input with a notice; transient reads get at most three attempts, with 1 and 2 second backoff persisted across restarts. A rejected input is never handed to Manager, and later messages can proceed. These retries apply only to reading an incoming file, never to an uncertain task launch or outgoing send. Native Manager queues messages within a thread and can create workers governed by the installation/provider limits. Setting a positive `maxActiveConversations` limits how many distinct conversations with unanswered accepted requests are admitted at once; it is not a worker-process limit. The public API does not offer independent per-DM worker limits. Eight concurrent file/intake handoffs bound adapter I/O only.

`queueTotal` defaults to 1000 and `queuePerChat` to 100; both are editable, up to 10000 total. Native pending intake is additionally bounded at 100 per thread. A full durable queue leaves the Telegram offset untouched and resumes after capacity becomes available. Consequently later messages in the same polling stream, including status commands, can wait behind capacity pressure.

Hard safety bounds: input text 100000 UTF-8 bytes; each file 20 MiB; 256 retained input file references, subject also to the native 200 MiB file cache; 10000 saved requests with 128 MiB total request payloads; 10000 outgoing receipts, reply links and button records each; 2048 generation tombstones. Oversized supported input becomes an explicit rejection without blocking later valid messages. Full retained storage stops admission instead of silently deleting unresolved work. Retained file references and receipts require owner-reviewed archival before reuse of exhausted storage; no automatic destructive pruning is provided.

## Recovery

The request and Telegram offset commit together before acknowledging an update. Duplicate updates cannot create another task. A changed or removed/re-added route gets a new generation; old jobs, callbacks and replies cannot enter it. Authorization and current group membership are checked again before dispatch and outgoing mutations.

A crash between native handoff and acknowledgement reconciles a known native receipt. An unknown handoff or Telegram send remains uncertain and is never blindly repeated. This favors avoiding duplicate work over automatic retry. It cannot guarantee exactly-once effects across Telegram and the native service.

Inspect private state locally (optional helper, no prompts or credentials printed):

```sh
node inspect.mjs --state /absolute/private/state.sqlite
node inspect.mjs --state /absolute/private/state.sqlite --discard 12345
```

Discard requires the adapter to be disabled and its lock released. It only marks an unresolved saved handoff; it neither cancels native work nor retries a send. Inspect the matching task in GeckIt first. Never delete state or locks to fix an ambiguous send.

## Offline checks

```sh
# From this directory; no dependencies to install
npm test
# From client/ with existing GeckIt development dependencies
npx vitest run test/telegram-team-adapter.test.ts
```

Tests use fake Telegram HTTP responses and a test provider. They do not contact Telegram, launch a paid provider, install the library or restart the installed application.


## Group privacy

Telegram may deliver commands but withhold ordinary text and photos in groups when bot privacy is enabled. Reply to a bot message in the configured topic, or grant the bot appropriate administrator access. Changing privacy in BotFather is a separate bot-owner action and can affect other groups. This module does not change privacy, membership or administrator rights. DM attachments do not have this group restriction. `getChatMember` for other people is only guaranteed when the bot is a group administrator.

## Manager setup and deliverables

The library does not install personal instructions or change Manager delegation. Review [manager-instructions.example.md](manager-instructions.example.md) and merge it with the installation's rules through GeckIt's owner settings. This is a template, not an automatic configuration step or a security boundary. Per-person IDs, credentials and private project paths do not belong in a shared template.

If desired, the owner can choose automatic worker delegation in Manager. This affects the entire Manager installation, including local management, not just Telegram. It removes the extra confirmation for creating a worker; it does not change provider permissions, grant owner tools to shared threads or automatically approve worker questions. External publication and service-change restrictions in the template are model instructions, not an additional hard enforcement mechanism.

Use `projects list` and the exact registered root or actual basename; do not assume a repository's product nickname is its registered name. Creating a new project requires owner authorization.

Native `channels send-file` accepts a selected file from a local worker's project and checks worker ownership. For artifact requests, instruct the worker from the beginning to place the deliverable under `.geckit-exports/<unique-task>/<filename>` in its project. The owner must explicitly approve this general staging convention if repository rules normally keep probes outside. After confirmed delivery remove only that task's temporary artifact. Ordinary reports/dumps remain outside repositories. No QA source changes are needed to send a file.

The template asks Manager to use a short caption and omit a redundant final text after successful delivery. This is best-effort model behavior; the adapter does not filter arbitrary answers or suppress errors.

## Offline migration from the old Python topic adapter

This operation does not import or repeat tasks. It applies only to the matching bot and topic with an empty old pending list. Other formats/target changes need a separate reviewed migration.

1. Disable the old receiver, ensure it really exited, and reconcile its pending requests, spool and native work. Check that no other host or built-in channel is polling this token. Stop the new adapter too.
2. Back up old config/state and the new configuration privately. Keep the old state intact; do not reset its offset or restore an older copy after accepting more messages.
3. Choose a **nonexistent** new SQLite state path in a private existing directory. The new config must identify the same bot/topic and its original credential file.
4. Copy `prepare-state.mjs` beside `config.mjs` and `store.mjs`, then run:

```sh
node prepare-state.mjs /private/new-config.json /private/old-config.json /private/old-state.json --old-receiver-stopped
```

The flag is the owner's explicit confirmation, not a remote process detector. The helper checks bot/target/state-path/offset and refuses a nonempty old pending list or an existing destination. It seeds only the preserved next offset and empty new bindings. Inspect the old spool separately; it does not prove native work is idle. It never reads a token value.

5. Enable the new library only after successful preparation. If an offline preparation fails after creating the destination, inspect that new state before any cleanup; never overwrite it blindly. Test `/status`, a DM and a topic reply.

Keep the stopped old receiver and its state for reference. After the new adapter accepts work, do not roll back to the old offset/state: that can duplicate actions. Reconcile offsets and unresolved operations before any rollback. Do not run the migration helper on an existing live deployment.
