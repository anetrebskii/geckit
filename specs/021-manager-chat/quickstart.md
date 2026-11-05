# Validation

From client: npm run typecheck; npm run lint; npm test; npm run build. From mobile: npm run build.

Use the existing manager-preview renderer with explicit synthetic native boundaries. Open through GeckIt test browser, never take over a personal tab. Test desktop 1440x900 and 900x700, phone 390x844, light/dark.

1. Fresh setup without Telegram: assistant, delegation, enable, Open chat. Verify no bot prerequisite.
2. Send text, multiline and keyboard input. Observe durable acceptance/queue and answer. Close/reopen/reload with a draft.
3. Working queue, blocked/paused/offline, failed send, uncertain acceptance and retry: verify retained input and no duplicate accepted message.
4. Telegram-origin history plus app follow-up: same Manager. Answer a current decision, then attempt stale choice. Native typed cards use the dedicated path.
5. Phone Tasks and Team entry, Back/settings navigation, connection loss/reconnect, long history with new-messages affordance and reachable composer.

Backend fixtures verify real Manager file persistence/guards independently of renderer fixtures. Live provider/Telegram and physical phone are only passed if actually exercised; do not infer from builds or screenshots. Do not restart the user's running GeckIt.
