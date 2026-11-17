# Channel contract v2 design handoff

The latest request requires Telegram, Slack, Discord and installed libraries to use one contract, including Settings. This supersedes the earlier exceptions for a dedicated Telegram screen, Telegram status in Manager, and legacy phone calls. The implementation reuses GeckIt's existing channel rows, form fields, buttons and permission controls. No new visual direction is introduced.

Behavior: [UX](ux.md). Existing layout: [Channels](../../docs/ux/channels.md). Contract: [library guide](../../docs/channel-libraries.md).
