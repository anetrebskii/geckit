# Research

Decision: use official Chrome DevTools MCP autoConnect. Rationale: documented Codex support and browser-managed consent; no public app-server method issues ChatGPT Desktop's host-bound identity. Claude uses its separate `--chrome` path. Alternatives: copying browser keys or bypassing peer checks rejected; native Chrome prohibited; attaching to another process's debugger URL rejected.

Decision: copy published package unchanged at build rather than rebundle. Research agent confirmed import-relative workers, descriptions and assets require directory fidelity. The package is self-contained, has no runtime native modules, and supports current Node/Electron. Keep notices. Pin 1.12.0; disable runtime update checks/statistics/CrUX. ASAR tree must be unpacked for Node subprocesses.

Decision: use per-thread config, not global config edits. Supported start/resume/fork accepts config overrides. Service configures path before runtime starts; tests without service do not accidentally launch browser tools. Preserve existing user developer instructions when adding browser guidance. Text correction uses separate codexOptions and receives no browser config.

Sources: https://github.com/ChromeDevTools/chrome-devtools-mcp ; https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session ; https://learn.chatgpt.com/docs/chrome-extension#troubleshooting ; https://learn.chatgpt.com/docs/app-server ; https://code.claude.com/docs/en/chrome . Live target read remains separate from protocol/schema evidence.
