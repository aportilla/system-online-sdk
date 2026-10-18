/**
 * App files: an application as one PNG. The picture is the application's
 * box; two iTXt chunks before IEND carry its manifest, as JSON, and its code,
 * one ES module compressed with zlib. A third, when the file is signed,
 * carries an Ed25519 signature over every byte of the file but its own chunk,
 * and the public key that made it. Any PNG tool reads the chunks and any
 * decoder skips them.
 *
 * This is the reading half: the reader, checking a signature and what a
 * site's trust says of it, checking a version against a range, putting
 * versions in order, the app API levels and whether this SDK runs an
 * application, and the scale every box is drawn at. It is pure and runs the
 * same under Node and in a page, through the platform's compression streams
 * and WebCrypto. Writing an app file, signing one, and the box, are
 * `system-online-sdk/build`'s.
 */

/** The app file format this SDK reads and writes. */
export const APP_FILE_FORMAT = 2

/**
 * The app API this SDK provides: the level of what a built application can
 * use of it and of vintage-frames. It goes up when something in it changes
 * or goes away, and never for an addition. app-api.json lists what it covers.
 */
export const APP_API = 3

/** The oldest app API this SDK still runs. */
export const APP_API_OLDEST = 3

/**
 * One system px of an app file's box, in its picture's px: every box of
 * this format is drawn at 3×, each system px a 3 × 3 block.
 */
export const BOX_SCALE = 3

/** The iTXt keywords of the manifest's chunk and the code's. */
export const MANIFEST_KEYWORD = 'system-online.app'
export const CODE_KEYWORD = 'system-online.code'

/** The iTXt keyword of the signature's chunk. */
export const SIGNATURE_KEYWORD = 'system-online.signature'

/** The manifest's keyword in format 1, which vintage-frames wrote before the SDK. */
const FORMAT_1_KEYWORD = 'vintage-frames.app'

/** What an app file says about its application. */
export interface AppManifest {
  /** The app file's own format, {@link APP_FILE_FORMAT}. */
  format: number
  id: string
  name: string
  version: string
  /** The SDK range the code was built and checked against: `^0.1.0`. */
  requires: string
  /** The app API the code was built against, {@link APP_API}. */
  api: number
  author: string
  /** What the application is, in a sentence or two of plain text. */
  description?: string
  /** Its 32 × 32 icon: its PNG as a `data:` URL. */
  icon: string
}

/** An application, read from its app file. */
export interface AppFile {
  manifest: AppManifest
  /** One ES module. Its default export is the application's factory. */
  code: string
}

/** The fields a manifest holds, in the order a written one lists them. All but `description` are required. */
const FIELDS = ['id', 'name', 'version', 'requires', 'api', 'author', 'description', 'icon'] as const

/** The eight bytes every PNG starts with. */
export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

/** The CRC-32 a PNG chunk ends with, over its type and data. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** One chunk of a PNG. */
export interface PngChunk {
  type: string
  data: Uint8Array
  /** Where it sits in the file: its length's first byte, and the byte after its CRC. */
  start: number
  end: number
}

/**
 * A PNG's chunks, IEND last, or null when it isn't a whole PNG: the
 * signature is wrong, a chunk runs past the end, a CRC doesn't match, or
 * there is no IEND. Anything after IEND is left out.
 */
export function pngChunks(bytes: Uint8Array): PngChunk[] | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: PngChunk[] = []
  let at = 8
  while (at + 12 <= bytes.length) {
    const end = at + 12 + view.getUint32(at)
    if (end > bytes.length) return null
    if (crc32(bytes.subarray(at + 4, end - 4)) !== view.getUint32(end - 4)) return null
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    chunks.push({ type, data: bytes.subarray(at + 8, end - 4), start: at, end })
    if (type === 'IEND') return chunks
    at = end
  }
  return null
}

