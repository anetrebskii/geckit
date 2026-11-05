export const MANAGER_CHAT_EVENT = 'manager:open-chat'

export const openManagerChat = (): void => { window.dispatchEvent(new Event(MANAGER_CHAT_EVENT)) }
