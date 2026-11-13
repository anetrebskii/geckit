# Secrets Settings renderer fixture

Run `npx vite --config test/browser/secrets/vite.config.ts` from `client`, then open `http://127.0.0.1:5232/test/browser/secrets/index.html`. Add `?theme=dark`, `?empty=1`, `?state=down` or `?state=locked`.

It mounts the production SettingsDialog on Settings > Secrets with the production stylesheet; only `window.geckit.secrets` is replaced. No broker, store or relay is contacted. `test/secrets-broker.integration.test.ts` covers the real broker.
