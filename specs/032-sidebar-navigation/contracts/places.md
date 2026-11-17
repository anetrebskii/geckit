# Contract: places and keys (desktop)

The pure rules are in `client/src/renderer/src/chat/places.ts` and covered by `client/test/places.test.ts`.

| Function | Input | Output |
| --- | --- | --- |
| `keptPlace(kept)` | the saved `chatPlace` | the place to show; `'tasks'` for an unknown id |
| `namesShown(width, navNames)` | window width, the saved choice | true when `navNames` and `width >= 884` |
| `waitingCount(n)` | count | `'99+'` above 99, else the number |
| `waitingSaid(n)` | count | "1 conversation waiting for you", "N conversations waiting for you" |
| `togglesNames(event, mac)` | a key event | Cmd+Ctrl+S on macOS, Ctrl+Alt+S elsewhere, never with Shift |
| `menuDot(place, waiting, unread)` | phone place and states | `'asks'`, `'unread'` or none (see data-model.md) |
| `menuSaid(dot)` | dot | the Menu button's accessible name |
| `monogram(name)` | saved computer name | first letters of the first two words, else the first two letters, uppercased |

## Keys and the places they open

| Key | Place, then action |
| --- | --- |
| Cmd+, (Ctrl+, elsewhere) | Settings |
| Cmd+J | Shortcuts |
| Cmd+N | Tasks, then New task |
| Cmd+Shift+N | Questions, then Ask a question |
| Cmd+P, Cmd+K | Tasks, then the switcher or command panel |
| Cmd+/ | the keyboard shortcuts list over the current place |
| Cmd+Ctrl+S (Ctrl+Alt+S) | show or hide the names |

Events that used to open overlays now set a place on desktop: the Team event opens Team (with an employee when one is named), the Manager chat event opens Manager, and Settings links to Checklists, Secrets or Integrations open Checklists, Secrets or Browsers.
