# Desktop renderer against the headless service

Run from `client/`:

```sh
npm run build:service
node test/browser/headless-service/setup.mjs
GECKIT_BROWSER_DATA=<printed-directory> npx vite --config test/browser/headless-service/vite.config.ts
```

Open `http://127.0.0.1:5207/test/browser/headless-service/`.

This harness mounts the actual Chat component with the actual preload and product CSS. All core operations and events use the real standalone Node service through its authenticated local RPC connection. The service owns temporary settings, projects, employees and conversation history. Its fixture provider launches a real child process and emits controlled answers; it does not contact a model account. Sending `wait` produces a permission card. Sending `complete` produces a normal answer.

The browser adapter replaces the native Electron boundary. App-update status, crash prompts, accessibility checks and phone pairing are fixture responses. The native voice-form lifecycle has no effect. Clipboard and external links use browser APIs. Native file pickers return cancellation. Other unavailable native actions fail explicitly. This harness does not establish native notifications, OS permissions or a real provider account.

Use product Settings to switch themes. Inspect desktop and narrow viewports, keyboard focus, scrolling, conversation actions, explicit permissions, employees and persisted settings. Reloading the page reconnects to the same service. A second browser tab uses the same service state.

To inspect the native client's global connection notice through the actual preload and renderer, inject the explicit fixture event, then clear it. This simulates native connection events; it does not disconnect the real service.

```sh
curl -X POST 'http://127.0.0.1:5207/api/fixture/notice?state=disconnected'
curl -X POST 'http://127.0.0.1:5207/api/fixture/notice?state=clear'
```

Stop the Vite process, then stop the isolated service:

```sh
node test/browser/headless-service/setup.mjs --stop <printed-directory>
```

The temporary directory remains for evidence. The browser bridge refuses a data directory without the isolation marker, so it cannot silently connect to normal GeckIt user data.
