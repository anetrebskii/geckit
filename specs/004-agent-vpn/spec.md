# Feature Specification: Built-in agent VPN connection

**Feature Branch**: Existing main checkout; no feature branch created

**Created**: 2026-10-04

**Status**: Implementation requested - configuration is independent of the native enforcement gate

**Input**: User description: "Can I make agent works only through VPN? Independently from my PC configuration ... just some sites requires changes VPn ... I would like built in in GeckIt." Follow-ups: "Amnezia VPN", "self-hosted", "AmneziaWG", "Everything. Agents should not aware or anyhow figure out that it's VPN."

## User Scenarios & Testing

### User Story 1 - Keep the agent on a dedicated connection (Priority: P1)

A person imports a connection to their self-hosted AmneziaWG server inside GeckIt. All network traffic from local agents and their tools keeps using that connection when the person switches their computer's VPN for browsing. Agents use normal network APIs without VPN configuration or instructions. Existing local projects, native tools, and subscriptions remain usable.

**Why this priority**: This is the requested separation between AI-provider connectivity and everyday browsing.

**Independent Test**: Configure a controlled gateway; exercise provider requests, direct TCP/UDP, DNS, and an agent browser; switch the computer's browsing VPN; and verify that every covered request still leaves through the configured gateway or waits if that gateway becomes unreachable.

**Acceptance Scenarios**:

1. **Given** a configured and enabled dedicated connection, **When** a local supported assistant sends a provider request, **Then** that request uses the dedicated connection.
2. **Given** an enabled dedicated connection, **When** the person changes the computer's VPN, **Then** provider requests continue to use the configured gateway or fail closed; they never switch to the computer's direct exit.
3. **Given** the person has not enabled the feature, **When** they start a conversation, **Then** existing connection behavior applies.
4. **Given** a supported assistant uses an existing subscription, **When** the feature is enabled, **Then** that subscription remains the authentication and billing mechanism.
5. **Given** an enabled dedicated connection, **When** an agent launches commands, subprocesses, or its dedicated browser, **Then** their network traffic uses the same enforced connection even if they ignore proxy settings or try to connect directly.
6. **Given** an enabled dedicated connection, **When** an agent inspects its prompt, environment, workspace, or launch arguments, **Then** none contains VPN setup instructions, proxy settings injected by GeckIt, or tunnel secrets. This does not guarantee that public network observations cannot reveal VPN use.

### User Story 2 - Stop requests when the connection fails (Priority: P1)

A person can leave the dedicated connection enabled knowing that GeckIt will not silently bypass it after a failure.

**Why this priority**: A fallback would defeat the requested behavior precisely when the computer's VPN is changing.

**Independent Test**: Disconnect the configured gateway during a conversation and observe both the user-visible failure and the absence of direct provider connections.

**Acceptance Scenarios**:

1. **Given** the dedicated connection is enabled but unavailable, **When** the person sends a message, **Then** GeckIt preserves the message and explains that the connection must recover before it can be sent.
2. **Given** a provider request is active, **When** the dedicated connection fails, **Then** the request stops or retries through the same connection without direct fallback or duplicate message submission.
3. **Given** an interrupted connection, **When** the gateway recovers, **Then** the person can retry or continue the existing conversation without losing its history.
4. **Given** an enabled dedicated connection, **When** its configuration is removed or unreadable, **Then** provider requests remain blocked until the person repairs the configuration or explicitly disables the feature.
5. **Given** the enforcement service crashes while an agent remains running, **When** any covered process tries to connect, **Then** traffic remains blocked; protection must not depend on GeckIt noticing the crash after traffic has already escaped.

### User Story 3 - Configure and understand the connection (Priority: P2)

A person adds their connection in Settings, checks whether it works, and can see whether local assistants are covered.

**Why this priority**: Built-in configuration is necessary to avoid manually managing launch commands or changing the computer's network settings.

**Independent Test**: Configure, test, enable, restart GeckIt, inspect status, and explicitly disable the connection from Settings.

**Acceptance Scenarios**:

1. **Given** no saved connection, **When** the person opens its settings, **Then** GeckIt explains what connection information is needed and how to supply it.
2. **Given** invalid connection information, **When** the person tests it, **Then** GeckIt identifies the problem without displaying credentials or keys in the error.
3. **Given** a successfully configured connection, **When** GeckIt restarts, **Then** the configuration and enabled state are retained and connection enforcement applies before any covered provider request.
4. **Given** a connection is enabled, **When** the person views Settings, **Then** they can distinguish connecting, connected, unavailable, and disabled states and see which assistants are covered.

