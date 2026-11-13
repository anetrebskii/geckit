import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTENSION_ID, installBrowserBridge, removeBrowserBridge, setBrowserBridgeOn } from '../src/cli/browser'
import { BROWSER, BROWSER_SKILL, SECRETS, browserSkillFiles, secretsSkillFiles } from '../src/main/guide'

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
    expect(described).toMatchObject({ path: host, allowed_origins: [`chrome-extension://${EXTENSION_ID}/`, 'chrome-extension://mjllmbfhnbeihgghghnbbkfcpahljnkp/'] })
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
    expect(BROWSER('/bin/geckit', true)).toContain('`geckit:use-browser` skill')
    expect(BROWSER('/bin/geckit', false, true)).toContain('browser profiles')
    setBrowserBridgeOn(false)
  })

  it('gives the skill its name, when to use it, and how to pick a profile', () => {
    const skill = BROWSER_SKILL('/bin/geckit', 'geckit-use-browser')
    expect(skill).toMatch(/^---\nname: geckit-use-browser\ndescription: .+\n---\n/)
    expect(skill).toContain('/bin/geckit browser profiles')
    expect(skill).toContain('--profile <email or name>')
  })

  it('keeps the skill within the skill format and links each reference it ships', () => {
    const files = browserSkillFiles('/bin/geckit', 'geckit-use-browser')
    const skill = files['SKILL.md'] ?? ''
    const description = /\ndescription: (.+)\n/.exec(skill)?.[1] ?? ''
    expect(description.split(/\s+/).length).toBeLessThanOrEqual(50)
    expect(description.length).toBeLessThanOrEqual(1024)
    expect(skill.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(750)
    const references = Object.keys(files).filter((path) => path !== 'SKILL.md')
    expect(references).toEqual(['references/test-browsers.md', 'references/design-checks.md'])
    for (const path of references) expect(skill).toContain(`](${path})`)
    expect(skill).toContain('`geckit-use-secrets` skill')
    expect(BROWSER_SKILL('/bin/geckit', 'use-browser')).toContain('`geckit:use-secrets` skill')
    expect(Object.values(files).join('')).not.toContain('{{')
  })

  it('gives secrets a skill of their own, in the skill format, whatever the Chrome switch says', () => {
    const files = secretsSkillFiles('/bin/geckit', 'geckit-use-secrets')
    expect(Object.keys(files)).toEqual(['SKILL.md'])
    const skill = files['SKILL.md'] ?? ''
    expect(skill).toMatch(/^---\nname: geckit-use-secrets\ndescription: .+\n---\n/)
    const description = /\ndescription: (.+)\n/.exec(skill)?.[1] ?? ''
    expect(description.split(/\s+/).length).toBeLessThanOrEqual(50)
    expect(skill.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(750)
    for (const part of ['## Purpose', '## Inputs', '## Work', '## Unknowns', '## Output', '## Verification']) expect(skill).toContain(part)
    for (const command of ['/bin/geckit secrets request <name> --use', '/bin/geckit secrets wait <name>', '/bin/geckit secrets run --env NAME=secret:<name>', '/bin/geckit browser type <tab> <ref> --secret <name>']) expect(skill).toContain(command)
    expect(skill).toContain('final message of this turn')
    expect(skill).not.toContain('{{')
    setBrowserBridgeOn(false)
    expect(SECRETS('/bin/geckit', true)).toContain('`geckit:use-secrets` skill')
    expect(SECRETS('/bin/geckit')).toContain('`geckit-use-secrets` skill')
    expect(SECRETS('/bin/geckit', false, true)).toContain('### Work')
  })

  it('puts the references into the guide as sections where no skill can be given', () => {
    setBrowserBridgeOn(true)
    const inline = BROWSER('/bin/geckit', false, true)
    expect(inline).toContain('## Test browsers')
    expect(inline).toContain('## Design checks')
    expect(inline).toContain('the Secrets section of this guide')
    expect(inline).toContain('the Test browsers section below')
    expect(inline).not.toContain('references/')
    setBrowserBridgeOn(false)
  })
})
