# Assistant status prototype

Use `client/src/renderer/assistant-status-preview.html` through the local Vite server. This mounts actual status components with independent fixture accounts in desktop board and phone Tasks context. Query parameters: `phone`, `theme=light|dark`, and fixture controls for loading, missing, unsigned, many quotas and multiple hosts. No live account, installation or session is changed.

Design: [UX](../ux/assistant-status.md), [handoff](../../specs/004-assistant-status/design.md).

Fixture state values: ready, checking, unavailable, signed-out, no-quotas, single-quotas, many-quotas, multi-hosts, local-plan. Disable/enable controls exercise provider changes; theme control switches light/dark. Local-plan compares fresh Claude limits against an older account snapshot. Review screenshots and verification limits are linked from the handoff.

Initial screenshots (superseded details layout): [desktop](assistant-status-desktop-light.jpg), [phone footer](assistant-status-phone-light.jpg), [phone sheet](assistant-status-phone-sheet-light.jpg). Fixture values are not real account measurements. Full keyboard, theme, scroll and verification evidence is recorded in the design handoff.

Redesigned panel screenshots: [desktop light](assistant-panel-desktop-light.jpg), [desktop dark](assistant-panel-desktop-dark.jpg), [phone light](assistant-panel-phone-light.jpg), [phone dark](assistant-panel-phone-dark.jpg). Revised details use a fixed cross close button, compact account headers and paired usage cards.

Latest density correction: [desktop single limits](assistant-panel-compact-desktop.jpg), [phone single limits](assistant-panel-compact-phone.jpg). Single limits fill a row; desktop width is 520px.