### User Story 4 - Choose between saved servers (Priority: P2)

A person imports several self-hosted AmneziaWG servers, gives each a name, and selects the server agents should use. Choosing another server must never silently switch to the computer's direct exit or claim the new server is active before enforcement and transport are ready.

**Independent Test**: Import two different native configurations, rename both, switch selection, restart, and verify saved selection. With routing enabled, switch while idle and while busy, interrupt the new gateway, and verify no direct escape or duplicate message submission.

**Acceptance Scenarios**:

1. **Given** multiple saved servers, **When** the person selects another, **Then** the selected server persists and the UI distinguishes selection from an active connection.
2. **Given** active protected agents, **When** a switch requires restarting them, **Then** the person can apply when agents finish or cancel; GeckIt does not silently interrupt them.
3. **Given** a failed switch, **When** the new gateway cannot connect, **Then** protection remains required and network access blocked, with no automatic gateway substitution.
4. **Given** an invalid import or unreadable secure store, **When** another server is added, **Then** previous saved servers and selection remain unchanged and the error contains no private configuration.

### Edge Cases

- The computer's VPN blocks or interrupts transport to the configured gateway.
- A local assistant process was started before the dedicated connection was enabled.
- The Claude tmux plugin connects to an already-running default tmux server outside the protected boundary. A unique tmux session name does not create a separately protected server.
- Codex is already running outside GeckIt and exposes a local control connection.
- Authentication renewal, account checks, usage checks, model listing, and text correction contact a provider outside a conversation turn.
- A provider library makes its own network requests rather than launching a supported builtin assistant.
- A conversation runs on an SSH host whose network is separate from this computer's network.
- IPv6, provider name resolution, or an inherited proxy exception bypasses the intended connection.
- The computer sleeps, changes Wi-Fi, or goes offline while a request is active.
- The configured gateway changes its public exit address despite retaining the same gateway endpoint.
- Credentials cannot be securely retained on a supported operating system.
- An assistant opens a separate browser for sign-in or site interaction.
- An agent delegates a network action to an existing shared browser, system resolver, SSH host, or external connector.
- An agent creates detached processes, uses custom DNS, changes proxy variables, or attempts to change routes without elevated privileges.
- A person explicitly grants an agent administrator access; this lies outside the protection boundary of an ordinary unprivileged agent.

## Requirements

### Functional Requirements

