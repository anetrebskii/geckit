# Contract: secret link relay (`signal/`)

Public surface in the `geckit-signal` Firebase project. Holds request cards and, briefly, ciphertext.

## Page

`https://geckit-signal.web.app/s/#<requestId>.<linkKey>.<keyHash>`

- `requestId` and `linkKey` are 22 base64url characters (128 bits). `keyHash` is base64url of the first 16 bytes of SHA-256 over the broker's raw P-256 public key; the page refuses a card whose `brokerKey` does not match it, so a relay that swaps the key is caught.
- A second entry of the viewer build (`client/src/viewer/secret.html`, built into `signal/public`). Hosting rewrites `/s` and `/s/` to `secret.html` and sends a strict CSP for it: `default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`.
- `<title>` and Open Graph tags are fixed: "GeckIt: a secret is requested". The fragment is never sent to a server, so link previews see only this. Opening the page does not use the link; only saving does.
- No third-party script, font or analytics.

## Function

One HTTPS function, `secret` (europe-west1), behind the Hosting rewrite `/api/secret`. Every call is `POST {action, id, ...}`.

| Action | Caller | Input | Output | Rules |
| --- | --- | --- | --- | --- |
| `open` | computer | `id`, `card` (name, kind, places, field, note, computer, task, brokerKey), `linkKey`, `owner` (a random secret only the computer keeps) | `{ expiresAt }` | Creates the document with `sha256(linkKey)` and `sha256(owner)`; 15-minute life. A second open of the same id is `exists`. |
| `card` | page | `id`, `linkKey` | `{ card, expiresAt }` | Hash must match (`not-valid`), `state = sent` (`already-used`), not expired (`expired`). Does not change state. |
| `save` | page | `id`, `linkKey`, `ciphertext {epk, iv, data}`, `lifetime` | `{ saved: true, computer }` | Transaction: only when `state = sent` and not expired; sets `state = saved`. Second save: `already-used`. At most 10 tries per request. |
| `collect` | computer | `id`, `owner` | `{ state }`, or with `state: saved` the `ciphertext, lifetime, device` | `owner` hash must match. Hands the ciphertext once, sets `collected` and deletes it. |

The computer polls `collect` every 3 seconds while a request is open.

## Storage

Firestore `secretRequests/{requestId}`: card fields, `linkKey` (its hash), `owner` (its hash), `state`, `expiresAt`, `tries`, `ciphertext?`. Security rules deny all client access; only the functions read and write. The hourly `secretCleanup` deletes documents 1 hour after `expiresAt`, so expired or collected requests leave nothing behind.
