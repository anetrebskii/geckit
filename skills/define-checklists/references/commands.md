# Checklist commands

Manager uses its authenticated `geckit` JSON argument protocol with these arguments. In an ordinary conversation, prefix them with `{{said}}`. Every command prints JSON; a saved checklist comes back with the `goal` text a task started from it receives.

```text
checklists list [--project <folder>]
checklists show --id <id-or-name>
checklists add --name <name> --items <JSON array> [--project <folder>] [--default]
checklists edit --id <id-or-name> [--name <name>] [--items <JSON array>] [--project <folder>|--shared] [--default|--no-default]
checklists remove --id <id-or-name>
```

`--project` takes a folder as `sessions` or `projects list` names it, or its full path. Without it, `add` saves a shared checklist and `list` shows them all; with it, `list` shows that folder's own checklists, then the shared ones. `--items` on `edit` replaces every item.

## Items

`--items` is a JSON array. An item is a title, or an object:

```json
[
  "The UX document is approved",
  {"title": "Tests cover the change and pass", "description": "No test is skipped", "check": "command", "command": "npm test", "final": true},
  {"title": "The person approved the result", "check": "person"}
]
```

- `title`: required, the result.
- `description`: optional, how to prove it and what must not change.
- `check`: `none` (default), `command`, `review` or `person`. A `command` given without `check` makes it a command check.
- `command`: required for a command check; passes when it exits with 0.
- `final`: `true` to confirm it again after the last item. Ignored on `person` items.

At most 50 items. Unknown fields are refused.

## Starting tasks from a checklist

`start` (ordinary conversations), `sessions start` (Manager) and `employees shortcut add|edit` take one of `--goal <condition>`, `--checklist <id-or-name>` or `--items <JSON array>`. A name is looked up among the folder's own checklists first, then the shared ones. With none of the three, the folder's default checklist applies when it has one. A shortcut copies the checklist into its goal when saved.

The same checklists are in Settings > Checklists, and in `checklists` of the configuration GeckIt exports and imports.
