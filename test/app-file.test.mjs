// App files: what the build entry writes (src/build/app-file.ts), the
// reader reads back (src/app-file.ts), a description with it or not; a PNG
// that isn't one reads as null, and `inspectAppFile` says why, a format 1
// file from vintage-frames included; a version or range not exactly as
// semver writes it, or a level that isn't one, is refused; `satisfies` checks
// a version against a range and `compareVersions` puts versions in semver's
// order, neither throwing on what isn't one; `appRuns` says whether this SDK
// runs an application; and the SDK's VERSION is package.json's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'

import {
  APP_API,
  APP_API_OLDEST,
  APP_FILE_FORMAT,
  VERSION,
  appRuns,
  checkSignature,
  compareVersions,
  inspectAppFile,
  judgeSignature,
  readAppFile,
  satisfies,
} from '../scripts/.tmp/unit/pure.js'
import { appFile, generateSigningKeys, packApp, signAppFile, writeAppFile } from '../scripts/.tmp/unit/build/index.js'
import { encodePng } from '../scripts/.tmp/unit/build/png.js'
import { carriesApp, leadingImports } from '../scripts/.tmp/unit/app-file.js'

const MANIFEST_KEYWORD = 'system-online.app'
const CODE_KEYWORD = 'system-online.code'
const SIGNATURE_KEYWORD = 'system-online.signature'

