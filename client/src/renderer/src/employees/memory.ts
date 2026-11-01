import type { EmployeeMemory } from '../../../shared/employees'

export function continuedMemory(held: EmployeeMemory, page: EmployeeMemory): EmployeeMemory {
  const conversations = [...held.conversations]
  for (const one of page.conversations) {
    const at = conversations.findIndex((source) => source.session.id === one.session.id)
    const was = conversations[at]
    if (was === undefined) conversations.push(one)
    else conversations[at] = { ...one, items: [...was.items, ...one.items] }
  }
  const incomplete = held.availability !== 'complete' || page.availability !== 'complete' || conversations.some((one) => one.unavailable !== undefined)
  const readable = conversations.some((one) => one.items.length > 0)
  return { ...page, conversations, availability: incomplete ? readable ? 'partial' : 'unavailable' : 'complete' }
}
