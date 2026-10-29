# Conversation export browser fixture

Run from `client`:

```sh
node node_modules/vite/bin/vite.js --config test/browser/conversation-export/vite.config.ts
```

Open http://127.0.0.1:5198/test/browser/conversation-export/index.html, select **Source conversation**, then use its normal **Continue with another model** branch icon in the right side of the desktop composer, beside microphone and Send. Check that the former header entry is absent. Desktop dark preset: append `?theme=dark`. Phone preset: append `?phone=1`; set the browser viewport to 390 × 844 and open the conversation's **More** menu. Combine presets as `?phone=1&theme=dark`.

The fixture renders actual `Chat`, `useChat`, `ConversationTransfer`, preload API and product styles. Only Electron IPC/context bridge/file paths are replaced. Histories, models, exports and destinations are synthetic. No real provider, account, upload or disk operation runs. The displayed Markdown preview is synthetic fixture content; native export formatting and persistence require their own tests.

Expand **Fixture evidence and controls** at the bottom to inspect exact export source ids, copy/continuation requests, prepared drafts, destination metadata, file-open requests, model requests and original source/draft preservation. Collapse it for full-screen visual review. **Toggle theme** changes actual app settings. Reloading preserves synthetic copies and drafts; **Reset fixture** explicitly clears fixture state and restores the original source draft.

Exercise these paths using normal UI interactions:

- Export Markdown; verify a saved path and Show export. Show export records the desktop open request or opens actual phone FileView against the fake native file read.
- Change to Opus fixture (same provider), enter an instruction, and press **Copy without sending**. Verify a separate prepared conversation with editable context, selected target/model and zero simulated provider create/send/queue calls. Source history, draft, queue and goal must remain unchanged. Repeat for Codex/GPT fixture (cross provider).
- Edit the prepared context, switch to the source, reopen the copy and reload the page. Verify the edited draft and selected target/model survive, still with no simulated provider call. Explicitly press the actual composer **Send**; only this action may create the simulated provider destination and send its edited context. Reopening and reloading a prepared copy must never send automatically.
- **Create and send** remains the separate immediate continuation. Verify its exact request, destination and simulated provider counters; it must not silently behave like preparation.
- Inspect unavailable model entries; they must not become usable targets. **Unavailable model catalog** affects the next catalog fetch; change assistant or reopen to fetch again.
- **Hold export/copy/create** before submitting. Check pending label, disabled duplicate submission, and held Escape/cancel/backdrop dismissal; **Release pending** finishes the operation. One copy click must produce one boundary request and one prepared copy, with no provider calls; one explicit send must produce one dispatch.
- **Hold model loading** before changing assistant; check loading and disabled creation, then release.
- **Fail export**, **Fail copy** or **Fail creation/send** before submitting. Verify visible failure and retained choices, turn failure off and retry. Export/copy failure must not create or send to a provider; creation failure after export does not mean a destination exists. A failed explicit send keeps the prepared draft available.
- Cancel/Escape/backdrop, focus entry/trap/restoration, multiline next instruction, phone scrolling and keyboard navigation. The source composer starts with an unsent draft, a queued message and a goal so preservation remains visible.

Fixture typecheck:

```sh
node node_modules/typescript/bin/tsc --noEmit -p test/browser/conversation-export/tsconfig.json
```
