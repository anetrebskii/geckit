# Quickstart

From `client`: `npm run build:service`; `node out/service/service.js --data /absolute/private/geckit-data`.
In another terminal set `GECKIT_DATA` for each CLI call: `node out/service/cli.js service status`; `service projects add /absolute/project`; `service settings get`; `service sessions start '{"root":"/absolute/project","text":"Describe this project","provider":"codex","mode":"manual"}' `.
Install/sign in to the provider CLI separately under the same user and configure the VPN rule deliberately before work. A fixture verifies service behavior without a real model account. See docs/headless-service.md for full syntax and systemd template.

Normal desktop dev/build/package includes the service. Desktop attaches or starts it for its data directory; CLI with the same `GECKIT_DATA` observes the same state. `service methods` and `service call settings:get '[]'` expose the full named core API. Closing desktop does not stop work. Configure a supported OS vault backend or protected `GECKIT_VAULT_KEY` for remembered secrets.
