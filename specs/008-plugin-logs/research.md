# Research: Plugin logs

- Decision: optional factory context containing only a scoped logger. Rationale: API v1 no-argument factories ignore extra arguments; libraries remain independent. Rejected builtin-provider host exposure.
- Decision: JSONL files under host userData/provider-logs. Rationale: predictable paths and tools; preserves immutable installed snapshots. Rejected plugin-owned logs and unstructured main.log.
- Decision: 2 MiB current file plus .1 backup, serialized writes shared by path. Rationale: bounded diagnostics with concurrent versions.
- Decision: host limits events use limits.host.*; actual tmux commands use usage.command.sent. Rationale: distinguish caller polling from backend activity.
- Decision: logging errors are swallowed, sensitive keys/values sanitized, instrumentation uses safe scalar metadata. Rationale: diagnostics cannot alter AI behavior or capture conversation data.
- Decision: no UI viewer. Rationale: terminal inspection directly satisfies audit request without modifying concurrent renderer work.