/** A PNG's chunks, each with where it sits in the file and its bytes there. */
function chunksOf(bytes) {
  const buf = Buffer.from(bytes)
  const out = []
  for (let at = 8; at < buf.length; ) {
    const end = at + 12 + buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, end - 4)
    out.push({ at, type, raw: buf.subarray(at, end), keyword: type === 'iTXt' ? data.toString('latin1', 0, data.indexOf(0)) : null })
    at = end
  }
  return out
}
const assemble = (chunks) => new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks.map((c) => c.raw)]))
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0)
  return { type, raw: Buffer.concat([head, data, crc]) }
}
const itxt = (keyword, text, compressed) =>
  chunk('iTXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0, compressed ? 1 : 0, 0, 0, 0]), compressed ? zlib.deflateSync(text) : Buffer.from(text)]))

const pixels = (width, height, f) => {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(f(i % width, Math.floor(i / width)), i * 4)
  return { width, height, data }
}

const ICON = await encodePng(pixels(32, 32, (x, y) => [x * 8, y * 8, 0, (x + y) % 2 ? 255 : 0]))
const ICON_URL = `data:image/png;base64,${Buffer.from(ICON).toString('base64')}`
const MANIFEST = { format: APP_FILE_FORMAT, id: 'meteors', name: 'Meteors', version: '0.1.0', requires: '^0.1.0', api: APP_API, author: 'Adam Portilla', icon: ICON_URL }
const CODE = "import { defineApp } from 'system-online-sdk'\nexport default () => defineApp({ id: 'meteors' }) // ☄\n"

/** A box with chunks of its own around its image data. */
async function box() {
  const plain = chunksOf(await encodePng(pixels(6, 4, (x, y) => [x * 40, y * 60, 9, 255])))
  return assemble([plain[0], chunk('tEXt', Buffer.from('Comment\0a box')), ...plain.slice(1)])
}

/** An app file made by hand, so the reader meets manifests no writer would write. */
async function handMade(manifest, [manifestKeyword, codeKeyword] = [MANIFEST_KEYWORD, CODE_KEYWORD]) {
  const chunks = chunksOf(await box())
  const app = [itxt(manifestKeyword, JSON.stringify(manifest), false), itxt(codeKeyword, CODE, true)]
  return assemble([...chunks.slice(0, -1), ...app, chunks.at(-1)])
}

/** The manifest's JSON as the file holds it, past its iTXt chunk's keyword and header. */
function manifestText(file) {
  const { raw } = chunksOf(file).find((c) => c.keyword === MANIFEST_KEYWORD)
  return raw.toString('utf8', 8 + MANIFEST_KEYWORD.length + 5, raw.length - 4)
}

test('a written app file reads back its manifest and code, and its other chunks are the box\'s', async () => {
  const before = await box()
  const file = await writeAppFile(before, MANIFEST, CODE)
  assert.deepEqual(await readAppFile(file), { manifest: MANIFEST, code: CODE })
  const kept = chunksOf(file).filter((c) => !c.keyword?.startsWith('system-online.'))
  assert.deepEqual(kept.map((c) => c.raw), chunksOf(before).map((c) => c.raw))
  assert.deepEqual(chunksOf(file).slice(-3).map((c) => c.keyword ?? c.type), [MANIFEST_KEYWORD, CODE_KEYWORD, 'IEND'])
})

test('writing over an app file replaces its app chunks rather than adding a second pair', async () => {
  const once = await writeAppFile(await box(), MANIFEST, CODE)
  const twice = await writeAppFile(once, { ...MANIFEST, version: '0.2.0' }, 'export default () => ({})')
  assert.equal(chunksOf(twice).filter((c) => c.keyword?.startsWith('system-online.')).length, 2)
  const read = await readAppFile(twice)
  assert.equal(read.manifest.version, '0.2.0')
  assert.equal(read.code, 'export default () => ({})')
})

test('packed, the manifest holds its format, its level and the icon\'s file byte for byte, and the box is a picture', async () => {
  const file = await packApp({
    manifest: { id: 'meteors', name: 'Meteors', version: '0.1.0', requires: '^0.1.0', author: 'Adam Portilla' },
    icon: ICON,
    code: CODE,
  })
  const { manifest, code } = await readAppFile(file)
  assert.equal(manifest.format, APP_FILE_FORMAT)
  assert.equal(manifest.api, APP_API)
  assert.deepEqual(Buffer.from(manifest.icon.replace('data:image/png;base64,', ''), 'base64'), Buffer.from(ICON))
  assert.equal(code, CODE)
  assert.deepEqual(chunksOf(file).map((c) => c.keyword ?? c.type), ['IHDR', 'IDAT', MANIFEST_KEYWORD, CODE_KEYWORD, 'IEND'])
})

test('a PNG without app chunks, a broken CRC, a missing chunk, two of one or an unknown format reads as null', async () => {
  const plain = await box()
  assert.equal(await readAppFile(plain), null)
  assert.equal(await readAppFile(new Uint8Array([1, 2, 3])), null)

  const file = await writeAppFile(plain, MANIFEST, CODE)
  const broken = Uint8Array.from(file)
  broken[chunksOf(file).find((c) => c.keyword === CODE_KEYWORD).at + 40] ^= 0xff
  assert.equal(await readAppFile(broken), null)

  const chunks = chunksOf(file)
  const without = (keyword) => assemble(chunks.filter((c) => c.keyword !== keyword))
  assert.equal(await readAppFile(without(CODE_KEYWORD)), null)
  assert.equal(await readAppFile(without(MANIFEST_KEYWORD)), null)
  const doubled = assemble(chunks.flatMap((c) => (c.keyword === CODE_KEYWORD ? [c, c] : [c])))
  assert.equal(await readAppFile(doubled), null)

  assert.ok(await readAppFile(await handMade(MANIFEST)), 'the hand-made file reads')
  assert.equal(await readAppFile(await handMade({ ...MANIFEST, format: 3 })), null)
  assert.equal(await readAppFile(await handMade({ ...MANIFEST, requires: undefined })), null)
})

test('inspectAppFile says why a file isn\'t an app file, where readAppFile reads null', async () => {
  const plain = await box()
  const file = await writeAppFile(plain, MANIFEST, CODE)
  const broken = Uint8Array.from(file)
  broken[chunksOf(file).find((c) => c.keyword === CODE_KEYWORD).at + 40] ^= 0xff
  const codeless = assemble(chunksOf(file).filter((c) => c.keyword !== CODE_KEYWORD))
  for (const [bytes, reason] of [
    [plain, 'it carries no application'],
    [broken, 'it is not a whole PNG'],
    [codeless, 'its code is missing'],
  ]) {
    assert.equal(await inspectAppFile(bytes), reason)
    assert.equal(await readAppFile(bytes), null)
  }
  assert.deepEqual(await inspectAppFile(file), { manifest: MANIFEST, code: CODE })
})

test('a format 1 file, which vintage-frames wrote before the SDK, is refused, saying so', async () => {
  const old = await handMade({ ...MANIFEST, format: 1, requires: '^0.19.1', api: 2 }, ['vintage-frames.app', 'vintage-frames.code'])
  assert.equal(await inspectAppFile(old), 'it is format 1, built on vintage-frames before the SDK, so build it again on system-online-sdk')
  assert.equal(await readAppFile(old), null)
})

test('the reader refuses a version that isn\'t a version and a requires that isn\'t a version or a caret range, saying which', async () => {
  for (const [manifest, reason] of [
    [{ ...MANIFEST, version: '1.0' }, 'its version, 1.0, is not a version'],
    [{ ...MANIFEST, requires: 'banana' }, 'its requires, banana, is not a range'],
    [{ ...MANIFEST, requires: '>=0.1.0' }, 'its requires, >=0.1.0, is not a range'],
    [{ ...MANIFEST, requires: '~0.1.0' }, 'its requires, ~0.1.0, is not a range'],
    // Only as semver writes one: no v, no space around it, no leading zeros.
    ...['v0.1.0', ' 0.1.0', '0.1.0 ', '01.2.3', '1.0.0-01'].map((version) => [{ ...MANIFEST, version }, `its version, ${version}, is not a version`]),
    ...['^v0.1.0', ' ^0.1.0', '^0.01.0'].map((requires) => [{ ...MANIFEST, requires }, `its requires, ${requires}, is not a range`]),
  ]) {
    const file = await handMade(manifest)
    assert.equal(await inspectAppFile(file), reason)
    assert.equal(await readAppFile(file), null)
    await assert.rejects(writeAppFile(await box(), manifest, CODE), {
      message: `system-online-sdk/build: the manifest won't read back: ${reason}`,
    })
  }
  for (const requires of ['0.1.0', '^0.2.0-rc.1']) {
    assert.ok(await readAppFile(await handMade({ ...MANIFEST, requires })), requires)
  }
  for (const version of ['0.0.0', '10.20.30', '1.0.0-0.3.7', '1.0.0-x-y.0a', '1.0.0+build.007']) {
    assert.ok(await readAppFile(await handMade({ ...MANIFEST, version })), version)
  }
})

test('appFile() refuses an app.version that isn\'t a version when the build starts, as it refuses a missing field', () => {
  const app = { id: 'meteors', name: 'Meteors', version: '0.1.0', author: 'Adam Portilla' }
  assert.doesNotThrow(() => appFile({ app, entry: 'src/index.ts', icon: 'icon.png' }))
  for (const version of ['1.0', 'v0.1.0']) {
    assert.throws(() => appFile({ app: { ...app, version }, entry: 'src/index.ts', icon: 'icon.png' }), {
      message: `system-online-sdk appFile(): app.version, ${version}, is not a version`,
    })
  }
})

test('a written manifest lists its fields in one order, a description after the author, and packApp carries it', async () => {
  const described = { ...MANIFEST, description: 'An Asteroids-style game on a 320 × 240 1-bit screen.' }
  const file = await writeAppFile(await box(), described, CODE)
  assert.deepEqual(await readAppFile(file), { manifest: described, code: CODE })
  assert.deepEqual(Object.keys(JSON.parse(manifestText(file))), ['format', 'id', 'name', 'version', 'requires', 'api', 'author', 'description', 'icon'])
  const { format, api, icon, ...fields } = described
  const packed = await packApp({ manifest: fields, icon: ICON, code: CODE })
  assert.equal((await readAppFile(packed)).manifest.description, described.description)
})

test('a manifest without a description, or with an empty one, has none; one that isn\'t text is refused', async () => {
  for (const description of [undefined, '', '  ']) {
    const written = await readAppFile(await writeAppFile(await box(), { ...MANIFEST, description }, CODE))
    assert.deepEqual(written.manifest, MANIFEST, `written: ${JSON.stringify(description)}`)
    if (description === undefined) continue
    const handWritten = await readAppFile(await handMade({ ...MANIFEST, description }))
    assert.deepEqual(handWritten.manifest, MANIFEST, `hand-made: ${JSON.stringify(description)}`)
  }
  for (const description of [42, null, ['a description']]) {
    assert.equal(await inspectAppFile(await handMade({ ...MANIFEST, description })), 'its description is not text')
    await assert.rejects(writeAppFile(await box(), { ...MANIFEST, description }, CODE), /its description is not text/)
  }
})

test('the reader refuses a manifest without an api, or with one that isn\'t a whole number from 1, saying so', async () => {
  const { api, ...levelless } = MANIFEST
  assert.equal(await inspectAppFile(await handMade(levelless)), 'its manifest has no api')
  await assert.rejects(writeAppFile(await box(), levelless, CODE), /its manifest has no api/)
  for (const api of [0, -1, 1.5, '1', null, true]) {
    const reason = `its api, ${JSON.stringify(api)}, is not a level`
    assert.equal(await inspectAppFile(await handMade({ ...MANIFEST, api })), reason)
    await assert.rejects(writeAppFile(await box(), { ...MANIFEST, api }, CODE), {
      message: `system-online-sdk/build: the manifest won't read back: ${reason}`,
    })
  }
})

test('appRuns: a level from APP_API_OLDEST to APP_API runs, and one outside doesn\'t', () => {
  for (let api = APP_API_OLDEST; api <= APP_API; api++) assert.ok(appRuns({ api }), `api ${api}`)
  for (const api of [1, 2, APP_API_OLDEST - 1, APP_API + 1, 1.5, undefined]) assert.ok(!appRuns({ api }), `api ${api}`)
})

test('the writer refuses a manifest it couldn\'t read back', async () => {
  await assert.rejects(writeAppFile(await box(), { ...MANIFEST, format: 1 }, CODE), /format 1/)
  await assert.rejects(writeAppFile(new Uint8Array([1, 2, 3]), MANIFEST, CODE), /not a whole PNG/)
})

test('satisfies: a caret range on 0.x takes its minor\'s patches and nothing past them; on 1.x and up, its major\'s', () => {
  assert.ok(satisfies('0.16.2', '^0.16.2'))
  assert.ok(satisfies('0.16.9', '^0.16.2'))
  assert.ok(!satisfies('0.16.1', '^0.16.2'))
  assert.ok(!satisfies('0.17.0', '^0.16.2'))
  assert.ok(!satisfies('1.0.0', '^0.16.2'))
  assert.ok(satisfies('0.0.3', '^0.0.3'))
  assert.ok(!satisfies('0.0.4', '^0.0.3'))
  assert.ok(satisfies('1.2.3', '^1.2.3'))
  assert.ok(satisfies('1.9.0', '^1.2.3'))
  assert.ok(!satisfies('2.0.0', '^1.2.3'))
  assert.ok(!satisfies('1.2.2', '^1.2.3'))
})

test('satisfies: exact versions, prereleases only against their own, anything else false', () => {
  assert.ok(satisfies('0.16.2', '0.16.2'))
  assert.ok(!satisfies('0.16.3', '0.16.2'))
  assert.ok(!satisfies('0.17.0-rc.1', '^0.16.2'))
  assert.ok(!satisfies('0.16.3-rc.1', '^0.16.2'))
  assert.ok(satisfies('0.17.0-rc.2', '^0.17.0-rc.1'))
  assert.ok(!satisfies('0.17.0-rc.1', '^0.17.0-rc.2'))
  assert.ok(satisfies('0.17.0', '^0.17.0-rc.1'))
  assert.ok(!satisfies('0.17.0-rc.1', '^0.17.0'))
  assert.ok(!satisfies('0.16.2', '>=0.16.2'))
  assert.ok(!satisfies('0.16.2', '~0.16.2'))
  assert.ok(!satisfies('banana', '^0.16.2'))
  assert.ok(!satisfies(null, '^0.16.2'))
  assert.ok(!satisfies('0.16.2', undefined))
})

test('compareVersions: semver\'s order, build metadata ignored, and anything that isn\'t a version first', () => {
  // semver.org's own example of precedence, sorted from the wrong end.
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']
  assert.deepEqual([...ordered].reverse().sort(compareVersions), ordered)
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0)
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0)
  assert.ok(compareVersions('1.0.0-rc.2', '1.0.0-rc.10') < 0, 'numeric identifiers by value')
  assert.ok(compareVersions('1.0.0-1', '1.0.0-alpha') < 0, 'numeric identifiers before alphanumeric ones')
  assert.equal(compareVersions('0.17.0', '0.17.0'), 0)
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0)
  assert.ok(compareVersions('banana', '0.0.0-0') < 0)
  assert.ok(compareVersions('0.0.0-0', '1.0') > 0)
  assert.equal(compareVersions('banana', '1.0'), 0)
  assert.ok(compareVersions('01.0.0', '0.0.0-0') < 0, 'leading zeros: not a version')
  // Read for comparing: space around a version and a leading v are let go.
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions(' 1.0.0 ', '1.0.0'), 0)
  // What isn't a string sorts with what isn't a version, and no sort throws.
  assert.deepEqual(['1.0.0', null, '0.9.0', 7, { version: '2.0.0' }].sort(compareVersions), [null, 7, { version: '2.0.0' }, '0.9.0', '1.0.0'])
})

