# New-task file-drop regression fixture

Run from `client`:

```sh
node node_modules/vite/bin/vite.js --config test/browser/new-task-drop/vite.config.ts
```

Open http://127.0.0.1:5197/test/browser/new-task-drop/index.html. Select **Background conversation**, then click **Run regression checks**. The result lists each assertion and send/upload counters. **Reset fixture** clears only this fixture origin's local storage and reloads. The drop button also lets a person exercise individual targets. Review light/dark themes with **Toggle theme**.

The fixture renders actual Chat, useChat, NewTask and Composer through the actual preload API. Its Vite alias replaces only Electron's IPC, context bridge and file-path boundary. All records, text files, images and Windows-style paths are synthetic; no live data, native filesystem reads, real upload or provider call is used. The native subscription list is visible in the evidence panel.

The regression covers multiple files, path quoting, both forms, dragover feedback, unrelated controls/backdrop/background, supported images, Cancel/Escape/backdrop close, repeated reopen and ordinary conversation drops. Success requires zero sends/uploads and every check passing.

This browser fixture proves DOM event ownership and observable draft/attachment behavior. It does not prove a real Windows Explorer drop through the Electron executable. A Windows-style path here substitutes only the return value of `webUtils.getPathForFile`.

Fixture typecheck:

```sh
node node_modules/typescript/bin/tsc --noEmit -p test/browser/new-task-drop/tsconfig.json
```
