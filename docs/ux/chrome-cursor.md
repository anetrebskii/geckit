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