test('VERSION is package.json\'s version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(VERSION, pkg.version)
})

/* ── Signatures ─────────────────────────────────────────────────────────── */

const KEYS = await generateSigningKeys()
const OTHER = await generateSigningKeys()

/** `file` with one chunk's data swapped by `edit`, its CRC made good, so the PNG stays whole: a forger's change. */
function forged(file, pick, edit) {
  const chunks = chunksOf(file)
  const at = chunks.findIndex(pick)
  const { raw, type } = chunks[at]
  return assemble([...chunks.slice(0, at), chunk(type, edit(Buffer.from(raw.subarray(8, raw.length - 4)))), ...chunks.slice(at + 1)])
}

test('a key pair is base64: the public key its 32 bytes, the private key its PKCS #8 form', () => {
  assert.equal(Buffer.from(KEYS.publicKey, 'base64').length, 32)
  assert.equal(Buffer.from(KEYS.privateKey, 'base64').length, 48)
  assert.notEqual(KEYS.publicKey, OTHER.publicKey)
})

test('checking a signature: unsigned, or signed and by which key; the reader reads a signed file as any other', async () => {
  const file = await writeAppFile(await box(), MANIFEST, CODE)
  assert.deepEqual(await checkSignature(file), { status: 'unsigned' })
  const signed = await signAppFile(file, KEYS.privateKey)
  assert.deepEqual(await checkSignature(signed), { status: 'signed', key: KEYS.publicKey })
  assert.deepEqual(await readAppFile(signed), { manifest: MANIFEST, code: CODE })
  // The box keeps its chunks; the signature goes in before IEND.
  assert.deepEqual(chunksOf(signed).slice(-4).map((c) => c.keyword ?? c.type), [MANIFEST_KEYWORD, CODE_KEYWORD, SIGNATURE_KEYWORD, 'IEND'])
  const { raw } = chunksOf(signed).find((c) => c.keyword === SIGNATURE_KEYWORD)
  const fields = JSON.parse(raw.toString('utf8', 8 + SIGNATURE_KEYWORD.length + 5, raw.length - 4))
  assert.deepEqual(Object.keys(fields), ['algorithm', 'key', 'signature'])
  assert.equal(fields.algorithm, 'Ed25519')
})

