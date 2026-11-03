# Browser integration contract

The service supplies `mcp_servers.geckit-chrome` through app-server thread config: command is the current service's executable, args name the copied MCP entry followed by `--autoConnect --no-usage-statistics --no-performance-crux`. Environment supplies `ELECTRON_RUN_AS_NODE=1` and `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`. Chrome connection is lazy and browser consent remains required. Startup may initialize tool inventory without opening Chrome. No public HTTP/API contract changes. User Codex config and unrelated MCP entries remain unchanged.
