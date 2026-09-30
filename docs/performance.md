---
type: checklist
status: in use
owner: Alex
created: 2026-09-30
---

# Performance: the checklist before a UI change is done

Every item below was a real slowdown in GeckIt, found on 2026-09-30 by profiling the running app. Go through the list before calling a change to the Chat window, the board, a list or a menu done, and measure when a change touches something drawn many times.

## 1. The checklist

### Drawn many times

- [ ] **A component drawn once per conversation is memoized, and its memo holds.** A card, a row or a result is `memo`, and its comparison looks only at what it shows. Never compare `chat`, `chat.sessions` or `chat.settings` whole: they change on every keystroke, every streamed line and every settings write. Compare the conversation, and the few values drawn from the rest: its open state, favourite, project colour. `BoardCard` in `Board.tsx` and `PhoneRow` in `PhoneBoard.tsx` are the pattern.
- [ ] **What a memoized row calls is read at the time.** Inline callbacks close over state and go stale in a row that was not drawn again. Keep the handlers in a `latest` ref updated in an effect and pass callbacks that read it (`latest` in `Board.tsx`, `PhoneBoard.tsx`, `Switcher.tsx`).
- [ ] **Nothing is worked out per row that could be worked out once.** A card that scans every conversation (`startedLine(chat.sessions, id)`) costs n x n. Work it out once per list in a `useMemo` and hand each row its own value (`startedLines` in `Board.tsx`).
- [ ] **Objects that did not change keep their identity.** A list from main arrives as new objects each time, which breaks every memo below it. `sameAsBefore` in `useChat.ts` keeps a conversation that did not change as the object it was; anything else sent whole from main and drawn per row needs the same.
- [ ] **A long list does not lay out and paint what is out of view.** Cards and rows carry `content-visibility: auto` with `contain-intrinsic-size: auto <height>`. It clips what hangs over the element's edge, so anything drawn outside it (a drag landing line at `top: -1px`) moves inside.

### Per render

- [ ] **No formatter is made per call.** `toLocaleDateString(locale, options)` and `toLocaleTimeString(locale, options)` build a new `Intl.DateTimeFormat` each time. Make the formatter once at module level, as `time.ts` does. This alone froze the board for up to half a second.
- [ ] **A hook that filters or sorts every conversation is in a `useMemo`**, keyed on the list and what is asked, not recomputed when a row is pointed at (`useFound` in `Switcher.tsx`).

### Pointer and keyboard

- [ ] **A selection that follows the pointer is drawn at once.** React renders a `mousemove` as a low-priority update in a later task, so a highlight set from `onMouseMove` trails the pointer by a frame or two. Set it with `flushSync`, and only when the pointer enters a different row: `if (index !== here) flushSync(() => setAt(index))`. Hover in search went from about 35 ms to 13 ms.
- [ ] **Typing redraws only what depends on the text.** The draft lives in `useChat`, so each keystroke draws the Chat window again; anything expensive under it has to be memoized or it runs per key.

### Animation

- [ ] **Anything that animates for long is animated on the compositor.** Only `transform` and `opacity` on an HTML element are. Chromium will not composite a `transform` on an `<svg>` (the trace says `compositeFailed: 1024`), so each visible spinner drew a whole main-thread frame 60 times a second, about 18% CPU. Turn a wrapping span instead (`spinner-turn` in `Icon.tsx`).
- [ ] **An infinite animation stops when it is not seen.** A spinner or pulsing dot left running on a hidden or finished element keeps the window drawing.

### Before shipping

- [ ] **Measured in the running app, not guessed.** Numbers from the dev build are inflated (see 3), so compare before and after under the same build.
- [ ] **The phone is rebuilt** when Chat sources changed: it bundles them and does not load them from the Mac.

## 2. How to measure

Everything here reads the running dev app without restarting it or clicking in it.

**Reach the app.** `kill -USR1 <main pid>` opens Node's inspector on `127.0.0.1:9229` until the next restart. The main pid is the parent of any `Electron Helper (Renderer)` whose `--user-data-dir` is `geckit-local`. Evaluate in main over that socket with `Runtime.evaluate` (`includeCommandLineAPI: true` gives `require`; take `require('fs')` before the first `await`), and reach the Chat window as `BrowserWindow.getAllWindows()` with the url `chat.html`. Its `webContents.debugger` speaks the whole DevTools protocol to the renderer; attach, send, detach.

**What is slow, and when.**

- `PerformanceObserver` on `long-animation-frame`, installed with `executeJavaScript`, lists every frame over 50 ms with the script that ran in it.
- `PerformanceObserver` on `event` with `durationThreshold: 16` gives each click and key press from input to paint, split into wait, run and paint. It does not report `mousemove`: for hover, log the `mousemove` time and the moment a `MutationObserver` sees the row take its selected class.
- `Profiler.start` / `Profiler.stop` over 30-90 s while the person uses the app, then sum self and inclusive time per function. Split the bursts between idle samples to see one slow frame alone.
- `Profiler.startPreciseCoverage({ callCount: true })`, then two `takePreciseCoverage` calls some seconds apart, counts how often each component ran. A `Card` count of 0 while nothing changed is a memo that holds.
- `Tracing.start` with `devtools.timeline,blink,cc` and `blink.animations` shows main frames per second and why an animation is not composited (`compositeFailed`).
- For CPU per animation, pause them through CSS, `animation-play-state: paused !important` in an injected style, and read the renderer's CPU with `top -pid`. Do not use `Animation.pause()` and `play()` from script: they detach the animation from its CSS and it keeps running after the style is gone.

**Read the dev build's numbers with care.** In `npm run dev`, React's `jsxDEV`, `createTask`, `addObjectDiffToProperties` and `logComponentRender` are development only, and were about 70% of the JavaScript time on 2026-09-30. A cost that is mostly those is small in the installed app; a cost in our own functions is real in both.

**Mind the person's window.** The dev app is the one Alex uses. Measure passively while he works; drive it with synthetic input only when he asks, and say what was opened and closed. A window that reports `document.visibilityState === 'hidden'` draws no frames, so measure while it is in front.

## 3. Where it stood on 2026-09-30

Dev build, about 290 cards on the board and 800 conversations.

| What | Before | After |
|---|---|---|
| Board render, per minute of use | 333 ms `Board`, 284 ms of it day headings | 45 ms |
| Cards drawn again, per minute | 349-431 ms | 67 ms, 0 while nothing changes |
| Slowest frame | 450 ms | about 190 ms, most of it dev-only React |
| Chat renderer CPU with two spinners showing | 22% | about 8% above idle |
| Pointer entering a search row to it drawn selected | 32-35 ms | 13 ms median |
| Same in the projects menu | 28 ms median | 17 ms median |
| An input event with no work of ours, to paint | 48 ms median | not yet looked into |
