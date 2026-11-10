# Research

Decision: recover Codex first links from thread.preview, keeping thread.name as title. Evidence: CodexSessions.list has no work field; Sessions.#listed searches live messages only if row is absent. Alternative: read every transcript on list; rejected due to per-card history costs.

Decision: index changed messages and persist bounded metadata. Alternative: scan all live history in #listed on every stream event; rejected for performance. Full read rebuilds the index.

Decision: recognize canonical GitLab paths independent of hostname. A company allowlist would exclude private installations and introduce organization-specific configuration.

Review decisions: preserve listed/saved metadata until a full transcript read succeeds; retain transcript order when a streamed message gains its first link; use the last mention of repeated related links while keeping the first subject pinned. Regressions cover each condition. Implementation is based on current origin/main, including service ownership and Manager/employee behavior.
