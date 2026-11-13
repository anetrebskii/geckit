# geckit-broker

Holds GeckIt secrets in the operating system's credential store and uses them without giving them to the AI. Spec: `specs/029-secrets-broker/`.

## Build and test

```bash
go build -o geckit-broker .
go test ./...
GOOS=linux go vet ./... && GOOS=windows go vet ./...
GECKIT_KEYCHAIN_TEST=1 go test ./store/
```

## Start

```text
geckit-broker --dir <folder> --socket <path or \\.\pipe\name>
```

- The first stdin line is a one-time token. When stdin closes, the broker exits.
- It prints `ready <socket>` on stdout once listening.
- Defaults: folder `~/Library/Application Support/GeckIt Broker` (macOS), `$XDG_DATA_HOME/geckit-broker` or `~/.local/share/geckit-broker` (Linux), `%LOCALAPPDATA%\GeckIt Broker` (Windows); socket `<folder>/broker.sock`, pipe `\\.\pipe\geckit-broker-<USERNAME>`.

## Protocol

One connection per operation, JSON lines:

1. Client sends `{"op":"hello","token":"…","protocol":1}`; broker answers `{"ok":true,"protocol":1,"version":"…","store":"…"}` or a refusal with code `hello`, `token` or `protocol`.
2. Client sends one operation; broker answers one line (or, for `run`, a stream) and closes.

Refusals: `{"ok":false,"code":"expired|place|field|program|task|locked|unknown","say":"…"}`; `say` never contains a value.

| op | request | answer |
| --- | --- | --- |
| `status` | | `store`, `version`, `protocol`, `locked`, `count` |
| `prepare` | `requestId`, `name`, `kind`, `places`, `field?`, `note?`, `taskId` | `brokerKey` |
| `accept` | `requestId`, `ciphertext {epk, iv, data}`, `lifetime` | `name`, `secret` (metadata), `expiresAt?` |
| `list` | | `secrets` (metadata) |
| `history` | `name?`, `limit?` | `records` |
| `revoke` | `name` or `all: true` | `removed` |
| `taskEnded` | `taskId` | `removed` |
| `fill` | `name`, `taskId`, `origin`, `field`, `endpointKey` | `sealed {epk, iv, data}` |
| `clean` | `text` | `text` |
| `run` | `taskId`, `secrets[]`, `env[]`, `argv[]`, `cwd` | lines `{"out":"<base64>"}` / `{"err":"<base64>"}`, then `{"ok":true,"exit":n}` |

- `fill.field` is `password` for an `input type=password`, otherwise the element description fixed at request time.
- `run.env` entries are `NAME=value` or `NAME=secret:<name>`. An `http` secret becomes the placeholder `{{secret:<name>}}`, replaced by the broker's proxy only on the secret's hosts. A `command` secret becomes the value only when `argv[0]` matches the secret's program. `secrets[]` adds `http` secrets (proxy) and `ssh` secrets (`SSH_AUTH_SOCK`).
- `lifetime`: `task`, `once`, `15m`, `1h`, `1d`, `keep`.

## Encryption for `accept` and `fill`

All binary fields are base64url without padding (padding is accepted on input).

- Keys: P-256. Public keys are the raw uncompressed point (65 bytes, `0x04 || X || Y`), as WebCrypto `exportKey("raw")` gives.
- Sender makes an ephemeral P-256 key pair, computes ECDH with the recipient's public key, and takes the 32-byte shared secret (WebCrypto `deriveBits({name:"ECDH", public}, privateKey, 256)`).
- AES key: HKDF-SHA256 over the shared secret, empty salt, info `geckit-secret-v1` for `accept` (page to broker) or `geckit-fill-v1` for `fill` (broker to browser endpoint), 32 bytes (WebCrypto: `importKey("raw", shared, "HKDF", false, ["deriveKey"])`, then `deriveKey({name:"HKDF", hash:"SHA-256", salt:new Uint8Array(), info}, key, {name:"AES-GCM", length:256}, false, [...])`).
- Cipher: AES-256-GCM, 12-byte random `iv`, no additional data; `data` is ciphertext with the 16-byte tag appended (WebCrypto's output as is).
- `epk` is the sender's ephemeral public key.
- For `accept` the recipient key is `brokerKey` from `prepare`; the plaintext is the value's UTF-8 bytes. For `fill` the recipient key is `endpointKey`.

## Storage

- macOS: one Keychain generic password per secret, service `org.anetrebskii.geckit.broker`, account = name, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, and an access list (`SecAccessCreate`) whose only trusted application is the broker itself. Other programs, `/usr/bin/security` included, get a system prompt.
- Windows: DPAPI-sealed files (`CryptProtectData`, current user) under `<folder>\items`. Credential Manager was not used: its blob limit is 2560 bytes.
- Linux: Secret Service items with attributes `application=geckit-broker`, `name=<name>`; without a Secret Service, AES-256-GCM files under `<folder>/items` with the key sealed by `systemd-creds --user` (`file-systemd-creds`) or a `0600` key file (`file-keyfile`).
- The sealed item holds the value with kind, places, field, lifetime, expiry, task and uses; it wins over `secrets.json`, the metadata cache without values. `history.jsonl` keeps 90 days, at most 10 000 records.
