# Data model

No persisted entities or migration. Runtime browser configuration contains executable, bundled MCP script path and fixed consent/privacy flags. A normal Codex thread receives an MCP server entry named `geckit-chrome` plus browser guidance, using existing thread config and developer instruction fields. Chrome maintains its own permission state; GeckIt does not store debugger tokens or browser credentials. PageId is returned by the MCP and used for that request; do not persist it as tab identity.
