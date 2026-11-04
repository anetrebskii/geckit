import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTENSION_ID, installBrowserBridge, removeBrowserBridge, setBrowserBridgeOn } from '../src/cli/browser'
import { BROWSER } from '../src/main/guide'

describe('browser bridge install', () => {
  it('writes the extension, the host program and Chrome\'s host manifest for the installed browsers only', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-bridge-'))
    mkdirSync(join(root, 'Library', 'Application Support', 'Google', 'Chrome'), { recursive: true })
    installBrowserBridge('/Applications/GeckIt.app/Contents/MacOS/GeckIt', '/Applications/GeckIt.app/Contents/Resources/app.asar/out/main/cli.js', 'darwin', root)
    const extension = JSON.parse(readFileSync(join(root, '.geckit', 'chrome-extension', 'manifest.json'), 'utf8')) as { permissions: string[] }
    expect(extension.permissions).toContain('nativeMessaging')
    const named = readFileSync(join(root, '.geckit', 'chrome-extension', 'manifest.json'), 'utf8').match(/[\w/]+\.(png|html)/g) ?? []
    for (const file of named) expect(statSync(join(root, '.geckit', 'chrome-extension', file)).size).toBeGreaterThan(0)
    expect(readFileSync(join(root, '.geckit', 'chrome-extension', 'icons', '16.png')).subarray(1, 4).toString()).toBe('PNG')
    const host = join(root, '.geckit', 'bin', 'geckit-browser-host')
    expect(readFileSync(host, 'utf8')).toContain('"/Applications/GeckIt.app/Contents/Resources/app.asar/out/main/cli.js" browser-host "$@"')
    expect(statSync(host).mode & 0o111).not.toBe(0)
    const described = JSON.parse(readFileSync(join(root, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'org.geckit.browser.json'), 'utf8')) as { path: string; allowed_origins: string[] }
    expect(described).toMatchObject({ path: host, allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] })
    expect(() => statSync(join(root, 'Library', 'Application Support', 'Chromium'))).toThrow()
  })

  it('turned off, takes away the host and its manifest and keeps the extension Chrome loads', () => {
    const root = mkdtempSync(join(tmpdir(), 'geckit-bridge-'))
    const chrome = join(root, 'Library', 'Application Support', 'Google', 'Chrome')
    mkdirSync(chrome, { recursive: true })
    installBrowserBridge('/bin/GeckIt', '/cli.js', 'darwin', root)
    removeBrowserBridge('darwin', root)
    expect(existsSync(join(chrome, 'NativeMessagingHosts', 'org.geckit.browser.json'))).toBe(false)
    expect(existsSync(join(root, '.geckit', 'bin', 'geckit-browser-host'))).toBe(false)
    expect(existsSync(join(root, '.geckit', 'chrome-extension', 'manifest.json'))).toBe(true)
  })

  it('tells the assistants about Chrome only while it is on', () => {
    setBrowserBridgeOn(false)
    expect(BROWSER('/bin/geckit')).toBe('')
    setBrowserBridgeOn(true)
    expect(BROWSER('/bin/geckit')).toContain('## Chrome through GeckIt')
    setBrowserBridgeOn(false)
  })
})
