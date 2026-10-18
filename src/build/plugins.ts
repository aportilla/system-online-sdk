/**
 * The Vite plugins. `appFile()` makes an application's build write its app
 * file; `appFiles()` builds app files into a site, or serves them to it as
 * files to install.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { APP_API, APP_API_OLDEST, appRuns, checkSignature, inspectAppFile, isVersion, leadingImports, satisfies } from '../app-file.js'
import type { AppManifest } from '../app-file.js'
import { VERSION } from '../version.js'
import { packApp } from './app-file.js'

/** The three entries an application imports besides its own files: the kit's root and the SDK's two. */
const ENTRIES = ['vintage-frames', 'system-online-sdk', 'system-online-sdk/pure']

/** The query that serves an app file's code as a module of its own. */
const CODE_QUERY = 'app-code'

/** The query that serves an app file as a file, with its manifest. */
const FILE_QUERY = 'app-file'

export interface AppFileOptions {
  /** The application's id, name, version and author, and its description if it has one: its `app.ts`. */
  app: { id: string; name: string; version: string; author: string; description?: string }
  /** The module whose default export is the application's factory. */
  entry: string
  /** Its 32 × 32 icon, a PNG. */
  icon: string
  /** Its artwork for the box: a 128 × 128 PNG, or that divided by a whole number. */
  artwork?: string
  /** A directory to write the app file to as well, such as a site's `apps/`. */
  copyTo?: string
}

/** What a bundled module's path says it is that an app file can't carry: Lit, or a copy of the kit or the SDK. */
function forbidden(id: string): string | null {
  const packages = id.match(/(?<=[\\/]node_modules[\\/])(?:@[^\\/]+[\\/])?[^\\/]+/g)
  const name = packages?.at(-1)?.replace('\\', '/')
  if (name === 'vintage-frames' || name === 'system-online-sdk') return `a copy of ${name}`
  if (name && /^(?:lit|lit-html|lit-element|@lit\/.+|@lit-labs\/.+)$/.test(name)) return `Lit (${name})`
  return null
}

/** The `system-online-sdk` range in the package.json at `root`, which must be a caret range. */
async function sdkRange(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const range: unknown = pkg.devDependencies?.['system-online-sdk'] ?? pkg.dependencies?.['system-online-sdk']
  if (typeof range !== 'string') throw new Error('package.json has no system-online-sdk dev dependency')
  if (!range.startsWith('^') || !isVersion(range.slice(1))) {
    throw new Error(`package.json's system-online-sdk range is "${range}", and an app file requires a caret range: ^${VERSION}`)
  }
  return range
}

/**
 * Makes an application's build write its app file, `dist/<name>.png`. It
 * builds the entry as a library, one ES module with the three entries left
 * as imports, and fails the build when the bundle breaks a rule: CSS or any
 * other file beside the code, more than one module, Lit, the kit or the SDK
 * bundled in, an import of anything but the three entries, or one a desktop
 * can't point at its own copies when it installs the file: a dynamic
 * import of them, or one outside the declarations the module opens with.
 * `npm run dev` is untouched.
 */
