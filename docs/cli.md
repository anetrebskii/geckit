# Local and remote CLI configuration

These commands are implemented in this branch. Both computers need a build that advertises `cli:product`; a running source service and an already registered full-control target are required. Installing this change does not enable any disabled assistant. Existing `--computer` is supported as an alias. No command changes a real target during the tests documented here.

```sh
geckit computers
geckit capabilities
geckit capabilities --host <registered-id>
geckit settings schema --host <registered-id>
geckit sessions schema --host <registered-id>
geckit providers --help --host <registered-id>
```

Omitting the selector or using `--host local` means local. An ID wins over a name; names must match exactly ignoring case and be unique. An unknown, ambiguous, offline, incompatible or unauthorized host fails with a nonzero exit. There is no local fallback or automatic retry. Manager mutations require the immutable ID, and its native confirmation is bound to the complete command and originating session. Manager capabilities expose its role limitations; remote session mutations go through the target Manager's existing ownership/approval flow with `manager send --text`.

Ordinary product families are settings, providers, projects, employees, shortcuts, sessions, hosts, channels, manager, computers, devices, access, browser-config and speech. The existing browser CLI and legacy sessions/show/start commands remain compatible. `capabilities` and domain schemas list concrete commands, arguments, authority and native restrictions. See the [complete API/field matrix](cli-coverage.md).

Reads do not create authorization. Operator product commands use the private source RPC bearer and the existing identity-bound encrypted paired channel. Observation grants cannot execute commands. Assistant workers cannot borrow operator RPC; authenticated Manager uses its own session token, operation identity, approvals and revocation check. Native provider sign-in, SSH secrets/MFA/host-key trust, OS permissions, pairing/grant creation and permission/team answers remain user-controlled. Secret values are not accepted by product patches or emitted by their reads. Native desktop configuration import/export and app update/restart remain their existing desktop flows; no arbitrary service call or shell is forwarded.

## MCode-only on a registered computer

First inspect; use actual IDs and current values from that target. `plugin:mcode` below is an example, not an assumed library identity. `providers list` includes installed disabled providers; `settings show` includes `chatProviders`. Do not enable a disabled MCode implicitly.

```sh
geckit providers list --host <id>
geckit settings show --host <id>
geckit manager view --host <id>
geckit projects list --host <id>
geckit shortcuts list --host <id>
geckit sessions list --host <id>
```

If MCode is already installed and enabled, explicitly move selected defaults and dependencies to it before disabling alternatives. The following values are examples; every expected value must match the last read.

```sh
geckit settings edit --host <id> \
  --patch '{"chatProvider":"plugin:mcode","correctProvider":"plugin:mcode"}' \
  --expected '{"chatProvider":"claude","correctProvider":"claude"}'
geckit projects provider --host <id> --project /target/project \
  --provider plugin:mcode --expected '"claude"'
geckit manager configure --host <id> \
  --patch '{"provider":"plugin:mcode"}' --expected '{"provider":"claude"}'
```

Configure only dependencies that actually refer to a provider being disabled. For each enabled saved task shortcut, save the entire edited draft from `shortcuts list` using `shortcuts save --draft '<edited JSON>' --expected '<entire previous JSON>'`; choose MCode explicitly. General Manager shortcuts use Manager's configured provider. No default, shortcut or Manager switch is performed automatically by `providers disable`.

Active, queued, held and closing work prevents disable. Finish work first. If the user explicitly wants to stop an isolated session and release its quiet runtime, use `sessions stop --id <session>` and then `sessions release --id <session>`, inspect it again, and wait for runtime closure. These commands are examples for an authorized operator, not instructions to stop existing user work without consent.

After reading the exact enabled array, disable each alternative with the updated array from the previous read:

```sh
geckit providers disable --host <id> --provider claude \
  --expected '["claude","codex","plugin:mcode"]'
geckit settings show --host <id>
geckit providers disable --host <id> --provider codex \
  --expected '["codex","plugin:mcode"]'
geckit providers list --host <id>
geckit settings show --host <id>
```

Expected final enabled array: `["plugin:mcode"]`. The last provider cannot be disabled. Stale arrays, unavailable providers or remaining dependencies fail before saving. Disable keeps libraries, credentials and history. Install/reinstall through CLI leaves the library disabled; an explicit enable action with the current expected array is separate and still requires access checks/Manager confirmation.

## Other configuration examples

```sh
geckit settings edit --host <id> --patch '{"theme":"dark"}' --expected '{"theme":"light"}'
geckit projects add --host <id> --path /target/project
geckit channels list --host <id>
geckit channels configure --host <id> --id channel:example \
  --patch '{"enabled":false}' --expected '{"enabled":true}'
geckit settings manager --host <id>
geckit settings manager-edit --host <id> --instructions 'New instructions' --expected-instructions 'Last read text'
geckit hosts schema --host <id>
geckit devices list --host <id>
geckit access status --host <id>
geckit speech status --host <id>
geckit browser-config status --host <id>
```

Target paths belong to the target filesystem. Employee `--description-file`, `--role-file` and other existing `*-file` inputs are read on the source before dispatch; their text is sent through the typed contract. Settings maps merge named entries; arrays replace. Entity contracts validate nonempty expected subsets or entire prior drafts as described by schemas. Read back after every mutation.

A timeout or disconnect after dispatch can lose the reply after saving. **Delivery is uncertain** means inspect the same target's state before any retry; the CLI never replays a mutation. An unsupported older target requires an explicit application update outside active work, not a shell fallback. Revoking the connection used by a command can itself lose the response.
