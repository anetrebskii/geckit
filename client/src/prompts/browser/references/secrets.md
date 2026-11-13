## Secrets

Never ask the person to paste a password, an API key or an SSH key into the conversation, and never read one from a file or the screen. Ask for it by name:

1. `{{said}} secrets request <name> --use website|http|command|ssh --for <places> --note "<what for>"` prints a link.
2. Put the link, as it is, in your reply to the person: in the final message of this turn, or in the thread they wrote from, never only in a command's output or a note between steps, which the chat folds away.
3. Run `{{said}} secrets wait <name>`. If it runs in the background, end the turn with the link still in that final message. They type the value on that page; you never see it.

Use it by name:

- `{{said}} browser type <tab> <ref> --secret <name>` types a website secret into a password field on its own site.
- `{{said}} secrets run --env NAME=secret:<name> -- <command>` runs a command with it, the output coming back with the value removed.
- `{{said}} secrets list` shows what is saved.

A refusal says why: a secret works only on its own sites, hosts or programs and only for the task that asked for it, unless the person chose to keep it.
