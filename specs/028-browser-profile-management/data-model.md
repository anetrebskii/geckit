# Data model

Reuse `TestBrowsersState['profiles'][number]` for UI identity/status and `Pick<TestAccount, 'name'> & Partial<Pick<TestAccount, 'note'>>` for archive profile metadata. Imported profile identity is the explicitly requested destination name. Account note is descriptive metadata, not authentication evidence.

An archive is gzip-compressed newline-delimited JSON: one versioned profile header, ordered directory/file records, bounded base64 chunks filling each file's declared size, and one end record containing entry/byte totals. Header source platform and optional Chrome version are informational. Version 1 format is `geckit-browser-profile`.

A profile lifecycle lock guards create/delete/export/import and cooperates with browser launch. Export requires an existing closed profile and a new private output. Import requires a new valid name, validates into a private staging directory, then publishes atomically. Failure removes newly created output/staging and preserves existing profiles. Runtime Singleton files and known caches are excluded; symlinks, special files and unsafe/duplicate/conflicting paths are rejected. Gzip integrity and an explicit end record reject incomplete archives. Records are bounded to 128 KiB, decoded chunks to 64 KiB, entries to 100,000 and total/file data to 10 GiB.
