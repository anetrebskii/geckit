# Data model

Shortcut adds optional destination with channel transport ID, destination ID and optional display label. Identity is stable IDs, never label text. Omission means legacy behavior and no new external delivery.

Destination choices expose stable ID, human name and actual native reply model. Only modules implementing publication expose choices; absence is unsupported, not empty success.

A service-owned run stores UUID, immutable shortcut and destination snapshot, admission time, source session, isolated Manager thread, completion/result, and delivery state/receipt/error. Delivery transitions waiting -> sending -> sent, failed or uncertain. Restart converts unresolved sending to uncertain. Known sent runs never republish. Failures preserve source identity/result. Run state must not be stored in renderer localStorage.

A native receipt identifies actual destination, thread/message and link. A scoped binding transaction changes the provisional Manager thread's native key while retaining its ID/backing session and notes ownership. Existing native keys cannot be stolen. Missing or mismatched native receipts are uncertain.