test('a signature covers every byte but its own chunk: one byte of the manifest, the code or the picture changed breaks it', async () => {
  const signed = await signAppFile(await writeAppFile(await box(), MANIFEST, CODE), KEYS.privateKey)
  const author = forged(signed, (c) => c.keyword === MANIFEST_KEYWORD, (data) => {
    const at = data.indexOf('Adam')
    data[at] = 'E'.charCodeAt(0)
    return data
  })
  assert.equal((await readAppFile(author)).manifest.author, 'Edam Portilla', 'a whole app file, but not the one signed')
  const code = forged(signed, (c) => c.keyword === CODE_KEYWORD, () => itxt(CODE_KEYWORD, CODE.replace('meteors', 'meteorz'), true).raw.subarray(8, -4))
  assert.equal((await readAppFile(code)).code, CODE.replace('meteors', 'meteorz'))
  const picture = forged(signed, (c) => c.type === 'IDAT', (data) => {
    data[2] ^= 1
    return data
  })
  const tail = new Uint8Array([...signed, 0])
  for (const [file, what] of [[author, 'the manifest'], [code, 'the code'], [picture, 'the picture'], [tail, 'a byte past IEND']]) {
    assert.deepEqual(
      await checkSignature(file),
      { status: 'broken', key: KEYS.publicKey, reason: 'it was changed after it was signed' },
      what
    )
  }
})

