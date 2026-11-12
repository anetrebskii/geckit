# Chrome cursor

When a conversation acts in a tab through `geckit browser`, the person watching that tab sees where it acts: a pointer that travels to the element, a ring where it clicks, and a thin green edge around the page while it works. Reading the page (`pages`, `read`, `find`, `text`, `shot`, `eval`) draws nothing.

## States

| State | What the tab shows | Enters when | Leaves when |
| --- | --- | --- | --- |
| Idle | Nothing | The extension is installed, or 3 s passed after the last action | An action starts |
| Moving | The pointer travels from where it last stood (the first time, from the bottom centre of the window) to the centre of the element, the edge fades in | `click`, `type` or `scroll <ref>` | The pointer arrives, 360 ms later |
| Clicking | A ring opens from the pointer and fades | `click` once the pointer arrived | 180 ms later; the click itself happens as the ring opens |
| Typing | The pointer rests at the start of the field while the text goes in | `type` once the pointer arrived | The text is in |
| Resting | Pointer and edge stay where the action ended | An action ended | The next action moves on from here, or after 3 s both fade out over 180 ms |

`key` and `scroll` by a screen show the edge only, since they have no element to point at.

## Rules

- Nothing in the overlay takes input or changes the page's layout: it is one fixed element over the page with `pointer-events: none`, its parts in a closed shadow root so the page's styles do not reach them.
- The pointer is black with a white outline so it reads on light and dark pages; the ring and the edge are GeckIt's green.
- With reduced motion asked for, the pointer appears at the element without travelling and the ring does not grow, it only fades.
- A tab in the background is drawn the same way; the person sees the resting state if they switch to it within 3 s.
- The overlay is drawn by the extension, not the conversation, so a page cannot fake it and a conversation cannot hide it.

## Which tabs GeckIt works in

| Where | What it shows | When |
| --- | --- | --- |
| Tab strip | A green tab group named "GeckIt", one per window | A tab GeckIt opened with `open`; Chrome removes the group when its last tab closes |
| Toolbar icon of GeckIt Browser | A green dot, and the tooltip "GeckIt has worked in this tab" | While the person looks at any tab GeckIt has read or acted in, until the tab closes |

- A tab the person opened is never moved into the group: it is theirs, and moving it would rearrange their window. The dot says GeckIt has been there.
- The dot needs the extension pinned to the toolbar; the group needs nothing.
- Marking a tab never fails a request: if Chrome refuses a group, the command still runs.

## Natural movement in Chrome for Testing - 2026-11-12

Alex requested natural movement in Chrome for Testing after watching Camoufox's native cursor trial. The existing browser commands remain the entry point. A new test-driver process is ready when it responds to a browser command; an already running process keeps its loaded implementation until relaunched. No new screen, setup step or browser dependency is added.

### Behavior and states

Automated `click`, `hover`, `type` and `scroll <ref>` move Chrome's actual mouse along a curved path with acceleration and deceleration before performing the action. Ordinary test-browser clicks use native mouse press/release events, including when `--real` is omitted. The existing overlay follows those actual mouse events instead of running a second straight-line animation. Position belongs to the tab, and another tab starts independently. The first move starts from the browser's initial mouse position at the top left.

| From | Event | To | What the user sees |
| --- | --- | --- | --- |
| Idle or Resting | an automated element command starts | Moving | the existing pointer and edge appear; the pointer follows the native curved movement |
| Moving | the native mouse reaches the element, automatically | Clicking, Typing or Resting | the click ring starts, the field receives text, or the pointer rests over the target |
| Moving | the tab closes or a browser command fails | Closed or Resting | the existing command error is returned; any remaining overlay fades after its rest interval |
| Clicking or Typing | the existing action completes, automatically | Resting | pointer and edge remain at the final position |
| Resting | three seconds pass without another action | Idle | the existing pointer and edge fade out |

Every point stays inside the page's content viewport, excluding browser scrollbars, and the final point is the element's current center clamped to those bounds. Path duration grows with distance and varies slightly between moves. It is bounded by 1.5 seconds to match the maximum used in the observed Camoufox-style movement without making a long move block a command indefinitely. Samples are scheduled roughly once per display frame (60 per second), with elapsed time accounting for protocol latency. Repeating an action at the same point adds no travel delay. Reduced-motion mode uses one immediate native move; the existing reduced-motion ring behavior remains.

### Silent behavior, limits and edge cases

There are no new messages or settings: paths and timing are internal to the command. Existing result wording and error wording remain. Read-only commands show nothing. Closing a tab drops its stored position. Resizing clamps the starting position and path to the new viewport. Missing refs fail before mouse input. A disabled or covered target receives the same native mouse behavior as a person's click; the driver does not synthesize an extra DOM click.

The test tab uses focus emulation so native input finishes while it stays in the background; the driver does not bring the tab or window forward. The person's live sign-in mouse input stays direct because it already comes from their own movements. Recording triggers retain their immediate input timing so existing animation recordings do not consume their capture window waiting for cursor travel. Ordinary Chrome through the extension retains its current movement. This change uses GeckIt's own path generator rather than importing Camoufox's Firefox engine or controlling the system pointer. Dragging, keystroke timing, fingerprint changes and promises of avoiding bot detection are deliberately absent.

### Acceptance

Verify the changed production CLI in a real Chrome for Testing profile: multiple trusted mousemove events with a curved path, successive moves starting from the preceding position, native clicks reaching targets, hover, typing/focus, element scrolling, independent tabs, and one immediate move with reduced motion. Inspect the actual overlay in light and dark pages at desktop and narrow viewport sizes; it must remain legible, respect screenshot hiding and stop drawing after the existing rest interval. No real account or external service is needed for these cursor checks.
