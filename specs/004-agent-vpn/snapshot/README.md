# Paused application integration snapshot

[application-integration.patch](application-integration.patch) preserves the VPN changes to the shared Electron/phone checkout and all new VPN TypeScript sources/tests. [manifest.json](manifest.json) records the base commit, exact file inventory and patch SHA-256. The native qualification sources and scripts are committed at their original paths.

Application changes are archived instead of activated on this branch. Their shared files also contain unfinished provider refactoring, model/usage UI and other edits. Those interleaved changes are retained as recovery context in the patch; unrelated files and provider dependency modules were left in the original local checkout. This patch is not a standalone buildable application integration and must not be applied blindly or shipped.

To inspect an archived file, search for its `diff --git` section in the patch. It uses zero context to preserve exact changed lines without introducing patch-context whitespace into the repository. Recover it in an isolated checkout of the recorded base with `git apply --unidiff-zero application-integration.patch`, then reconcile the provider dependencies and validate the result before use. Never apply it to Alex's dirty checkout.

The branch preserves work for later investigation. It does not connect GeckIt to a VPN. DNS capture, reliable helper updates, full enforcement qualification, native runtime integration and automatic setup remain unfinished. Implementation stays paused until Alex resumes it.

UI and performance reviews recorded in the feature handoff describe the original working tree. Publishing this archival artifact makes no new rendered-UI or runtime validation claim.
