import { describe, expect, it } from 'vitest'
import { newEmployeeDraft, savedEmployeeId } from '../src/renderer/src/employees/draft'
import { continuedMemory } from '../src/renderer/src/employees/memory'
import type { Employee, EmployeeMemory } from '../src/shared/employees'

const employee: Employee = { id: 'employee', name: 'Tatiana', role: 'Marketing', description: '', avatar: 'employee-01', archived: false, revision: 1 }
const source: EmployeeMemory['conversations'][number] = { session: { id: 'source', root: '/project', title: 'Source', at: 1 }, hidden: true, items: [{ kind: 'theirs', id: 'large-message', text: 'Repeated content.' }], more: true }

describe('employee memory continuation', () => {
  it('keeps identical chunks from nonoverlapping message offsets', () => {
    const held: EmployeeMemory = { employee, conversations: [source], availability: 'complete', next: 'second' }
    const { more: _more, ...lastSource } = source
    const page: EmployeeMemory = { employee, conversations: [lastSource], availability: 'complete' }
    const result = continuedMemory(held, page)
    expect(result.conversations[0]?.items.map((one) => one.text)).toEqual(['Repeated content.', 'Repeated content.'])
    expect(result.conversations[0]?.hidden).toBe(true)
    expect(result.next).toBeUndefined()
  })
  it('retains partial availability after a complete last page', () => {
    const held: EmployeeMemory = { employee, conversations: [{ ...source, unavailable: 'Host disconnected' }], availability: 'partial', next: 'second' }
    const page: EmployeeMemory = { employee, conversations: [], availability: 'complete' }
    expect(continuedMemory(held, page).availability).toBe('partial')
  })
  it('keeps earlier readable history when the last page is unavailable', () => {
    const held: EmployeeMemory = { employee, conversations: [source], availability: 'complete', next: 'second' }
    const page: EmployeeMemory = { employee, conversations: [], availability: 'unavailable' }
    expect(continuedMemory(held, page).availability).toBe('partial')
  })
})


describe('employee creation contract', () => {
  it('omits identity and revision until the backend creates an employee', () => {
    const draft = newEmployeeDraft('employee-02')
    expect(draft).not.toHaveProperty('id')
    expect(draft).not.toHaveProperty('revision')
    const saved: Employee = { ...employee, ...draft, id: 'server-assigned-id', revision: 1 }
    expect(savedEmployeeId(draft, [employee], [employee, saved])).toBe(saved.id)
  })
  it('selects the saved employee with its normalized name', () => {
    const draft = { ...newEmployeeDraft('employee-01'), name: '  Tatiana  ', role: employee.role }
    expect(savedEmployeeId(draft, [], [employee])).toBe(employee.id)
  })
})
