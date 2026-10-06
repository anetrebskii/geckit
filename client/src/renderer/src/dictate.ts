import { useEffect, useState } from 'react'

import { join } from '../../shared/wav'
import { keep, readKept } from './kept'

/** Dictation on the phone, heard by iOS or by the host; nothing anywhere else. */
export interface Dictate {
  /** Resolves once it listens, and rejects with what stands in the way. */
  /** With goOn, what is said is added to the recording kept for place, and both are written down together. */
  readonly start: (language: string, heard: (text: string) => void, ended: () => void, place?: string, goOn?: boolean) => Promise<void>
  /** Resolves once the last of what was said has been handed to heard. */
  readonly stop: () => Promise<void>
  /** Stops without writing down; what the host was to hear is kept to be tried again. */
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

/** The last recording the host did not write down, kept on the phone until it does, so it can be tried again after the app was closed. */
export interface Unheard {
  /** The conversation it was said in, or the project of a new one. */
  readonly place: string
  readonly audio: string
  readonly why: string
}

const UNHEARD = 'dictation-unheard'
// About a second of the WAV as base64; anything shorter held nothing worth keeping.
const SECOND = 43_000

export const readUnheard = (): Promise<Unheard | undefined> => readKept<Unheard>(UNHEARD)
export const dropUnheard = (): Promise<void> => keep(UNHEARD, undefined)

// No language given: whisper hears which one was spoken, so Russian and English both come out as said.
async function writeDown(kept: Omit<Unheard, 'why'>): Promise<string> {
  await keep(UNHEARD, { ...kept, why: 'It was not written down.' })
  try {
    const answer = await window.geckit.transcribe({ audio: kept.audio })
    if (!answer.ok) throw new Error(answer.error ?? 'The host heard nothing.')
    await dropUnheard()
    return answer.text ?? ''
  } catch (error) {
    await keep(UNHEARD, { ...kept, why: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/** Has the host write down the kept recording once more; it is dropped once it does. */
export async function hearAgain(): Promise<string> {
  const kept = await readUnheard()
  if (kept === undefined) throw new Error('Nothing is kept to try again.')
  return writeDown(kept)
}

let waiting: { readonly heard: (text: string) => void; readonly ended: () => void; readonly place: string; readonly before?: string } | undefined
let starting: Promise<void> | undefined

const onHost = (mic: Voice): Dictate => {
  const recorded = async (before: string | undefined): Promise<string> => {
    const audio = await mic.stop()
    return before === undefined ? audio : join(before, audio)
  }
  return {
  live: false,
  start: (_language, heard, ended, place = '', goOn = false) => {
    const begun = (async (): Promise<void> => {
      const kept = goOn ? await readUnheard() : undefined
      await mic.start()
      waiting = { heard, ended, place, ...(kept?.place === place ? { before: kept.audio } : {}) }
    })()
    starting = begun
    return begun.finally(() => {
      if (starting === begun) starting = undefined
    })
  },
  stop: async () => {
    await starting
    const said = waiting
    if (said === undefined) return
    waiting = undefined
    try {
      const text = await writeDown({ place: said.place, audio: await recorded(said.before) })
      if (text !== '') said.heard(text)
    } finally {
      said.ended()
    }
  },
  // Closed while recording, what was said is kept rather than thrown away.
  cancel: () => {
    void (async (): Promise<void> => {
      await starting
      const said = waiting
      if (said === undefined) return
      waiting = undefined
      const audio = await recorded(said.before)
      if (audio.length > SECOND) await keep(UNHEARD, { place: said.place, audio, why: 'Closed before it was written down.' })
    })().catch(() => undefined)
  },
  }
}

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