- **FR-001**: GeckIt MUST let a person configure, test, enable, and explicitly disable a dedicated connection from its desktop settings.
- **FR-002**: Connection configuration MUST support an AmneziaWG native `.conf` export from the person's Amnezia Self-hosted server through a compatible built-in engine. Setup MUST explain how to create a separate connection identity for GeckIt.
- **FR-003**: When enabled, all provider requests from supported local builtin assistants MUST use the dedicated connection, including conversation requests, account refresh, usage, model listing, and text correction where applicable.
- **FR-004**: Coverage MUST include all network traffic initiated by protected agents, their commands, descendants including detached descendants, helpers, and dedicated browsers: direct TCP, UDP, DNS, IPv4, and IPv6 where enabled. Protection MUST NOT depend on those programs honoring proxy variables or VPN instructions.
- **FR-005**: Changing the computer's VPN MUST NOT change the configured gateway used for covered requests. If the gateway becomes unreachable, covered requests MUST fail closed.
- **FR-006**: An enabled connection MUST NOT fall back to direct provider connectivity after startup failure, gateway failure, invalid configuration, or interrupted transport.
- **FR-007**: Enforcement MUST apply before any covered process can make its first request. An already-running assistant or browser MUST NOT be reused unless its connection coverage can be established.
- **FR-008**: GeckIt MUST explain connection failure without losing the person's message or conversation history. Recovery MUST NOT submit the same message twice.
- **FR-009**: Connection settings and status MUST persist consistently across the desktop windows. Secret connection information MUST NOT be stored in the ordinary settings file or included in logs, analytics, error reports, or command arguments.
- **FR-010**: The person MUST be able to see the connection's enabled state, availability, and assistant coverage. Unsupported assistants MUST NOT appear protected; local assistants that cannot enforce the selected connection MUST be blocked while coverage is required.
- **FR-011**: Enabling or changing the dedicated connection MUST NOT silently interrupt active conversations. GeckIt MUST explain any restart or pause required to apply the change before confirming that coverage is active.
- **FR-012**: Existing AI subscriptions MUST remain usable without adding provider API keys or changing provider service addresses.
- **FR-013**: Provider name resolution, IPv6, and connection exceptions MUST NOT create a direct fallback for covered provider requests.
- **FR-014**: The feature MUST use consistent language on macOS, Windows, and Linux and explicitly report unsupported configurations rather than claiming coverage.
- **FR-015**: Local tunnel coverage MUST NOT be presented as protecting remote SSH agents or network actions delegated outside the protected execution boundary. When VPN-only operation is required, uncovered remote agents and delegated network tools MUST be blocked until equivalent coverage exists at their execution location.
- **FR-016**: GeckIt MUST explain that gateway selection does not guarantee a permanent public IP address. The selected gateway determines its own exit address, and the person's computer still needs connectivity to reach it.
- **FR-017**: Import MUST validate the Amnezia protocol and configuration version. An unsupported configuration MUST be rejected explicitly; AmneziaWG-specific connection parameters MUST NOT be silently discarded or treated as ordinary WireGuard settings.
- **FR-018**: GeckIt MUST manage tunnel configuration, credentials, and lifecycle outside the agent's accessible configuration. It MUST NOT inject VPN instructions into prompts, require agent-side VPN setup, or supply proxy environment variables as its routing mechanism.
- **FR-019**: An unprivileged protected agent MUST NOT be able to disable routing enforcement, obtain tunnel secrets, or establish a direct network fallback by changing its environment, using another network library, or creating subprocesses. Protection against an agent explicitly granted administrator control of the computer is outside scope.
- **FR-020**: A platform MUST NOT offer an enabled or connected state until all-traffic enforcement is supported and established. Unsupported platforms MUST report that limitation and block protected launches. A connected tunnel alone is not evidence of enforcement.
- **FR-021**: Existing native local development tools MUST remain available. Moving execution into a different operating system or virtual machine requires an explicit scope decision rather than being introduced as a silent substitute.

- **FR-022**: GeckIt MUST support multiple saved AmneziaWG server profiles with import, rename, selection, and removal. Profile configuration MUST be encrypted separately from ordinary settings and never sent to renderer windows or the phone.
- **FR-023**: The selected server MUST persist across restarts. The interface MUST distinguish a saved selection from an active protected connection.
- **FR-024**: Server switching MUST retain enforcement throughout the transition, use the FR-011 safe boundary for active agents, and never automatically choose another server after a failure.
- **FR-025**: If a platform's native enforcement gate is unavailable, configuration and selection MAY be saved, but Connect MUST be unavailable. The UI MUST distinguish FR-029 application admission from native packet enforcement: saved servers block new work through GeckIt but do not establish tunnel routing or a running-tool internet kill switch. No protection claim may be made.
- **FR-026**: Configuration setup MUST show visible AmneziaWG native export and import instructions and distinguish saved profiles from connectivity. The rejected export/import demonstration MUST remain removed. Agent VPN MUST explain its purpose and illustrate intended agents-to-VPN-to-internet routing and blocked internet when VPN disconnects, using the SSH-host visual language. Motion MUST be finite, pauseable, reduced-motion compatible, paused when hidden/offscreen and independent of real state/configuration changes. It MUST label the illustration as intended behavior and keep actual unavailable native routing explicit.
- **FR-027**: Desktop Chat MUST show a labelled agent VPN status in its bottom bar across providers and open Agent VPN settings directly from it. Read failures MUST remain unknown rather than claim protection. Unavailable routing MUST remain explicit; Connect/Reconnect MUST require existing native enforcement gates. Saved selection MUST NOT appear connected.
- **FR-028**: The mobile app must display the paired computer's agent VPN status in a touch-sized bottom control and expose its phone-sized status settings from that control and Settings > Host. It must distinguish loading, unknown and host-offline states, send only non-secret view metadata, and keep configuration mutations computer-only. Native routing and reconnect gates remain unchanged.
- **FR-029**: Saved VPN configuration MUST require a verified connection before agent/provider work started through GeckIt, including phone-started requests and SSH handoffs. Remote execution MUST NOT bypass admission or be described as routed through the local VPN. No tunnel, unreadable retained configuration or uncertain readiness MUST reject dispatch without losing queued messages. Application admission MUST NOT be described as packet-level isolation. Reconnect MUST operate and verify a real tunnel while native blocking remains in force.
- **FR-030**: On qualified native macOS builds, GeckIt MUST ship its developer-signed, provisioned and notarized VPN component and manage installation, activation, configuration, startup connection and same-server recovery itself. End users MUST NOT create Apple Developer accounts, certificates, App IDs or provisioning profiles, run build commands, or provide developer credentials. GeckIt MUST explain and guide actual macOS approvals without approving them on the user's behalf. Missing/revoked approval, setup failure and cancelled setup MUST preserve required blocking. Automatic recovery MUST NOT change the selected server, disable protection or replay an uncertain provider submission.

