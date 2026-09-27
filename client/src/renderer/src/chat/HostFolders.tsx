import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Folders } from '../../../shared/api'
import type { HostView } from '../../../shared/hosts'
import { Icon } from '../ui/Icon'

/**
 * Choose a folder on a host.
 *
 * The system's Open panel sees only this computer's disks, so a host gets one
 * built to behave like it: Places down the left, the folder's parts across the
 * top, one level of folders in a list, and the keys Finder has for the same
 * things. Its folders are read from the host as they are opened.
 */

/** Where people keep work, by the system the host runs; only the ones the host has are offered. */
const PLACES: Readonly<Record<string, readonly string[]>> = {
  Darwin: ['Desktop', 'Documents', 'Developer', 'Projects', 'Code'],
  Linux: ['projects', 'Projects', 'code', 'src', 'work', 'dev', 'workspace'],
}

interface Place {
  readonly path: string
  readonly name: string
  readonly icon: string
}

const base = (path: string): string => path.split('/').filter((part) => part !== '').pop() ?? '/'

export function HostFolders({
  host,
  onClose,
  onAdded,
}: {
  readonly host: HostView
  readonly onClose: () => void
  readonly onAdded: (root: string) => void
}): React.JSX.Element {
  const [folders, setFolders] = useState<Folders | undefined>()
  const [places, setPlaces] = useState<readonly Place[]>([])
  const [reading, setReading] = useState(true)
  const [trouble, setTrouble] = useState<string | undefined>()
  const [chosen, setChosen] = useState<string | undefined>()
  const [filter, setFilter] = useState('')
  const [hidden, setHidden] = useState(false)
  const [going, setGoing] = useState<string | undefined>()
  const [adding, setAdding] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  const open = useCallback(
    (where: string | undefined): void => {
      setReading(true)
      setTrouble(undefined)
      void window.geckit.hosts.folders(host.id, where).then((found) => {
        setReading(false)
        if (found === undefined || (where !== undefined && found.path !== where && found.path === found.home)) {
          setTrouble(`Could not read ${where ?? 'the home folder'} on ${host.name}.`)
          return
        }
        setFolders(found)
        setChosen(undefined)
        setFilter('')
        list.current?.focus()
      })
    },
    [host.id, host.name],
  )

  // The home folder first, which is also what says which places the host has.
  useEffect(() => {
    void window.geckit.hosts.folders(host.id, undefined).then((found) => {
      setReading(false)
      if (found === undefined) {
        setTrouble(`Could not read the folders on ${host.name}.`)
        return
      }
      setFolders(found)
      const home = found.home ?? found.path
      const kept = PLACES[found.system ?? ''] ?? PLACES['Linux'] ?? []
      const there = new Set(found.folders.map((one) => one.name))
      setPlaces([
        { path: home, name: base(home), icon: 'home' },
        ...kept.filter((name) => there.has(name)).map((name) => ({ path: `${home}/${name}`, name, icon: 'folder' })),
        { path: '/', name: host.name, icon: 'display' },
      ])
      list.current?.focus()
    })
  }, [host.id, host.name])

  const shown = useMemo(() => {
    const words = filter.toLowerCase()
    return (folders?.folders ?? []).filter((one) => (hidden || !one.name.startsWith('.')) && one.name.toLowerCase().includes(words))
  }, [folders, filter, hidden])

  const path = folders?.path ?? ''
  const target = chosen ?? path
  const parts = path === '/' ? [] : path.split('/').filter((part) => part !== '')

  const add = (): void => {
    if (target === '') return
    setAdding(true)
    void window.geckit.hosts.addFolder(host.id, target).then((root) => {
      setAdding(false)
      if (root === undefined) {
        setTrouble(`${target} is not a folder on ${host.name}.`)
        return
      }
      onAdded(root)
      onClose()
    })
  }

  // Escape puts away the Go to field first, and only then the panel, and never the dialog under it.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      if (going === undefined) onClose()
      else setGoing(undefined)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [going, onClose])

  const move = (by: number): void => {
    const at = shown.findIndex((one) => one.path === chosen)
    const next = shown[Math.max(0, Math.min(shown.length - 1, at < 0 ? (by > 0 ? 0 : shown.length - 1) : at + by))]
    if (next === undefined) return
    setChosen(next.path)
    list.current?.querySelector(`[data-path="${CSS.escape(next.path)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  const keys = (event: React.KeyboardEvent): void => {
    const command = event.metaKey || event.ctrlKey
    if (command && event.shiftKey && event.key.toLowerCase() === 'g') {
      event.preventDefault()
      setGoing(path)
      return
    }
    if (event.key === 'ArrowDown' && command && chosen !== undefined) {
      event.preventDefault()
      open(chosen)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp' && command) {
      event.preventDefault()
      if (folders?.up !== undefined) open(folders.up)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (chosen !== undefined) open(chosen)
      else add()
    } else if (event.key === 'Backspace' && filter === '') {
      event.preventDefault()
      if (folders?.up !== undefined) open(folders.up)
    } else if (event.key === 'Backspace') {
      setFilter(filter.slice(0, -1))
    } else if (event.key.length === 1 && !command && !event.altKey) {
      // Typing in the list narrows it, as it does in the system's panel.
      setFilter(filter + event.key)
    }
  }

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog folder-panel" role="dialog" aria-label={`Choose a folder on ${host.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="folder-bar">
          <button
            type="button"
            className="icon-button"
            disabled={folders?.up === undefined}
            title={`Enclosing folder (${window.geckit.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Up)`}
            aria-label="Enclosing folder"
            onClick={() => open(folders?.up)}
          >
            <Icon name="left" size={14} />
          </button>
          <nav className="path-bar" aria-label="Folder">
            <button type="button" className={parts.length === 0 ? 'here' : ''} onClick={() => open('/')}>
              <Icon name="display" size={12} />
              {host.name}
            </button>
            {parts.map((part, index) => {
              const to = `/${parts.slice(0, index + 1).join('/')}`
              return (
                <span key={to} className="path-part">
                  <Icon name="right" size={10} />
                  <button type="button" className={index === parts.length - 1 ? 'here' : ''} onClick={() => open(to)}>
                    {to === folders?.home ? <Icon name="home" size={12} /> : null}
                    {part}
                  </button>
                </span>
              )
            })}
          </nav>
          <label className="folder-filter">
            <Icon name="search" size={12} />
            <input type="text" value={filter} placeholder="Filter" aria-label="Filter" spellCheck={false} onChange={(event) => setFilter(event.target.value)} />
          </label>
        </div>

        <div className="folder-body">
          <nav className="folder-places" aria-label="Places">
            <div className="places-head">Places</div>
            {places.map((one) => (
              <button key={one.path} type="button" className={one.path === path ? 'on' : ''} onClick={() => open(one.path)}>
                <Icon name={one.icon} size={13} />
                <span>{one.name}</span>
              </button>
            ))}
          </nav>
          <div className="folder-list" ref={list} role="listbox" tabIndex={0} aria-label={`Folders in ${path}`} onKeyDown={keys}>
            {reading && folders === undefined ? (
              <div className="folder-note">
                <Icon name="spinner" size={13} className="spinning" /> Reading {host.name}...
              </div>
            ) : trouble !== undefined && folders === undefined ? (
              <div className="folder-note trouble">{trouble}</div>
            ) : shown.length === 0 ? (
              <div className="folder-note">{filter === '' ? `No folders inside ${base(path)}` : `No folder named like "${filter}"`}</div>
            ) : (
              shown.map((one) => (
                <div
                  key={one.path}
                  role="option"
                  aria-selected={one.path === chosen}
                  data-path={one.path}
                  className={`folder-row${one.path === chosen ? ' on' : ''}`}
                  onClick={() => setChosen(one.path)}
                  onDoubleClick={() => open(one.path)}
                >
                  <Icon name="folder" size={14} />
                  <span className="name">{one.name}</span>
                  {one.git ? <span className="folder-git">git</span> : null}
                </div>
              ))
            )}
          </div>
        </div>

        {going === undefined ? null : (
          <div className="folder-goto">
            <span>Go to the folder:</span>
            <input
              type="text"
              value={going}
              autoFocus
              spellCheck={false}
              aria-label="Go to the folder"
              onChange={(event) => setGoing(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                const to = going.trim() === '~' || going.trim() === '' ? folders?.home : going.trim().replace(/^~(?=\/)/, folders?.home ?? '~')
                setGoing(undefined)
                open(to)
              }}
            />
          </div>
        )}

        <div className="folder-foot">
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
            Show hidden
          </label>
          <span className="folder-where" title={target}>
            {trouble !== undefined && folders !== undefined ? <span className="trouble">{trouble}</span> : target}
          </span>
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={adding || target === '' || folders === undefined} onClick={add}>
            {adding ? 'Adding...' : `Add ${base(target)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
