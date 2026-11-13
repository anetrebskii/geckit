# Deployment precedents

These examples were checked against deployment repositories and conversation history on 2026-11-13. They describe past installations, not the current state of any VM. Read the target's current repository and status before reusing paths or procedures. No company account or repository is a default for a new installation.

| Installation | Service account and home | GeckIt data | Vault environment | Operator wrapper |
| --- | --- | --- | --- | --- |
| TwinsAIbot | twinsbot, /var/lib/twinsaibot/home | /var/lib/twinsaibot/geckit | /var/lib/twinsaibot/geckit.env | sudo geckitctl |
| EntechBot | entechbot, /var/lib/entechbot/home | /var/lib/entechbot/geckit | /var/lib/entechbot/geckit.env | sudo entechbotctl geckit |

Both use `/opt/geckit/service` and `geckit.service`. Wrapper argument conventions differ: TwinsAI's wrapper already inserts `service`, so status is `sudo geckitctl status`. Entech's passes the entire CLI, so status is `sudo entechbotctl geckit service status`. For pairing, use the bundled CLI directly as the service account, or an existing wrapper that accepts top-level `pair`.

TwinsAIbot provisions Azure through Terraform and `host/bootstrap.sh`. The bootstrap deliberately leaves an existing GeckIt bundle, unit and wrapper alone. Changing its version pin does not update an already installed service. Its manual update stages the release bundle, waits for idle, stops the service and retains the previous bundle as a rollback copy. Its repository's main workflow can apply production changes on push; read that workflow before delivery.

EntechBot uses Terraform, cloud-init for base packages and a CustomScript extension rendered from `infra/azure/provision.sh.tftpl`. The extension builds the service from a pinned release tag, installs systemd units and changes the installed bundle when the GeckIt version changes. Read its update plan before apply because the service is stopped during replacement. Historical continuation work prepared a plan and left apply to the operator; do not treat that plan as an observed update.

Both retain the service home, provider login, private data and stable vault key on the data disk. Existing Key Vault integrations deliver credentials through operator-owned provisioning. Do not copy credential values or settings between companies. mdexport/llmdex collection jobs are separate from GeckIt installation; add them only when requested. Likewise, Docker, 1Password and cloud identity rules are deployment-specific requirements.

Past incidents distinguish setup layers:

- A missing Codex executable caused list-status errors on a Claude-only VM. Check enabled providers and installed release support before adding another provider.
- Ubuntu browser setup needed display/system dependencies and hit a sandbox policy refusal. This did not prevent the core service or Slack from starting. Use the installed browser's own instructions; old Chrome-for-Testing workarounds do not establish Camoufox requirements.
- A successful systemd restart preserved an enrolled client, while replacing the service invalidated an unused pairing code.

Source records: GeckIt conversation `codex:01a1c71d-e2e3-7c71-9cc6-788ee155c09b` (TwinsAIbot deployment and remote diagnosis); `codex:01a1ceb5-5556-7090-a86c-1c8a4cbcb3c8` (EntechBot version plan). Source repositories: `twins-ai/TwinsAIbot` README, host/bootstrap.sh, host/geckit.service and host/geckitctl; `entech-code/EntechBot` README, deployment/geckit.service, deployment/entechbotctl and infra/azure/provision.sh.tftpl. Retrieve history through GeckIt's conversation commands when accessible; unavailable sources remain unverified.
