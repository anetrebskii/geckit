# Contributing

## Setup

Node 22 or later.

```bash
cd client
npm ci
npm run dev
```

## Before opening a pull request

```bash
cd client
npm run lint
npm run typecheck
npm test
```

The tests run against recorded `claude` output in `client/test/fixtures/` and do not need a Claude account.

Do not run prettier over the code: it rewrites whole files.

## What the pull request runs

Lint, typecheck and tests, then unsigned builds for macOS, Windows and Linux, and an unsigned iPhone build. The builds are attached to the run for a week. The macOS build is signed ad hoc, so macOS may ask you to allow it in System Settings, Privacy & Security.

Releases are made only from `main`, after a pull request is merged.
