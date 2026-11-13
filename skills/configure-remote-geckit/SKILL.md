---
name: configure-remote-geckit
description: Install, update and verify a headless GeckIt service on a remote machine. Use for a VM or server that must keep running without desktop. Pairing an existing service belongs to configure-remote-connection; connecting its Slack app belongs to configure-slack.
---

# Configure remote GeckIt

## Purpose

Deliver a headless GeckIt installation that runs under the intended OS account and retains its state across service restarts. Extend the deployment's existing provisioning instead of replacing it with a second installation.

## Inputs

Resolve the target, OS, architecture, service account, private data directory, requested release and deployment repository from the request and existing configuration. Read [installation and recovery](references/installation.md) before work. Read [deployment precedents](references/deployments.md) when adapting an existing bot or provisioning repository.

Read the deployment repository's instructions, unit and wrapper before changes. Inspect status, active work, installed bundle version, Node, provider installation and authentication without printing secrets. Use supported CLI operations; an inaccessible host is a blocker for deployment, not evidence of absence.

## Work

1. Choose the existing deployment workflow or a new standalone installation. Pin the requested release and architecture; verify download integrity where supplied. If building from source, copy the entire service output, including assets and package metadata.
2. Prepare Node 22 or newer, a dedicated account, private writable data directory, provider executables on its PATH and persistent secret storage. Install and sign in only the providers the person selected, under that account. The operator completes interactive authentication.
3. Use an OS service manager with the correct HOME, PATH, data directory and vault environment. Keep one owner per data directory. Closing desktop does not stop the service.
4. Preserve existing credentials, device identity, data, vault key, conversations and configuration. Stage an update before stopping the service. Finish or explicitly stop active work, shut down cleanly, replace the bundle and retain a rollback copy. Follow the deployment's Terraform or release controls.
5. Configure registered projects, enabled providers, Manager when requested, and the approved public-IP policy. Provider readiness requires authentication and the VPN/IP rule to permit sending; listening alone does not establish readiness. Do not disable the policy merely to make a check pass.
6. For workspace access load `configure-remote-connection`; for Slack load `configure-slack`. Browser installation is conditional: use `use-browser` and the installed backend's requirements when requested. A display or browser is unnecessary for the core service.
7. Read state after every uncertain mutation. If operator access is denied, report the exact remaining operator step. Do not strip assistant identity or read operator credentials to bypass it.

## Unknowns

Mark the installed version, authentication, vault availability and external integration outcomes `Unknown` until checked on the target. Repository pins describe desired state. Never infer a successful apply, live model response or Slack reply from a build, plan, unit status or Connected row.

## Output

In the person's language, report target, installed version, service account, bundle/data paths, changed provisioning files and observed checks. Include rollback location and the remaining operator action if blocked. Omit empty sections, secrets and temporary pairing codes.

## Verification

Check the actual service process and owner, CLI status, registered projects and selected providers. With authorized account use, observe one harmless task through completion. Verify state survives an orderly restart when active work permits it. Verify pairing and channels separately when in scope. Fix failures in those checks and rerun the affected check; label simulated, source-only and live-account evidence separately.
