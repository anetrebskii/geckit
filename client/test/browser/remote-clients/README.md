# Real remote-clients fixture

From `client/`, run `npm run build:service`, then `node test/browser/remote-clients/setup.mjs` with local socket access. This copies the complete service bundle into a fresh temporary folder and starts it through its server CLI, with isolated HOME/data/vault and an explicit fixture provider. It never changes user providers or credentials.

Start `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5213`. Open `/test/browser/remote-clients/` through the GeckIt browser CLI. For the actual mobile entry, start Vite from `mobile/` on port 5214 and choose “Connect to a server”. Enter the invitation link returned by `http://127.0.0.1:47932/invitation`.

Click Connect normally. Compare the displayed phrase with `/pending` (which executes the actual server CLI). Only then call `/approve`. These operator endpoints are localhost fixture helpers, never production service endpoints.

The fixture contains a real stored 125-item provider conversation, a private project and saved Manager history. The provider is a test plugin, not an authenticated model account. Service, CLI, authorization, encryption, WebRTC, snapshot/history and UI are real. Signaling uses a local mailbox with the same encrypted SDP payloads; Firebase and TURN are not exercised.

- `/new-code?ttl=1s` tests expiry; `/new-code?manager=1` explicitly grants both projects and Manager history.
- `/event` executes actual `chat:rename`; observe the remote title update.
- `/restart` shuts down and restarts the service with the same vault/trust. Observe automatic reconnect and fresh snapshot.
- `/devices` lists devices without keys; `/revoke` revokes the first active device. Pair distinct browser origins (5213 desktop, 5214 mobile) to test separate device identities and same-code reuse rejection.
- Manager history requires all registered project scopes, including profiles. Without `--manager` only Manager summary state is visible.

No test endpoint should be exposed beyond localhost. Stop setup with Ctrl-C; it terminates its child service. Save only screenshots and non-secret observations, never its invitation or vault key. Real NAT, managed Firebase, forced TURN, physical phone and packaged cross-platform checks remain separate release gates.

For the actual desktop Chat entry, start the existing headless-service Vite harness on5215 with `GECKIT_BROWSER_DATA=<fixture>/data node node_modules/vite/bin/vite.js --config test/browser/headless-service/vite.config.ts --port 5215` after creating `<fixture>/data/browser-harness.json` containing `{}`. Open `/test/browser/headless-service/` and click Servers. The harness connects local RPC to the real service and mocks Electron/native boundaries; Servers itself uses actual WebRTC.

`/test/browser/remote-clients/hosts.html` on that same5215 harness renders the actual legacy MacList with a mocked Macs navigation boundary. It verifies placement of old/new entries, not a legacy phone connection.
