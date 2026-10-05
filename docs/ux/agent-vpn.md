# Agent VPN

Status: Working-tree configuration, status and required-admission UI. Native routing, connection and reconnect remain proposed and unimplemented.

Automatic native setup requested on 2026-10-05: [setup and recovery UX handoff](../../specs/004-agent-vpn/automatic-setup-ux.md). After native qualification, GeckIt ships and manages its signed/notarized component. Developer provisioning is a build responsibility; users supply their AmneziaWG configuration and actual macOS approvals only. This future flow does not change the current unavailable runtime or establish packet blocking.

Current configuration UI is implemented separately. The next section describes the requested clarity update; routing states later in this document remain future behavior.

## Configuration setup and demonstration

The initial separate-scene demo was rejected by Alex on2026-10-04. [Continuous walkthrough UX](../../specs/004-agent-vpn/ux.md) supersedes the illustration/caption/control details below, while preserving real setup actions, finite playback, reduced motion, visibility pausing and the configuration-only boundary.

The header says `Prepare your VPN servers`. Without configurations, show `Configuration only` and `VPN connection is not available yet`. With any saved or unreadable retained configuration, show `VPN required` and `Agents are blocked until VPN connects`. Both states explain `The native VPN component is not installed. Connect and Reconnect require it.` Do not show an unusable Connect button. There is no user setup step that can activate the unfinished runtime.

Always show setup instructions in a card titled `Add your first server` when empty and `Add another server` when populated:

1. `Open AmneziaVPN` - choose Share VPN access for your self-hosted server.
2. `Export a separate connection` - name the user GeckIt, choose your server, AmneziaWG and AmneziaWG native format, then save the .conf file. A vpn:// key or .vpn export is not the accepted format.
3. `Import the .conf file` - use the primary `Import .conf file` action in this card. Explain that each server needs its own configuration, and that saving a server blocks agent work until VPN connects.

Keep instructions visible in empty, saved and error states; the core setup guidance must not depend on opening a disclosure. After import, retain the existing first-server selection behavior and focus rules. Saved profiles appear under `Saved servers`, with the selector labelled `Configuration to use later`. A note says `Saved selection only. This does not connect agents.` Names, removal confirmation and errors retain the existing safe behavior. Rename `Check configuration` to `Check file` and explain `Checks supported settings only; does not contact the server.` File errors and storage errors remain inline and do not alter selection.

Import errors and loading errors appear next to the import action in the setup card, rather than below all saved profiles. Rename, offline-check and removal feedback appears beside saved-server controls. Announce each result once and retain the triggering control's focus. This matters because the setup card and demonstration make the Settings content vertically scrollable.

Secure-storage and unreadable-store availability alerts appear immediately below the compact connection notice, above setup instructions, so the reason Import is disabled is visible before the disabled action.

`Watch setup demo` opens an on-demand walkthrough in the setup card. It is labelled `Setup demonstration` and `Example only. No file is imported and no connection is made.` Three scenes illustrate Amnezia export, importing a .conf file and a saved configuration. The final scene says `VPN required` and explains that agents are blocked until VPN connects; it never depicts traffic reaching a VPN or a Connected state. Demo actions must not call the real import/select API or alter saved configurations.

The person can play, pause, replay, close and select any numbered scene manually. One play runs once for roughly 9 seconds, enough to read three short captions, then stops. Animation uses only transform/opacity on HTML wrappers. No default autoplay, looping, per-frame React updates or layout animation. Pause timers and CSS animation when the page is hidden or the demonstration scrolls out of view; unmount on Close or leaving Settings. With prefers-reduced-motion, show static scenes with manual navigation and explain that motion is reduced. Playback controls are ordinary labelled buttons in visual tab order; opening does not steal focus, closing returns focus to Watch setup demo. Captions stay visible and are not announced on every animation frame. Motion is decorative; the equivalent visible instructions remain usable without it.

Layout follows existing Settings tokens. At desktop size use a compact status notice, a setup card, optional demonstration and saved-server controls in vertical order. At <=600 pixels use the already scoped one-column Settings layout, wrapping controls and captions without horizontal overflow. Phone status is specified below; configuration import remains on the computer.

