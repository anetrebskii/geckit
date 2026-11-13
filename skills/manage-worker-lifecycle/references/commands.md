# Manager command protocol

Use the authenticated Manager host protocol, not a shell. Emit a `geckit` fence with a unique stable operation ID and argument array, then wait for its receipt. Reconcile an uncertain operation using its original ID; do not replay mutations with new IDs.

```geckit
{"id":"inspect-workers-1","args":["sessions","list","--managed"]}
```

Check `capabilities` first. Commands below are Manager arguments; ordinary conversation CLI commands have different flags and authority.

| Need | Arguments |
| --- | --- |
| Find candidates | `sessions list` or `sessions list --managed` |
| Read candidate | `sessions show --id <full-id> --last 30` |
| Inspect employees | `employees list`, then `employees show <employee-id>` |
| Inspect projects/providers | `projects list`, `providers list`, `providers models --provider <provider-id>` |
| Assign new work | `sessions start --project <project> --text <assignment> --goal <condition> --employee <active-id>` |
| Continue same outcome | `sessions send --id <full-id> --text <next-step>` |
| Correct active work | `sessions steer --id <full-id> --text <correction>` |
| Retry held operation | `sessions retry --id <full-id>` |
| Mark verified result | `sessions mark --id <full-id> --status done` |
| Record blocked work | `sessions mark --id <full-id> --status blocked` |
| Cancel but keep history | `sessions mark --id <full-id> --status archived` |

Omit `--employee` for unassigned work. Add an enabled `--provider` and available `--model` only when chosen under the provider rules. Supply a self-contained prompt even when assigning an employee; the employee recovers their own prior context.

Manager's list has no `--status`, `--since` or text-search flag. Select candidate rows from the returned status and context; inspect likely completed tasks rather than assuming a title proves continuity. Show is bounded to the latest 1-30 items. Recover missing original requirements before judging Done.

Read current `state`, `status`, `delivery`, `tasks`, `queued`, `canInject` and `observedAt` when returned. Their timestamps describe observation, not guaranteed causal completion. Accepted, queued and steered are different delivery stages; none proves the requested outcome.

An existing worker must belong to the current Manager thread for mutations. Attach/follow only when authorized. Another thread's tracker requires an explicit coordination handoff. Team topics can restrict capabilities to their own workers; a skill does not expand that authority.

For a remote target, use its stable `--host` ID, check that target's capabilities first and keep it on subsequent operations. Never fall back to local state after a remote failure. Keep native provider permissions and channel approval rules.
