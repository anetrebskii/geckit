# Validation

Run `npm ci`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` in client. Inspect `out/service/browser` for package entry, workers and licenses. Run its MCP initialize/tools/list directly with Node and PATH without npm/npx. Desktop package must unpack that same resource outside ASAR.

For real integration use a separate app-server connection with the built service's per-thread MCP settings. Chrome 144+ must run on that machine. Enable remote debugging at chrome://inspect/#remote-debugging and accept Chrome's Allow prompt. List pages, match the authorized URL, then call take_snapshot with explicit pageId without bringing the tab forward. Record the observed URL/pageId and a small non-sensitive excerpt. Do not publish, switch profiles or use native Chrome. Verify missing-debugging error separately if encountered. Tool inventory alone is not an acceptance pass. Do not restart active GeckIt conversations for validation.
