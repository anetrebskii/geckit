import { useEffect, useState } from 'react'

import type { ManagerView } from '../../../shared/manager'

export function useManager(): ManagerView | undefined {
  const [view, setView] = useState<ManagerView>()
  useEffect(() => {
    const api = window.geckit.manager
    if (api === undefined) return
    let here = true
    void api.view().then((next) => { if (here) setView(next) }, () => undefined)
    const off = api.on((next) => { if (here) setView(next) })
    return () => { here = false; off() }
  }, [])
  return view
}

export { managerLabel } from './manager-label'
