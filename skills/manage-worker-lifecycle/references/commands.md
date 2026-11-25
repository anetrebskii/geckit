# Manager command protocol

Use the authenticated Manager host protocol, not a shell. Emit a `geckit` fence with a unique stable operation ID and argument array, then wait for its receipt. Reconcile an uncertain operation using its original ID; do not replay mutations with new IDs.

```geckit
{"id":"inspect-workers-1","args":["sessions","list","--managed"]}
```

Check `capabilities` first. Commands below are Manager arguments; ordinary conversation CLI commands have different flags and authority.

An employee can run several tasks in parallel. Each task has its own GeckIt chat and card. At most one Manager thread tracks each task.

| Need | Arguments |
| --- | --- |
| Find candidates | `sessions list` or `sessions list --managed` |
| Read candidate | `sessions show --id <full-id> --last 30` |
| Inspect employees | `employees list`, then `employees show <employee-id>` if advertised |
| Inspect projects/providers | `projects list`, `providers list`, `providers models --provider <provider-id>` |
| Find checklists | `checklists list --project <project>` |
| Assign new work | `sessions start --project <project> --text <assignment> --goal <condition> --employee <active-id>` |
| Change a worker's employee | `sessions assign --id <managed-worker-id> --employee <active-id\|none>` |
| Tag a worker when the user asks | `sessions tag --id <managed-worker-id> --add <tag name>` or `--remove <tag name>` |
| Assign with a checklist | `sessions start --project <project> --text <assignment> --checklist <id-or-name>` or `--items <JSON array>` in place of `--goal` |
| Change a running task's checklist | `sessions checklist --id <full-id> --items <JSON array>` |
| Continue same outcome | `sessions send --id <full-id> --text <next-step>` |
| Correct active work | `sessions steer --id <full-id> --text <correction>` |
| Retry held operation | `sessions retry --id <full-id>` |
| Mark verified result | `sessions mark --id <full-id> --status done` |
| Record blocked work | `sessions mark --id <full-id> --status blocked` |
| Cancel but keep history | `sessions mark --id <full-id> --status archived` |

Give exactly one of `--goal`, `--checklist` or `--items`; with none, the folder's default checklist applies, and start fails when there is no default. `--items` is a JSON array of titles or `{"title", "description", "check": "none|command|review|person", "command", "final"}`; each item is a result reached in order. The returned `goal` is the goal the worker received first; a checklist sets each next item as its goal in turn. `sessions list` gives each task's `checklist` progress (`passed`, `all`, `current`, `waitsForPerson`, `done`) and `sessions show` its items with `state` (`open`, `passed`, `approval`). `sessions checklist` replaces the task's own copy; an item with unchanged title and check keeps its state, the saved checklist is untouched, and only the person approves `person` items. Omit `--employee` for unassigned work. Add an enabled `--provider` and available `--model` only when chosen under the provider rules. Supply a self-contained prompt even when assigning an employee; the employee recovers their own prior context.

Manager's list has no `--status`, `--since` or text-search flag. Select candidate rows from the returned status and context; inspect likely completed tasks rather than assuming a title proves continuity. Show is bounded to the latest 1-30 items. Recover missing original requirements before judging Done.

Read current `state`, `status`, `delivery`, `tasks`, `queued`, `canInject` and `observedAt` when returned. Their timestamps describe observation, not guaranteed causal completion. Accepted, queued and steered are different delivery stages; none proves the requested outcome.

In shared and scheduled result threads, use `employees list` to match an active employee by name and role. Pass the returned ID when starting or reassigning a worker. An existing worker must belong to the current Manager thread for mutations. Reassignment saves the employee on the worker without sending a new turn. Attach or follow only when capabilities advertises the command and the person asks for it. A worker tracked by another thread requires a handoff.

For a remote target, use its stable `--host` ID, check that target's capabilities first and keep it on subsequent operations. Never fall back to local state after a remote failure. Keep native provider permissions and channel approval rules.
