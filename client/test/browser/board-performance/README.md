# Board rendering fixture

From `client`, run `node node_modules/vite/bin/vite.js --config test/browser/board-performance/vite.config.ts` and open http://127.0.0.1:5196/test/browser/board-performance/index.html. Append `?large=1` for 800 synthetic conversations or `?theme=dark` for dark mode. Normal mode has 16 fixture cards plus Source conversation.

The fixture mounts the actual Chat, useChat and Board in StrictMode, with the existing conversation-export native adapter. Only native calls and account/history data are synthetic; no real provider requests or native writes occur. Mark and rename simulate incoming native snapshots. The fixture's bottom disclosure records boundary requests and controls unchanged snapshots, one-card updates and streamed conversation text.

Check normal card opening, Enter, Cmd-selection/Escape, context menus, rename, column changes, ordering, From/Started navigation, and Save as a shortcut after switching conversations. Open Source conversation and start streaming; type an unsent draft while the board remains visible. Capture V8 call counts: BoardView should skip draft/stream-only updates, while real card changes, column choices, selections and menus still update. Repeated identical snapshots must preserve list identity. Check desktop light/dark, a narrower window and scrolling. Stop the fixture stream before leaving.

Typecheck with `node node_modules/typescript/bin/tsc --noEmit -p test/browser/board-performance/tsconfig.json`. Live app measurements remain necessary for real IPC load; this fixture verifies UI and rendering behavior at synthetic boundaries.
