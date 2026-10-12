# Verification: Calendar recurrence

Status: Implemented in the working tree and ready for Alex's review. Alex approved implementation on 2026-10-11.

## Completed design checks

- Existing scheduler, contract, persistence and desktop/phone shortcut editors read before changes.
- Spec quality checklist: 16/16 complete. Consistency analysis: 12 requirements covered by 17 tasks, zero blocking conflicts.
- Approved UX document and interactive GeckIt-token prototype reviewed in Chrome full-window context.
- Prototype: desktop 1352x676 light/dark, phone 390x844 dark and 320x568 light. Weekly selection, interval/count, end radio state, monthly selection, invalid interval/disabled Done, Done/reopen, Cancel draft retention, keyboard focus and Escape, narrow scrolling reviewed. 320 px weekday clipping and dark native input color scheme repaired.
- State diagram rendered with local Mermaid CLI and Chrome. Document links resolve; diff whitespace check passed at design stage.
- Initial full-repository localhost server rejected by automatic approval due broad private-file exposure. Safer server of only prototype HTML and UI stylesheet approved; no review remains blocked by that rejection.

## Implementation checks

- Shared immutable calendar rule persists alongside existing shortcut settings. Custom rules and cron are mutually exclusive; raw cron keeps its previous representation and behavior.
- Regression coverage: Monday-anchored multiweek dates, monthly date/ordinal/last weekday, missing fifth weekdays/month dates/leap dates, inclusive end date, count limits, final-day scheduler latency, DST gap/fold, differing phone/computer zones, catch-up coalescing, overlapping timed-run suppression, pause/resume, manual-run independence, stale edits, deleted drafts, strict write failure retention, malformed stored-rule isolation and runtime-zone publication.
- Client typecheck and lint passed. Client production build and mobile build passed after final changes. Diff whitespace check passed.
- Final unrestricted full suite: 65 files / 846 tests passed in 20.46 seconds, including the new cache regression. Sandbox-only file watcher and local socket failures disappeared outside the sandbox. Output: `/private/tmp/geckit-recurrence-tests-final.log`.

## Actual UI review

Actual ShortcutList/Editor, PhoneShortcuts/ShortcutSheet and shared CustomRecurrence were bundled into an isolated preview with narrow mocked IPC; no assistant calls or active-app restart. Parent personally inspected full-window context in Chrome, including adjacent editor/list layout:

| Surface | Light and dark viewports | Reviewed |
| --- | --- | --- |
| Desktop | 1440x900, 1024x768 | Custom entry, starts/time, interval, weekdays, day/month/year units, monthly patterns, Never/On/After, inline invalid states, summary and next/ended, focus, nested picker, save/error/retry, scrollable outer editor, raw cron |
| Phone | 390x844, 320x568 | Same controls and rule fields; nested sheets, computer-zone preview, Cancel/Done/Save, save rejection/retry, paused/ended lists, manual Run access, raw cron and cancellation, fixed header/body scrolling |

- Keyboard: Tab wraps within custom editor; Space toggles weekdays; empty selection disables Done; Enter selects menu items; picker Escape returns focus and preserves custom dialog; custom Escape cancels only custom edit and restores its opener. Done changes the outer draft; outer cancellation keeps persisted values.
- Save rejection shows exactly "Couldn't save the shortcut. Try again." and preserves name/recurrence. Retrying succeeds and updates the actual list. Phone and desktop both exercised.
- Fixed during review: Never radio alignment, date-input padding/borders/native dark color scheme, phone parent/nested overlay stacking, picker selection focus return and narrow weekday width. Final 320 px weekday row: clientWidth 278 / scrollWidth 278. Header actions and bottom summary remain reachable while body scrolls.
- Phone preview used America/New_York while browser runs in Europe/Samara; the custom next time remains the connected computer's 09:00. Native date segment ArrowUp edits update validation/summary; automation fill alone did not reliably trigger React's native date change, so native keyboard editing was used for that check.
- Final preview console had no errors. Screenshots: [desktop light, 1440x900](screenshots/desktop_light.jpg), [phone dark, 390x844](screenshots/phone_dark.jpg). These show real components, with mocked persistence/session launch.

## Performance review

Needs measuring: live app frame cost after installation. New code was not loaded into Alex's active app because that would require restarting it. No remaining warm-query regression found in isolated measurements.

