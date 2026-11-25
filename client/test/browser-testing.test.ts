import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickProfile } from '../src/cli/browser'
import { HIDDEN_SCRIPT } from '../src/cli/hidden-page'
import { deleteTestProfile, extensionSource, makeTestAccount, nearScript, pageScript, scrubSecrets, wheelStep, updateBrowserLocation, updateTestProfile, serveTestLaunches, testBrowsersState, validTestName } from '../src/cli/testing'

describe('test browsers', () => {
  it('replaces filled secret values in what eval returns', () => {
    expect(scrubSecrets({ token: 'pw-12345', nested: ['x pw-12345 y', 'a"b\\c'] }, ['pw-12345', 'a"b\\c'])).toEqual({ token: '[secret]', nested: ['x [secret] y', '[secret]'] })
    expect(scrubSecrets('nothing', [])).toBe('nothing')
  })
  it('keeps refs and secret fields in the isolated world, and finds an element only while it is on the page', () => {
    const hidden = new Function(`${HIDDEN_SCRIPT}; const made = globalThis.geckitHidden; delete globalThis.geckitHidden; return made`)() as { next: number; secrets: Set<object>; find: (ref: string) => object | null; mark: (el: object, ref: string) => void }
    const field = { isConnected: true }
    hidden.mark(field, '7')
    hidden.secrets.add(field)
    expect(hidden.find('7')).toBe(field)
    expect(hidden.find('8')).toBeNull()
    field.isConnected = false
    expect(hidden.find('7')).toBeNull()
    expect(hidden.next).toBe(1)
    const scope = new Function(`${pageScript()}; return geckitPage`)() as Record<string, (...args: unknown[]) => unknown>
    Object.assign(globalThis, { geckitHidden: hidden, document: { querySelectorAll: () => [] } })
    try {
      expect(scope['pageOverlay']?.(false)).toEqual({})
      expect(scope['pageSecrets']?.('hide')).toEqual({})
      field.isConnected = true
      expect(scope['pageSecrets']?.('values')).toEqual({ values: [] })
    } finally { delete (globalThis as { geckitHidden?: unknown }).geckitHidden; delete (globalThis as { document?: unknown }).document }
  })
  it('runs the extension own page functions, read out of background.js', () => {
    const scope = new Function(`${pageScript()}; return geckitPage`)() as Record<string, unknown>
    expect(Object.keys(scope).sort()).toEqual(['pageBox', 'pageCenter', 'pageChoose', 'pageField', 'pageGrab', 'pageHas', 'pageOverlay', 'pagePointer', 'pageRead', 'pageScroll', 'pageSecretField', 'pageSecrets', 'pageSlow', 'pageStyle', 'pageText', 'pageTyped'])
    expect(extensionSource('lzw')).toMatch(/^function lzw\(indexes\) \{[\s\S]*\n\}$/)
    expect(extensionSource('LZW_CODES')).toBe('const LZW_CODES = new Int32Array(4096 * 256)')
    expect(() => extensionSource('nothingLikeThis')).toThrow('background.js has no nothingLikeThis')
  })
  it('turns the wheel toward an element out of view, at most most of a screen, and stops once it is in view', () => {
    const area = { left: 0, top: 0, right: 1280, bottom: 800 }
    expect(wheelStep({ x: 640, y: 400, area })).toBe(0)
    expect(wheelStep({ x: 640, y: 1000, area })).toBe(600)
    expect(wheelStep({ x: 640, y: 5000, area })).toBe(640)
    expect(wheelStep({ x: 640, y: -3000, area })).toBe(-640)
    expect(wheelStep({ x: 640, y: 20, area })).toBe(-380)
    expect(wheelStep({ x: 300, y: 450, area: { left: 100, top: 300, right: 600, bottom: 500 } })).toBe(0)
    expect(() => new Function(`return ${nearScript('7"x')}`)).not.toThrow()
  })
  it('builds page markup without HTML strings, which a Trusted Types default policy rewrites', () => {
    expect(pageScript()).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/)
  })

  it('names a test profile with lowercase letters, digits and hyphens only', () => {
    expect(['store', 'stage-2'].every(validTestName)).toBe(true)
    expect(['', 'Store', '../x', '-x', 'a b'].some(validTestName)).toBe(false)
  })

  it('reaches a test browser only by its label, and never by default while a Chrome profile is there', () => {
    const own = { pid: 1, label: 'aleks@example.com', tabs: [10], focused: 0, t: 0 }
    const store = { pid: 2, label: 'geckit:store', tabs: [900_000_001], focused: 0, t: 0 }
    const staging = { pid: 3, label: 'geckit:store-staging', tabs: [], focused: 0, t: 0 }
    expect(pickProfile([store, own], {})).toBe(own)
    expect(pickProfile([store], {})).toBe(store)
    expect(pickProfile([own, store, staging], {}, 'geckit:store')).toBe(store)
    expect(pickProfile([own, store, staging], {}, 'test:store')).toBe(store)
    expect(pickProfile([own, store], { tab: 900_000_001 })).toBe(store)
    expect(pickProfile([own], {}, 'geckit:gone')).toBe('geckit:gone is not open. Run geckit browser start geckit:gone.')
  })

  it('makes a profile without a description', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-testing-'))
    makeTestAccount('plain', '  ', root, true)
    expect(testBrowsersState(root).profiles).toMatchObject([{ name: 'plain', open: false, locationSettings: { overrides: {} } }])
  })

  it('shows shared settings as defaults for a new profile and preserves its overrides when the defaults are cleared', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-testing-'))
    const defaults = { language: 'en', region: 'GB', timezone: 'Europe/London', geolocation: { latitude: 51.5072, longitude: -0.1276 } }
    updateBrowserLocation(null, defaults, root)
    expect(testBrowsersState(root).locationDefaults?.overrides).toEqual(defaults)
    makeTestAccount('plain', '', root, true)
    updateBrowserLocation('plain', { language: 'fr' }, root)
    expect(testBrowsersState(root).profiles).toMatchObject([{ locationSettings: { defaults, overrides: { language: 'fr' } } }])
    updateBrowserLocation(null, {}, root)
    const reset = testBrowsersState(root)
    expect(reset.locationDefaults?.overrides).toEqual({})
    expect(reset.profiles[0]?.locationSettings?.defaults.geolocation).toBeUndefined()
    expect(reset.profiles[0]?.locationSettings?.overrides).toEqual({ language: 'fr' })
  })

  it('renames a profile and changes its description, keeping its files', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-testing-'))
    makeTestAccount('old', 'GitHub as alex', root, true)
    writeFileSync(join(root, '.geckit', 'camoufox', 'profiles', 'old', 'Cookies'), 'kept')
    makeTestAccount('taken', '', root, true)
    expect(() => updateBrowserLocation('old', { geolocation: { latitude: 91, longitude: 0 } }, root)).toThrow('Enter latitude')
    updateBrowserLocation('old', { language: 'es', region: 'us', timezone: 'America/New_York' }, root)
    updateTestProfile('old', 'old', 'GitHub as work', root)
    expect(testBrowsersState(root).profiles.find((one) => one.name === 'old')?.note).toBe('GitHub as work')
    expect(() => updateTestProfile('old', 'taken', '', root)).toThrow('already exists')
    updateTestProfile('old', 'github-work', 'GitHub as work', root)
    expect(testBrowsersState(root).profiles).toMatchObject([{ name: 'github-work', open: false, note: 'GitHub as work' }, { name: 'taken', open: false }])
    expect(testBrowsersState(root).profiles.map((profile) => profile.locationSettings?.overrides)).toEqual([{ language: 'es', region: 'US', timezone: 'America/New_York' }, {}])
    expect(readFileSync(join(root, '.geckit', 'camoufox', 'profiles', 'github-work', 'Cookies'), 'utf8')).toBe('kept')
  })

  it('lists kept profiles and deletes one with its folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-testing-'))
    for (const one of ['store', 'staging', 'Not Valid']) mkdirSync(join(root, '.geckit', 'camoufox', 'profiles', one), { recursive: true })
    expect(testBrowsersState(root).profiles).toMatchObject([{ name: 'staging', open: false }, { name: 'store', open: false }])
    deleteTestProfile('store', root)
    expect(testBrowsersState(root).profiles).toMatchObject([{ name: 'staging', open: false }])
  })

  it('starts one driver per launch file, outside the conversation that left it', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'geckit-launch-'))
    const script = join(folder, 'driver.cjs')
    writeFileSync(script, "require('node:fs').appendFileSync(process.argv[1] + '.ran', process.argv.slice(2).join(' ') + '\\n')")
    writeFileSync(join(folder, 'a.launch'), JSON.stringify({ name: 'store' }))
    writeFileSync(join(folder, 'duplicate.launch'), JSON.stringify({ name: 'store' }))
    writeFileSync(join(folder, 'b.launch'), JSON.stringify({ name: '../etc' }))
    const stop = serveTestLaunches(process.execPath, script, folder, folder)
    for (let waited = 0; waited < 5_000 && !existsSync(`${script}.ran`); waited += 100) await new Promise((done) => setTimeout(done, 100))
    stop()
    expect(readFileSync(`${script}.ran`, 'utf8')).toBe('browser-test store\n')
    expect(existsSync(join(folder, 'a.launch')) || existsSync(join(folder, 'b.launch'))).toBe(false)
  })
})
