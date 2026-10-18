/**
 * Writing app files. The box's own chunks are copied as they are, so the
 * picture is never re-encoded; any app chunks already there are dropped, a
 * signature with them, and the manifest's and the code's go in before IEND.
 *
 * Signing is a step after the build: the signature's chunk goes in before
 * IEND, over every byte of the file but its own chunk, in Ed25519 through
 * WebCrypto, and carries the public key that made it.
 */

import {
  APP_API,
  APP_FILE_FORMAT,
  CODE_KEYWORD,
  SIGNATURE_ALGORITHM,
  SIGNATURE_KEYWORD,
  base64Of,
  bytesOf,
  deflate,
  inspectAppFile,
  itxtKeyword,
  MANIFEST_KEYWORD,
  manifestOf,
  PNG_SIGNATURE,
  pngChunks,
} from '../app-file.js'
import type { AppManifest } from '../app-file.js'
import { composeBox } from './box.js'
import { concat, pngChunk } from './png.js'

/** What {@link packApp} packs. */
export interface PackAppInput {
  /** The manifest's fields but its format, app API and icon, which the packer fills in. */
  manifest: Omit<AppManifest, 'format' | 'api' | 'icon'>
  /** The icon's PNG, 32 × 32. */
  icon: Uint8Array
  /** The application's code: one ES module whose default export is its factory. */
  code: string
  /** The artwork's PNG, for the box. Without it the icon is stamped there. */
  artwork?: Uint8Array
}

const utf8 = new TextEncoder()

/** An iTXt chunk with no language tag and no translated keyword. */
function itxt(keyword: string, text: Uint8Array, compressed: boolean): Uint8Array {
  const head = Uint8Array.from([...keyword].map((ch) => ch.charCodeAt(0)))
  return pngChunk('iTXt', concat([head, Uint8Array.of(0, compressed ? 1 : 0, 0, 0, 0), text]))
}

/** The keywords of the chunks an app file adds to its box. */
const APP_KEYWORDS: readonly string[] = [MANIFEST_KEYWORD, CODE_KEYWORD, SIGNATURE_KEYWORD]

/** `box` with `manifest` and `code` in its chunks, and no signature: a rewritten file is signed again. */
export async function writeAppFile(box: Uint8Array, manifest: AppManifest, code: string): Promise<Uint8Array> {
  const chunks = pngChunks(box)
  if (!chunks) throw new Error('system-online-sdk/build: the box is not a whole PNG')
  const checked = manifestOf(manifest)
  if (typeof checked === 'string') throw new Error(`system-online-sdk/build: the manifest won't read back: ${checked}`)
  const app = [
    itxt(MANIFEST_KEYWORD, utf8.encode(JSON.stringify(checked)), false),
    itxt(CODE_KEYWORD, await deflate(utf8.encode(code)), true),
  ]
  const parts: Uint8Array[] = [PNG_SIGNATURE]
  for (const chunk of chunks) {
    if (chunk.type === 'iTXt' && APP_KEYWORDS.includes(itxtKeyword(chunk.data))) continue
    if (chunk.type === 'IEND') parts.push(...app)
    parts.push(box.subarray(chunk.start, chunk.end))
  }
  return concat(parts)
}

/** The whole app file: the box in the SDK's frame, then the manifest and the code. */
export async function packApp({ manifest, icon, code, artwork }: PackAppInput): Promise<Uint8Array> {
  const full: AppManifest = { ...manifest, format: APP_FILE_FORMAT, api: APP_API, icon: `data:image/png;base64,${base64Of(icon)}` }
  return writeAppFile(await composeBox({ manifest: full, icon, artwork }), full, code)
}

/** A key pair for signing app files, each base64. */
export interface SigningKeys {
  /** The public key: its 32 bytes. A site that trusts it lists it in `createShell`'s `trust.keys`. */
  publicKey: string
  /** The private key: its PKCS #8 form. Keep it off every machine but the one that signs. */
  privateKey: string
}

/** A new Ed25519 key pair for signing app files. */
export async function generateSigningKeys(): Promise<SigningKeys> {
  const pair = (await crypto.subtle.generateKey({ name: SIGNATURE_ALGORITHM }, true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    publicKey: base64Of(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    privateKey: base64Of(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))),
  }
}

/** A private key as `generateSigningKeys()` gives it, or as PEM: its PKCS #8 bytes, or null. */
function pkcs8Of(privateKey: string): Uint8Array | null {
  return bytesOf(privateKey.replace(/-----(?:BEGIN|END) PRIVATE KEY-----/g, ''))
}

/**
 * `file` signed with `privateKey`: the private key as `generateSigningKeys()`
 * gives it, or as PEM. A signature already there is replaced; the new one
 * goes in before IEND, over every byte of the file but its own chunk, and
 * carries the public key. Anything after IEND is left out. Throws on a file
 * that isn't an app file, and on a key that isn't an Ed25519 private key.
 */
export async function signAppFile(file: Uint8Array, privateKey: string): Promise<Uint8Array> {
  const read = await inspectAppFile(file)
  if (typeof read === 'string') throw new Error(`system-online-sdk/build: it is not an app file: ${read}`)
  const der = pkcs8Of(privateKey)
  let key: CryptoKey
  let publicKey: string
  try {
    key = await crypto.subtle.importKey('pkcs8', der!.slice(), { name: SIGNATURE_ALGORITHM }, true, ['sign'])
    // The private key's JWK carries the public key as `x`.
    const x = bytesOf((await crypto.subtle.exportKey('jwk', key)).x)
    if (x?.length !== 32) throw new Error('no public key')
    publicKey = base64Of(x)
  } catch {
    throw new Error(`system-online-sdk/build: the private key is not an ${SIGNATURE_ALGORITHM} private key`)
  }
  const kept = pngChunks(file)!.filter((c) => !(c.type === 'iTXt' && itxtKeyword(c.data) === SIGNATURE_KEYWORD))
  const body = kept.slice(0, -1).map((c) => file.subarray(c.start, c.end))
  const iend = kept.at(-1)!
  const signed = concat([PNG_SIGNATURE, ...body, file.subarray(iend.start, iend.end)])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: SIGNATURE_ALGORITHM }, key, signed.slice()))
  const fields = { algorithm: SIGNATURE_ALGORITHM, key: publicKey, signature: base64Of(signature) }
  return concat([PNG_SIGNATURE, ...body, itxt(SIGNATURE_KEYWORD, utf8.encode(JSON.stringify(fields)), false), file.subarray(iend.start, iend.end)])
}
