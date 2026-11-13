# Contract: GeckIt service ↔ broker

Local only. JSON lines over a channel only the current user can open: a Unix socket of mode `0600` in the broker's folder (macOS, Linux), a named pipe with a DACL for the current user SID (Windows). The service starts the broker with a one-time token on its stdin; every request carries it. Requests from the CLI go through the service, never directly.

## Handshake

```json
→ {"op":"hello","token":"…","protocol":1}
← {"ok":true,"protocol":1,"version":"1.0.0","store":"keychain"}
```

Protocol mismatch: `{"ok":false,"code":"protocol"}`; the service restarts the broker from the installed resources.

## Operations

| op | Request fields | Answer | Notes |
| --- | --- | --- | --- |
| `prepare` | `requestId`, `name`, `kind`, `places`, `field?`, `taskId` | `{ brokerKey }` | ephemeral P-256 key pair kept in memory for this request |
| `accept` | `requestId`, `ciphertext`, `lifetime` | `{ name, expiresAt? }` | decrypts, seals, stores; drops the request key |
| `list` | none | `{ secrets: [metadata] }` | no values |
| `history` | `name?`, `limit?` | `{ records: [...] }` | |
| `revoke` | `name` \| `all:true` | `{ removed: n }` | |
| `taskEnded` | `taskId` | `{ removed: n }` | from the board's Done/delete transition |
| `fill` | `name`, `taskId`, `origin`, `field`, `endpointKey` | `{ sealed }` | value sealed to the browser endpoint's key, see below |
| `run` | `taskId`, `secrets[]`, `env[]`, `argv[]`, `cwd` | stream of `{ out \| err: cleaned bytes }`, then `{ exit }` | broker spawns the command; proxy/agent sockets per run |
| `clean` | `text` | `{ text }` | replaces active values and encodings |
| `status` | none | `{ store, version, locked }` | |

All refusals: `{"ok":false,"code":"expired|place|field|program|locked|unknown","say":"…"}` with no value in `say`.

## The one place a value crosses the boundary

Typing into a page needs the value in the browser. The broker never gives it to the service in clear:

1. The browser endpoint that will type (the extension's background worker for a Chrome profile, the test-browser driver for `geckit:<name>`) creates an ephemeral P-256 key pair per `typeSecret` call and sends its public key with the call (`endpointKey`).
2. The service asks the broker to `fill`; the broker checks the tab's origin and field against the secret, then returns the value sealed to `endpointKey` (ECDH + AES-GCM).
3. The service passes the sealed value to the endpoint, which decrypts it, sets the field's value in an isolated world, dispatches `input` and `change`, marks the element `data-geckit-secret` and drops the key.

The service, the CLI and the agent see only ciphertext. The value exists in clear only in the broker and, for one call, in the browser endpoint and the page, which must have it anyway. Page-reading commands mask elements marked `data-geckit-secret` and password fields, and pass page text through `clean` (FR-024).
