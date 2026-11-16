# Contract: phone calls added

The phone reaches main only through the call map in `client/src/main/index.ts`, mirrored in `client/src/renderer/src/phone.ts`. This feature adds:

| Call | Service method | Returns | Notes |
| --- | --- | --- | --- |
| `secrets.list` | `secrets:list` | secret metadata (name, kind, places, lifetime, expiry) | never a value |
| `secrets.history` | `secrets:history` | uses of one secret | |
| `secrets.revoke` | `secrets:revoke` | number removed | the Remove action |
| `secrets.status` | `secrets:status` | store, locked, problem | |
| `channels.configure` | `channels:configure` | the channels view | the phone sends only `{ enabled }` |

Still refused on the phone with "Manage secrets on the computer.": `secrets.prepare`, `secrets.save`, `secrets.update`. Still refused with "Manage channels on the computer.": `channels.screen`, `install`, `remove`, `inspect`, `checkUpdates`.
