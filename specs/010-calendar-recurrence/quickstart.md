# Validation: Calendar recurrence

From client/: run npm run typecheck, npm run lint, npm test, npm run build. From mobile/: npm run build. Tests require no model calls or account.

Use isolated recurrence preview, never drive or restart active GeckIt. Review full-window context in light/dark at desktop 1440x900 and 1024x768, phone 390x844 and 320x568.

1. Open existing shortcut, choose Custom, set every 2 weeks Tuesday/Thursday at 09:00 starting 2026-10-13, After 13. Done changes outer draft; Save persists. Reopen with all fields unchanged.
2. Cancel/Escape nested recurrence and verify outer cron rule untouched; focus returns. Tab/Shift+Tab stay in active surface. No outside click discards.
3. Empty weekday selection and invalid interval/date/count disable Done with exact inline messages. Repair and save.
4. Review day/week/month/year, date/ordinal/last monthly patterns, Never/On/After, and paused/ended summaries. Ensure actions stay reachable with scrolling at 320 px.
5. Force save failure in isolated mock; retain draft and show retry message, then save successfully.
6. Tests verify anchors, multiple weekdays, missing days/leap dates, DST gaps/folds, main/phone zone parity, final-day latency, no catch-up after expiry, pause/resume/manual independence, malformed persistence and scheduler history preservation.
7. Record real-device/main runtime checks unavailable rather than claiming them. Rebuild phone assets; installing/releasing is outside this task.
8. Simulate a backend without calendarRecurrenceVersion: custom Save must retain the draft and show the existing failure message without calling the save API or changing a previously persisted cron rule. Named/raw/manual saves remain compatible.
9. Simulate a supported backend whose resolved save response strips/changes recurrence: keep the editor open with the same draft and failure state. Equivalent field/weekday ordering is accepted.
10. Exercise actual main saveShortcut and store with temporary userData; read settings.json and reload settings to verify the complete rule survives persistence. Runtime support/zone metadata must not enter that file or accept renderer overrides.

Renderer hot reload does not activate a new main save handler or scheduler in an already-running backend. After active conversations finish, restart GeckIt Local to load updated main code, then save/reopen the rule. Do not restart active sessions merely to make backend tests pass. Until that restart, source/temporary-store/preview checks do not prove the live app can persist and execute custom schedules.
