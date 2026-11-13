# Previous bot configurations

Checked from conversation records and provisioning sources on 2026-11-13. These are identity and setup precedents; inspect the current target before edits. They do not establish a VM's present release, granted scopes or live Slack behavior.

| Bot | Workspace | App ID | Target deployment |
| --- | --- | --- | --- |
| TwinsAI Bot | TwinsAI | A0CEDR4SMS6 | TwinsAIbot |
| ENTechBot | Entech Solutions | A0CGY3Q8RHP | EntechBot |

A second app named TwinsAI Bot, `A08HMHK4PN3`, was left unchanged in the file-permission task because it appeared to be the retired bot. That was an assumption, not a reason to delete it. Check identity against the service configuration before changing either app.

The 2026-11-12 file-permission conversation reports that both active apps already had `files:read`; `files:write` was added and both apps reinstalled. The OAuth pages showed both scopes without a reinstall warning. No real file upload/download was verified there. One VM's installed version was not confirmed. Do not carry the old claim that both bots can transfer files forward as verified behavior.

EntechBot's deployment README describes Socket Mode and a Messages tab. It lists app_mention/message.im/message.channels/message.groups/channel_created events and bot scopes copied from TwinsAI plus channels:join. The latter additions serve its separate mdexport auto-join collector. GeckIt's built-in channel does not need channel_created or auto-join for ordinary chat. Its Key Vault names are `slack-token` and `slack-app-token`; TwinsAIbot's export job uses `slack-bot-token`. These are secret names, not values. Do not assume a collector secret is automatically configured in GeckIt's sealed channel storage.

The headless installations retain their vault key and service data separately from tool bundles. Credential changes go through native channel setup or the owning operator provisioner. Avoid two active harnesses consuming the same Slack app. Inspect the old service and exact app first. Stop only the intended consumer within the person's authorization.

Source conversation `plugin:claude-tmux:27b1e663-5ef4-4059-a142-02fba68f54ae` records the file scopes and duplicate app IDs. `codex:01a1c71d-e2e3-7c71-9cc6-788ee155c09b` records the earlier Slack read-method failure and VM release coordination. Retrieve them with GeckIt's conversation history when available. Source configurations: TwinsAIbot README and host/bootstrap.sh; EntechBot README, deployment/geckit.service and infra/azure/provision.sh.tftpl. Unavailable history or configuration remains unverified.
