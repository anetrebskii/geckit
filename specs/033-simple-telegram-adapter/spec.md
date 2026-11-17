# Specification: simple optional Telegram adapter

Confirmed scope: shared forum topic AND isolated personal chats for admitted teammates. Replace the panel prototype with a separately installable library in this repository. No application-core patch, separate panel or testing-repository QA changes. Configuration is private JSON using the existing channel configFile field. Technical choices require no further user clarification.

Acceptance: separate Manager threads and reply destinations; enforced native tool ownership; bounded durable intake before offset acknowledgement; no blind replay after uncertain effects; generation and authorization checks on outgoing work; scoped files and approval callbacks; configurable optional admission concurrency; offline fake Telegram and provider verification.

Non-goals: OS/project sandboxes, core worker scheduler changes, live migration, installation, deployment, commits or publication. See adapter README for exact restrictions and capacities.