| Checklist item | Verdict | Evidence |
| --- | --- | --- |
| Nothing expensive repeated per row | Holds for warm evaluation | Finite endpoints owned by immutable rule objects in WeakMap; repeated queries no longer rescan after 64 rules. Regression verifies reduced formatter calls across 65 rules. No new conversation-row component introduced. |
| No formatter made per call | Holds | Reused civil-date, label and zone/time formatters; local-zone metadata cached for 60 seconds and refreshed after clock rollback. |
| Typing redraws only work depending on text | Holds | Rule validation and next-time computations useMemo on recurrence/zone/time; unrelated shortcut fields reuse the rule. Custom draft/error/next calculations memoized. |
| Phone rebuilt | Holds | Mobile production bundle rebuilt after shared Chat changes. |
| Measured in running app | Cannot verify live installation | Full-window production-bundle UI review and pure evaluator probes completed; live profiler and physical device checks unavailable without loading the new build. |

Eight checklist items concerning new per-conversation components, hover, sorting, long-list layout and animations were not changed by this feature.

Pure Node probes on this computer, same rule set and evaluator build:

| 65 daily rules | Cold query | Repeated query |
| --- | --- | --- |
| After 13; America/New_York | 18.02 ms | 1.59 ms |
| After 10,000; local Europe/Samara | 400.76 ms | 0.31 ms |
| After 10,000; America/New_York | 10,098.3 ms | 1.6 ms |

Before the WeakMap fix, the last stress case's repeated query took 10,143.3 ms because the 64-entry cache evicted the entire set. The same repeated query now takes 1.6 ms. A single maximum-count cold rule previously measured 151.5 ms; its cached query averaged 0.05 ms over 100 calls.

Known performance limit: a large collection of maximum-count rules in another time zone still requires a costly first endpoint calculation. Warm list renders, scheduler ticks and unrelated typing reuse endpoints. This change does not add persisted endpoint metadata or background workers.

## Feature-list approval

Proposed exact expansion through an async question; no answer received yet, so docs/features.md and its audit remain unchanged by this session:

"Scheduled work. Save prompts as shortcuts, including their folder, goal and assistant settings. Run them manually or on daily, weekday, weekly or cron schedules while GeckIt is open. In the working tree, desktop and phone also support custom calendar recurrence: every N days, weeks, months or years; selected weekdays and monthly patterns; ending on a date or after a set number of occurrences."

## Screenshot follow-up: 2026-10-12

Alex requested UI review and fixes from the live-app screenshot. This follow-up changes only scoped recurrence CSS:

- Inactive On/After inputs previously inherited active text/background. Disabled inputs now use existing faint-text/sunken-background tokens; the inactive occurrences suffix is muted too.
- The interval focus outline extended 4 px outside the input but the scrolling body clipped its left edge. The desktop body now reserves a 4 px gutter while retaining the existing content alignment. Measured outline width 2 px + offset 2 px fits the 4 px gutter.
- End-row centers had different spacing because Never was shorter than date/count rows. Consistent label height and an 8 px row gap align them; the end-input column is closer to its label. Desktop section gap uses the existing form's 12 px rhythm.
- Phone date/time/number inputs and pickers were 34-36 px high. They now measure 44 px; weekday targets remain 44 px high and still fit 320 px width without horizontal overflow.

