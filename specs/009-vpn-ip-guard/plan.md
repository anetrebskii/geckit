# Implementation Plan: VPN public IP guard

**Checkout**: main, work where requested | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

## Summary

Main-owned, disabled-by-default gate before all GeckIt-controlled session dispatches. Probe configured public-capable IPv4/IPv6 families through ipify. Fail closed, retain blocked operations and provide exactly-once Try again. Desktop and paired phone share settings.

## Technical Context

TypeScript 5.9, Node 22+, React 19, Electron 38. Existing Node HTTPS/net/os, React and Vitest; no new runtime dependency. Existing settings.json, session notes and pending queue storage. Deterministic injected network/provider tests; no model charges. Desktop macOS/Windows/Linux and shared iPhone renderer. Zero probes when disabled or periodic monitoring is idle; automatic ten-second shared active-work checks when enabled with ten-second total deadline. No new per-card calculations or animations.

## Constitution Check

Pass: subscription policy preserved; main-owned settings/shared API; deterministic no-model tests; approved UX and prepared prototype precede UI; platform-neutral wording and app tokens. Work stays uncommitted in user-requested checkout; branch/PR workflow applies when later preparing integration. No push, merge or release requested.

## Design

Read [design.md](design.md), [UX](../../docs/ux/vpn-ip-guard.md), [prototype](../../docs/design/vpn-ip-guard.html). User approved proposed scope on 2026-10-10: before sends/continuations, GeckIt computer only. Active-work interruption under the single main flag was approved on 2026-10-11; SSH egress remains outside verification. Lookup tests must distinguish configured families from unavailable probes; failures block.

## Project Structure

- shared/api.ts: vpnIpCheck, vpnAllowedIps defaults and minimal retry state/contract.
- shared/vpn-ip.ts: public-address canonicalization/validation and copy.
- main/vpn-ip.ts: injectable family-specific HTTPS check with abort deadline and current policy revalidation.
- main/store.ts: all-or-nothing setting validation and conservative saved-policy normalization.
- main/sessions/index.ts: optional beforeSend dependency, retained blocked operation, duplicate/cancel lock and actual dispatch gates.
- main/index.ts, preload/index.ts, renderer phone-calls: production wiring and narrow retry channel if needed.
- renderer/ui/VpnIpSettings.tsx, SettingsDialog.tsx, chat/PhoneSettings.tsx: shared desktop/paired-computer settings UI.
- renderer/chat/{useChat,Transcript,Composer,Chat}: checking/blocked UI, retained draft/attachments, phone error fidelity and retry.
- test/vpn-ip.test.ts, test/store.test.ts, test/sessions.test.ts: deterministic regressions.

## Dispatch and Recovery

Gate before backend.create/resume/fork and native goal writes, then before dispatch after asynchronous preparation. Cover direct send, queue drain, Send now, positive answers, automatic grants and Auto permission retries, delegation, restart/reattach and Remote Control enabling. Stop, denial, and cancellation remain ungated. Guard spoken-command planning too because it contains session titles and prompts. Periodic failure pauses native autonomous goals through control APIs and interrupts owned provider processes; it cannot guarantee remote termination or intercept network traffic.

Persist held message/queue metadata and park blocked automatic work. A failed answer must not call #ended cleanup, which deletes asks. Do not remove queue head on blocked send or let renderer failed-turn draft recovery remove another queued message. Known unsent retry sends exact saved operation; started turn failure sends continuation. Repeated retries lock before awaiting; cancellation invalidates late result. Policy changed during asynchronous work must be verified before sending. No success cache.

## Validation

Zero create/hold/send/inject/positive-answer/fork/native goal writes on refusal; disabled behavior unchanged; empty/invalid settings; IPv4/IPv6 mismatch/unavailability/timeout; policy races; duplicate/cancel races; retained queue/attachments/unrelated draft; held restart and scheduled work. Typecheck, lint, tests, desktop/mobile builds. Full-window Chrome desktop 1440x900 and 1024x768, phone 390x844 and 320x844, light/dark, keyboard/focus, scrolling and all states. Repository performance review before completion.

## Periodic extension plan - 2026-10-11

Read updated UX/design/prototype before UI implementation. Use Settings.vpnIpCheck as the single switch for before-send and active-work protection, retaining atomic validation. Remove the separate desktop/phone stop switch and ignore the obsolete saved preference. One main-owned periodic monitor uses the existing verifier, starts immediately for active sessions and then every 10 seconds, never overlaps and does not affect before-send success caching. Settings changes and dispose invalidate pending results. Session integration interrupts supported active drivers/background work, parks queues and retains recovery through late provider events. Reuse stop/held/retry contracts, no new runtime dependency. Active/provider lifecycle research precedes implementation; fake timers and recorded drivers verify failure/off/stale/recovery. Run full tests/types/lint and desktop/mobile builds plus full-window review and performance-review. Existing checkout/architecture exceptions remain unchanged.
