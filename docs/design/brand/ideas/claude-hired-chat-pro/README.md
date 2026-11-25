# GeckIt: Hired chat, production build

The speech bubble's tail runs on into a tie inside a jacket: the conversation went to work. Concept and tests: [v3](../claude-hired-chat-v3/README.md).

[Sheet](hired-chat-sheet.png) · `python3 build.py` regenerates every file.

| File | Use |
| --- | --- |
| `mark-ink.svg`, `mark-white.svg` | One-colour mark, light and dark backgrounds |
| `app-icon.svg` | App icon: white bubble, green jacket on the ink tile; the jacket bleeds off the tile's bottom edge like a portrait |
| `logo-light.svg`, `logo-dark.svg` | Mark and round-14 wordmark; the jacket's bottom sits on the text baseline |

Build changes against v3: the jacket bleeds off the icon's bottom edge instead of floating mid-tile; the mark is scaled so its base sits on the wordmark baseline. Checked at 16, 32 and 512 px in one colour, reversed and on the tile.
