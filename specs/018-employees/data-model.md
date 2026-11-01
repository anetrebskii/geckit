# Data model

- Employee: id (stable UUID), name (trimmed, nonempty), role and description (free text, may be empty), avatar (bundled employee-01..employee-12 ID), archived (boolean), revision (incremented saved revision).
- EmployeeDraft: Pick of editable Employee fields plus optional id/revision; stale revision rejects overwrite and preserves existing record.
- EmployeesView: catalog plus optional instruction-sync error; successful catalog save and successful guide update are distinct.
- SessionNote/ChatSession/SessionMessage: optional employeeId composed from Employee.id; notes retain source root for discovery after hide/archive/restart. Null assignment clears it. Employee selection is persisted before first provider dispatch. No prompt text mutation.
- Settings.employeeFilter: empty string for all, `unassigned` for no assignment, otherwise stable employee ID; shared settings broadcast handles desktop/phone agreement.
- EmployeeMemory: employee, source conversation pages, complete/partial/unavailable availability and opaque next cursor. Each source identifies session/root/title/time/status/provider, hidden state, mine/theirs messages, unavailable reason and more flag. A continued source can appear on more than one page.
- Archived employee remains resolvable by ID/history and existing assignment, but is not eligible for a new assignment. Restore preserves ID and avatar. Current assignment controls memory membership; reading never changes hidden/archive state.