### Feasibility Boundary

The user requested that an agent could not discover VPN use at all. No implementation can guarantee that against an agent with unrestricted network and system inspection. Transparent routing means no agent-side VPN setup, inaccessible tunnel management and keys while protected, and no unprivileged bypass. Public IP or system observations can still reveal VPN use. Alex subsequently requested implementation and server switching. Implement the practical transparent interpretation; do not claim absolute undetectability. Do not report the literal undetectability requirement as achieved.

### Key Entities

- **Dedicated connection**: The person's chosen gateway, non-secret connection preferences, and explicit enabled state.
- **Connection secret**: Credentials or private keys retained separately from normal settings.
- **Connection status**: Availability, failure explanation, and coverage for supported assistants.
- **Assistant coverage**: Whether a local builtin assistant, provider library, or remote conversation uses the selected connection.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In ten consecutive computer VPN changes against a controlled gateway, every observed covered provider request uses that gateway; zero requests leave directly.
- **SC-002**: In startup, mid-request, and recovery gateway-failure scenarios, zero covered provider requests use a direct fallback.
- **SC-003**: After restarting GeckIt with the dedicated connection enabled, zero covered provider requests occur before connection enforcement is established.
- **SC-004**: A person with valid connection information can configure and test it entirely within GeckIt without modifying computer-wide VPN settings or agent launch commands.
- **SC-005**: Each supported builtin assistant completes a conversation and its applicable account, usage, model-listing, and correction operations through the dedicated connection.
- **SC-006**: Connection failure and recovery preserve the pending message and existing history and cause zero duplicate message submissions in the acceptance scenarios.
- **SC-007**: Direct TCP/UDP, IPv4/IPv6, system/custom DNS, detached descendants, and dedicated browser requests pass the routing and failure tests with zero direct escape; uncovered delegated tools are blocked before use.
- **SC-008**: Inspection of agent-visible prompts, launch arguments, injected environment, and accessible configuration finds zero tunnel secrets, VPN setup instructions, or GeckIt proxy settings.

## Assumptions

- The person supplies an existing Amnezia Self-hosted connection; selling VPN access is outside this feature.
- Local Codex and Claude Code, including the Claude tmux plugin, are coverage targets. tmux requires its own protected server/socket, descendant coverage, and a bounded hook-control connection; its inherited account/models/limits/browser operations must also be covered. Provider libraries need explicit coverage capability rather than an assumed guarantee.
- The requested separation preserves local project access and does not require moving the agent to a remote computer.
- Independent configuration means selecting and enforcing a separate gateway. It cannot make a local agent independent of physical connectivity or prevent another computer-wide VPN from blocking transport to that gateway.
- The first version manages its connection from desktop Settings. Conversations started from the paired phone use the desktop's applicable connection policy.
- Separate sign-in and automation browsers must use a dedicated protected process. An existing shared browser cannot be assumed protected because an agent controls one of its tabs.
- The selected import flow uses a dedicated AmneziaWG connection identity. Two simultaneously running clients must not reuse one identity.
- Transparent operation means ordinary networking with host-owned tunnel management. Absolute undetectability is not a deliverable guarantee: an agent with unrestricted network and system inspection can infer VPN use from public IP addresses, installed networking components, or other observations. Alex's implementation request authorizes the practical interpretation; absolute undetectability remains a feasibility limitation, not an implemented promise.
