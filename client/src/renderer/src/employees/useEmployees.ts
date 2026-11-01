import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Employee, EmployeesView } from '../../../shared/employees'

const EMPTY: EmployeesView = { employees: [] }

export function useEmployees(): {
  readonly view: EmployeesView
  readonly byId: ReadonlyMap<Employee['id'], Employee>
  readonly loading: boolean
  readonly loadError: boolean
  readonly reload: () => void
  readonly take: (next: EmployeesView) => void
} {
  const [view, setView] = useState<EmployeesView>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const take = useCallback((next: EmployeesView): void => {
    setView((held) => {
      const before = new Map(held.employees.map((one) => [one.id, one]))
      const employees = next.employees.map((one) => {
        const was = before.get(one.id)
        return was?.revision === one.revision ? was : one
      })
      return { ...next, employees }
    })
    setLoading(false)
    setLoadError(false)
  }, [])
  const reload = useCallback((): void => {
    setLoading(true)
    void Promise.resolve().then(() => window.geckit.employees.list()).then(take).catch(() => {
      setLoading(false)
      setLoadError(true)
    })
  }, [take])
  useEffect(() => {
    let here = true
    void Promise.resolve().then(() => window.geckit.employees.list()).then((next) => { if (here) take(next) }).catch(() => { if (here) { setLoading(false); setLoadError(true) } })
    const off = window.geckit.employees?.on(take)
    return () => { here = false; off?.() }
  }, [take])
  const byId = useMemo(() => new Map(view.employees.map((one) => [one.id, one])), [view.employees])
  return { view, byId, loading, loadError, reload, take }
}
