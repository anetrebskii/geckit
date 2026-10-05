# Phone Agent VPN contract

The sealed phone transport exposes only `agentVpn.view` returning existing `AgentVpnView`, and `vpn:changed` events with that same non-secret metadata. The view contains saved profile identifiers/names/compatibility, selection and unavailable runtime/storage state. It contains no raw configuration, tunnel keys, endpoint commands, paths or executable hooks.

Phone `window.geckit.agentVpn.view()` performs a live read with no persisted view. `onView()` subscribes to metadata updates. Existing import/select/rename/remove/check methods reject locally without sending a host request; those calls must not appear in the host allowlist.

Phone-local connection state invalidates the visible VPN view on loss and triggers a fresh read on reconnection. Stale old-link events or reads must not restore a live-looking view. A computer lacking the new view call reports unknown status. App foreground or manual Refresh performs another read; no polling, routing operation or reconnect claim is added.

Computed `required` and `blocked` flags arrive in the same view. They determine the Host VPN required label and blocked explanation. Phone agent requests are subject to the same main-process admission checks; desktop configuration mutation methods remain unavailable on phone. Refresh is a status read, never tunnel reconnect.
