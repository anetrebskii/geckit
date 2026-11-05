# Data model

`Configuration` derives preference groups from `Settings`; `employees` uses `Employee[]`; `manager` uses `Partial<ManagerConfig>`. Optional groups load normal defaults. `version` is 1. `local-state.json` retains device/work fields from Settings; `manager.json` retains Manager runtime without its configuration. Session metadata and encrypted credential stores are unchanged. Shortcut execution history belongs to local state; IDs and employee references remain stable during migration and copy.

Readable unknown fields are retained on mutation. Unsupported versions and malformed group containers fail before writes. Migration preserves legacy originals before committing the new file. Successful migration is idempotent; canonical configuration takes precedence over legacy copies.