export function appFile(options: AppFileOptions): Plugin {
  const { app, entry, icon, artwork, copyTo } = options
  for (const field of ['id', 'name', 'version', 'author'] as const) {
    if (typeof app?.[field] !== 'string' || !app[field]) throw new Error(`system-online-sdk appFile(): app.${field} is missing`)
  }
  if (!isVersion(app.version)) throw new Error(`system-online-sdk appFile(): app.version, ${app.version}, is not a version`)
  if (!entry || !icon) throw new Error(`system-online-sdk appFile(): ${entry ? 'icon' : 'entry'} is missing`)
  const fileName = `${app.name.replace(/[\\/:*?"<>|]/g, '-')}.png`
  let root = ''
  let packed: Uint8Array | null = null

  return {
    name: 'system-online-sdk:app-file',
    apply: 'build',
    config: () => ({
      build: {
        lib: { entry, formats: ['es'], fileName: 'app' },
        copyPublicDir: false,
        rolldownOptions: {
          external: /^(?:vintage-frames|system-online-sdk)(?:\/|$)/,
          output: { codeSplitting: false },
        },
      },
    }),
    configResolved(config) {
      root = config.root
    },
    buildStart() {
      for (const file of [icon, artwork, 'package.json']) if (file) this.addWatchFile(resolve(root, file))
    },
    // Last, so it sees the whole bundle: Vite emits a library's CSS in its own generateBundle.
    generateBundle: {
      order: 'post',
      async handler(_, bundle) {
        const outputs = Object.values(bundle)
        const chunks = outputs.filter((o) => o.type === 'chunk')
        const beside = outputs.filter((o) => o.type === 'asset').map((o) => o.fileName)
        if (beside.length) {
          this.error(
            `${app.name} emits ${beside.join(', ')} beside its code, and an app file holds one module: ` +
              'no CSS import, no source map file, its art inlined.'
          )
        }
        const [chunk] = chunks
        if (!chunk || chunks.length > 1) this.error(`${app.name} builds to ${chunks.length} modules, and an app file holds one.`)
        for (const id of Object.keys(chunk.modules)) {
          const what = forbidden(id)
          if (what) this.error(`${app.name} bundles ${what}. It uses the page's copy and brings none of its own.`)
        }
        const imports = [...chunk.imports, ...chunk.dynamicImports].filter((spec) => !ENTRIES.includes(spec))
        if (imports.length) {
          this.error(`${app.name} imports ${imports.join(', ')}. An application imports ${ENTRIES.join(', ')} and its own files.`)
        }
        // A desktop that installs the file points the names in its head at its own copies, and no others.
        if (chunk.dynamicImports.length) {
          this.error(
            `${app.name} imports ${chunk.dynamicImports.join(', ')} with import(). ` +
              'An application imports them statically, so a desktop that installs it can load its code.'
          )
        }
        const head = new Set(leadingImports(chunk.code)?.map((i) => i.specifier) ?? [])
        const elsewhere = chunk.imports.filter((spec) => !head.has(spec))
        if (elsewhere.length) {
          this.error(`${app.name}'s code imports ${elsewhere.join(', ')} past the declarations it opens with, where a desktop can't load it.`)
        }

        try {
          const requires = await sdkRange(root)
          if (!satisfies(VERSION, requires)) {
            throw new Error(`package.json requires system-online-sdk ${requires}, and the build is on ${VERSION}: move the range`)
          }
          packed = await packApp({
            manifest: {
              id: app.id,
              name: app.name,
              version: app.version,
              requires,
              author: app.author,
              description: app.description,
            },
            icon: new Uint8Array(await readFile(resolve(root, icon))),
            code: chunk.code,
            artwork: artwork ? new Uint8Array(await readFile(resolve(root, artwork))) : undefined,
          })
        } catch (err) {
          this.error(`${app.name}: ${(err as Error).message}`)
        }
        delete bundle[chunk.fileName]
        this.emitFile({ type: 'asset', fileName, source: packed })
      },
    },
    async writeBundle() {
      if (!copyTo || !packed) return
      const dir = resolve(root, copyTo)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, fileName), packed)
    },
  }
}

/** Why this SDK doesn't run an application: the app API it was built for. */
function refusal(manifest: AppManifest): string {
  const runs = APP_API_OLDEST === APP_API ? `${APP_API}` : `${APP_API_OLDEST} to ${APP_API}`
  return `is built for app API ${manifest.api}, and this site's SDK runs app API ${runs}`
}

/**
 * Builds app files into a site, or serves them to it as files. An import of
 * `*.png?app` or `*.png?app-file` reads the file and refuses one that isn't
 * an app file, or one this SDK doesn't run (`appRuns`).
 *
 * - `?app` builds the application in. Its default export is the
 *   application's factory, its definition given the manifest's icon and the
 *   manifest, and `manifest` is the manifest. The code imports the kit and
 *   the SDK by name, so the page keeps one copy of each.
 * - `?app-file` builds nothing in. Its default export is the file's URL, an
 *   asset served byte for byte so its signature holds, for the shell's
 *   install; `manifest` is the manifest. A signature that doesn't hold is
 *   refused here, as an install would refuse it.
 *
 * A new file reloads the dev server's page.
 */
export function appFiles(): Plugin {
  let root = ''
  return {
    name: 'system-online-sdk:app-files',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    async load(id) {
      const query = id.indexOf('?')
      if (query < 0) return null
      const file = id.slice(0, query)
      const params = new URLSearchParams(id.slice(query + 1))
      if (!file.endsWith('.png') || !(params.has('app') || params.has(CODE_QUERY) || params.has(FILE_QUERY))) return null
      this.addWatchFile(file)
      const name = relative(root, file)
      const bytes = new Uint8Array(await readFile(file))
      const read = await inspectAppFile(bytes)
      if (typeof read === 'string') this.error(`${name} is not an app file: ${read}.`)
      const { manifest, code } = read
      if (params.has(CODE_QUERY)) return code
      if (!appRuns(manifest)) {
        this.error(
          `${name}: ${manifest.name} ${manifest.version} ${refusal(manifest)}. ` +
            `Build ${manifest.name} on system-online-sdk ${VERSION} and copy its app file in.`
        )
      }
      if (params.has(FILE_QUERY)) {
        const signature = await checkSignature(bytes)
        if (signature.status === 'broken') this.error(`${name}: ${manifest.name} ${manifest.version}'s signature doesn't hold: ${signature.reason}.`)
        return [
          `import url from ${JSON.stringify(`${file}?url`)}`,
          `export const manifest = ${JSON.stringify(manifest)}`,
          'export default url',
          '',
        ].join('\n')
      }
      return [
        `import factory from ${JSON.stringify(`${file}?${CODE_QUERY}`)}`,
        `export const manifest = ${JSON.stringify(manifest)}`,
        'export default (...args) => ({ ...factory(...args), icon: manifest.icon, manifest })',
        '',
      ].join('\n')
    },
  }
}