Personally reviewed full-window light/dark context at desktop 712x660 (the supplied image's apparent 2x size), 1024x768 and 1440x900; phone 320x568 and 390x844 in both themes. Also reviewed a short 712x480 desktop window: title/actions stay visible while the body scrolls. Never/On/After enabled styling, inline invalid count, native date editing, Tab focus wrap, Escape focus return and phone body scrolling checked. Phone header top remained 0 while body scrollTop reached 99; weekday overflow remained 0. Final preview console had no errors.

Screenshots of actual components with narrow mocked IPC: [corrected desktop](screenshots/ui_review_desktop_light_2026_10_12.jpg), [corrected phone](screenshots/ui_review_phone_dark_2026_10_12.jpg). The desktop example uses the same start, interval, weekday, Never and inactive values as the supplied screenshot. Active app was not restarted; physical iPhone verification remains unavailable.

Typecheck, lint and final client/mobile builds passed. Outputs: `/private/tmp/geckit-recurrence-ui-{typecheck,lint,client-build,mobile-build}.log`. No new tests added for cosmetic CSS; the previous 846-test result above covers the unchanged scheduling implementation. Diff whitespace check passed.

Performance review: no performance problems found in this CSS follow-up. No new per-render work, list components or animations. Phone rebuild is the touched checklist item; other 12 checklist items are unaffected. Existing cold endpoint calculation limits remain as documented above.

### Focus correction after second screenshot

Alex showed that the input's left focus edge was still clipped in the live dialog. The earlier gutter-only fix did not resolve that screenshot. Non-radio inputs now use `outline-offset: -2px`, so the existing 2 px accent outline is entirely inside each control. Button/radio focus remains unchanged. This avoids depending on space outside the input in the scroll container.

Personally inspected full dialog context at 712x660 and a scrolling 712x480 desktop window, light/dark; checked number/time fields and narrow 320x568 phone focus in both themes. Computed outline width 2 px / offset -2 px confirmed. Phone screenshots were captured over the complete emulated viewport to avoid browser-frame downscaling. Escape returns focus to Edit recurrence. [Corrected input focus](screenshots/focus_inset_desktop_light_2026_10_12.jpg).

Typecheck, lint, client and mobile builds passed again. Cosmetic CSS only; no new animations or per-render work. Diff check passed. Actual components were reviewed in the isolated preview; the installed app was not restarted.

### Desktop runtime check after clarification

Alex clarified that the supplied clipped outline is from desktop. The non-radio input selector applies to desktop as well as phone; it is not scoped to `.phone`. Read-only process/port inspection identified the running GeckIt Local checkout at `/Users/alex/Projects/mine/geckit/client`, with electron-vite serving port 5173. Fetching its existing `/src/styles.css` module confirmed that the dev server serves the `outline-offset: -2px` override.

The open desktop window's computed style and current rendered focus are not yet verified. Computer Use denied both the initial GeckIt target and the correct GeckIt Local target: "Computer Use was not approved to use GeckIt Local". Requested access to that application. No window refresh, conversation restart or runtime CSS injection attempted. Source/dev-server verification must not be reported as verification of the currently open native window.

## Custom-save investigation: 2026-10-12

Alex reported that custom scheduler settings never save. Read the actual desktop Custom Done -> outer Save -> preload IPC -> main saveShortcut -> store path before editing. Current renderer closes the editor on any resolved save response and does not verify the returned recurrence.

Read-only live evidence: GeckIt Local main PID 76276 started October 10 at 23:49:18; recurrence persistence was added to main/shortcuts.ts and store.ts on October 11. Main remains the same process. Actual settings.json had four shortcuts, including the one in Alex's screenshot, with neither cron nor recurrence at the recent October 12 write. No user settings were changed during inspection.

Independent reproduction used actual saveShortcut and actual store with temporary userData (Electron path/log only stubbed): current source returned and persisted the requested recurrence; the prefeature HEAD saveShortcut returned and persisted the same draft without recurrence. Its reconstruction omits that field. This establishes how a newly loaded editor can report success against an older running main process while dropping the schedule.

Implemented main-owned runtime `calendarRecurrenceVersion: 1`, excluded from disk and renderer overrides. Shared checked-save rejects custom rules before IPC when support is absent, verifies returned recurrence content after Save, and uses the existing failed-save state to retain the desktop/phone draft. Property and weekday order do not affect acknowledgment. Phone timetable toggles catch failures and retain their controlled value. Existing manual/cron saves remain compatible.

30 focused tests passed, including unsupported-backend zero-call/preserved-cron checks, stripped/altered acknowledgments, normalized ordering and actual main/store create-edit-disk-fresh-store round-trip. Final full suite: 67 files / 853 tests passed in 20.53 seconds with normal local filesystem/socket access; log `/private/tmp/geckit-recurrence-save-tests-final.log`. Typecheck, lint, client/mobile builds and diff check passed.

Personally inspected actual components with isolated preview IPC, full desktop 1440x900 in light/dark and phone 390x844 / 320x568. Unsupported desktop Save made zero calls and left previous cron plus edited draft intact. Advertised-but-stripped responses kept edited name/rule open in desktop and phone with the existing error. Current desktop Save reopened with interval 3 and original weekdays/count; phone transient failure retried successfully. Unsupported phone list toggle remained checked with no console error. Narrow phone error is reachable by scrolling while Save stays in the header. Input focus remains inset; no new layout/focus changes in this save patch. [Desktop retained draft](screenshots/save_guard_desktop_light_2026_10_12.jpg), [phone retained draft](screenshots/save_guard_phone_dark_2026_10_12.jpg). Browser viewport reset and isolated server stopped afterward.

Performance review: no performance problems found in the save patch. Runtime metadata preserves settings identity when unchanged; comparison runs only on Save, with no date endpoint calculation, new formatter or animation. Phone bundle rebuilt. Other 11 checklist items unaffected. Live profiling was not needed for this event-only change; the running backend still predates it.

Activation remains pending: the updated backend must be loaded after active conversations finish and GeckIt Local restarts. This session did not restart it, mutate actual shortcuts or verify live launches/native focus. Computer Use access to GeckIt Local remains unavailable. Draft retention is editor memory, so an unsaved draft does not survive quitting; record/re-enter those settings after the safe restart. Source, preview and temporary disk tests do not establish activation in the currently running app.

## Mobile screenshot follow-up: 2026-10-12

Alex's iPhone screenshot showed Starts/At labels colliding with the header and date/time controls touching despite the intended column gap. The header used a fixed border-box height of 52 px with safe-area padding inside it, leaving insufficient space for its 44 px actions. Phone CSS now gives the header `52px + var(--top)` height, reserves the status-bar inset separately, and constrains the title between actions. Native date/time inputs have bounded width, normalized appearance and value alignment; phone Starts/At stack at full width so localized dates and larger text can fit.

Weekday buttons use round 44x44 px targets. At widths below 360 px the row extends into the existing horizontal gutter so seven targets still fit; the body permits vertical scrolling only. It fills the remaining sheet height and reserves the existing bottom inset. Desktop selectors and recurrence behavior are unchanged.

Personally inspected full rendered components in Chrome at phone 390x844 and 320x568 in light/dark, with a fixture providing 47 px top / 34 px bottom safe areas. Also inspected 20 px body/input/header text at 320x568: title truncates without overlapping actions, full-width date/time values and icons fit, and lower fields remain reachable by scrolling. Header measured 99 px and stayed at top 0 while the body scrolled. Native date/time arrow keys, Never/On/After disabled styling, Tab into Starts, picker Enter/Escape and Escape focus return checked. Seven weekday targets measured 44x44 px. Inspected desktop 712x660 light/dark with its original two-column start row. Final preview console had no errors. [Final mobile dark](screenshots/mobile_safe_area_dark_2026_10_12.jpg).

Typecheck, lint, final client/mobile builds, Capacitor `copy ios` and diff check passed. Verified updated styles in the copied iOS web assets. Logs: `/private/tmp/geckit-recurrence-mobile-ui-{typecheck,lint,client-build,mobile-build,ios-copy}.log`. Cosmetic CSS only; no new tests needed. The preceding 853-test result covers unchanged scheduling/save code.

Performance review: no performance problems found. Phone rebuild holds; other 12 checklist items unaffected. No new render calculations, component instances, animations or formatters. Native iPhone/WebKit rendering and installation were not available; the safe-area result is a browser fixture, not a physical-device claim. Active desktop app was not restarted. Browser viewport reset and isolated server stopped after review.

## iPhone installation: 2026-10-12

Alex explicitly requested "push to my iphone". Found his paired, wired iPhone 13 Pro with Developer Mode already enabled. Xcode Debug build of scheme App succeeded using the project's existing automatic signing team. Confirmed the signed app contains the corrected safe-area header and stacked native fields, then installed `com.anetrebskii.geckit` over the existing app with `devicectl`; JSON result reported success. No uninstall, pairing reset or desktop restart performed. Build/install evidence: `/private/tmp/geckit-iphone-calendar-build.log` and `/private/tmp/geckit-iphone-calendar-install.json`.

Launch attempted afterward, but iOS rejected it because the device was locked. Alex can unlock the phone and open GeckIt. Installation is verified; opening the app and physical WebKit visual inspection remain unverified. Desktop scheduler activation remains the separate safe-restart requirement above.

## Grouped mobile review correction: 2026-10-12

Alex rejected the installed mobile form and asked whether it had been reviewed. The preceding review checked Chrome rendering, sizing and clipping, but accepted desktop-style bordered controls with weak grouping. That review was insufficient; the supplied physical-device screenshot is the evidence for this correction.

Phone now uses actual `PhoneKit.Cell` and `phone-group` forms: grouped Starts/At rows with trailing native values, inline repeat controls, monthly row, grouped end choices with the existing check icon and real radio semantics, and aligned footnotes. Inactive values stay visible and readable. Desktop markup retains its original controls. Keyboard focus trapping now excludes unchecked radios, so Tab from Never wraps to Cancel instead of escaping the dialog.

Personally inspected complete rendered phone context in light/dark at 390x844 and 320x568, including 47/34 px safe-area fixtures and 20 px text. Review found and fixed: date-control specificity leaving a desktop border, crowded section headings, card flex shrinking that hid fields in short windows, undersized direct input/picker targets, long monthly labels, and the timezone footnote's missing inset. Final cards keep their intrinsic height and scroll below the fixed header; direct controls and weekdays are 44 px targets. Native values, Never/On/After, invalid count 0, count 10000, day/week/month/year, monthly ordinal selection, picker keyboard input, Escape focus return, Never Tab wrap, Done draft update and transient Save failure/retry checked. Desktop 712x660 light/dark parity personally reviewed. Final preview console had no errors. [Final grouped phone preview](screenshots/mobile_grouped_dark_2026_10_12.jpg).

Typecheck, lint, 12 affected recurrence/checked-save tests, final client/mobile builds, Capacitor copy and diff check passed. Logs `/private/tmp/geckit-recurrence-mobile-grouped-*.log`. No performance problems found: phone rebuild holds; other 12 checklist items unaffected. This is one editor with existing formatter/memo boundaries and no new animation or list work.

Signed Xcode Debug build succeeded with the existing identity. Confirmed final copied app includes no-shrink card layout and corrected footnote inset. Installed the revision over existing GeckIt on the paired iPhone 13 Pro; `devicectl` JSON reports success. The installed app launched successfully afterward. Evidence `/private/tmp/geckit-iphone-calendar-grouped-{build.log,install.json,launch.json}`. No uninstall, pairing reset or desktop restart.

Actual-device visual review remains pending. Automatic approval review rejected binding to iPhone Mirroring because it could expose private phone content; specifically requested permission to use it only for GeckIt, with no answer received yet. Did not bypass through another screen-access method. Preview evidence and successful installation must not be described as physical WebKit visual verification.

Alex requested deployment again afterward. Verified all 22 current mobile web files match the signed app, then reinstalled successfully on the same iPhone. The subsequent launch was rejected because the device was locked; unlock and open GeckIt. Evidence: `/private/tmp/geckit-iphone-calendar-redeploy-{install,launch}.json`. No code changes or app-data reset during this redeployment.

## Plain-value mobile design: 2026-10-12

Alex rejected the grouped design's nested gray controls. Applied the apple-ui design review to the supplied iPhone screenshot: excessive boxes, oversized rows and native date/time values sitting near the top. Phone values now appear as plain trailing text, with the existing accent indicating editable values. Rows retain 44 px direct targets without extra vertical padding. Selected weekdays use existing soft-accent tokens and thin accent borders; disabled values remain visible and faint. No data, state, validation or wording changes.

Investigated the centering issue against [WebKit's own user-agent stylesheet](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/css/html.css): date/time controls use inline-flex with centered items. The previous phone CSS replaced that layout with display:block. Restored centered inline-flex on the native controls and normalized value margins, without replacing the native picker.

Personally inspected full actual-component preview at 390x844 dark and 320x568 light with 20 px text and safe-area fixtures. Reviewed selected weekdays, Never/On/After, native date editing, count 10000, count0 inline validation, disabled values, scrolling, focus and Tab wrap. Final dark design inspected after animation completed; console had no errors. [Final design preview](screenshots/mobile_plain_values_dark_2026_10_12.jpg). Desktop behavior and selectors remain unchanged; physical iPhone visual review is still unavailable without the pending Mirroring permission.

Typecheck/lint, client/mobile builds, Capacitor copy, signed Xcode Debug build and diff check passed. CSS-only correction; previous scheduling/save tests unchanged. Logs `/private/tmp/geckit-recurrence-mobile-design-*.log` and `/private/tmp/geckit-iphone-calendar-design-build.log`. Performance review: no performance problems found; phone rebuild holds, other 12 checklist items unaffected. No new animation, formatter or per-render work. Browser viewport reset and preview server stopped afterward.

The revised build was installed under existing iPhone deployment authorization; result recorded in `/private/tmp/geckit-iphone-calendar-design-install.json`. Launch was rejected because the iPhone was locked; unlock and open GeckIt. No uninstall, pairing reset or desktop restart.

Alex then explicitly requested verification of the installed iPhone UI. Retried the same iPhone Mirroring binding under that authorization; Computer Use returned "not approved to use iPhone Mirroring". Requested session access be enabled. Actual-device visual verification remains blocked, and no alternate capture/control method was used to bypass the restriction.

## Browser / Capacitor verification: 2026-10-12

Alex requested browser verification as the alternative to blocked iPhone Mirroring. Reviewed the actual CustomRecurrence and PhoneShortcuts components in an isolated compiled preview, with mock settings IPC and no real shortcuts or conversations. Fixture viewport metadata matches mobile/index.html, including viewport-fit=cover. Capacitor config uses Keyboard resize:none and mobile/src/main.ts writes --keyboard; the browser fixture reproduces that CSS state with a 300 px keyboard cover.

Found and fixed a keyboard overlap: the root shrank to 544 px, but the portaled recurrence dialog stayed 844 px. Subtracting the keyboard height also required phone scrim top alignment; inherited centering otherwise put the 544 px sheet at y150, still behind the keyboard. The final sheet spans y0..544, its header remains y0..99, and the count error scrolls fully above the keyboard (y450..479). UX reachability requirement updated before the CSS fix.

Personally inspected full-screen light/dark 390x844 with 47 px top/34 px bottom fixture insets; light 320x568 with enlarged text; dark 844x390 with a 21 px bottom inset. Reviewed grouping, trailing-value alignment, 44 px weekday targets, header focus, disabled fields, scrolling to footnotes, narrow unit/monthly menus and validation. No horizontal overflow. At narrow enlarged text the title truncates while both actions remain visible. Never+Tab returns to Cancel. Monthly last-Tuesday rule, interval2 and count13 survived Done, outer Save, list display and reopening against mock IPC. This does not verify the running host backend's save path or native pickers.

Evidence: [dark portrait](screenshots/phone-capacitor-dark.jpg), [light portrait](screenshots/phone-capacitor-light.jpg), [narrow enlarged text](screenshots/phone-capacitor-narrow-large-text.jpg), [keyboard validation](screenshots/phone-capacitor-keyboard-validation.jpg), [landscape scrolling](screenshots/phone-capacitor-landscape-scroll.jpg). Native WebKit layout, iOS keyboard animation, locale-specific picker rendering and landscape notch insets remain unverified. Chrome browser viewport testing is not physical-device proof.

Typecheck and scoped recurrence/save lint passed. Client/mobile builds, Capacitor copy, signed Xcode Debug build and iPhone installation passed. All 22 mobile web files match the signed app bundle. Direct ESLint over src and test passed. npm run lint reported two no-undef errors in unrelated dev-bundle.js; unchanged by this work. No new tests for the two-rule CSS fix; existing recurrence/save test results above still apply. Performance review: no performance problems found; phone rebuild holds, other 12 checklist items unchanged. No new animations, render calculations or loops.

Signed build/install evidence: /private/tmp/geckit-iphone-capacitor-review-build.log and /private/tmp/geckit-iphone-capacitor-review-install.json. No uninstall, pairing reset, real settings write or desktop restart. Browser viewport reset, created tab closed and isolated preview server stopped after review. Launch attempt was rejected because the iPhone was locked; unlock and open GeckIt. Evidence: /private/tmp/geckit-iphone-capacitor-review-launch.json.

## Runtime limits

Schedules run on the computer while GeckIt is open, checked every 20 seconds. End-after counts scheduled occurrences, including execution misses/skips/failures; manual runs do not consume the series. DST nonexistent wall times are excluded from eligible occurrences; folds run once at the earlier instant. End date/count stops later-day catch-up; a delayed check on the final local day remains eligible.

No active conversations restarted or real models invoked. Live automatic launches and physical iPhone visual behavior are not verified. The signed iPhone app has been installed under Alex's explicit deployment requests; desktop backend activation remains the safe-restart requirement above.

## Phone numeric editing correction: 2026-10-12

Alex supplied a physical iPhone screenshot while editing. The inherited desktop outline drew a square across the full 44 px number field, and type=number without inputMode showed a general keyboard. The screenshot timestamp 14:31 precedes the 14:32 installation of the earlier keyboard-height correction; this screenshot alone cannot prove that correction failed.

Updated UX before implementation: phone sheet focuses itself on opening so it does not automatically open the keyboard; Tab reaches Cancel and Shift+Tab reaches the last enabled control. Both phone number fields request inputMode=numeric. Replaced phone numeric focus outline with existing soft-accent tint and 6 px rounded corners. Added 6 px text insets and included the inset in count width, preserving 10000. Desktop autofocus, numeric type/min/step validation and outline remain.

Followed the updated apple-ui browser review procedure. Used actual CustomRecurrence and PhoneShortcuts in surrounding shortcut editor with explicit mock IPC. Focus-sensitive fixture applies 350 px --keyboard only when a phone number receives focus; it represents the existing Capacitor Keyboard callback, not the native keyboard UI. Browser checks:390x844 light/dark,320x568 light,1200x900 desktop light/dark. Opened through Edit recurrence; initial focus stayed on dialog and keyboard fixture stayed closed. Tab reached Cancel; Shift+Tab reached Occurrences. Tap/fill interval updated summary to Every 3 weeks; active field had no outline, rounded tint and visible caret. Count 10000 fit completely above simulated keys. Empty count showed inline error and disabled Done. Escape discarded edited interval/count and returned focus to opener. Done retained count 10000 in outer draft and reopening retained it with keyboard closed. Desktop ArrowUp/Enter changed interval 2 to 3 and returned the expected summary; desktop initial focus remained interval and inputMode absent. Full-screen review after settling covered grouping, header, alignment, density, disabled controls, keyboard body scrolling and narrow field reachability. No browser console errors.

Evidence: [dark editing](screenshots/phone-editing-dark.jpg), [light editing](screenshots/phone-editing-light.jpg), [narrow count editing](screenshots/phone-editing-narrow.jpg). Mock IPC proves draft transitions; live host persistence unchanged and not retested here. iOS keypad selection and physical WKWebView focus appearance remain unverified; Chrome does not show an iPhone keyboard. No attempt to bypass denied Mirroring access.

Typecheck, direct ESLint src/test, client/mobile builds, Capacitor copy, signed Xcode Debug build and diff check passed. All 22 current mobile web files match the signed app bundle. No added tests for the small editing change; browser interaction checks exercise its actual focus and validation handlers. No performance problems found: phone rebuilt, other 12 checklist items unaffected; no new formatter, loop, animation or list work. Build/install evidence: /private/tmp/geckit-iphone-editing-build.log and /private/tmp/geckit-iphone-editing-install.json. Update installed without uninstalling/resetting pairing or restarting desktop. Browser viewport reset, created tab closed and isolated preview server stopped.

The installed update launched successfully on the paired iPhone. Launch evidence: /private/tmp/geckit-iphone-editing-launch.json. Device launch confirms opening, not native visual inspection.

## Main delivery validation: 2026-10-12

Isolated calendar recurrence delivery from unrelated VPN and approval changes in the shared checkout. Temporary branch feat/calendar-recurrence-delivery started from origin/main at e1304f2. UI components and recurrence CSS match the browser-reviewed implementation; only calendar API/store/test hunks were ported from mixed files. Feature list remains unchanged pending its separate documentation approval.

Isolated typecheck and direct ESLint src/test passed. All 65 test files and 734 tests passed with local socket/file-watcher permissions, including actual main/store custom save and disk reload. Initial sandbox run blocked socket/watch tests; unrestricted rerun passed. Desktop and mobile production builds passed. Logs: /private/tmp/geckit-calendar-delivery-tests.log and /private/tmp/geckit-calendar-delivery-build.log. Performance review found no problems: module/cached formatters, memoized editor calculations, cached finite endpoints, existing compositor entrance, phone rebuilt. Existing browser/native limits above remain.

No active desktop conversations restarted. Only calendar scheduling, save/persistence, phone editing fixes and their tests/design/verification artifacts belong to this delivery.
