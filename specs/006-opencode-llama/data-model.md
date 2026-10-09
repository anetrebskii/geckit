# Data model

- Assistant: plugin:opencode-llama; same ID and family in manifest/provider.
- Conversation: native OpenCode id/directory/title/time; GeckIt id prefixes native ID with plugin:opencode-llama:. Native storage remains owned by OpenCode.
- Model: providerID/modelID joined by slash; name, limits and cost read from connected provider catalog. Only Llama matches are selectable.
- Transcript: native message and part IDs produce stable text/thought/tool items. Delta events append to cached parts; authoritative updates replace them.
- Driver: idle -> starting -> running -> waiting -> running -> ended; stop/failure settles once. End closes subscription and aborts owned turn; provider disposal kills owned server only.
- Permission/question: native request ID maps to GeckIt ask ID. Multiple questions use #index IDs and submit answers together.
