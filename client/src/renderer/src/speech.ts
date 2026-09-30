import { useEffect, useState } from 'react'

import type { SpeechModel } from '../../shared/api'

/** The model dictation hears with on this computer, as its one download moves. */
export function useSpeechModel(): SpeechModel | undefined {
  const [model, setModel] = useState<SpeechModel>()
  useEffect(() => {
    // Optional: a dev app started before the preload had it hot-reloads this page all the same.
    const speech = window.geckit.speech as typeof window.geckit.speech | undefined
    void speech?.model().then(setModel)
    return speech?.onModel(setModel)
  }, [])
  return model
}

/** Starts the download, or picks a failed one up again. */
export const fetchSpeechModel = (): void => (window.geckit.speech as typeof window.geckit.speech | undefined)?.fetch()

const megabytes = (bytes: number): string => String(Math.round(bytes / 1_000_000))

export const percent = (model: SpeechModel): number => Math.floor((model.received / model.total) * 100)

/** Downloading the speech model, 212 of 574 MB */
export const downloading = (model: SpeechModel): string =>
  `Downloading the speech model, ${megabytes(model.received)} of ${megabytes(model.total)} MB`
