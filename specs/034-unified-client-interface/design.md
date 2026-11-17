# Design: One client interface for every GeckIt client

**Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)
**Status**: Ready for review

## Scope

The person's goal: a desktop connected to another computer is as quick as the phone, and the phone works with a computer that runs GeckIt without the desktop app. Almost all of the change is invisible. Five things are visible: placeholders while a part loads on the desktop, Find searching the whole conversation, a Pair again card on phones paired the old way, full-size pictures on a phone connected to a computer without the desktop app, and a remote desktop that keeps working through a short drop instead of disabling writes.

Surfaces: the Chat transcript and Find strip (desktop and phone), the phone board's notice area. Outside this change: the board, Manager, Settings, the remote connection flow in [remote-clients.md](../../docs/ux/remote-clients.md).

## Artifacts

- UX document: [docs/ux/unified-client-interface.md](../../docs/ux/unified-client-interface.md)
- Layout prototype: not applicable. Every visible change reuses an existing component in its existing place: the transcript skeleton (`skeleton-bubble`, `skeleton-line`), the `picture-waiting` box, the Load earlier row, the Find strip's count, and the notice card in `chat/Notices.tsx`. Only labels and when they appear change, which the UX document specifies.

## Decisions

- **Placeholders on the local desktop wait 150 ms.** Local parts normally arrive in under 100 ms, and a placeholder that flashes reads as a fault. Remote links show them at once. See UX section 1.
- **Find searches on the computer.** The phone's current "Only what is loaded is searched" plus Load earlier is a workaround for having only the end. Once every client has only the end, Find must answer for the whole conversation or it regresses on the local desktop. See UX section 2.
- **Old phone pairing becomes read-only with a Pair again card** (spec Clarifications, Q1). A phone that updates never goes blank, and only one path keeps full control. See UX section 3.
- **Pictures arrive at full size from a computer without the desktop app.** Scaling stays where it runs today, in a desktop app window, with the same size and format; the headless service gets no image library (research R4, FR-023). Silent, because the picture looks the same. See UX section 4.
- **Calls wait for a dropped link, as on the phone.** A remote desktop no longer disables writes while reconnecting: what the person does waits up to 60 s and goes when the link is back; nothing already sent is sent again (research R13, FR-021). See UX section 5.
- **A remote client's theme and board choice are its own**, as on the phone (research R14, FR-022). Silent: it is what a person expects.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1, FR-004 | UX 1: conversation end loading | Open a long conversation on a remote desktop: skeleton, then the latest messages; scroll up: "Loading earlier", then earlier messages. |
| US1, FR-005 | UX 1: run of steps loading | Open a run: the line opens, one placeholder line, then the steps. |
| US1, FR-006 | UX 1: picture loading | Scroll a picture into view: grey box at drawn size, then the picture, no layout jump. |
| US2, FR-008 | UX 2: Find over the whole conversation | Find a word that appears only in the first 100 items of a 5,000-item conversation on a local desktop: count includes it; moving to it loads that part and scrolls there. |
| US2, SC-005 | UX 1 threshold | Open a long local conversation: no visible skeleton flash. |
| US3, FR-018 | UX 3: Pair again card | Old-paired phone after update: board readable, card shown, composer disabled; Scan code then pairing: card gone, sending works. |
| US3, SC-006 | UX 4 | Phone with a headless computer: pictures appear at full size; with the desktop app: scaled as today. |
| FR-021 | UX 5: waiting for the link | Drop the link, send a message within 60 s: it goes after reconnecting, once. Drop it mid-send: "Connection lost. Check the computer before retrying this action.", not resent. |
| FR-022 | UX 5: own settings | Change theme on a remote desktop: the server and the phone keep theirs. |
| FR-012 | UX 1 failure | Drop the link while Load earlier is pending: "Could not load. Try again"; press after reconnect: part loads. |

## Review Evidence

No prototype was built (see Artifacts), so no browser review was run at this stage. The states above are verified in the running app during implementation, per [quickstart.md](quickstart.md), in light and dark, at desktop size and phone size (390 x 844), including keyboard use of the Find strip and scrolling while parts load.

## Open Decisions

None.

## Planning Handoff

- Preserve the existing components and class names listed under Artifacts; no new styles beyond any token-based rule the "Loading earlier" and "Could not load. Try again" labels need.
- Find needs a new server operation that returns matches over the whole conversation (contract `chat:find`).
- The local desktop delays placeholders by 150 ms; remote clients do not.
- The phone's Pair again card depends on the phone knowing it is on the old pairing and the old path refusing sends.
