# CLI contract

`geckit browser profiles export <name> --output <file>` exports one closed GeckIt-managed Chrome for Testing profile. Refuse active/launching/locked profiles and existing output files. Output permissions are private. Success identifies the exported profile/path and says the archive contains private browser data.

`geckit browser profiles import <file> --name <new-name>` restores to a new managed name without overwriting. Reject unsupported, malformed, truncated or unsafe archives. Success identifies the imported name and explains that another computer may require sign-in because saved credentials depend on its OS key store.

Archives contain profile files and optional account note, not OS key stores. Ordinary Chrome profiles and implicit paired-computer file transfer are outside this contract. With a remote execution target, the path belongs to that executing computer. Unknown profile subcommands fail with usage instead of listing profiles.

Existing native `browser.account(name,note)` becomes create-only for Settings; CLI note updates retain their explicit existing operation. Native failed browser opening rejects so the renderer can show an actionable row error.
