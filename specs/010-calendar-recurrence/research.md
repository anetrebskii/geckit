# Research: Calendar recurrence

## Decision: Keep calendar recurrence distinct from cron

Rationale: Existing five-field cron cannot faithfully encode arbitrary week intervals, anchored ordinal weekdays and count/date endpoints. Keep named and raw cron untouched. Alternative rejected: approximate translation into cron would shift dates or lose limits.

## Decision: Fixed calendar anchor and scheduled occurrence count

Rationale: Last actual run is a scheduler cursor, not a recurrence anchor. Count eligible scheduled dates regardless of launch outcome, and use calendar-day inclusive expiry for the final date. Existing since cursor remains suitable for coalescing and pause/resume. Alternative rejected: successful-run quota shifts a calendar endpoint after downtime.

## Decision: Shared evaluator with scheduling computer's zone

Rationale: Phone-local Date arithmetic otherwise shows different dates and previews. Main exposes its resolved runtime zone. Use reusable Intl formatters and verified civil-time conversion; gaps skipped, earliest folded instant used once. Alternative rejected: per-rule zone picker expands product scope.

## Decision: One editor with desktop/phone presentation

Rationale: Shared fields/validation prevent parity drift; desktop uses GeckIt modal, phone uses full sheet-like header/actions. Existing runtime types are reused with Pick/Omit, and caller drafts are untouched until Done.

## Decision: Explicit save failures and malformed-rule rejection

Rationale: A caller cannot report success if disk save failed. Use existing strict persistence path for shortcut writes; do not execute malformed stored custom rules. Preserve untouched concurrent work, scheduler cursor and last-session data.

Research completed from existing code/types and delegated TypeScript inspection. No unresolved technical clarification remains. No new dependency or external interface is required.
