# Implementation plan: built-in Codex Chrome access

Spec: [spec.md](spec.md). Design: [design.md](design.md), [UX](../../docs/ux/codex-chrome.md). Branch: `feat/codex-chrome`.

## Technical context
TypeScript strict, Node 22.12+, Electron 38, Codex app-server JSON-RPC, Vite SSR. Official `chrome-devtools-mcp@1.12.0` is a build dependency copied unchanged into `out/service/browser`, including sibling workers, resources, package metadata and licenses. Desktop unpacks this tree from ASAR for external process execution; standalone carries the same tree. No runtime npm dependency.

## Constitution check
PASS: subscription login unchanged; no API key or private host identity copied. Shared API unchanged. No renderer change. Native browser permission remains mandatory. Cross-platform paths use Node helpers; live macOS evidence does not imply Windows/Linux validation. Dependency justified by supported Chrome integration unavailable through app-server host issuance. Targeted tests cover behavior, with separate live evidence. No files above existing size limit are expanded unnecessarily. No release or active-session restart required.

## Architecture and phases
1. Package official MCP as an unchanged resource, pin dependency and minimum Node version.
2. Configure its launch path at service startup, using Electron's Node mode on desktop. Add typed per-thread config to ordinary Codex #options for start/resume/fork; no global TOML writes. Preserve merged developer instructions, text corrections unchanged.
3. Provide target/profile/consent guidance as developer instructions. No browser connection until a browser tool is called. Native permission is browser-owned; error guidance is delivered in the existing transcript.
4. Test launch path, options propagation and correction isolation. Build and launch copied resource without npm; exercise real app-server MCP initialization and target read. Record exact blockers if user setup is missing.

## Artifacts
[Research](research.md), [data model](data-model.md), [contract](contracts/browser.md), [validation](quickstart.md). No unresolved technical decisions. Post-design constitution check: PASS.

## Complexity tracking
The existing `codex.test.ts` is already over 400 lines; a focused provider propagation test was added there to reuse its app-server fixture instead of duplicating hundreds of lines. New launch-path tests are isolated in `codex-browser.test.ts`. New production module remains small. There is no new runtime Node dependency: the official distribution is a build dependency copied into the artifact.
