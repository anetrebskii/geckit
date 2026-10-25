# Research

## Voice Memos
Apple documents same-account iCloud sync, not a public local discovery API: https://support.apple.com/guide/voice-memos/see-your-recordings-on-all-your-apple-devices-vma6cc4d0571/mac . Sync is OS-owned and can require opening Voice Memos/enabling iCloud; layered recording compatibility varies. Do not promise availability.

Observed third-party implementation documents CloudRecordings.db ZCLOUDRECORDING metadata columns ZPATH,ZDATE,ZDURATION,ZCUSTOMLABEL,ZUNIQUEID: https://github.com/jonzarecki/macos-voice-memos-transcriber/blob/main/docs/ARCHITECTURE.md . This is evidence of a private storage format, not an Apple API contract. Adapter inspects schema and fails closed. CoreData dates use seconds from 2001 only for the validated known schema; test exact conversion.

Local read-only metadata probe at ~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings returned PermissionError; an escalated immutable SQLite schema open returned unable to open database. No titles/audio/rows were read. Access must be surfaced, never bypassed.

Revised decision after Alex rejected manual setup: auto-detect only known Apple Voice Memos locations for the current macOS user. Preserve explicit directories from older saved settings internally; no folder picker or path entry. Use a copied stable DB+WAL snapshot, query only temporary copy; path/symlink containment for audio; separate observations before processing. Original -shm is not created. Baseline lists only, excludes existing UUIDs and older creation timestamps including late sync. Folder glob alone rejected because sidecars are not recordings.

## Transcription and classification
Existing installed Whisper + afconvert converts a copy to local PCM. No model auto-download or paid API. Missing dependency is explicit. Existing correct(custom) uses restricted provider text path; validate JSON classification and expose no Manager tools before approval. Transcript may reach selected assistant only after opt-in consent; raw audio stays local.

## Authority and time
Existing opaque Telegram callback/user pairing plus persisted item revision and pairing fingerprint. Deterministic Manager inbox IDs provide restart dedup; notes deterministic atomic paths. Intl timezone wall-time checks for weekly intervals, overnight belongs to starting day; no catchup burst after sleep. Timer is single flight and disposed. Manual work/outbox independent of intake hours.

## Automatic connection follow-up
Apple’s current Full Disk Access documentation: https://support.apple.com/en-gb/guide/mac-help/mchl211c911f/27/mac/27 . It describes System Settings > Privacy & Security > Full Disk Access and explicit user approval. GeckIt opens the pane only; access checks remain authoritative. Opening the pane never establishes a connection or alters TCC. Private Voice Memos storage remains unsupported as an official API.

Minimal actual current-user probe on 2026-10-25 opened only the known CloudRecordings.db read-only for its SQLite header; macOS returned EPERM before any bytes were read. Evidence: `/private/tmp/geckit-voice-memos-evidence/native-access.json`. No recording rows, titles or audio read. The native detection implementation is separately tested against synthetic known-layout libraries, missing/denied paths and legacy explicit directories. Native live discovery remains access-blocked; fixture success does not prove personal iCloud sync or live transcription.