Validation: empty and saved states, real fixture import, selection/rename/file check, invalid import, secure storage and write errors, removal/cancel, play/pause/replay/manual scenes/close, no demo-induced profile changes, reduced motion, hidden/out-of-view pause, keyboard focus, scrolling and both themes at desktop and narrow sizes. This maps to US3, US4, FR-014, FR-022, FR-023 and FR-025. Native routing acceptance is unaffected.

## Goal and boundary

Keep local agents and every tool they launch on the person's self-hosted AmneziaWG connection while the computer's VPN can change for browsing. GeckIt owns setup and enforcement. Agents use ordinary network APIs and receive no VPN instructions, proxy environment, or tunnel secrets.

An unprivileged agent cannot turn protection off or escape it. This does not promise that an agent cannot infer VPN use from its public IP, system inspection, or the product's source code. Administrator control granted by the person is outside the enforcement boundary.

## Entry point and layout

Desktop Settings has an `Agent VPN` section after Assistants. It contains a saved-server selector, selected-server card, and an explanation: `Route agents and their tools through your AmneziaWG connection.` Under it: `Your computer's VPN can change independently. If this connection fails, agent network access stops.`

No per-conversation choice: protection is computer-wide for local GeckIt agents. The phone can see status but configuration import and OS installation happen on the computer. Phone-started agents use the same policy.

## Setup

The empty state shows `No connection` and `Import configuration`. The picker accepts native `.conf` files. GeckIt validates the protocol and supported version before retaining the secret. Import does not execute file hooks or scripts. The user-visible connection name is separate from secret fields.

`How to export` expands instructions: create a separate user named GeckIt in Amnezia, choose the self-hosted server and AmneziaWG, choose AmneziaWG native format, then save the `.conf` file. No request to paste keys into a conversation.

Import returns focus to the connection card. An invalid file shows an inline reason and retains any previous valid configuration. Do not display private keys, raw configuration, or endpoints containing credentials in errors.

## States and transitions

| State | Label | Behavior and controls |
| --- | --- | --- |
| Empty | No connection | Import configuration; protection has never been enabled. |
| Disabled | Off | Show saved name; Enable, Replace configuration, Remove. |
| Required installation | Setup required | Explain native OS setup; Install network helper. Protected launches remain blocked if protection was already required. |
| OS consent pending | Waiting for system approval | Explain where to approve; Check again, Cancel setup. Cancelling leaves an existing protection requirement blocked. |
| Connecting | Connecting | Protection remains required; covered traffic is blocked until enforcement and tunnel readiness are both established. |
| Active | Connected | Show saved name; `Agents and their tools`; Disable. No per-packet animation. |
| Tunnel failure | Connection unavailable | `Agent network access is blocked. Reconnect to continue.` Retry, Replace configuration, Disable. |
| Enforcement failure | Protection unavailable | `Agent network access is blocked. Repair setup to continue.` Repair setup, Disable. |
| Unsupported platform or configuration | Unavailable | Explain what is unsupported. No Enable control or claim of protection. |

Enabling protection first establishes blocking, then launches or reconfigures protected processes, then opens tunnel connectivity. GeckIt reports Connected only when both transport and enforcement are ready. Disabling is an explicit action, never automatic after a failed import, startup, or reconnect.

Changes that require restarting active agent processes show `Apply when agents finish` and `Cancel`. Existing active sessions retain their current policy until the transition can be made without direct escape. GeckIt must not silently kill a working agent or report new protection before it applies.

Removing a saved configuration while protection is required leaves protection required and traffic blocked. Explicit Disable is a separate action.

## Conversations and tools

When a local agent is waiting on connectivity, its status says `Waiting for Agent VPN`. Preserve unsent draft text; do not append VPN instructions to the transcript or let the model attempt to repair the tunnel. Retry only when provider protocol semantics can avoid duplicate submissions.

Agent browsers are dedicated protected processes. Existing shared browser tabs, remote SSH agents, external connectors, or host services cannot be assumed covered. A tool with an uncovered execution boundary is blocked with a user-visible explanation; normal assistant instructions remain unchanged. No silent use of an uncovered browser.

Loopback and local development servers remain usable inside the protected boundary. Access to computer-local services must not introduce a generic network relay that can bypass protection.

## Focus, keyboard, scrolling, and timing

Use existing Settings navigation, dialog, and form controls. Every control has a visible label. Tab follows visual order; Escape closes an expanded help panel before closing Settings. File-picker cancellation changes no state. Status changes use a polite live region without stealing focus. Error actions retain keyboard focus on the control that triggered them.

