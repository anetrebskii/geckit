## Asking GeckIt about the work itself

`{{said}}` answers about the conversations, and is the way to find out what was done today rather than reading Claude Code's own files. Everything but `start` only reads.

```
{{said}} sessions --today
{{said}} sessions --since 2d --project formula-business --status review
{{said}} sessions --today --json
{{said}} sessions --favorites
{{said}} show <id>
{{said}} show <id> --last 10
```

`sessions` prints one line each, newest first: a \* for a favorite, the id, when it last changed, the project, how it stands - in progress, review, blocked, done or archived - and the title. `--today` and `--since` also count one moved between columns in that time, and `--favorites` keeps only the favorites. `show` prints when it was created and each time it moved to another column, then what was said in it, the person and Claude, without what the tools printed. `--json` gives the same for reading with a program, with that history in `history` and `favorite` true or false.

{{otherComputers}}

## Building GeckIt or a provider library

When asked to create or change a provider, run `{{said}} instructions providers` for the contract, example, build and verification instructions. For GeckIt itself, run `{{said}} instructions app`. These commands only read and work with the installed CLI.

## Other conversations

### Asking for new ones

A conversation does the one job it was asked for. Other work that turns up goes to a conversation of its own, started through GeckIt, so this one can finish and the person sees each job as its own card.

Start one when:

- the person asks for work in another project, or asks to split a job into parts;
- you find something worth doing that is not part of what was asked here: a bug beside the one being fixed, a test failing in code nobody touched, a follow-up the change will need later;
- a part of the job can go on without this conversation, and doing it here would hold this one open.

Do not do that work here, and do not only mention it at the end of an answer: a mention is lost once the card moves to Done. You need no leave to send it, since every one asked for is put in front of the person first and they start it or refuse it there. Where you cannot tell whether they want the work at all, ask in your answer and send it once they say yes. Do not send the job you are doing, or a step of it you are about to take yourself. A task, a to-do or a reminder the person asks you to write down is not a conversation either: it goes where their own instructions say such things are kept, and never through this command.

{{send}}

{{exactForm}}For one short conversation, `{{said}} start --project <name> [--title <title>] [--goal <condition>] <text>` does the same, as long as the text has no quotes, `$`, `;` or `&` in it.

- `project` is the folder's name as `sessions` prints it. At most 20 at once.
- `title` is what the person reads on the card to decide, so say the work in a few words.
- `text` is all the new conversation is given, and it knows nothing of this one. Write what to do, where - files, commands, links -, what you already found, and how to tell it is done.
- `goal` is optional. Give it when being done can be checked, such as tests passing or a page loading.

The command prints one line per conversation in the order sent - started or queued with its id, or refused - with the person's note on one if there is one, and their reply to you last. A note on a started one was also given to that conversation. A queued one is a conversation already, whose first message waits until fewer of the person's conversations are working. A refusal is an answer: do not send the same thing again, and follow the reply. Then say in your answer what you sent and how it stands.

### Reading linked ones

A conversation started this way remembers the one that asked for it.

```
{{said}} linked
{{said}} show <id> --last 10
```

`linked` lists, for this conversation, the one it was started from, the ones it started and how each stands, and what it asked for and was refused. `show --last` reads the end of any of them. Look there before starting on anything a linked conversation may already have done or decided, and before telling the person how the work you asked for stands.
