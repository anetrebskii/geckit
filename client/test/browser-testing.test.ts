import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickProfile } from '../src/cli/browser'
import { deleteTestProfile, extensionSource, makeTestAccount, pageScript, scrubSecrets, updateTestProfile, serveTestLaunches, testBrowsersState, validTestName } from '../src/cli/testing'

describe('test browsers', () => {
  it('replaces filled secret values in what eval returns', () => {
    expect(scrubSecrets({ token: 'pw-12345', nested: ['x pw-12345 y', 'a"b\\c'] }, ['pw-12345', 'a"b\\c'])).toEqual({ token: '[secret]', nested: ['x [secret] y', '[secret]'] })
    expect(scrubSecrets('nothing', [])).toBe('nothing')
  })
  it('runs the extension own page functions, read out of background.js', () => {
    const scope = new Function(`${pageScript()}; return geckitPage`)() as Record<string, unknown>
    expect(Object.keys(scope).sort()).toEqual(['pageBox', 'pageCenter', 'pageClick', 'pageOverlay', 'pagePointer', 'pageRead', 'pageScroll', 'pageSecretField', 'pageSecrets', 'pageSlow', 'pageStyle', 'pageText', 'pageType', 'pageTypeSecret'])
    expect(extensionSource('lzw')).toMatch(/^function lzw\(indexes\) \{[\s\S]*\n\}$/)
    expect(extensionSource('LZW_CODES')).toBe('const LZW_CODES = new Int32Array(4096 * 256)')
    expect(() => extensionSource('nothingLikeThis')).toThrow('background.js has no nothingLikeThis')
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
    expect(testBrowsersState(root).profiles).toEqual([{ name: 'plain', open: false }])
  })

  it('renames a profile and changes its description, keeping its files', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-testing-'))
    makeTestAccount('old', 'GitHub as alex', root, true)
    writeFileSync(join(root, '.geckit', 'camoufox', 'profiles', 'old', 'Cookies'), 'kept')
    makeTestAccount('taken', '', root, true)
    updateTestProfile('old', 'old', 'GitHub as work', root)
    expect(testBrowsersState(root).profiles.find((one) => one.name === 'old')?.note).toBe('GitHub as work')
    expect(() => updateTestProfile('old', 'taken', '', root)).toThrow('already exists')
    updateTestProfile('old', 'github-work', 'GitHub as work', root)
    expect(testBrowsersState(root).profiles).toEqual([{ name: 'github-work', open: false, note: 'GitHub as work' }, { name: 'taken', open: false }])
    expect(readFileSync(join(root, '.geckit', 'camoufox', 'profiles', 'github-work', 'Cookies'), 'utf8')).toBe('kept')
  })

  it('lists kept profiles and deletes one with its folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-testing-'))
    for (const one of ['store', 'staging', 'Not Valid']) mkdirSync(join(root, '.geckit', 'camoufox', 'profiles', one), { recursive: true })
    expect(testBrowsersState(root).profiles).toEqual([{ name: 'staging', open: false }, { name: 'store', open: false }])
    deleteTestProfile('store', root)
    expect(testBrowsersState(root).profiles).toEqual([{ name: 'staging', open: false }])
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
