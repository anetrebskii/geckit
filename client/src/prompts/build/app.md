# Build GeckIt from source

Repository: https://github.com/anetrebskii/geckit
Read AGENTS.md and CLAUDE.md in the checkout before editing. Node 22+ is required.

Desktop:
  cd client
  npm ci
  npm run typecheck
  npm run lint
  npm test
  npm run build
  npm run dev

npm run build writes out/main, out/preload and out/renderer, including out/main/cli.js. npm run dev runs GeckIt Local with separate geckit-local user data and a geckit-local command. Do not restart active conversations just to load a backend change. npm run package creates installers; it is not a deployment.

Phone (uses client/node_modules):
  cd mobile
  npm run build
  npm run ios

npm run ios syncs Capacitor and opens Xcode. Signing and installing on a device needs the person's configured Apple development identity. Dictation additionally requires client/scripts/whisper.sh and cmake. The signal/ Firebase service is a separate deployment.

For provider libraries run geckit instructions providers. Review visible changes interactively in Chrome, light/dark, at the requested viewport, and follow docs/performance.md before calling them done.
