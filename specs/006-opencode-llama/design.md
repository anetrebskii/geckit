# Design: OpenCode + Ollama library

**Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)
**Status**: Implementation authorized by the user's request.

## Scope
US1/US2 use existing library installation, independent assistant switch, model picker, transcript, permission/question cards and board actions on desktop and phone. There are no new renderer components, layout, CSS or control behaviors.

## Artifacts
- UX: [OpenCode + Ollama](../../docs/ux/opencode-llama.md).
- Existing library UX: [Provider libraries](../../docs/ux/provider-libraries.md).
- Existing model states: [Model details](../../docs/ux/provider-model-details.md).
- Prototype: existing [Library update design](../../docs/design/provider-library-updates.md); no layout change requires a new prototype.

## Decisions
Name is "OpenCode + Ollama", short name "Ollama". All available Ollama text models are selectable, regardless of family. Default uses the native Ollama default or the first available Ollama model; explicit selections never silently fall back. Local model access needs no sign-in. Tools ask permission; Plan uses OpenCode's plan agent. Unsupported automatic safety review is reported as unavailable. Native goals, images, SSH execution and browser selection remain unsupported.

## Requirement Coverage
| Requirement | Decision | Validation |
| --- | --- | --- |
| FR-001/002/007 | Existing installation and model selection | Manifest and catalog tests; setup README |
| FR-003/004 | Existing transcript/cards and Stop | Stream, approval, question, error and lifecycle tests |
| FR-005 | Existing board/history | Namespace, folder scope, fork and restart tests |
| FR-006 | Existing correction; optional instructions | Correction and instruction tests |

## Review Evidence
No renderer code is changed. Native OpenCode 1.18.35 mock-model streaming, read-tool approval and history verification pass; see [verification.md](verification.md). Native full-screen visual review of an installed library is unavailable because OpenCode is not installed and the library has no public installation URL yet. Light/dark desktop/phone, keyboard/focus, scrolling and adjacent UI remain unverified for the installed library; existing controls are reused. Do not claim native visual or Llama inference verification from deterministic tests.

## Open Decisions
None blocking implementation. Alex chose Ollama as the model provider. OpenCode 2 discovers models; OpenCode 1 uses configured Ollama models. The existing Model selector is the entry point.

## Planning Handoff
Keep host API v1 unchanged. No import/create-time side effects. Ship standalone index.mjs and sources. Use native persistence, loopback authenticated server, exact-once completion and deterministic tests. Do not modify other sessions' feature selector or checkout files.
