# Contract: Manager setting, CLI and wording

## Setting

Manager page, Setup section (desktop `ManagerPage` and phone `PhoneManager`), below the assistant choice:

| Element | Wording |
|---|---|
| Label | Compact conversation at |
| Control | A menu: Off, 100,000, 160,000, 240,000, 400,000 and 600,000 tokens; a value set another way (CLI, configuration import) is listed too. On the phone the row is "Compact At" and opens the same choices as a sheet titled "Compact Conversation At". |
| Note | Manager summarises its conversation when it reaches this size, so each answer rereads less. Default 240,000 tokens. |
| Assistant without compaction | <Assistant name> can't compact conversations. Manager's conversation keeps growing. |
| Invalid value | Choose 0 (off) or a number from 50,000 to 2,000,000. |

## CLI

```text
geckit service manager configure '{"compactAt":240000}'
geckit service manager configure '{"compactAt":0}'
```

`manager view` shows `config.compactAt`. `core/product-cli.ts` adds `compactAt` to `schemas.manager.patch`. Configuration export and import carry `manager.compactAt`.

## Thread states

| State | Short (pill) | Full |
|---|---|---|
| Limit reached, reset known | as today (`limitReply` / `limitStands`) | as today |
| Limit reset, nothing waiting | Limit reset | Limit reset. Continues with the next message. |
| Compacting | Compacting | Summarising its conversation to keep it short. |

No toast, sound or channel message accompanies compaction or the reset.

## Manager instructions (client/src/prompts)

One added rule: "After a usage limit, do not schedule your own continuation for a later time. Continue when a message arrives; GeckIt delivers waiting messages at the reset."
