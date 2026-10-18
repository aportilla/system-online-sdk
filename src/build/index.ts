/**
 * `system-online-sdk/build` — app files, written: the Vite plugin that makes
 * an application's build write its app file, the one that builds app files
 * into a site or serves them as files, and the pieces under them: the
 * packer, the writer, the signer and the box in the SDK's frame. Build-only:
 * it runs under Node, and no page imports it. Reading an app file, and
 * checking its signature, are `system-online-sdk/pure`'s.
 * docs/APP-FILES.md is the guide.
 */

export { appFile, appFiles } from './plugins.js'
export type { AppFileOptions } from './plugins.js'
export { generateSigningKeys, packApp, signAppFile, writeAppFile } from './app-file.js'
export type { PackAppInput, SigningKeys } from './app-file.js'
export { composeBox } from './box.js'
export type { BoxInput } from './box.js'
