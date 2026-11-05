import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { configurationActions } from '../src/main/configuration-actions'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'geckit-actions-'))
  folders.push(folder)
  const directory = join(folder, 'data')
  mkdirSync(directory)
  writeFileSync(join(directory, 'settings.json'), '{"version":1}')
  const path = join(folder, 'geckit-settings.json')
  const source = join(folder, 'source.json')
  const text = '{"version":1,"general":{"theme":"dark"}}'
  writeFileSync(source, text)
  const dependencies = {
    directory,
    chooseExport: vi.fn(async (): Promise<string | undefined> => path),
    chooseImport: vi.fn(async (): Promise<string | undefined> => source),
    confirmImport: vi.fn(async () => true),
    export: vi.fn(async () => text),
    import: vi.fn(async (_text: string): Promise<void> => undefined),
    reveal: vi.fn((_path: string) => undefined),
    restart: vi.fn(() => undefined),
  }
  return { folder, path, source, text, dependencies, api: configurationActions(dependencies) }
}

describe('desktop configuration actions', () => {
  it('reveals the active file and writes a private, complete portable export', async () => {
    const { api, path, text, dependencies } = fixture()
    await api.reveal()
    expect(dependencies.reveal).toHaveBeenCalledWith(join(dependencies.directory, 'settings.json'))
    expect(await api.export()).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(text)
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600)
  })
  it('cancels both file pickers without exporting, confirming or restarting', async () => {
    const { api, dependencies } = fixture()
    dependencies.chooseExport.mockResolvedValue(undefined)
    dependencies.chooseImport.mockResolvedValue(undefined)
    expect(await api.export()).toBe(false)
    expect(await api.import()).toBe(false)
    expect(dependencies.export).not.toHaveBeenCalled()
    expect(dependencies.confirmImport).not.toHaveBeenCalled()
    expect(dependencies.restart).not.toHaveBeenCalled()
  })
  it('refuses export into the active data folder, including a symlinked parent', async () => {
    const { api, folder, dependencies } = fixture()
    const active = join(dependencies.directory, 'settings.json')
    dependencies.chooseExport.mockResolvedValue(active)
    await expect(api.export()).rejects.toThrow('outside GeckIt’s data folder')
    const alias = join(folder, 'alias')
    symlinkSync(dependencies.directory, alias, 'dir')
    dependencies.chooseExport.mockResolvedValue(join(alias, 'settings.json'))
    await expect(api.export()).rejects.toThrow('outside GeckIt’s data folder')
    expect(readFileSync(active, 'utf8')).toBe('{"version":1}')
    expect(dependencies.export).not.toHaveBeenCalled()
  })
  it('preserves an existing destination on service failure and permits retry', async () => {
    const { api, path, text, dependencies } = fixture()
    writeFileSync(path, 'previous export')
    dependencies.export.mockRejectedValueOnce(new Error('Service disconnected.'))
    await expect(api.export()).rejects.toThrow('Service disconnected.')
    expect(readFileSync(path, 'utf8')).toBe('previous export')
    expect(await api.export()).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(text)
  })
  it('validates before confirmation and cancels without staging', async () => {
    const { api, source, text, dependencies } = fixture()
    writeFileSync(source, '{"version":99}')
    await expect(api.import()).rejects.toThrow('not a supported GeckIt configuration')
    expect(dependencies.confirmImport).not.toHaveBeenCalled()
    writeFileSync(source, text)
    dependencies.confirmImport.mockResolvedValue(false)
    expect(await api.import()).toBe(false)
    expect(dependencies.import).not.toHaveBeenCalled()
    expect(dependencies.restart).not.toHaveBeenCalled()
  })
  it('imports the captured bytes and waits for ownership release before restart', async () => {
    const { api, source, text, dependencies } = fixture()
    dependencies.confirmImport.mockImplementation(async () => { writeFileSync(source, '{"version":99}'); return true })
    let release = (): void => undefined
    dependencies.import.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    const imported = api.import()
    await vi.waitFor(() => expect(dependencies.import).toHaveBeenCalledWith(text))
    expect(dependencies.restart).not.toHaveBeenCalled()
    await expect(api.export()).rejects.toThrow('already in progress')
    release()
    expect(await imported).toBe(true)
    expect(dependencies.restart).toHaveBeenCalledOnce()
  })
  it('does not restart after a rejected import and allows another operation', async () => {
    const { api, dependencies } = fixture()
    dependencies.import.mockRejectedValueOnce(new Error('Finish or stop active and queued work before importing configuration.'))
    await expect(api.import()).rejects.toThrow('active and queued work')
    expect(dependencies.restart).not.toHaveBeenCalled()
    await api.reveal()
    expect(dependencies.reveal).toHaveBeenCalledOnce()
  })
})
