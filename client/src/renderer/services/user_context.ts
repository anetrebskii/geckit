export interface UserContext {
  firstLaunch: boolean;
}

const StorageKey = 'userContext';

const DefaultUserContext: UserContext = {
  firstLaunch: true,
};

export function getUserContext(): UserContext {
  const userContextText = window.localStorage.getItem(StorageKey);
  if (!userContextText) {
    return DefaultUserContext;
  }
  return JSON.parse(userContextText);
}

export function setUserContext(userContext: Partial<UserContext>) {
  window.localStorage.setItem(
    StorageKey,
    JSON.stringify({
      ...getUserContext(),
      ...userContext,
    }),
  );
}
