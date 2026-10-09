# Feature Specification: OpenCode + Ollama library

**Created**: 2026-10-09
**Status**: Implemented; updated for Ollama model selection
**Input**: "Can you implement plugin for open code + llama model?"

## User Scenarios & Testing

### User Story 1 - Work with Ollama (Priority: P1)
Choose OpenCode + Ollama as an independent assistant, select an available Ollama model, send a task and follow its text and tool activity.
**Independent Test**: Create a conversation, stream a reply, approve a tool and stop a second turn using a deterministic backend.
**Acceptance Scenarios**:
1. Given an available Ollama model, when a task is sent, then the selected model answers in the existing transcript.
2. Given a permission request, when the person allows or refuses it, then that answer reaches OpenCode.
3. Given a running task, when Stop is pressed, then work ends once and another message can be sent.

### User Story 2 - Continue conversations (Priority: P2)
Find, reopen, rename, fork and delete OpenCode conversations through the board.
**Independent Test**: Recreate the provider, read the same conversation and fork at a displayed message.
**Acceptance Scenarios**:
1. Given saved history, when the provider restarts, then the conversation and transcript remain readable under stable IDs.
2. Given a project, when its history is listed or searched, then conversations in other folders are excluded.

### Edge Cases
Missing OpenCode, no available Ollama model, backend failure, disconnected event stream, repeated completion events, Stop during startup, foreign IDs and remote roots must produce bounded failures without affecting other providers.

## Requirements

### Functional Requirements
- **FR-001**: Deliver an independent installable OpenCode + Ollama assistant with a prebuilt entry.
- **FR-002**: Show all available Ollama text models in the existing Model selector with reported capacities and prices; omit unknown quotas and capacities.
- **FR-003**: Stream user messages, assistant replies, reasoning and tool activity; handle approvals and questions.
- **FR-004**: Stop, end and dispose owned work once, including startup and transport failures.
- **FR-005**: Retain native history with stable namespaced IDs; implement folder-scoped listing, search, read, rename, fork and deletion.
- **FR-006**: Support text correction and optional GeckIt instructions; report unsupported native goals, remote control, images and browser selection accurately.
- **FR-007**: Document Ollama discovery in OpenCode 2 and configured Ollama models in OpenCode 1.

### Key Entities
Assistant identity, configured model, native conversation, transcript part, permission or question, owned server.

## Success Criteria
- **SC-001**: All scenarios pass without paid model calls.
- **SC-002**: Reopening a conversation preserves every supported transcript item and its identity.
- **SC-003**: Every completed, stopped or failed turn reports completion exactly once.
- **SC-004**: Installation requires no dependency installation or build on the user's computer.

## Assumptions
Native OpenCode 1 and 2 server protocols. Existing GeckIt library installation and assistant controls are reused. Ollama is the model provider; the library does not install models, alter credentials or select models from other providers. Source is published in the public MIT repository https://github.com/anetrebskii/geckit-opencode-llama, with a copy in examples/opencode-provider. Alex requested the standalone repository for Libraries.

## User correction - 2026-10-09
Alex requested OpenCode + Ollama, with available models returned by the plugin to the existing Model selector. This replaces the proposed library configuration form. Preserve installed-library and session IDs; exclude other providers and retain explicit selection errors when a model disappears.
