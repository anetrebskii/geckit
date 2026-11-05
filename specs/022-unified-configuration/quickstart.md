# Validation

From `client`, run `npx vitest run test/configuration.test.ts test/store.test.ts test/employees.test.ts test/manager.test.ts test/session-migration.test.ts test/manager-store.test.ts test/shortcut-persistence.test.ts test/employees-guide.test.ts --maxWorkers=2`, then `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2` and `npm run build`.

Filesystem scenarios use isolated temporary directories: migrate legacy settings/catalog/Manager with runtime state, interleave all three owners' writes, restart, copy only configuration to another directory, reject malformed/newer input, and force a write failure. No account, provider process, Telegram connection or active app restart is required.
