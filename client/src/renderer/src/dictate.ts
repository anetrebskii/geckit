import { useEffect, useState } from 'react'

/** Dictation on the phone, heard by iOS or by the host; nothing anywhere else. */
export interface Dictate {
  /** Resolves once it listens, and rejects with what stands in the way. */
  readonly start: (language: string, heard: (text: string) => void, ended: () => void) => Promise<void>
  /** Resolves once the last of what was said has been handed to heard. */
  readonly stop: () => Promise<void>
  /** Stops and drops what was not heard yet. */
  readonly cancel: () => void
  /** Whether words arrive while they are said, or only after stop. */
  readonly live: boolean
}

/** The phone's microphone, lent by the app on the phone: a WAV at 16 kHz mono, as base64. */
export interface Voice {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<string>
  readonly drop: () => void
}

/** Listens to how loud the microphone is, 0 to 1; returns what stops listening. */
export type Level = (said: (level: number) => void) => () => void

/** How loud the microphone is while on, for the mic to swell with the voice. */
export function useLevel(on: boolean): number {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const listen = (window as { geckitLevel?: Level }).geckitLevel
    if (!on || listen === undefined) return
    const stop = listen(setLevel)
    return () => {
      stop()
      setLevel(0)
    }
  }, [on])
  return level
}

export type Ear = 'phone' | 'host'

const EAR = 'geckit.dictation-ear'

/** Who hears dictation on this phone: the host with its whisper model unless the phone was chosen. */
export const ear = (): Ear => (localStorage.getItem(EAR) === 'phone' ? 'phone' : 'host')
export const setEar = (chosen: Ear): void => localStorage.setItem(EAR, chosen)

const iphone = (): Dictate | undefined => (window as { geckitDictate?: Dictate }).geckitDictate
export const voice = (): Voice | undefined => (window as { geckitVoice?: Voice }).geckitVoice

let waiting: { readonly heard: (text: string) => void; readonly ended: () => void } | undefined

const onHost = (mic: Voice): Dictate => ({
  live: false,
  start: async (_language, heard, ended) => {
    await mic.start()
    waiting = { heard, ended }
  },
  stop: async () => {
    const said = waiting
    if (said === undefined) return
    waiting = undefined
    try {
      const audio = await mic.stop()
      // No language given: whisper hears which one was spoken, so Russian and English both come out as said.
      const answer = await window.geckit.transcribe({ audio })
      if (!answer.ok) throw new Error(answer.error ?? 'The host heard nothing.')
      if ((answer.text ?? '') !== '') said.heard(answer.text ?? '')
    } finally {
      said.ended()
    }
  },
  cancel: () => {
    if (waiting === undefined) return
    waiting = undefined
    mic.drop()
  },
})

export const dictate = (): Dictate | undefined => {
  const mic = voice()
  return ear() === 'host' && mic !== undefined ? onHost(mic) : iphone()
}

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
