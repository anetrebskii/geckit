# Research

- Decision: native OpenCode HTTP/SSE protocol, using [official server docs](https://opencode.ai/docs/server/) and current [v2 generated schemas](https://github.com/anomalyco/opencode/tree/dev/packages/sdk/js/src/v2). Rationale: persistent sessions, live tools, permissions and questions. Alternative: run --format json lacks an interactive approval channel.
- Decision: spawn one owned authenticated loopback server lazily, using port 0 and a random password. Rationale: avoid fixed-port collisions, imports stay inert, do not reuse or shut down someone else's server. SDK root types lag current event schemas, so use documented HTTP directly.
- Decision: configured Llama catalog only. Rationale: no silent hosted fallback; local or hosted setup remains OpenCode-owned. Document Ollama by default and preserve existing config.
- Decision: manual ask rules and plan agent; no automatic safety-review claim. Unknown quotas/capacities omitted, prices copied only when backend supplies them.
