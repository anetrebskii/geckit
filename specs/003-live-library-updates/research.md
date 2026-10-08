# Research

- `client/src/main/sessions/plugins.ts` stages updates in `.ready-*`; startup applies them by renaming installed and ready directories.
- `loadPlugin` imports `index.mjs` by file URL. Reimporting the same path would return cached ESM modules, including relative helpers. Runtime activation therefore needs a unique module URL and an immutable per-version snapshot directory.
- `Sessions.#for` previously looked up a provider dynamically from the session ID. Updating that map alone could pair an old driver with a new provider implementation.
- The Settings dialog already has an interactive preview that mounts the production component and stylesheet.
