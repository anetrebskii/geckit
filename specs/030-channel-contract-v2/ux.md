# Library-owned channel settings

## 1. Why

A library must be able to implement everything the bundled Telegram, Slack and Discord modules implement without a change to GeckIt's renderer. Existing Telegram pairing and Discord connection checks are currently compiled into the app's UI.

## 2. What is added

| Surface | Behavior |
| --- | --- |
| Settings, Channels | Every installed channel uses the same row, On switch, Set up and configuration form. |
| Set up | An optional module `settings(context, request)` supplies a declarative screen of sections, text, fields, links and actions. Without it, manifest fields are used alone. |
| Manager | No channel-specific account or control UI. Connection status lives in Channels. |
| Phone | Generic channel requests and updates by ID. Configuration stays on desktop. |

The user opens Settings, Channels, selects Set up, completes the channel's connection steps, and saves its connection credentials. The channel reports Connected only after its own verification. Saved secrets alone do not imply a connected account. On later visits the module shows its current connection and offers changes without requiring unrelated permissions to be entered again. A module with a settings hook owns its configuration fields and saves them through context.configure, avoiding duplicate token inputs. The host adds no permission or folder controls. All GeckIt project folders are available automatically through the common contract.

## 3. States

Set up opens a card under the row, lined up with the name; the row stays highlighted and the Set up chevron turns up. Loading shows "Loading connection settings..." with a spinner over placeholder shapes of a title, text and two buttons. A returned screen shows the library's exact title, descriptions and actions. A pending action disables submissions and shows "Working...": a spinner inside the pressed button (the words for screen readers), or the visible line when the action has no button on the screen, such as Try again. Actions that ask for confirmation are drawn in the danger colour. A failed action displays its returned message and retains the current screen for retry. Off channels remain configurable. Removing or switching a channel cannot display a late response from an earlier request.

## 4. Transitions

| From | Event | To | What the user sees |
| --- | --- | --- | --- |
| Closed | Press Set up | Loading | "Loading connection settings..." |
| Loading | Module returns, automatically | Ready | Library screen |
| Ready | Submit action | Working | "Working...", actions disabled |
| Working | Module returns, automatically | Ready | Updated screen; secret fields cleared |
| Working | Module rejects, automatically | Failed | Error; current fields retained |
| Failed | Submit again | Working | Error clears; "Working..." |
| Ready | Channel publishes a view, automatically | Ready | Refreshed connection state; unsent fields retained |
| Ready | Action requires confirmation | Confirming | Library confirmation, Cancel and Confirm |
| Confirming | Cancel | Ready | No action sent |
| Confirming | Confirm | Working | Action sent once |
| Any open state | Escape or close | Closed | Focus returns to Set up; no implicit save |

## 5. What stays silent

Transport updates do not open Settings, reset fields, or move keyboard focus. Secrets are not included in screen state or published views. UI state is local to the opened screen, not a global wizard shared between windows.

## 6. Thresholds and time

No new polling, debounce or delay. Refresh is event-driven. Telegram retains its existing ten-minute pairing expiry and its limit of 100 approver IDs. Those remain channel policy.

## 7. Wording

Host wording: "Loading connection settings...", "Working...", "Try again", "Cancel", "Confirm", "Connection", "GeckIt access". Channel wording belongs to the module, including Telegram pairing and Discord token verification. The host access form and folder picker are absent. Manager access and declared capabilities are always enabled, with no separate switches.

## 8. Edge cases

A channel without a settings extension uses the manifest form. A failed check never saves a rejected token. The channel may show setup before it is running. Actions requiring a live connection report a failure if unavailable. Disabled or removed channels cannot continue using a previous runtime context. Phone views pass through the module's presentation function before forwarding; Telegram removes pairing and account-management data there.

## 9. What is deliberately absent

No renderer branching by channel ID, no Telegram renderer API, no legacy Telegram phone calls, no channel-specific account field in Manager, and no arbitrary HTML or scripts from a channel in the renderer. The schema renders through existing GeckIt controls.

## 10. Decisions

Use declarative screens rather than renderer bundles: all modules can describe the needed connection flows while host styling and keyboard behavior remain shared. The explicit request to execute all review requirements authorizes removing the former Telegram-specific UI and compatibility exceptions. This changes how connection settings are composed while preserving transport policy and stored pairing data.

## 11. Reconciliation

The user correction on 2026-11-15 removes the Manager, control, files and shares switches. All declared capabilities are enabled for bundled and external libraries alike; legacy false values no longer restrict access. Global Manager enablement remains. This explicit correction supersedes the former opt-in grants requirements.

Implements the latest no-exceptions requirement across backend, renderer and phone. Extends FR-005, FR-019, FR-024 and FR-025. Replaces the earlier FR-022/FR-023 assumptions that required Telegram-specific UI and phone compatibility. Libraries and bundled modules receive the same settings and migration hooks. Live messenger verification requires actual accounts; fake transport tests and browser fixtures are reported separately.

At widths up to 520 px, Settings navigation becomes a horizontally scrollable row above the full-width page. The connection screen and host permissions scroll vertically; field labels, messages and actions wrap within the page.

Latest correction (2026-11-15): Discord configuration has only Bot token and People who may write. Slack configuration has only Bot token and App token and answers all workspace users, including guests; foreign workspace accounts, deleted users and bots are not answered. Legacy allowlists in Slack, Discord channel restrictions, disabled direct messages and disabled secret checks no longer change behavior. Direct messages, all visible Discord channels and secret checks are always enabled. Every channel can use every project configured in GeckIt; old per-channel folder lists are ignored. The operational On switch remains for starting/stopping a connection. Connection checks, status, links and Save/Cancel actions remain.
