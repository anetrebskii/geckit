# Create and configure an employee

## Select the employee

Use `{{said}} employees list` and `employees show <employee-id>` to check names, roles and archived state. A name match alone does not establish the intended employee. Ask when several match; never restore an archived employee without a request.

Resolve the requested name, responsibilities and work boundaries from the conversation. Ask for a missing name or an unclear responsibility before creating. Portrait and role text are optional CLI fields; leave an unspecified portrait to GeckIt. Portrait numbers are 1 through 12.

## Write the instructions

The role is a job title. The description contains the employee's working instructions: purpose, responsibilities, sources to consult, expected deliverables and completion checks. Write them in the person's requested language. Preserve existing instructions when adding a responsibility. Exclude credentials, invented access and promises of capabilities the selected provider lacks.

An employee does not have a provider, model, project, account or independent permission setting. Those belong to a conversation or saved shortcut. Creating an employee neither starts a task nor creates a schedule. History comes from conversations currently assigned to the employee; do not copy transcripts into the description.

## Save through the supported interface

Read `{{said}} help` or Manager capabilities for this target's supported forms. In a shell, use a UTF-8 file for multiline instructions:

```sh
{{said}} employees create --name "Maya" --role "QA Engineer" --description-file /tmp/maya-instructions.txt --avatar 4
{{said}} employees show <returned-employee-id>
{{said}} employees edit <employee-id> --description-file /tmp/maya-instructions.txt
```

Create the file from the agreed responsibilities before running the example. Omit `--avatar` when no portrait was chosen. Pass only requested changes to Edit; its description replaces the saved description.

Authenticated Manager uses its advertised `geckit` JSON action interface, without a shell. Pass multiline text as one `--description` argument; a local `--description-file` is a shell CLI convenience. Preserve newlines through the JSON serializer. Never unset session identity to bypass an Allow card.

Creation, editing, archiving, restoration and assignment from a conversation wait for the person's bound Allow decision. A pending card is not a saved employee. On refusal, stop that action. On an uncertain result, inspect the catalog before retrying so a successful creation is not duplicated.

## Configure work only when requested

To assign an existing conversation, use `{{said}} employees assign <session-id> <employee-id>` and inspect `employees tasks <employee-id>`. Assignment does not send a message or start work. Use `none` to remove an assignment only when requested.

For requested shortcuts or recurring work, load `{{scheduleSkill}}` from {{schedulePath}}. Inspect existing shortcuts first. Configure project, prompt, provider and model there; do not invent a timetable or run a shortcut merely to test saving.

## Verify

Read `employees show <employee-id>` after saving. Compare name, role, full description, portrait and archived state with the request. Inspect tasks and shortcuts separately when those changed. Report saved configuration, pending approvals and actual execution as separate results; disclose unavailable readback.
