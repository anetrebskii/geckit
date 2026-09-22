import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_SETTINGS } from '../../shared/api'
import type { Settings } from '../../shared/api'

/**
 * What the application remembers, as every window sees it.
 *
 * The main process owns the file; a window reads it once and is told again
 * whenever anything changes, wherever it changed.
 */
export function useSettings(): [Settings, (change: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    // A key added since the main process was started is not in what it sends.
    const take = (said: Settings): void => setSettings({ ...DEFAULT_SETTINGS, ...said })
    void window.geckit.settings.get().then(take)
    return window.geckit.settings.on(take)
  }, [])

  // Every window paints itself from this, so the choice is applied here rather
  // than three times over.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset['theme']
    else root.dataset['theme'] = settings.theme
  }, [settings.theme])

  const change = useCallback((partial: Partial<Settings>) => {
    setSettings((held) => ({ ...held, ...partial }))
    void window.geckit.settings.set(partial)
  }, [])

  return [settings, change]
}

