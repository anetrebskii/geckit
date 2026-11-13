# Original desktop connections

2026-11-13. Codex session 01a1d4d0-d120-72d0-b0c5-317d239abf25. Implemented on main for direct delivery. No temporary worktree was created.

The original file-origin IndexedDB in GeckIt Local contains three saved computers. The development renderer used its localhost-origin database instead. Desktop storage operations now run in a hidden file-origin renderer in the same Electron session and data directory. The Chat preload forwards listing, saving, renaming, forgetting, public-key lookup and signing to that store. The private signing and wrapping keys stay in their original IndexedDB. Browser and phone clients retain origin-local storage.

Native verification used a temporary copy of the real IndexedDB, the built preload, the actual storage module and the new main-process bridge. The localhost renderer read all three computers and produced a signature verified against the original public key. Renaming, retaining a label while saving, forgetting, restoring and reading after reload passed. An unsupported operation was rejected. The original database was not changed by these checks. Temporary copies were removed after verification.

Browser verification used the real Chat, computer selector and Computers dialog with three synthetic records substituted only at the native storage boundary. The selector listed all three computers; Manage computers showed all three rows. Full-screen inspection passed in light and dark at 1280x800 and dark at 900x650. Edit focused the name field, and Escape returned to the list. A second Escape did not dismiss the list after focus left the removed editor; this existing keyboard behavior was not changed. No real remote connection was attempted.

Type checking, desktop/service builds, the authentication regression test and ESLint on changed files passed. The full suite passed 1,958 tests and initially failed the two service integration files while their shared build output was in use; both files passed on rerun, including a sequential run of all ten tests. The repository lint command still reports 43 errors in five unchanged build scripts; changed files pass lint.

The running development desktop has not been restarted. Reopening GeckIt Local is required to load its new main process and preload. Active service conversations were preserved. Live remote reconnection and the updated running desktop remain unverified.