test('two signatures, one that doesn’t read and another algorithm are broken', async () => {
  const signed = await signAppFile(await writeAppFile(await box(), MANIFEST, CODE), KEYS.privateKey)
  const twice = assemble(chunksOf(signed).flatMap((c) => (c.keyword === SIGNATURE_KEYWORD ? [c, c] : [c])))
  assert.deepEqual(await checkSignature(twice), { status: 'broken', key: null, reason: 'it has two signatures' })
  const swap = (fields) => forged(signed, (c) => c.keyword === SIGNATURE_KEYWORD, () => itxt(SIGNATURE_KEYWORD, fields, false).raw.subarray(8, -4))
  assert.equal((await checkSignature(swap('not json'))).reason, 'its signature does not read')
  assert.equal((await checkSignature(swap(JSON.stringify({ algorithm: 'Ed25519', key: KEYS.publicKey, signature: 'AAAA' })))).reason, 'its signature does not read')
  assert.deepEqual(await checkSignature(swap(JSON.stringify({ algorithm: 'RSA', key: KEYS.publicKey, signature: 'AAAA' }))), {
    status: 'broken',
    key: KEYS.publicKey,
    reason: 'its signature is "RSA", and this SDK checks Ed25519',
  })
  assert.equal((await checkSignature(new Uint8Array([1, 2, 3]))).status, 'broken')
})

