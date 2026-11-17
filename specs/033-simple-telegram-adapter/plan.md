# Implementation plan

1. Preserve the panel prototype and use an isolated branch/worktree from the verified source base.
2. Specify topic plus DMs; clarification resolved by the user's explicit DM requirement.
3. Read design handoff and public channel contract; select library API rather than core changes.
4. Implement strict file configuration, Telegram transport, transactional SQLite state and bounded intake.
5. Bind non-owner Manager threads, attachments, delivery and scoped approval callbacks.
6. Implement generation revocation, recovery without ambiguous retries, independent intake and optional active-conversation admission limits.
7. Verify fake Telegram behavior and real native Channels/Manager integration with a free test provider.
8. Review authorization and failure boundaries, document installation and unsupported isolation guarantees. No install, live sends, commits or publication.
