# Stash reconciliation

All six stash refs retained; none applied or dropped. Blob presence uses full object reachability from origin/main, independently of task status.

| Source | SHA | Tracked/untracked | Result |
| --- | --- | --- | --- |
| stash@{0} | `13fe04e59dedf0e40881145a17dcb25487cbaf73` | 66/148 | Current shared-checkout snapshot. All66 tracked blobs and90 of148 untracked blobs occur in main history. Unique58 paths are logs, historical reports/evidence and an older contract note; no unique application source. |
| stash@{1} | `63d38e643ce442a03c6283193521407219b11c6e` | 57/24 | All57 tracked and all24 untracked blobs occur in main history. Preserve as historical snapshot; no missing patch. |
| stash@{2} | `74cc2cbc19f82054dc97db48d00f5af4c24f7153` | 9/22 | All8 application/test tracked blobs occur in main history; UX differs only by later added verification. Unique untracked paths are model-picker bundles/harness and phone filming fixture with local data; not product source. Per-provider choices delivered. |
| stash@{3} | `878b74f4ee738647851e61e19a927333755a72d6` | 14/5 | Telegram implementation blobs occur in main history. Remaining snapshots are tests/UX/verification with later edits. Approval report formatter delivered as e4e703a5, later table changes retained. All5 untracked blobs occur in main history. |
| stash@{4} | `6d664d42468af425bceef37ddb68fb7cc583c584` | 31/65 | Mixed early Manager/Telegram/MCP approval snapshot superseded by current implemented modules. Unique untracked Manager/spec files are interim versions; marketing documents are non-product content. Preserve entire stash; do not reapply obsolete architecture. |
| stash@{5} | `5cf3db4b52d9e8cfccbbd7e04d359ad07028e2ef` | 56/0 | Autostash combines Codex integration/provider libraries, metadata/browser selection and Codex Spec Kit migration. Current provider code and service architecture supersede it;31 tracked blobs already exact in main history,25 combined/earlier versions reconciled. No untracked files. Preserve. |