test('signing again replaces the signature; a rewritten file carries none; the key can be PEM', async () => {
  const file = await writeAppFile(await box(), MANIFEST, CODE)
  const once = await signAppFile(file, KEYS.privateKey)
  const pem = `-----BEGIN PRIVATE KEY-----\n${KEYS.privateKey}\n-----END PRIVATE KEY-----\n`
  const again = await signAppFile(once, pem)
  assert.equal(chunksOf(again).filter((c) => c.keyword === SIGNATURE_KEYWORD).length, 1)
  assert.deepEqual(await checkSignature(again), { status: 'signed', key: KEYS.publicKey })
  const resigned = await signAppFile(once, OTHER.privateKey)
  assert.deepEqual(await checkSignature(resigned), { status: 'signed', key: OTHER.publicKey })
  const rewritten = await writeAppFile(once, { ...MANIFEST, version: '0.2.0' }, CODE)
  assert.deepEqual(await checkSignature(rewritten), { status: 'unsigned' }, 'writeAppFile drops it with the app chunks')
  await assert.rejects(signAppFile(await box(), KEYS.privateKey), /not an app file: it carries no application/)
  await assert.rejects(signAppFile(file, KEYS.publicKey), /not an Ed25519 private key/)
  await assert.rejects(signAppFile(file, 'banana'), /not an Ed25519 private key/)
})

test('the trust’s answer for each standing and setting: a held key installs; a broken signature is refused whatever', async () => {
  const file = await writeAppFile(await box(), MANIFEST, CODE)
  const unsigned = await checkSignature(file)
  const signed = await checkSignature(await signAppFile(file, KEYS.privateKey))
  const broken = { status: 'broken', key: KEYS.publicKey, reason: 'it was changed after it was signed' }
  const answers = (trust) => [signed, unsigned, broken].map((check) => {
    const { standing, answer } = judgeSignature(check, trust)
    return `${standing}:${answer}`
  })
  assert.deepEqual(answers(null), ['untrusted:install', 'unsigned:install', 'broken:refuse'], 'no trust: any file installs')
  assert.deepEqual(answers({ keys: [KEYS.publicKey] }), ['trusted:install', 'unsigned:ask', 'broken:refuse'], 'asked about by default')
  assert.deepEqual(answers({ keys: [OTHER.publicKey], otherwise: 'refuse' }), ['untrusted:refuse', 'unsigned:refuse', 'broken:refuse'])
  assert.deepEqual(answers({ keys: [], otherwise: 'install' }), ['untrusted:install', 'unsigned:install', 'broken:refuse'])
  assert.deepEqual(answers({ keys: [OTHER.publicKey, KEYS.publicKey], otherwise: 'ask' }), ['trusted:install', 'unsigned:ask', 'broken:refuse'])
  // A key written another way is the same key.
  const urlSafe = KEYS.publicKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.deepEqual(judgeSignature(signed, { keys: [urlSafe] }), { standing: 'trusted', key: KEYS.publicKey, answer: 'install' })
})

