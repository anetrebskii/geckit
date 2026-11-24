import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { sign } from 'node:crypto'
import { appendFileSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const [command, ipa, version, buildNumber] = process.argv.slice(2)
const bundleId = 'com.anetrebskii.geckit'
const appId = '6815725206'
const appPath = 'Payload/App.app'
const readyStates = ['WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_APPROVED', 'IN_BETA_TESTING']

assert(['verify', 'check-access', 'deliver'].includes(command), 'Choose verify, check-access or deliver')

if (command !== 'check-access') {
  assert(ipa && /^\d+\.\d+\.\d+$/.test(version) && /^\d+$/.test(buildNumber), 'Enter an IPA, release version, and build number')

  for (const [path, id] of [
    [appPath, bundleId],
    [`${appPath}/PlugIns/NotificationService.appex`, `${bundleId}.NotificationService`],
  ]) {
    const plist = execFileSync('unzip', ['-p', ipa, `${path}/Info.plist`])
    const info = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: plist, encoding: 'utf8' }))
    assert.equal(info.CFBundleIdentifier, id)
    assert.equal(info.CFBundleShortVersionString, version, `Version in ${id}`)
    assert.equal(info.CFBundleVersion, buildNumber, `Build number in ${id}`)
  }
  console.log(`Verified GeckIt iOS ${version} (${buildNumber}) and its notification extension.`)
}

function upload(key, keyId) {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-testflight-'))
  const keyPath = join(directory, `ApiKey_${keyId}.p8`)
  writeFileSync(keyPath, key, { mode: 0o600 })
  try {
    execFileSync('xcrun', ['altool', '--upload-package', ipa, '--api-key', keyId, '--api-issuer', '', '--api-key-subject', 'user'], {
      env: { ...process.env, API_PRIVATE_KEYS_DIR: directory },
      stdio: 'inherit',
    })
  } finally {
    unlinkSync(keyPath)
    rmdirSync(directory)
  }
}

