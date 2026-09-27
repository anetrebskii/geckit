import { useState } from 'react'

/** iOS dictation, when the app on the phone lends it; nothing anywhere else. */
export interface Dictate {
  /** Resolves once it listens, and rejects with what stands in the way. */
  readonly start: (language: string, heard: (text: string) => void, ended: () => void) => Promise<void>
  readonly stop: () => void
}

export const dictate = (): Dictate | undefined => (window as { geckitDictate?: Dictate }).geckitDictate

const CODES: Readonly<Partial<Record<string, string>>> = {
  English: 'EN',
  Russian: 'RU',
  Spanish: 'ES',
  German: 'DE',
  French: 'FR',
  Portuguese: 'PT',
  Italian: 'IT',
  Polish: 'PL',
  Turkish: 'TR',
  Ukrainian: 'UK',
  Chinese: 'ZH',
  Japanese: 'JA',
}

export const languageCode = (language: string): string => CODES[language] ?? language.slice(0, 2).toUpperCase()

const KEPT = 'geckit.dictation-language'

/** Which of the two languages dictation listens in, kept on this phone between tasks. */
export function useDictationLanguage(first: string, second: string): readonly [string, () => void] {
  const [language, setLanguage] = useState(() => (localStorage.getItem(KEPT) === second ? second : first))
  const shown = language === second ? second : first
  const flip = (): void => {
    const next = shown === first ? second : first
    localStorage.setItem(KEPT, next)
    setLanguage(next)
  }
  return [shown, flip]
}
