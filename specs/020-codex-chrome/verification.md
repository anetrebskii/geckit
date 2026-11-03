# Verification - 2026-11-03

Working branch: `feat/codex-chrome`. Session: `01a1a264-95de-7ad2-ae03-6596da2a860b`. Not released or loaded into the active GeckIt process. Active conversations were not restarted.

## Passing checks

- `npm run build`: standalone service and Electron main/preload/renderers built successfully.
- `npm run typecheck`: all four projects passed.
- `npm test -- --reporter=dot` outside the restricted socket sandbox: 110 files passed, 1 skipped; 1517 tests passed, 1 skipped. Includes configuration propagation through real provider methods with a fake app-server, start/fork/resume and isolated correction. These tests do not prove browser access.
- Targeted ESLint on all changed source/config/test files passed. `git diff --check` passed.
- Copied official server `out/service/browser` initialized via Node 22.19 with PATH restricted to `/usr/bin:/bin`: version 1.12.0, 32 tools; no npm/npx or source node_modules needed at runtime.
- Actual `@electron/asar.createPackageWithOptions` packaged a staging copy using `unpackDir: 'out/service/browser/**'`; the browser entry was marked unpacked. Electron 38 in `ELECTRON_RUN_AS_NODE=1` launched that actual unpacked package and initialized the same 32 tools with no npm/npx in PATH. This verifies resource layout and Node-mode launch, not a signed installer or browser permission.
- Real Codex 0.162.1 app-server thread `01a1a27f-36fd-7f81-bfed-d2eb86c3bef0`, ephemeral and read-only: accepted per-thread `mcp_servers.geckit-chrome` config and returned 32 tools. No model turn was started.
- Separate real app-server thread `01a1a27f-96f9-7b71-b7b8-5eb6274cbb0e` confirmed inherited MCP entries remain present alongside `geckit-chrome`, including the user's `chrome-devtools`; no global configuration was overwritten by the implementation.

- The actual changed `CodexSessions` and `launchCodex` modules were compiled into a temporary verifier. `CodexSessions.create` connected to the real app-server and produced thread `01a1a283-ff02-7151-9019-de23d8dba536`; `mcpServerStatus/list` on the same child confirmed `geckit-chrome` with 32 tools. This exercises the provider's automatic config path without a fake server or a model turn. The empty verification thread was unsubscribed and the verifier child stopped.

## Actual browser failure / remaining acceptance condition

`mcpServer/tool/call` -> `list_pages` on the built-in server returned:

> Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.

Cause: absent `/Users/alex/Library/Application Support/Google/Chrome/DevToolsActivePort` (ENOENT). Browser connection was explicitly authorized by Alex, but Chrome remote debugging has not yet been enabled/observed. No page list or content was read. Thus SC-002 / T007 remains **unverified and blocked on Chrome setup**, not passed. Await the user enabling remote debugging in the intended profile and accepting Chrome's own Allow prompt. Retry only the authorized `DfQ_KnOoJeh` Instagram tab, then read using explicit `pageId`; never switch profiles or control native Chrome.

The local global Codex MCP entry was explicitly added after Alex approved the connection. Built-in GeckIt code does not edit global configuration. Initial ChatGPT browser-service remains unavailable because GeckIt cannot issue that host's signed context; the official MCP is the supported alternative.

## Limits

Full repository ESLint fails in unchanged `src/core/ownership.ts:14` and `src/main/service-client.ts:149` (`preserve-caught-error`). Those files are unchanged from HEAD; no unrelated fix included. An initial restricted test run failed on Unix-socket `listen EPERM`; the approved unrestricted complete run passed.

Chrome 156.0.8078.80 on macOS is installed. Windows/Linux live launch, signed installers, live Chrome consent, actual page read, and a newly loaded GeckIt service are not verified. Browser identity is never copied, authentication checks are retained, no native Chrome control/profile switch or Instagram publication was performed. There are no renderer layout changes, so light/dark/viewport UI checks are not applicable to this patch.

Existing lint follow-up was started through the official GeckIt CLI as `codex:01a1a283-3bda-7c21-b36a-e962786b41ff`. It is separate from this browser change. No commit, push or release was performed.