async function deliver() {
  const { ASC_KEY_ID: keyId, ASC_PRIVATE_KEY: key } = process.env
  assert(keyId && key, 'Configure the GeckIt-only individual key as ASC_KEY_ID and ASC_PRIVATE_KEY in the testflight environment')
  delete process.env.ASC_PRIVATE_KEY

  async function request(path, query = {}, method = 'GET', data) {
    const now = Math.floor(Date.now() / 1000)
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const claims = `${encode({ alg: 'ES256', typ: 'JWT', kid: keyId })}.${encode({ sub: 'user', iat: now, exp: now + 300, aud: 'appstoreconnect-v1' })}`
    const signature = sign('sha256', Buffer.from(claims), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    const url = new URL(path, 'https://api.appstoreconnect.apple.com/v1/')
    url.search = new URLSearchParams(query).toString()
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${claims}.${signature}`, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify({ data }),
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status === 204) return
    const result = await response.json()
    assert(response.ok, `${method} ${url.pathname} failed (${response.status}): ${JSON.stringify(result.errors)}`)
    return result
  }

  const apps = await request('apps', { limit: '2' })
  assert(!apps.links?.next && apps.data.length === 1 && apps.data[0].id === appId
    && apps.data[0].attributes.bundleId === bundleId, 'The individual App Store Connect key must have access only to GeckIt')
  if (command === 'check-access') {
    console.log('App Store Connect key access is limited to GeckIt.')
    return
  }
  const groups = await request(`apps/${appId}/betaGroups`)
  const group = groups.data.find(({ attributes }) => attributes.name === 'Public' && !attributes.isInternalGroup)
  assert(group?.attributes.publicLinkEnabled, 'GeckIt Public must have an enabled TestFlight link')
  const groupRef = { type: 'betaGroups', id: group.id }

  const findBuild = async () => {
    const result = await request('builds', {
      'filter[app]': appId,
      'filter[version]': buildNumber,
      'filter[preReleaseVersion.version]': version,
      'filter[preReleaseVersion.platform]': 'IOS',
    })
    assert(result.data.length <= 1, 'Multiple App Store Connect builds match the IPA')
    return result.data[0]
  }
  const findUpload = async () => {
    const result = await request(`apps/${appId}/buildUploads`, {
      'filter[cfBundleShortVersionString]': version,
      'filter[cfBundleVersion]': buildNumber,
      'filter[platform]': 'IOS',
    })
    const deliveries = result.data.map(({ attributes }) => attributes.state)
    return deliveries.find(({ state }) => state !== 'FAILED') ?? deliveries[0]
  }

  let build = await findBuild()
  if (!build && !(await findUpload())) upload(key, keyId)
  for (let attempt = 0; build?.attributes.processingState !== 'VALID'; attempt += 1) {
    const delivery = await findUpload()
    assert(!delivery?.errors?.length && delivery?.state !== 'FAILED', `Apple upload failed: ${JSON.stringify(delivery?.errors)}`)
    assert(!build || build.attributes.processingState === 'PROCESSING', `Apple build is ${build?.attributes.processingState}`)
    assert(attempt < 40, 'Apple is still processing the upload. Re-run the TestFlight job to continue.')
    await setTimeout(30_000)
    build = await findBuild()
  }
  assert.equal(build.attributes.expired, false)
  assert.equal(build.attributes.usesNonExemptEncryption, false, 'The build needs export-compliance information')

  const path = `builds/${build.id}`
  const buildRef = { type: 'builds', id: build.id }
  const { data: localizations } = await request(`${path}/betaBuildLocalizations`)
  if (!localizations.some(({ attributes }) => attributes.locale === 'en-US')) {
    await request('betaBuildLocalizations', {}, 'POST', {
      type: 'betaBuildLocalizations',
      attributes: {
        locale: 'en-US',
        whatsNew: `GeckIt ${version}. Connect to your computer, open a conversation, and try sending a message from iPhone.`,
      },
      relationships: { build: { data: buildRef } },
    })
  }

  const readState = () => request(path, { include: 'betaGroups,buildBetaDetail,betaAppReviewSubmission' })
  const betaDetail = (result) => result.included?.find(({ type }) => type === 'buildBetaDetails')
  const isInGroup = (result) => result.included?.some(({ type, id }) => type === groupRef.type && id === groupRef.id)
  const current = await readState()
  const detail = betaDetail(current)
  assert(detail, 'Build is missing TestFlight details')
  if (!detail.attributes.autoNotifyEnabled) {
    await request(`buildBetaDetails/${detail.id}`, {}, 'PATCH', {
      type: detail.type, id: detail.id, attributes: { autoNotifyEnabled: true },
    })
  }
  if (!isInGroup(current)) await request(`${path}/relationships/betaGroups`, {}, 'POST', [groupRef])

  const state = await readState()
  const external = betaDetail(state)?.attributes.externalBuildState
  if (external === 'READY_FOR_BETA_SUBMISSION' && !state.included.some(({ type }) => type === 'betaAppReviewSubmissions')) {
    await request('betaAppReviewSubmissions', {}, 'POST', {
      type: 'betaAppReviewSubmissions',
      relationships: { build: { data: buildRef } },
    })
  }

  const verified = await readState()
  const verifiedDetail = betaDetail(verified)?.attributes
  assert(isInGroup(verified), 'Apple did not confirm membership in Public')
  assert(verifiedDetail?.autoNotifyEnabled, 'Apple did not confirm automatic distribution')
  assert(readyStates.includes(verifiedDetail.externalBuildState), `Unexpected TestFlight state: ${verifiedDetail.externalBuildState}`)
  const stateLabel = verifiedDetail.externalBuildState.replaceAll('_', ' ').toLowerCase()
  const summary = `GeckIt iOS ${version} (${buildNumber}) added to [TestFlight Public](${group.attributes.publicLink}). Apple status: ${stateLabel}.`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
}

if (command !== 'verify') await deliver()
