# Verification

Use isolated HOME/GECKIT_DATA, recorded provider files and disabled integrations. Build service, run its CLI to issue code, pair browser mobile and desktop against actual WebRTC; inspect snapshot/history/events. Expire/reuse/revoke and reconnect after service restart. Do not use user credentials. Commands and observed outcomes go to docs/reports/remote-clients.md.


Revision checks: on an empty isolated data directory run `geckit pair`; assert one copyable code and surviving detached service. Repeat without restarting service. Paste into actual Servers, verify direct enrollment without pending, open normal workspace, add server folder, send recorded-provider task and answer approval. Disconnect/reconnect and revoke. Verify an old scoped grant cannot call control. Build/typecheck/lint and affected/full tests. Review 1440x900 and390x844 light/dark. Repeat with real remote source installation where possible; no paid model call or user credential changes.
