# Verification

Implementation: branch `feat/unified-host-cli`, isolated worktree `/private/tmp/geckit-cli-01a1b589`, base `d09b0c11`. Codex session `01a1b589-679e-7a93-aa35-28f2446bad8f`. No live providers, credentials, grants or physical remote were changed. No application restart, push, merge or publication was performed. The original dirty checkout was preserved.

## Checks and observable results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed all four project configurations |
| `npm run lint` | Passed source and tests |
| `npm run build` | Passed service, desktop main/preload and renderer build |
| `HOME=<fresh temporary home> npm run test -- --no-file-parallelism` | 1783 passed, 2 skipped; 135 passed files, 2 skipped files; 89.37 seconds |
| Final affected tests (`sessions`, `provider-lifecycle`, `product-remote-guard`) | 265 passed, 3 files; includes the final pending-preparation readback guard |
| Renderer fixture `tsc --noEmit -p test/browser/cli-product/tsconfig.json` | Passed |
| `node test/cli-product/transport.mjs` against built output | Passed seven scenario groups through real RPC and encrypted WebRTC; fixture `/private/tmp/gk-cli-VEiZDx/result.json` |
| Independent review `/root/independent_review` | Final verdict: no concrete remaining bugs in inspected changes; independently rerun 8 focused tests passed, 257 unrelated tests filtered |
| `git diff --check` | Passed |

The normal sandbox refused Unix sockets/loopback, so transport tests used approved escalation. Full-suite HOME was disposable. File parallelism was disabled because existing tests build shared service output concurrently. Initial failures led to fixes, including disabled-provider bypasses, misleading asynchronous success receipts, source authorization revocation, library lifecycle races, passive runtime completion under library locks, and test computer-cache isolation. Final logs are preserved outside the worktree at `/private/tmp/geckit-cli-evidence-01a1b589/`.

## Real isolated transport

The harness starts two compiled Node services with separate HOME, application data, vault keys, Claude/Codex directories and synthetic fixture libraries. It pairs them using actual identity exchange, authenticated RPC, encrypted WebRTC and a disposable loopback signaling server. It verifies:

- Source/target separation, target capabilities, remote reads/writes, expected-value conflict and unknown-host refusal without local fallback.
- Synthetic MCode-only after explicit stop/release of test work; busy/held work refuses disable, and no provider fallback is enabled.
- Disabled-provider history cannot restart with retry/proceed; unsupported transport and invalid shortcut cron fail.
- Legacy sessions/show include plugin history; `--computer` alias works through the same relay.
- Employee file text is expanded on the source before remote dispatch.
- Workers cannot use operator configuration; target Manager authority cannot mutate unowned sessions.
- Secret channel patches are refused and wrong RPC bearer authentication fails.

Unit/integration tests additionally cover ambiguous/blank/multiple hosts, compatibility parsing, unsupported targets, scope failures, exact expected arrays, default/project/shortcut/Manager dependencies, lost replies without replay, bound Manager confirmations and authorization revoked while dialing. The secret-patch transport test uses an absent channel, so installed-channel field filtering is established by schema/unit validation rather than that transport assertion alone.

## Renderer and UX

Actual `ManagerChat` and product styles were rendered through GeckIt's CLI-controlled test driver, using the fixture in `client/test/browser/cli-product/`. The native answer API alone is a fixture; this is not proof of real native approval completion. Reviewed full screen context at 1280x800 and 390x844, light/dark, long immutable target/command wrapping, both answer choices, paused disabled state, focus and scrolling/overflow. Allow/Refuse returned the expected operation and fixture session IDs through the actual React handler. No horizontal overflow was observed. Screenshots are in the evidence directory. Tab/Enter commands in the background test driver did not reliably change focus/activate; native keyboard activation remains unverified. This change adds no renderer layout or keyboard handler.

The installed bridge timed out. Review used an independent service/test driver with disposable HOME, an existing Chrome binary and a new isolated profile. It did not switch or inspect personal browser profiles. The UX Mermaid state diagram was rendered and visually inspected through that same GeckIt CLI.

## Remaining boundaries

Physical remote hardware, managed Firebase signaling, NAT/TURN, authenticated model accounts and interactive OS/provider/SSH permission dialogs were not exercised. Synthetic MCode is not the real library or account. Both source and target must run compatible builds advertising `cli:product`; an old target refuses explicitly. Install/reinstall keeps a library disabled. New trust, credentials, permission/team answers, application update/restart and bulk configuration import/export remain documented native/operator boundaries. Registered computer rename has no existing product API. Automatic Voice Memos intake remains retired. Derived calendar timezone is read from the target OS, not a writable preference.

The complete coverage inventory and native permission classification are in [cli-coverage.md](../../docs/cli-coverage.md); safe MCode-only instructions are in [cli.md](../../docs/cli.md). Delivery is a saved local commit on the retained branch/worktree, ready for review; no PR was published or worktree removed because external delivery was not requested.