The connection section uses Settings' scroll container. No fixed card heights; allow long connection names to wrap. At widths up to 600 pixels, Agent VPN Settings puts section navigation in a horizontally scrolling row above the full-width page. The page scrolls vertically; control labels must not be squeezed into a side-by-side narrow column. Other Settings sections retain their existing layout. Collapsed help stays silent until expanded.

Status is event-driven. Do not poll per conversation, render traffic counters, or animate continuously. Show Connecting immediately; if still connecting after 30 seconds, show Connection unavailable with Retry. This UI timeout does not release enforcement. Native network enforcement must block escape immediately, independently of the renderer's status timing.

## Acceptance coverage

- US1 / FR-001 through FR-005, FR-017, FR-018: import, enable, ordinary agent networking, all-tool coverage, computer VPN changes.
- US2 / FR-006 through FR-008, FR-013, FR-019, FR-020: startup, tunnel/extension failure, no direct fallback, message retention and safe recovery.
- US3 / FR-009 through FR-012, FR-014: secret storage, truthful states, restart persistence, native setup, unchanged subscriptions and cross-platform language.
- FR-015 and FR-021: block uncovered delegates; preserve native workflows and do not substitute a virtual machine without an explicit decision.
- FR-016: a selected server does not guarantee a permanent public exit IP or transport availability.

## Saved servers and current implementation boundary

Import adds a server rather than replacing the previous one. Give each a name; rename and remove are separate controls. Remove expands an inline confirmation with Cancel and Remove server; cancelling retains selection and returns focus to Remove. `Server` selects from saved configurations; `Selected server` does not imply Connected. Without a native runtime, no Connect or Reconnect control is offered. Saving a configuration requires VPN and rejects GeckIt agent dispatch; selecting or checking it cannot connect a tunnel. Removing the final readable configuration releases the application admission block. This current admission slice does not provide packet enforcement for external, detached or shared processes. `Check configuration` is an offline validation, never described as a live connection test.

Keep the active connection separate from pending selection during a switch. No automatic failover. Unsupported native routing does not expose an Enable switch or silently modify computer-wide routing. Desktop-only configuration controls are not exposed to the phone.

Encrypted configuration retention uses the operating system's encryption service and rejects plaintext fallback. This preparatory configuration store is not proof that a native agent cannot access its own user's encryption service; the protected execution implementation must put secrets and management outside its actual boundary before protection is offered.

## Bottom-bar status and direct settings entry

Alex requested visible connection status and an easy route to reconnect from Settings on 2026-10-04. Put one quiet, labelled VPN button at the leading edge of Chat's bottom bar, on both the board and an open conversation, for every desktop provider. It stays reachable when account/usage items overflow horizontally. Reuse the settings icon, footer typography, hover and focus tokens. Saved profiles never get a connected indicator; unavailable routing needs no alarm colour.

| State | Bottom-bar label | Settings action |
| --- | --- | --- |
| Reading the main-process view | VPN loading | Open Agent VPN settings. |
| No saved configuration, native routing unavailable | VPN unavailable | Show connection-unavailable explanation and configuration controls. |
| Any saved configuration or unreadable retained storage | VPN required | Explain that agent work is blocked until VPN connects. |
| View read failed | VPN status unknown | Open Agent VPN settings to read the service again. Retry status on window focus; never claim disconnected or protected. |

The accessible name includes Agent VPN, its status and Open VPN settings. Its tooltip explains required admission when configured; otherwise it explains that native VPN routing is unavailable. When known, include `Saved configuration: <name>. Not connected.` The indicator describes GeckIt's local agent VPN, not the operating system VPN or SSH-agent coverage.

Click, Enter or Space opens existing Settings directly on Agent VPN. Focus moves to its selected section button. Escape, Done or the scrim closes it and returns focus to the bottom-bar opener. Ordinary Settings continues to open General. No extra menu or modal sits between the status and its controls. One initial read, broadcasts and window-focus refresh drive status; no polling, timers, credentials or per-conversation subscriptions.

