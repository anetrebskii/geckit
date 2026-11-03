# Built-in Chrome access for Codex

Branch: `feat/codex-chrome`. Requested 2026-11-03. Status: implementation authorized.

## Context
Codex in GeckIt cannot issue ChatGPT Desktop's host-bound browser identity. Claude uses its own `--chrome` integration. Ship the official Chrome DevTools MCP with GeckIt and configure ordinary local Codex conversations automatically. No global Codex configuration edits are needed for users.

## User stories
### US1 (P1): Read an authorized Chrome tab
Given Chrome 144+ with remote debugging enabled and the user accepting Chrome's connection permission, a local Codex conversation can find the requested URL and read that page by pageId. It must not raise another tab, switch profiles, or publish content without the user's instruction.
### US2 (P1): Start without package/config setup
A new installation contains the browser server and gives new, resumed and forked Codex conversations the tools, without npm, npx, manually editing TOML, ChatGPT.app, or credentials copied from another process. Text correction remains isolated from browser tools.
### US3 (P2): Recover from unavailable Chrome
When Chrome is absent, too old, remote debugging disabled, permission refused, or the target tab absent, report the actual blocker and supported setup. Normal chat remains usable. Never claim browser access based only on MCP initialization.

## Requirements
- FR-001: Ship a pinned official server and its license/assets in desktop and standalone service distributions; no runtime download.
- FR-002: Configure built-in `geckit-chrome` through supported app-server thread config for normal start/resume/fork, preserving unrelated user configuration and developer instructions.
- FR-003: Retain Chrome's permission prompt; disable MCP usage statistics, CrUX and automatic update checks; do not bypass browser authentication.
- FR-004: Guide the model to act only on the requested URL/pageId, avoid foreground/profile switching, and explain Chrome 144+ remote-debugging setup when needed.
- FR-005: Keep correction/probe sessions free of the built-in server and preserve normal conversation behavior when Chrome is unavailable.
- FR-006: Run meaningful automated config/packaging checks and a real authorized tab-scoped read. Report unverified platforms and actual limitations.

## Success criteria
SC-001: A clean built distribution initializes the browser MCP with npm/npx absent from PATH.
SC-002: Actual app-server thread receives the built-in MCP tools and reads the authorized tab by explicit pageId.
SC-003: Configuration tests cover start/resume/fork, correction isolation, retained user instructions and archive paths; build, lint, typecheck and required tests pass.

## Scope and edge cases
Chrome itself and its explicit first-use consent remain prerequisites. AutoConnect uses Chrome's default profile; a target absent there is a blocker, not permission to switch profiles. The browser belongs to the machine running the service; SSH does not forward local Chrome. Existing active conversations are not restarted to install this change. No renderer layout or new controls are introduced. No Instagram publication.
