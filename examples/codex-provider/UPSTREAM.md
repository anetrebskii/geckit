# Runtime provenance

Copied from https://github.com/anetrebskii/geckit at base commit `bd6a56f3c26fc88dbf67114482502258b98cdd29` plus the provider model/usage changes in this checkout on 2026-10-08. The snapshot includes ws and its retained license notices. The GeckIt license is included beside this file.

Refreshed on 2026-10-09 with optional Driver injection and Codex `turn/steer` support, integrated into GeckIt main. Released installer availability must be checked separately.

GeckIt maintainers can regenerate the snapshot with `node client/scripts/export-codex-runtime.mjs`. This is an explicit upstream refresh; it replaces `examples/codex-provider/src/codex-runtime.mjs`. Plugin authors normally edit the copy directly and run their own `npm run build`. Nothing fetches upstream at install or runtime.

Customized on 2026-10-09 with an optional logger on the copied CodexSessions class. It records actual account/rate-limit RPC outcomes without payloads. An upstream regeneration overwrites these copied-runtime additions; preserve or reapply them before rebuilding the library.
