# Implementation plan

Extend existing paired-computer transport and use one product dispatcher for operator commands and authenticated Manager relay. Preserve safe legacy assistant commands and current RPC/device authentication. Explicit host errors never substitute local execution. Provider configuration uses a shared synchronous validator and current Sessions state, followed by one settings write.

UX handoff: [design.md](design.md), [UX](../../docs/ux/unified-host-cli.md). No renderer changes planned; existing approval cards are reused. Coverage and acceptance: [matrix](../../docs/cli-coverage.md). Required gates: typecheck, lint, unit/integration, isolated real transport, build, independent review. No real account/provider/remote configuration changes are authorized for verification.