/** An iTXt chunk's keyword. */
export function itxtKeyword(data: Uint8Array): string {
  const nul = data.indexOf(0)
  return nul > 0 ? String.fromCharCode(...data.subarray(0, nul)) : ''
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** An iTXt chunk's text, inflated when it is compressed. Throws on a broken chunk. */
async function itxtText(data: Uint8Array): Promise<string> {
  const nul = data.indexOf(0)
  const compressed = data[nul + 1]
  const method = data[nul + 2]
  const language = data.indexOf(0, nul + 3)
  const translated = language < 0 ? -1 : data.indexOf(0, language + 1)
  if (nul < 1 || translated < 0 || compressed! > 1 || method !== 0) throw new Error('a broken iTXt chunk')
  const text = data.subarray(translated + 1)
  return utf8.decode(compressed ? await inflate(text) : text)
}

/** zlib data, inflated. */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** zlib data, deflated. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A parsed manifest as one this SDK reads, or what is wrong with it. */
export function manifestOf(json: unknown): AppManifest | string {
  if (!json || typeof json !== 'object') return 'its manifest is not an object'
  const m = json as Record<string, unknown>
  if (m.format !== APP_FILE_FORMAT) {
    return typeof m.format === 'number'
      ? `it is format ${m.format}, and this SDK reads format ${APP_FILE_FORMAT}`
      : 'its manifest has no format'
  }
  const manifest: Partial<AppManifest> = { format: APP_FILE_FORMAT }
  for (const field of FIELDS) {
    const value = m[field]
    if (field === 'api') {
      if (value === undefined) return 'its manifest has no api'
      if (!Number.isInteger(value) || (value as number) < 1) return `its api, ${JSON.stringify(value)}, is not a level`
      manifest.api = value as number
      continue
    }
    if (field === 'description') {
      if (value !== undefined && typeof value !== 'string') return 'its description is not text'
      if (typeof value === 'string' && value.trim()) manifest.description = value
      continue
    }
    if (typeof value !== 'string' || !value) return `its manifest has no ${field}`
    if (field === 'version' && !isVersion(value)) return `its version, ${value}, is not a version`
    if (field === 'requires' && !isRange(value)) return `its requires, ${value}, is not a range`
    manifest[field] = value
  }
  return manifest as AppManifest
}

/**
 * The manifest and code an app file carries, or why it isn't one: not a
 * whole PNG, a chunk missing or doubled, a format this SDK doesn't read, a
 * field missing or unreadable, or code that doesn't inflate. The reason ends
 * a sentence such as "Meteors.png is not an app file: …", and is for people:
 * its wording can change in any release, so match on nothing in it.
 */
export async function inspectAppFile(bytes: Uint8Array): Promise<AppFile | string> {
  const chunks = pngChunks(bytes)
  if (!chunks) return 'it is not a whole PNG'
  const found = new Map<string, Uint8Array>()
  let format1 = false
  for (const { type, data } of chunks) {
    if (type !== 'iTXt') continue
    const keyword = itxtKeyword(data)
    if (keyword === FORMAT_1_KEYWORD) format1 = true
    if (keyword !== MANIFEST_KEYWORD && keyword !== CODE_KEYWORD) continue
    if (found.has(keyword)) return `it has two ${keyword} chunks`
    found.set(keyword, data)
  }
  const manifestData = found.get(MANIFEST_KEYWORD)
  const codeData = found.get(CODE_KEYWORD)
  if (!manifestData && !codeData) {
    return format1
      ? 'it is format 1, built on vintage-frames before the SDK, so build it again on system-online-sdk'
      : 'it carries no application'
  }
  if (!manifestData) return 'its manifest is missing'
  if (!codeData) return 'its code is missing'
  let json: unknown
  try {
    json = JSON.parse(await itxtText(manifestData))
  } catch {
    return 'its manifest does not read'
  }
  const manifest = manifestOf(json)
  if (typeof manifest === 'string') return manifest
  try {
    return { manifest, code: await itxtText(codeData) }
  } catch {
    return 'its code does not inflate'
  }
}

/** The manifest and code an app file carries, or null for any other PNG. */
export async function readAppFile(bytes: Uint8Array): Promise<AppFile | null> {
  const file = await inspectAppFile(bytes)
  return typeof file === 'string' ? null : file
}

/**
 * Whether a PNG carries an app file's chunks, readable or not: its manifest,
 * its code or its signature, or format 1's manifest. A picture that carries
 * none is any other PNG.
 */
export function carriesApp(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return false
  // A chunk's type is followed by its data, an iTXt's by its keyword; a CRC
  // gone wrong or a length cut short leaves the bytes where they were.
  const text = latin1.decode(bytes)
  return ['iTXtsystem-online.', `iTXt${FORMAT_1_KEYWORD}`].some((mark) => text.includes(mark))
}

const latin1 = new TextDecoder('latin1')

/* ── Signatures ─────────────────────────────────────────────────────────── */

/** The algorithm an app file is signed with. */
export const SIGNATURE_ALGORITHM = 'Ed25519'

/**
 * What an app file's signature says. `unsigned`: it has no signature.
 * `signed`: it holds, every byte of the file but its own chunk as the key
 * signed them; `key` is the public key, base64. `broken`: one that doesn't
 * hold, since the file was changed after it was signed, or that doesn't read;
 * `reason` is for people, as {@link inspectAppFile}'s is.
 */
export type SignatureCheck =
  | { status: 'unsigned' }
  | { status: 'signed'; key: string }
  | { status: 'broken'; key: string | null; reason: string }

/** Base64, from bytes. */
export function base64Of(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** Bytes, from base64 or base64url, padded or not; null for anything else. */
export function bytesOf(text: unknown): Uint8Array | null {
  if (typeof text !== 'string') return null
  const plain = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(plain) || plain.replace(/=+$/, '').length % 4 === 1) return null
  try {
    return Uint8Array.from(atob(plain.padEnd(Math.ceil(plain.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * An Ed25519 public key in the one form keys are compared in: its 32 bytes
 * as padded base64. Null for anything that isn't one.
 */
export function keyOf(text: unknown): string | null {
  const bytes = bytesOf(text)
  return bytes?.length === 32 ? base64Of(bytes) : null
}

/** `parts`, end to end. */
function join(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The file a signature covers: every byte of it but the signature's own chunk. */
export function signedPart(bytes: Uint8Array, chunk: Pick<PngChunk, 'start' | 'end'>): Uint8Array {
  return join([bytes.subarray(0, chunk.start), bytes.subarray(chunk.end)])
}

/**
 * Check an app file's signature: whether it has one, whose key made it, and
 * whether it holds. It covers every byte of the file but its own chunk, so a
 * changed byte of the manifest, the code or the picture breaks it. Two
 * signatures, a chunk that doesn't read and an algorithm other than Ed25519
 * are broken too, and so is a signature on a platform that can't check one.
 */
export async function checkSignature(bytes: Uint8Array): Promise<SignatureCheck> {
  const chunks = pngChunks(bytes)
  if (!chunks) return { status: 'broken', key: null, reason: 'it is not a whole PNG' }
  const found = chunks.filter((c) => c.type === 'iTXt' && itxtKeyword(c.data) === SIGNATURE_KEYWORD)
  if (!found.length) return { status: 'unsigned' }
  if (found.length > 1) return { status: 'broken', key: null, reason: 'it has two signatures' }
  const chunk = found[0]!
  let fields: Record<string, unknown>
  try {
    fields = JSON.parse(await itxtText(chunk.data))
  } catch {
    return { status: 'broken', key: null, reason: 'its signature does not read' }
  }
  const key = keyOf(fields?.key)
  if (fields?.algorithm !== SIGNATURE_ALGORITHM) {
    return { status: 'broken', key, reason: `its signature is ${JSON.stringify(fields?.algorithm)}, and this SDK checks ${SIGNATURE_ALGORITHM}` }
  }
  const signature = bytesOf(fields.signature)
  if (!key || signature?.length !== 64) return { status: 'broken', key, reason: 'its signature does not read' }
  let holds: boolean
  try {
    const publicKey = await crypto.subtle.importKey('raw', bytesOf(key)!.slice(), { name: SIGNATURE_ALGORITHM }, false, ['verify'])
    holds = await crypto.subtle.verify({ name: SIGNATURE_ALGORITHM }, publicKey, signature.slice(), signedPart(bytes, chunk).slice())
  } catch {
    return { status: 'broken', key, reason: `this platform can’t check an ${SIGNATURE_ALGORITHM} signature` }
  }
  return holds ? { status: 'signed', key } : { status: 'broken', key, reason: 'it was changed after it was signed' }
}

/** A site's trust: the public keys it holds, and what a file none of them signed gets. */
export interface Trust {
  /** Ed25519 public keys, base64, as `generateSigningKeys()` gives them. Any number, or none. */
  keys: readonly string[]
  /**
   * What a file none of the keys signed gets, unsigned or signed by another
   * key: installed, refused, or asked about first. Default `'ask'`.
   */
  otherwise?: TrustAnswer
}

/** What a site's trust says of a file: install it, ask first, or refuse it. */
export type TrustAnswer = 'install' | 'ask' | 'refuse'

/**
 * A file's standing with a site: signed by a key the site holds (`trusted`),
 * by another (`untrusted`), not signed, or a signature that doesn't hold.
 */
export type Standing = 'trusted' | 'untrusted' | 'unsigned' | 'broken'

/**
 * What a site's trust says of a checked file: its standing, the key that
 * signed it, and the answer. A key the site holds installs it. A broken
 * signature is refused whatever the trust. Without a trust, any other file
 * installs; with one, it gets the trust's `otherwise`.
 */
export function judgeSignature(
  check: SignatureCheck,
  trust: Trust | null
): { standing: Standing; key: string | null; answer: TrustAnswer } {
  if (check.status === 'broken') return { standing: 'broken', key: check.key, answer: 'refuse' }
  const key = check.status === 'signed' ? check.key : null
  if (key != null && trust?.keys.some((k) => keyOf(k) === key)) return { standing: 'trusted', key, answer: 'install' }
  const standing = key != null ? 'untrusted' : 'unsigned'
  if (!trust) return { standing, key, answer: 'install' }
  const otherwise = trust.otherwise === 'install' || trust.otherwise === 'refuse' ? trust.otherwise : 'ask'
  return { standing, key, answer: otherwise }
}

/* ── The code's imports ─────────────────────────────────────────────────── */

/** One module an app file's code imports at its head: its name, and where its quoted name sits in the code. */
export interface CodeImport {
  specifier: string
  /** The quoted name's first quote, and the index after its last. */
  start: number
  end: number
}

const IDENTIFIER_START = /[A-Za-z_$\u0080-\uffff]/
const IDENTIFIER_PART = /[\w$\u0080-\uffff]/

/**
 * The modules an app file's code imports and re-exports in the declarations
 * it opens with, in order: `import … from "…"`, `import "…"`,
 * `export * from "…"` and `export { … } from "…"`. A bundler writes every
 * static import there, so these are the names a desktop points at the page's
 * own modules. The head ends at the first other statement, and an `import()`
 * in the code past it is never listed. Null when a declaration doesn't read.
 */
export function leadingImports(code: string): CodeImport[] | null {
  const n = code.length
  /** Past white space and comments from `i`; -1 at a comment left open. */
  const skip = (i: number): number => {
    for (;;) {
      while (i < n && /\s/.test(code[i]!)) i++
      if (code.startsWith('//', i)) {
        while (i < n && !/[\n\r\u2028\u2029]/.test(code[i]!)) i++
      } else if (code.startsWith('/*', i)) {
        const close = code.indexOf('*/', i + 2)
        if (close < 0) return -1
        i = close + 2
      } else {
        return i
      }
    }
  }
  /** The word at `i`, or ''. */
  const word = (i: number): string => {
    if (!IDENTIFIER_START.test(code[i] ?? '')) return ''
    let j = i + 1
    while (j < n && IDENTIFIER_PART.test(code[j]!)) j++
    return code.slice(i, j)
  }
  /** The string literal at `i`: its value and the index past it; null when it doesn't read. */
  const string = (i: number): { value: string; end: number } | null => {
    const quote = code[i]
    let value = ''
    for (let j = i + 1; j < n; j++) {
      const c = code[j]!
      if (c === quote) return { value, end: j + 1 }
      if (/[\n\r]/.test(c)) return null
      if (c === '\\') {
        const next = code[++j]
        if (next == null || !/['"\\/]/.test(next)) return null
        value += next
      } else {
        value += c
      }
    }
    return null
  }
  /** Past a braced list from `i` (its `{`), names quoted or not; -1 when it doesn't read. */
  const braces = (i: number): number => {
    for (let j = i + 1; ; ) {
      j = skip(j)
      if (j < 0 || j >= n) return -1
      const c = code[j]!
      if (c === '}') return j + 1
      if (c === "'" || c === '"') {
        const s = string(j)
        if (!s) return -1
        j = s.end
      } else if (c === ',' || c === '*' || c === ':') {
        j++
      } else {
        const w = word(j)
        if (!w) return -1
        j += w.length
      }
    }
  }

  const out: CodeImport[] = []
  let i = code.startsWith('#!') ? code.search(/[\n\r]|$/) : 0
  for (;;) {
    i = skip(i)
    if (i < 0) return null
    const keyword = word(i)
    if (keyword !== 'import' && keyword !== 'export') {
      // A directive ("use strict") before the declarations is passed over.
      if ((code[i] === '"' || code[i] === "'") && !out.length) {
        const s = string(i)
        const after = s ? skip(s.end) : -1
        if (after >= 0 && code[after] === ';') {
          i = after + 1
          continue
        }
      }
      return out
    }
    let j = skip(i + keyword.length)
    if (j < 0) return null
    // import() and import.meta are code; so is any export but a re-export.
    if (keyword === 'import' && (code[j] === '(' || code[j] === '.')) return out
    if (keyword === 'export' && code[j] !== '*' && code[j] !== '{') return out
    // To the module's name: the first string outside braces that no `as` names.
    let found: { value: string; start: number; end: number } | null = null
    let named = false
    while (!found) {
      j = skip(j)
      if (j < 0 || j >= n) return null
      const c = code[j]!
      if (c === "'" || c === '"') {
        const s = string(j)
        if (!s) return null
        if (!named) found = { value: s.value, start: j, end: s.end }
        named = false
        j = s.end
      } else if (c === '{') {
        j = braces(j)
        if (j < 0) return null
        // `export { … }` with no `from` is the module's own export: code.
        if (keyword === 'export' && word(skip(j)) !== 'from') return out
      } else if (c === '*' || c === ',') {
        j++
      } else {
        const w = word(j)
        if (!w) return null
        named = w === 'as'
        j += w.length
      }
    }
    out.push({ specifier: found.value, start: found.start, end: found.end })
    j = skip(found.end)
    if (j < 0) return null
    // Import attributes: with { type: "json" }.
    const attributes = word(j)
    if (attributes === 'with' || attributes === 'assert') {
      j = skip(j + attributes.length)
      if (j < 0 || code[j] !== '{') return null
      j = braces(j)
      if (j < 0) return null
      j = skip(j)
      if (j < 0) return null
    }
    i = code[j] === ';' ? j + 1 : j
  }
}

interface Semver {
  core: [number, number, number]
  pre: string[]
}

/** A version exactly as semver writes one: the pattern semver.org gives. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/**
 * `text` as a version, read for comparing: space around it and a leading `v`
 * are let go. Null for anything else, a string or not.
 */
function parseSemver(text: unknown): Semver | null {
  if (typeof text !== 'string') return null
  const m = SEMVER.exec(text.trim().replace(/^v/, ''))
  return m ? { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] } : null
}

/**
 * Whether `text` is a version exactly as semver writes one: `0.1.0`,
 * `1.0.0-rc.1`, but not `v0.1.0`, ` 0.1.0` or `01.2.3`.
 */
export function isVersion(text: string): boolean {
  return SEMVER.test(text)
}

/** Whether `text` is a version or a caret range, exactly as written: `0.17.0`, `^0.17.0`. */
function isRange(text: string): boolean {
  return isVersion(text.startsWith('^') ? text.slice(1) : text)
}

/** The version a range names, read for comparing: the range itself, or a caret range's floor. Null when it is neither. */
function rangeVersion(range: unknown): Semver | null {
  if (typeof range !== 'string') return null
  const text = range.trim()
  return parseSemver(text.startsWith('^') ? text.slice(1) : text)
}

/** Below zero, zero or above as `a` comes before, with or after `b`. */
function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i]! - b.core[i]!
  // A release comes after its prereleases.
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return Number(x) - Number(y)
    if (xn !== yn) return xn ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/**
 * Below zero, zero or above as version `a` comes before, with or after `b`,
 * in semver's order: a release after its prereleases, build metadata
 * ignored. Anything that isn't a version, a string or not, comes before
 * every version, so a sort never throws.
 */
export function compareVersions(a: string, b: string): number {
  const x = parseSemver(a)
  const y = parseSemver(b)
  return x && y ? compareSemver(x, y) : (x ? 1 : 0) - (y ? 1 : 0)
}

/**
 * Whether `version` meets `range`: an exact version, or a caret range as
 * npm reads it. `^1.2.3` takes 1.x from 1.2.3 on, `^0.2.3` takes 0.2.x from
 * 0.2.3 on, and `^0.0.3` takes 0.0.3 alone. A prerelease meets a range only
 * when the range names a prerelease of the same version. Anything else is
 * false.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseSemver(version)
  const r = rangeVersion(range)
  if (!v || !r) return false
  if (!range.trim().startsWith('^')) return compareSemver(v, r) === 0
  if (v.pre.length && !(r.pre.length && v.core.every((n, i) => n === r.core[i]))) return false
  const [major, minor, patch] = r.core
  const below: Semver = { core: major ? [major + 1, 0, 0] : minor ? [0, minor + 1, 0] : [0, 0, patch + 1], pre: [] }
  return compareSemver(v, r) >= 0 && compareSemver(v, below) < 0
}

/**
 * Whether this SDK runs the application a manifest describes: one built at
 * an app API from {@link APP_API_OLDEST} to {@link APP_API}.
 */
export function appRuns(manifest: Pick<AppManifest, 'api'>): boolean {
  const { api } = manifest
  return Number.isInteger(api) && api >= APP_API_OLDEST && api <= APP_API
}
