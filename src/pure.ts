/**
 * `system-online-sdk/pure` — the shell's pure modules on their own: the
 * catalog, the system's fonts, the geometry, the saved session, the app file
 * reader and the SDK's version. They import nothing from vintage-frames and
 * touch no DOM at import, so a site's own pure modules and their tests
 * import them under Node. `system-online-sdk` exports the same names.
 */

export * from './catalog.js'
export * from './fonts.js'
export * from './geometry.js'
export * from './state.js'
export {
  APP_API,
  APP_API_OLDEST,
  APP_FILE_FORMAT,
  BOX_SCALE,
  appRuns,
  compareVersions,
  inspectAppFile,
  readAppFile,
  satisfies,
} from './app-file.js'
export type { AppFile, AppManifest } from './app-file.js'
export { VERSION } from './version.js'
