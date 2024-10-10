type UserSettings = {
  nativateLanguage: string | undefined;
  secondLanguage: string | undefined;
  openAiKey: string | undefined;
  openAiModel: string;
};

export interface UserContext {
  firstLaunch: boolean;
  settings: UserSettings;
}

const StorageKey = 'userContext';

const DefaultUserContext: UserContext = {
  firstLaunch: true,
  settings: {
    nativateLanguage: undefined,
    secondLanguage: undefined,
    openAiKey: undefined,
    openAiModel: 'gpt-3.5-turbo',
  },
};

export function getUserContext(): UserContext {
  const userContextText = window.localStorage.getItem(StorageKey);
  if (!userContextText) {
    return DefaultUserContext;
  }

  const result: UserContext = {
    ...DefaultUserContext,
    ...JSON.parse(userContextText),
  };
  return result;
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