At narrow desktop widths, keep the labelled VPN control visible while existing account information can scroll. The phone shows a separate touch-sized control for the paired computer; configuration mutations remain desktop-only. No new animation. Current routing remains gated: no functioning Connect/Reconnect, fake spinner or simulated Connected state. Once native enforcement passes its acceptance gates, real states and Reconnect belong in this same Settings destination, driven by runtime evidence.

Acceptance: light/dark at 1352x706 and 390x844; Claude/Codex/plugin footer branches; loading/read-error/empty/saved/secure-storage states; live rename/selection updates; direct section, visible keyboard focus and return focus; usage overflow; desktop behavior preserved; phone behavior follows the mobile handoff below. Browser preview mounts real footer/Settings and stylesheet with synthetic data.

## Mobile status and settings entry

Under the phone list and above its tab bar, show one quiet, 44-pixel-minimum status row: "Host VPN unavailable" and a settings glyph. In a conversation, place the same row below the composer, respecting the home indicator and hiding it while the keyboard is open. Tap opens a full-height Agent VPN sheet without leaving the current tab or conversation. Settings > Host also opens this destination. Dismiss returns to the same place and opener.

The page names the paired computer and says "Agent VPN on <computer>". This is the paired computer's agent admission status; it does not change the phone's network or route remote SSH hosts through its VPN. Show real loading, unavailable, read failure, and host-offline states. Display the selected saved configuration as "Saved configuration", never connected. When configured, explain that agents are blocked until VPN connects; otherwise explain that native routing is unavailable. Offer "Refresh status"; do not expose an inoperative Connect/Reconnect button. Show "Manage configurations on <computer>" as explanatory text, not an unimplemented link.

Only the non-secret status view crosses the existing sealed phone connection. No configuration text, private keys, import, rename, remove, check or selection mutations are available from the phone. Updates arrive as events; refresh on reconnect and app foreground, with no polling and no persisted VPN view. Immediately invalidate status on a dropped connection so cached state cannot imply live protection. Older computers return "VPN status unknown" with an explicit refresh action.

Acceptance: real phone footer and page at 390x844 and 375x667 in light/dark; tap, dismissal and focus return; long computer/profile names; scrolling; loading/error/offline/empty/saved states; live metadata changes and reconnect; keyboard/footer safe-area behavior; no extra reads while typing; desktop regression. Browser preview uses synthetic metadata and must be labelled as a preview. Physical iPhone and real VPN routing validation remain separate.

### Mobile states and transitions

| From | Event | To | What the user sees and can do |
| --- | --- | --- | --- |
| Initial | Status mounts, automatically | Loading | "Host VPN loading"; open the sheet to see the computer being checked. |
| Loading | Computer answers without configuration, automatically | Unavailable | "Host VPN unavailable"; inspect status and refresh. |
| Loading | Computer answers with required admission, automatically | Required | "Host VPN required"; agent work is blocked until VPN connects. |
| Loading | Read fails or older computer rejects call, automatically | Unknown | "Host VPN status unknown"; "Refresh status" tries again. |
| Any live state | Phone connection closes, automatically | Offline | "Host offline"; saved VPN view is cleared; the existing phone connection retries. |
| Offline | Connection returns, automatically | Loading | Status is read again, without a tap or any network-policy change. |
| Required / Unavailable / Unknown | Tap "Refresh status" or foreground app, automatically on foreground | Loading | Status is checked again; no animated connection claim. |
| Required / Unavailable | Computer updates configuration, automatically | Required / Unavailable | Any remaining profile requires VPN; final readable removal releases admission. Saved metadata never means connected. |
| Any | Tap bottom control or Settings > Host row | Sheet open | Current state and computer name; return with Done, Escape or existing sheet dismissal. |
| Sheet open | Dismiss | Previous place | Same tab/conversation, with focus returned to opener. |

No new timers, transient success messages, spinners or provider details are introduced. Phone link diagnostics remain in the existing reconnect notice. No underlying agent prompt changes. The old decision to hide VPN entirely on phone is replaced by this read-only status slice because Alex explicitly requested mobile parity. FR-028 and T023/T024 cover this slice; native implementation requirements remain open.

## Required VPN admission - 2026-10-04

Alex requires saved VPN configuration to block agent work until a verified connection exists. This replaces the earlier configuration-only decision to let agents continue on the ordinary network. A saved server, a retained encrypted configuration that cannot be read, or an unready policy must deny new agent work from GeckIt. Removing a selected server does not disable the requirement while any server remains. Invalid/cancelled imports and failed writes do not change policy. No automatic fallback. Offline dictation and browsing already saved conversations remain available.

