# Historical observation contract v2

Superseded for new pairings by [full-control contract](protocol.md). Existing scoped grants keep this authorization boundary.

Only enrollment, authentication, snapshot and history requests cross the data channel. Local administration uses authenticated private RPC. Default deny for every other method. Major mismatch fails before data. Scopes apply before serialization for both snapshot and events. Events invalidate snapshot/history with epoch+sequence; reconnect replaces snapshot, no mutations replayed. Enrollment requires code possession, device signature and operator confirmation; consumed codes cannot enroll a second device. Trust pins server identity and client key. Revocation checked on every call and closes live channels.
