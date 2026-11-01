import type { Employee, EmployeeDraft } from '../../../shared/employees'

export const newEmployeeDraft = (avatar: Employee['avatar']): EmployeeDraft => ({ name: '', role: '', description: '', avatar })

export const savedEmployeeId = (draft: EmployeeDraft, before: readonly Employee[], after: readonly Employee[]): Employee['id'] | undefined =>
  draft.id ?? after.find((one) => !before.some((old) => old.id === one.id) && one.name === draft.name.trim() && one.role === draft.role && one.description === draft.description && one.avatar === draft.avatar)?.id