The current runtime has no native tunnel. Therefore configured agent requests from GeckIt must be rejected explicitly before provider invocation, including Chat starts/resume, queued dispatch, correction and provider metadata requests. Reuse the existing message/error path so drafts and queues survive. Recheck after asynchronous work before dispatch; do not remove a queued message on denial. Phone-started local requests use the same main-process boundary. SSH agent starts/handoffs are also denied while configured VPN is unavailable, because they must not bypass the requirement. This does not establish remote-host routing through the local VPN; remote coverage remains a separate native qualification boundary. An application admission block is not a packet-level kill switch for escaped/external processes or arbitrary plugin code. Native OS enforcement remains necessary for those guarantees.

Desktop and phone status: "VPN required" / "Host VPN required" when configurations exist and native runtime is unavailable. Settings: "Agents are blocked until VPN connects." Unconfigured status remains "VPN unavailable" / "Host VPN unavailable". Unknown reads remain unknown. The sheet/settings explain why: "The native VPN component is not installed. Connect and Reconnect require it." Do not introduce a pretend connection state or a button that only refreshes metadata labelled Reconnect. A real reconnect must close/restart the tunnel, verify readiness and keep the native block throughout. Its implementation remains blocked on native provisioning and qualification.

Policy transitions: successful first import enters required/blocked; selecting or renaming retains required; removing one of several retains required; removing the final server releases only this admission block; corrupted secure storage remains blocked; startup initializes policy before any queues/provider initialization; failed reads cannot release it. Tests must prove provider/launch spies stay untouched when blocked and unchanged no-configuration behavior.

## Bottom-bar visual integration revision - 2026-10-04

Alex rejected the small outlined VPN button in the supplied board screenshot. It inherits a form-button border, sits too close to the footer edge and reads as a separate widget. Previous screenshot review focused on Settings and did not establish visual quality of the footer in the board context.

The footer is one quiet utility strip. The VPN entry occupies the leading edge; existing plan and usage occupy the trailing group. Use a borderless settings glyph before the status label, a shared baseline and comfortable vertical inset. Show a subtle hover surface and visible keyboard focus only during interaction. Keep the truthful full label in every state. No coloured protection dot, outlined pill, extra menu or animation.

Keep the VPN entry fixed while only the provider-information group can scroll horizontally. Long usage rows must not pass beneath the VPN action. At narrow widths, hide existing optional account copy as before and retain access to quota details without a whole-footer scrollbar. Settings entry and focus-return behavior remain unchanged; mobile retains its own touch-sized footer rather than inheriting desktop measurements.

Review the complete footer beside representative board cards, not just a settings modal or cropped control. In both themes, inspect visual hierarchy, alignment, spacing, icon/text balance, hover, keyboard focus and quota overflow at1352x706 and390x844. Review actual unavailable, required, loading and unknown labels. Make corrections based on the rendered result before delivery.

## Setup demo removal - 2026-10-04

Alex rejected the walkthrough and explicitly requested removal. Remove Watch setup demo, the entire demonstration surface, playback/scene controls, demo-specific Escape handling and all associated animation/state code. Keep the visible numbered export/import instructions and real Import .conf file action. No replacement demo or illustration. Settings layout, profile operations and truthful connection status stay as specified. This supersedes all earlier demonstration decisions above and in the linked walkthrough UX. Review the simplified settings in light/dark, saved/empty states, keyboard focus and narrow scrolling.

## Agent traffic explanation - 2026-10-04

Alex subsequently requested explanation and routing motion using SSH Hosts as the reference. Follow [routing UX](../../specs/004-agent-vpn/routing-ux.md): purpose, actual build support, then a compact agents/AmneziaWG/internet figure and existing setup. One finite connected sequence ends with blocked internet; manual states, pause/replay and reduced motion remain available. Label it "How protection will work" and "Illustration only. This is not your connection status." The rejected export/import demo stays removed.

A saved configuration currently denies new GeckIt agent work; running tools do not yet have verified native internet blocking. Keep this limitation before the figure and keep real status independent. Phone uses the same explanation for its paired computer; SSH hosts need their own protection. This UI does not imply Apple capability approval or a working native connection.
