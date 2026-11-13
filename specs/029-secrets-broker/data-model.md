# Data Model: Secrets through a link, used by a broker

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Secret

Stored by the broker. The sealed item is the authority; the metadata row is a readable cache for listing.

| Field | Where | Rules |
| --- | --- | --- |
| `name` | item key, metadata | `^[a-z0-9][a-z0-9-]{1,47}$`, unique per computer |
| `value` | sealed item only | 1 to 16 384 bytes; never leaves the broker |
| `kind` | sealed + metadata | `website` \| `http` \| `command` \| `ssh` |
| `places` | sealed + metadata | website: origins (`https://github.com`); http: host names, optional `*.` prefix; command: absolute program path or bare program name resolved at use; ssh: host patterns |
| `field` | sealed + metadata | website only, optional: element description fixed at request time; absent means password fields only |
| `note` | metadata | up to 200 characters, from the request |
| `lifetime` | sealed + metadata | `task` \| `once` \| `15m` \| `1h` \| `1d` \| `keep` |
| `expiresAt` | sealed + metadata | ms since epoch; absent for `task` and `keep` |
| `taskId` | sealed + metadata | conversation id that requested it; required for `task` |
| `usesLeft` | sealed + metadata | `1` for `once`, absent otherwise |
| `cleaned` | metadata | false when the value is shorter than 8 characters |
| `requestId` | metadata | the request it came from |
| `createdAt`, `lastUsedAt` | metadata | ms since epoch |

**Validation**: a use is allowed only when the sealed fields say so: not expired, task exists for `task`, `usesLeft > 0` for `once`, place matches, field matches. On any mismatch between sealed and metadata fields, the sealed fields win and the metadata row is rewritten.

**State transitions**:

```text
requested --(save on page, collected)--> active --(use)--> active
active --(once: first successful use)--> deleted
active --(15m/1h/1d: expiresAt passed, at sweep or next use)--> deleted
active --(task: conversation Done or deleted)--> deleted
active --(revoke)--> deleted
active --(new link saved for same name)--> active (value replaced, history keeps both)
```

## Secret request

Created by the service when the agent asks; mirrored to the relay without the link key.

| Field | Where | Rules |
| --- | --- | --- |
| `id` | local + relay | 128-bit random, base64url |
| `linkKey` | local only, and in the link fragment | 128-bit random; the relay stores `sha256(linkKey)` |
| `name`, `kind`, `places`, `field`, `note` | local + relay card | as Secret |
| `computer` | relay card | the computer's display name |
| `taskTitle` | relay card | the conversation's title, cut to 80 characters |
| `brokerKey` | relay card | broker's ephemeral P-256 public key for this request (raw, base64url) |
| `signature` | relay card | ECDSA P-256 over the card by the computer's pairing identity key |
| `identityKey` | relay card | that public key, so the page can verify; GeckIt shows its fingerprint with each submission |
| `expiresAt` | local + relay | created + 15 minutes |
| `state` | local + relay | `sent` → `saved` → `collected`, or `sent` → `expired` |
| `ciphertext` | relay only, after save | `{ epk, iv, data, lifetime }`; deleted when collected or expired |
| `taskId` | local | conversation that asked; the link travels in its reply (research R9) |

**Rules**: `saved` is set once, inside a transaction, by the first valid save; later saves get "already used". Opening the page never changes state. The broker's private key for a request lives only in broker memory and is dropped at `collected` or `expired`; a broker restart before collection makes the request `expired` and the agent can request again.

## Use record

Appended by the broker; readable by GeckIt for the history view.

| Field | Rules |
| --- | --- |
| `at` | ms since epoch |
| `name` | secret name |
| `taskId` | conversation that asked |
| `kind` | `website` \| `http` \| `command` \| `ssh` \| `revoke` \| `expire` |
| `place` | origin, host, program or ssh host; never request bodies or arguments that could hold values |
| `result` | `ok` \| refusal reason code (`expired`, `place`, `field`, `program`, `locked`, `unknown`) |

Kept 90 days, at most 10 000 records, oldest dropped first.
