# Data model
Existing types: `SessionProvider`, `ClaudeAccount`, `ProviderUsage`, `ProviderQuota`, `PlanUsage`, `PlaceUsage`, `LlmProviderInfo`.
Assistant snapshot derives provider identity and account; loading/error state is renderer-only. Enabled settings control lifetime. Account replies and events update only matching enabled identity. Selected assistant data must never leak across switches. No persistence or migration.
