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

  const result: UserContext = JSON.parse(userContextText);

  // Backward compartibility
  result.settings = {
    nativateLanguage:
      window.localStorage.getItem('lang1') ?? result.settings.nativateLanguage,
    secondLanguage:
      window.localStorage.getItem('lang2') ?? result.settings.secondLanguage,
    openAiKey:
      window.localStorage.getItem('openApi') ?? result.settings.openAiKey,
    openAiModel:
      result.settings?.openAiModel ?? DefaultUserContext.settings.openAiModel,
  };

  return result;
}

export function setUserContext(userContext: Partial<UserContext>) {
  // Backward compartibility
  if (userContext.settings?.nativateLanguage) {
    window.localStorage.removeItem('lang1');
  }

  if (userContext.settings?.secondLanguage) {
    window.localStorage.removeItem('lang2');
  }

  if (userContext.settings?.openAiKey) {
    window.localStorage.removeItem('openApi');
  }

  window.localStorage.setItem(
    StorageKey,
    JSON.stringify({
      ...getUserContext(),
      ...userContext,
    }),
  );
}
