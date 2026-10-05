# Desktop Agent VPN contract

window.geckit.agentVpn: view(), import(), select(id), rename(id,name), remove(id), check(id), onView(callback). Each mutation returns a result containing the latest non-secret view and optional sanitized error. Import opens an OS picker and reads a bounded .conf in main. Raw config never crosses IPC. The renderer cannot submit config, a path, engine argv, endpoint commands or executable hooks.

vpn:view, vpn:import, vpn:select, vpn:rename, vpn:remove, vpn:check IPC channels and vpn:changed event. Use shared domain types re-exported through shared/api.ts. Configuration mutations are desktop-only; the read-only view and change metadata are exposed through the phone contract. Native unavailable means no Connect operation, no altered routes, no protected state.

The view now includes computed `required` and `blocked` flags. Successful configuration mutation updates main-process admission before broadcasting. No new Connect/Reconnect method exists until a native runtime can actually perform and verify the operation.
