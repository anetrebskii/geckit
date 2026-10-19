import { useEffect, useState } from 'react'

import type { ManagerView } from '../../../shared/manager'
import { ON_PHONE } from '../on-phone'

export function useManager(): ManagerView | undefined {
  const [view, setView] = useState<ManagerView>()
  useEffect(() => {
    if (ON_PHONE) return
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
