/**
 * What the phone keeps of a Mac between launches, in IndexedDB: the list, the
 * settings and the end of the conversations opened last, so the app opens on
 * them while the link is still being made. A phone that cannot keep anything
 * reads nothing and carries on.
 */

let opened: Promise<IDBDatabase | undefined> | undefined

const database = (): Promise<IDBDatabase | undefined> =>
  (opened ??= new Promise((done) => {
    try {
      const asked = indexedDB.open('geckit', 1)
      asked.onupgradeneeded = () => asked.result.createObjectStore('kept')
      asked.onsuccess = () => done(asked.result)
      asked.onerror = () => done(undefined)
    } catch {
      done(undefined)
    }
  }))

export async function readKept<T>(key: string): Promise<T | undefined> {
  const db = await database()
  if (db === undefined) return undefined
  return new Promise((done) => {
    const asked = db.transaction('kept').objectStore('kept').get(key)
    asked.onsuccess = () => done(asked.result as T | undefined)
    asked.onerror = () => done(undefined)
  })
}

export async function keep(key: string, value: unknown): Promise<void> {
  const db = await database()
  if (db === undefined) return
  await new Promise<void>((done) => {
    const writing = db.transaction('kept', 'readwrite')
    if (value === undefined) writing.objectStore('kept').delete(key)
    else writing.objectStore('kept').put(value, key)
    writing.oncomplete = () => done()
    writing.onerror = () => done()
  })
}
