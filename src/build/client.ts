/**
 * `system-online-sdk/build/client`: the types of a `*.png?app` import, which
 * `appFiles()` serves. A site adds it to tsconfig's `types` beside
 * `vite/client`.
 */
declare module '*.png?app' {
  /** The application's factory: its definition, given the manifest's icon. */
  const app: (...args: any[]) => import('../index.js').AppDefinition<any>
  export default app
  /** The app file's manifest. */
  export const manifest: import('../pure.js').AppManifest
}
