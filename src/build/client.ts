/**
 * `system-online-sdk/build/client`: the types of the `*.png?app` and
 * `*.png?app-file` imports, which `appFiles()` serves. A site adds it to
 * tsconfig's `types` beside `vite/client`.
 */
declare module '*.png?app' {
  /** The application's factory: its definition, given the manifest's icon and the manifest. */
  const app: (...args: any[]) => import('../index.js').AppDefinition<any>
  export default app
  /** The app file's manifest. */
  export const manifest: import('../pure.js').AppManifest
}

declare module '*.png?app-file' {
  /** The app file's URL: the file served byte for byte, for the shell's install. */
  const url: string
  export default url
  /** The app file's manifest. */
  export const manifest: import('../pure.js').AppManifest
}