test('carriesApp: a PNG with an app file’s chunks, whole or not; any other PNG or file isn’t one', async () => {
  const file = await writeAppFile(await box(), MANIFEST, CODE)
  assert.equal(carriesApp(file), true)
  assert.equal(carriesApp(file.subarray(0, file.length - 30)), true, 'cut short')
  assert.equal(carriesApp(await handMade({ ...MANIFEST, format: 1 }, ['vintage-frames.app', 'vintage-frames.code'])), true, 'format 1')
  assert.equal(carriesApp(await box()), false)
  assert.equal(carriesApp(new TextEncoder().encode('iTXtsystem-online.app')), false, 'not a PNG')
})

/* ── The code's imports ─────────────────────────────────────────────────── */

/** The specifiers leadingImports finds in `code`, each as the code quotes it. */
const heads = (code) => leadingImports(code)?.map(({ specifier, start, end }) => `${specifier}@${code.slice(start, end)}`) ?? null

test('leadingImports: every declaration a bundle opens with, each name where its quotes sit', () => {
  const code = [
    '#!/usr/bin/env node',
    '"use strict";',
    '/* a banner */ // and a line',
    'import { a as b, "c-d" as e } from "vintage-frames";',
    "import * as kit from 'vintage-frames'",
    'import f, { g } from "system-online-sdk";',
    'import "system-online-sdk/pure";',
    'import data from "./data.json" with { type: "json" };',
    'export * from "system-online-sdk/pure";',
    'export * as "name" from "x";',
    'export { h, i as j } from "y";',
    '//#region src/index.ts',
    'const k = "import { z } from \\"nope\\"";',
    'import { late } from "late";',
  ].join('\n')
  assert.deepEqual(heads(code), [
    'vintage-frames@"vintage-frames"',
    "vintage-frames@'vintage-frames'",
    'system-online-sdk@"system-online-sdk"',
    'system-online-sdk/pure@"system-online-sdk/pure"',
    './data.json@"./data.json"',
    'system-online-sdk/pure@"system-online-sdk/pure"',
    'x@"x"',
    'y@"y"',
  ])
})

test('leadingImports: minified, and stopping at the code, a local export, import() and import.meta', () => {
  assert.deepEqual(heads('import{a as b}from"vintage-frames";import*as c from"system-online-sdk";export{d};import("e")'), [
    'vintage-frames@"vintage-frames"',
    'system-online-sdk@"system-online-sdk"',
  ])
  assert.deepEqual(heads('import("vintage-frames").then(() => {})'), [])
  assert.deepEqual(heads('import.meta.url; import x from "y"'), [])
  assert.deepEqual(heads('export default function () {}'), [])
  assert.deepEqual(heads(''), [])
  assert.equal(heads('import { a } from "unterminated'), null)
  assert.equal(heads('import { a from "x"'), null)
  assert.equal(heads('/* open'), null)
})

test('leadingImports reads the head of a packed app file’s code, as an install does', async () => {
  const code = 'import { centeredBox as e, defineApp as t } from "system-online-sdk";\nimport { VF_BODY_FAMILY as n } from "vintage-frames";\n//#region src/index.ts\nexport { t as default };\n'
  const { code: read } = await readAppFile(await packApp({ manifest: { id: 'x', name: 'X', version: '1.0.0', requires: '^0.2.0', author: 'A' }, icon: ICON, code }))
  assert.deepEqual(leadingImports(read).map((i) => i.specifier), ['system-online-sdk', 'vintage-frames'])
})
