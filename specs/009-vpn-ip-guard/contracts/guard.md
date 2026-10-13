# Guard contract

Settings adds vpnIpCheck:boolean and vpnAllowedIps:readonly string[]; existing broadcasts reach desktop/phone. parseVpnIps(text:string) returns {ips:readonly string[],error?:string}; canonicalPublicIp(address:string) returns string|undefined.

checkVpnIp(settings:()=>Pick<Settings,'vpnIpCheck'|'vpnAllowedIps'>, dependencies?:Partial<VpnIpDependencies>):Promise<void>. Disabled means no probe. Enabled failure rejects with exact UX explanation. Dependencies: families():readonly (4|6)[] and probe(family:4|6,signal:AbortSignal):Promise<string>. No successful result cache. Shared constants own error text.

SessionsDeps optional beforeSend:()=>Promise<void>|void keeps tests deterministic and old guard-off timing intact. Production returns synchronous void when disabled and supplies checkVpnIp(getSettings) when enabled. Disabled mode emits no IP checking status. Gate before content-transmitting provider create/resume/fork and dispatch. ChatSession checkingIp/heldSend markers and chat.retry(id):Promise<string|undefined> reach shared API/preload/phone routing. SessionMessage.submission identifies a local provisional new conversation for cancellation before provider creation. Phone keeps actual error explanation. Cancellation/denial remain available while blocked.

Periodic monitor is optional in SessionsDeps; its policy callback identifies the current enabled rule or returns undefined when vpnIpCheck is off. It shares one ten-second active-work timer/check, discards obsolete results and calls retained stop/hold handling on failure. Settings and dispose reconcile/invalidate the monitor. Successful periodic results never satisfy beforeSend. Provider native-goal pause is a control-only operation without a model turn.
