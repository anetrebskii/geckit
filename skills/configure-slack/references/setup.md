# Built-in Slack setup

## App and workspace

Start from the existing Slack app ID and workspace, not its name. Open that app's settings at `https://api.slack.com/apps`. Use GeckIt's documented browser capability for page work; the person completes administrative sign-in or permission prompts. Do not read token fields into the model.

Enable Socket Mode. Under Basic Information, create an app-level token with `connections:write`; this is the App token, with an `xapp-` prefix. Enable Event Subscriptions and bot events `app_mention`, `message.im`, `message.channels` and `message.groups` for the conversation types required. Socket Mode receives these through an outgoing WebSocket connection and does not need a public Request URL. Enable the app's Messages tab when people must DM it.

The built-in adapter advertises these bot token scopes:

| Scope | GeckIt use |
| --- | --- |
| app_mentions:read | Receive mentions |
| chat:write | Send replies and status |
| im:history | Direct-message context |
| mpim:history | Group direct-message context |
| channels:history | Public-channel thread context |
| groups:history | Private-channel thread context |
| users:read | Names and workspace-member access checks |
| files:read | Receive files |
| files:write | Upload files |
| reactions:write | Working indicator reactions |

Compare the target version's channel field help with this table; do not add unrelated scopes. Install/reinstall the existing app in the selected workspace after adding scopes. The Bot User OAuth Token, with an `xoxb-` prefix, is distinct from the app-level token. Check the granted scope list and reinstall warnings. A reinstall may preserve a token; do not infer rotation or replace vault values without observing the token handoff through the supported private flow.

Invite the bot to the channels it should hear. Private-channel access requires an invitation. Exporting all public channels, joining them automatically and `channels:join` belong to a separate collection workflow, not core GeckIt chat setup.

Slack references: [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/) and [app-level connection scope](https://docs.slack.dev/reference/scopes/connections.write/). The scope table above comes from GeckIt's built-in adapter, not the smaller example library.

## Configure the intended GeckIt

On desktop, select the intended computer, then Settings, Channels, Slack, Set up. The built-in row already exists; do not install the example repository as a duplicate Slack channel. Have the person enter Bot token and App token in the native secret fields. Saved values are sealed and are not shown again.

Configure:

- `allow`: Slack user IDs, never display names. A nonempty list admits only listed IDs. An empty list admits full members of the bot's workspace, excluding guests, deleted users, outsiders and bots. Ask when the desired access policy is unspecified.
- `checkSecrets`: keep enabled unless the person explicitly requests another policy. Token-like messages are refused before model dispatch; do not test with a real credential.
- `projects`: only registered roots the channel may use.
- `manager`: enable May talk to Manager, and confirm Manager itself is enabled with an available provider/model.
- `enabled`: turn on after the configuration is ready.

Operator or authenticated Manager can read `channels list` and apply non-secret changes with `channels configure --id channel:slack --patch <JSON> --expected <last-read-subset>`. Inspect the target's capabilities first. Arrays replace; preserve unrelated grants and allowed users. On an expected-value conflict, reread and merge. The product patch supports only enabled, projects, manager and non-secret config; it refuses secret fields.

For a headless operator, `service call channels:view '[]'` reads channel state. `service call channels:configure '["channel:slack",{...}]'` is the underlying operator RPC when the installed method list advertises it. This method accepts channel changes including secret provisioning, but do not put real secret values into a chat, tool command or shell history. Have the operator use an existing protected provisioning path, or use native setup through a paired desktop. Ordinary assistant identity is not allowed to call the operator API; do not work around that refusal.

## Behavior and acceptance

The built-in adapter sends DMs and mentioned channel threads to Manager. In channels, a mention selects a thread; mention the bot again for the acceptance follow-up. The adapter collects earlier messages from that thread, subject to access, pagination and context limits. Each thread keeps its own Manager conversation. Manager can delegate project work only within the channel's project grants and normal approvals.

Read the channel's Connected/failed/setup status and Manager state first. Then, in an authorized test channel:

1. Have an allowed person mention the bot with a harmless request; observe its working indicator and answer in the same thread.
2. Mention it in a follow-up asking about a harmless fact already in that thread. Verify the answer uses that fact.
3. Test a separate thread and DM if those entry points are required. Verify the second thread's conversation mapping is distinct.
4. If files are requested, send a harmless text/image file under 1 KiB and ask about its contents. Then request a harmless generated project file and verify the native Slack upload and receipt. A file URL in a reply is not evidence of an uploaded attachment.
5. With an available disallowed test account, verify access is refused or ignored according to the adapter. Do not broaden access merely to perform the test.

Never claim message or file delivery from a fake Slack transport, unit status or scope screenshot. Record any unavailable live check.

## Diagnose by layer

| Observation | Inspect |
| --- | --- |
| Setup/missing credentials | Presence of both saved secret fields; vault availability, without displaying values |
| Socket not connected | App token scope, Socket Mode, outbound network and sanitized channel error |
| Connected but no answer | Correct app/workspace, event subscriptions, invitation, allow policy, Manager enabled and channel Manager grant |
| Missing project work | Registered project roots, channel grants, enabled provider and authentication, VPN/IP rule, pending approvals |
| Missing thread context | History scopes and invitation; deployed adapter version and sanitized conversations.replies error |
| missing_scope for files | files:read or files:write as reported; reinstall the same app; retry the affected file check |
| Duplicate or unexpected bot replies | Other active consumers of this Slack app; verify app IDs and old services before disabling anything |

An older GeckIt sent Slack read-method parameters as JSON, yielding `conversations.replies: invalid_arguments`. The fix sends form-encoded read parameters. Scope additions do not fix that version bug. Check whether the installed release contains the fix rather than copying another connector's credentials. File support also depends on the deployed adapter; do not hardcode an old minimum as proof that a current installation is ready.
