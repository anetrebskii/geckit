---
type: spec
status: integration review
owner: Alex
created: 2026-11-08
---

# Plan measurements

## 1. Purpose and path

The existing plan bar shows account quotas when a person opens or focuses GeckIt. An idle window does not periodically start Claude Code. This restores completed PR #13 in the current service/provider architecture.

## 2. Surfaces

Existing desktop and phone plan bars and account groups. No new control or layout.

## 3. States

Cached quotas remain visible while a requested measurement runs. A successful measurement updates the existing bar. An unavailable response retains the last successful values. A remote host's quota belongs to that host.

## 4. Transitions

| From | Trigger | Result |
| --- | --- | --- |
| Idle | Window opens or gains focus | Read cached account and request measurement |
| Fresh | Same request within ten minutes | Reuse Claude measurement |
| Stale | Same request after ten minutes | Request current measurement |
| Working conversation | Complete local Claude quota event | Update both windows and freshness |
| Working conversation | Five-hour-only event | Preserve weekly quota; do not extend complete measurement freshness |
| Remote conversation | Host quota event | Do not overwrite the local account |

## 5. Quiet states

No recurring plan or account poll in an open window. Version metadata retains its separate one-minute cache. Other providers keep their existing measurement cadence.

## 6. Timing

Claude usage caches for ten minutes. Host unavailable measurements cache for one minute. Initial account retries continue only while no account response is available. No plan timer runs in main or renderer.

## 7. Wording

Existing quota labels, account names and unavailable explanations remain unchanged.

## 8. Edges

Coalesced native measurement requests retain provider isolation and revision protection. Partial quota events do not erase the weekly value. Reopening/focusing requests freshness; merely leaving a window open does not.

## 9. Exclusions

No provider configuration, credentials, account selection, permission guards, remote deployment or runtime restart.

## 10. Decision

Use the existing ProviderMeasurements cache rather than restoring the obsolete pre-provider fields from PR #13. Share existing ask-only arguments across local and SSH metadata queries.

## 11. Acceptance

Existing full suite plus original PR #13 regression cases check ten-minute throttling and complete/partial turn updates. Verify no recurring plan/account timer and preserve newer provider behavior. Real account measurement is not exercised during this Git-only integration.
