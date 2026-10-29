# Validation

1. Run focused export formatter and main/Sessions regressions in `client`: check every SessionItem kind, Markdown fences, large output, image data/reference, UTF-8 real disk write, source preservation, same/cross provider choice, failure and remote upload.
2. Launch actual Chat browser fixture per `client/test/browser/conversation-export/README.md`. Open conversation via its normal UI, open transfer, change assistant/model, export/show file, continue, inspect exact request/navigation. Simulated Electron/provider boundary is explicitly labelled.
3. Exercise cancellation, Escape/focus return, model loading/unavailable, failure/retry, pending double-submit, long content scrolling. Review full window at 1440x900 and phone 390x844 in light/dark; record actual sizes if different.
4. Run client typecheck, lint, full test suite, desktop build; `mobile/npm run build`. Review `docs/performance.md` for renderer change.
5. Real model inference and physical phone/SSH integration are separate from boundary tests. Do not claim those checked without evidence. Preserve running user sessions; no restart/deployment.

6. Follow-up no-send copy: open source without placing any source message/queue item; choose Copy without sending. Assert saved destination/target/model/context draft, zero send/start/queue calls, unchanged source. Edit prompt, close/reopen and reconstruct application state from persisted notes; assert draft and model survive without automatic work. Explicitly Send once and assert current edited prompt goes through normal guard/queue to selected provider/model exactly once. Verify intentionally empty draft stays empty, failures do not discard recoverable prepared context and normal deletion does not contact a provider for a nonexistent thread.
