# Research
- Decision: reuse `chat.account(provider)` and `onAccount` instead of new backend protocol. Both desktop and phone already support these calls.
- Decision: account state belongs to each provider. Current `useChat` stores only selected account; shared overview must fetch others and reject stale/mismatched responses.
- Decision: preserve `accountsOf`, `placesOf`, `usageOf` for Claude SSH plans instead of flattening them into local quotas.
- Alternatives: expanded footer consumes conversation space; rotating providers obscures identity; selected-only status fails the request.
