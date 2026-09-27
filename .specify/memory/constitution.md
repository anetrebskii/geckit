<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Principles added: I. The Person's Own Plan; II. One Contract Between Main and Windows;
  III. Recorded Output, Not Live Calls; IV. UX Before Pixels; V. Every System, One Word;
  VI. Tokens Only
- Sections added: Constraints; Development Workflow; Governance
- Removed sections: none
- Deferred TODOs: none
-->

# GeckIt Constitution

## Core Principles

### I. The Person's Own Plan

Every Claude Code session GeckIt starts runs the person's own `claude` binary on their own
subscription. The environment handed to it MUST be scrubbed of `ANTHROPIC_API_KEY` and
related variables, locally and on any other computer GeckIt starts `claude` on. Credentials
the person types (passwords, passphrases) MUST NOT be written to GeckIt's settings file; if
kept at all they go to the operating system's credential store.

Rationale: the product promise is "your plan, not an API key", and a leaked secret in a JSON
file is a breach no feature justifies.

### II. One Contract Between Main and Windows

The main process owns processes, files, the network and settings. Renderers (Panel, Chat,
Voice, the phone's copy of Chat) reach them only through `client/src/shared/api.ts` over IPC,
and settings are broadcast from `main/store.ts`, never kept in `localStorage`. A new ability is
a new entry in that contract, and the phone reaches it only if it is listed in `phoneCalls()`.

Rationale: three windows, the phone and main must see the same state at the same time.

### III. Recorded Output, Not Live Calls

Parsing and state logic MUST be pure functions covered by vitest against recorded output in
`client/test/fixtures/`, so the suite costs nothing and needs no account or network. Code that
spawns processes stays thin around those pure functions. `npm run lint`, `npm run typecheck`
and `npm test` MUST pass before a pull request.

Rationale: the tests must run for anyone, offline, for free.

### IV. UX Before Pixels

Any change a person can see starts as a UX document in `docs/ux/` (states, transitions, exact
wording, thresholds with reasons, what stays silent) and, when it has a layout, a prototype in
`docs/design/`. The implementation follows the agreed document; a disagreement found while
building goes back into the document first.

Rationale: a reversal costs a paragraph in Markdown and a rebuild in code.

### V. Every System, One Word

GeckIt ships for macOS, Windows and Linux. Interface copy MUST read the same on all three
(no "this Mac"), use one term per concept everywhere (code, copy, docs), and features MUST
degrade rather than break where a system lacks something.

Rationale: one product, one vocabulary; screenshots and docs stay true on every system.

### VI. Tokens Only

Styling lives in `client/src/renderer/src/styles.css` and uses its tokens; a literal colour in a
rule is a defect because it exists in one theme only. Prettier is not run over the code.

Rationale: light and dark stay correct without anyone checking both by hand.

## Constraints

- Electron with electron-vite, React 19, TypeScript, ESM (`"type": "module"`), Node 22+.
- No new runtime dependency when a few lines of Node or an existing library do the job; a new
  dependency is added with the package manager, never by hand-editing the manifest.
- Files stay small and readable: a file past roughly 400 lines is split by responsibility.
- Nothing is installed on another computer without the person asking for it.

## Development Workflow

- Work happens on a branch and lands through a pull request using
  `.github/pull_request_template.md` (What changed, How it was tested, Screenshots).
- Commit messages are one plain sentence saying what the person now sees or can do.
- `.github/workflows/publish.yml` builds from `main`; releases are made only after a merge.

## Governance

This constitution sits above habits and individual preferences; CLAUDE.md holds the runtime
guidance and must not contradict it. An amendment is a pull request that edits this file,
states the version bump (MAJOR for a removed or redefined principle, MINOR for a new one,
PATCH for wording) and updates the Sync Impact Report. Reviews check every change against the
principles above; a justified exception is written in the plan's Complexity Tracking.

**Version**: 1.0.0 | **Ratified**: 2026-09-27 | **Last Amended**: 2026-09-27
