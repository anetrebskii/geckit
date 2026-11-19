# Follow the last connected computer for iPhone push

- Request: Send iPhone notifications only from the last GeckIt computer that connected successfully.
- Checkout: `/Users/alex/Projects/mine/geckit`, permanent checkout on `main`.
- Started: 2026-11-19.

## Acceptance conditions

- Connect to A and background the app. Eligible alerts from A reach the phone.
- Open B's cached workspace while B is unreachable. A remains the notification source.
- Connect successfully to B. Eligible alerts from B pass, and the relay drops new alerts from A even if the phone never reconnects to A.
- Close and reopen the app. The selection survives. Removing the selected computer pauses its alerts until another computer connects.
- Assumption: Switch sources automatically. Existing notification permission, idle checks and content still apply.

## Progress

1. UX documented in [Notifications on the phone](../ux/phone-push.md).
2. The change uses the existing connection screens and native notification surfaces.
3. The iPhone records a successful connection and synchronizes it to the relay. The relay stores the newest selection per token and filters before APNs.
4. No shipped skills describe this behavior.
5. Feature-list wording for approval follows.

   > iPhone push alerts follow the last GeckIt computer that connected successfully.

6. Client suite passed with 2,245 tests and 7 skips. Client lint and typecheck, desktop and mobile builds, and mobile typecheck with the existing Vite React aliases passed. The two relay tests passed with simulated Firestore and APNs. They covered per-phone routing, stale updates, removal, legacy fallback and Firestore errors.
7. In the GeckIt test browser, the real Computers renderer and phone selection code sent only A while B's cached workspace showed, then sent B after the simulated connection succeeded. The fixture substituted remote transport, native workspace and relay responses.
8. Native banner presentation and live push delivery remain unverified. The test tab and local fixture were closed.

## Result

- Delivery: local changes in the permanent checkout.
- Remaining: deploy both Firebase functions and verify actual push delivery from two paired computers to an updated iPhone.
