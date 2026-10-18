/**
 * Loading an app file's code at runtime. The code is one ES module that
 * imports `vintage-frames`, `system-online-sdk` and `system-online-sdk/pure`
 * by name, and it has to reach the page's own copies of them: one registry of
 * elements, one shell, `instanceof VfWindow` true across both. A production
 * site has inlined both packages into its own chunks, so no URL serves them.
 *
 * - The shell holds the three as namespaces, the very modules the page
 *   runs, and makes each into a module of its own: a `blob:` module that
 *   reads the namespace off a key of the page's and re-exports every name in
 *   it. They are made once per page, on the first load.
 * - The code's head, the declarations a bundler writes its imports in
 *   (`leadingImports`), has each of the three names rewritten to its
 *   module's URL. Any other name there is refused, and so is a head that
 *   doesn't read: `appFile()` builds nothing else.
 * - The code then loads as a `blob:` module of its own. A page with a
 *   Content-Security-Policy allows `blob:` in `script-src`.
 */

import * as kit from 'vintage-frames'
import * as sdk from './index.js'
import * as pure from './pure.js'
import { leadingImports } from './app-file.js'

/**
 * The three names an application imports, and the namespaces the page runs
 * under them: read at the first load, never as this module evaluates. It
 * evaluates partway through the SDK's own entry, which imports it, and a
 * bundler that writes the entry's namespace as a variable hasn't set it yet.
 */
const namespaces = (): Record<string, object> => ({
  'vintage-frames': kit,
  'system-online-sdk': sdk,
  'system-online-sdk/pure': pure,
})

/** Where each module made from a namespace reads it: a key of the page's own. */
const REGISTRY = 'system-online-sdk.modules'

/** A name a module can export as a binding of its own. */
const BINDING = /^[A-Za-z_$][\w$]*$/

/** Each name's module, by URL, made on the first load and kept for the page. */
let made: Map<string, string> | null = null

function modules(): Map<string, string> {
  if (made) return made
  const registry = ((globalThis as Record<symbol, Record<string, object>>)[Symbol.for(REGISTRY)] ??= {})
  made = new Map()
  for (const [name, namespace] of Object.entries(namespaces())) {
    registry[name] = namespace
    const names = Object.keys(namespace).filter((n) => n !== 'default' && BINDING.test(n))
    const source = [
      `const namespace = globalThis[Symbol.for(${JSON.stringify(REGISTRY)})][${JSON.stringify(name)}];`,
      `export const { ${names.join(', ')} } = namespace;`,
      ...('default' in namespace ? ['export default namespace.default;'] : []),
    ].join('\n')
    made.set(name, URL.createObjectURL(new Blob([source], { type: 'text/javascript' })))
  }
  return made
}

/**
 * Load an app file's code and resolve its default export, the application's
 * factory. Rejects, saying why for people, when the code imports anything but
 * the three names, when it doesn't load (a syntax error, a name the page's
 * modules don't export, a throw while it runs), or when it has no factory.
 * `name` names the module in the browser's tools.
 */
export async function loadCode(code: string, name: string): Promise<(...args: unknown[]) => unknown> {
  const head = leadingImports(code)
  if (!head) throw new Error('its code opens with an import this desktop can’t read')
  const urls = modules()
  let linked = ''
  let at = 0
  for (const { specifier, start, end } of head) {
    const url = urls.get(specifier)
    if (!url) throw new Error(`its code imports ${specifier}, and an application imports ${[...urls.keys()].join(', ')} alone`)
    linked += code.slice(at, start) + JSON.stringify(url)
    at = end
  }
  linked += `${code.slice(at)}\n//# sourceURL=${encodeURI(name)}\n`
  const url = URL.createObjectURL(new Blob([linked], { type: 'text/javascript' }))
  let module: { default?: unknown }
  try {
    module = await import(/* @vite-ignore */ url)
  } catch (err) {
    throw new Error(`its code doesn’t load: ${(err as Error)?.message ?? err}`)
  } finally {
    URL.revokeObjectURL(url)
  }
  if (typeof module.default !== 'function') throw new Error('its code has no factory: its default export isn’t a function')
  return module.default as (...args: unknown[]) => unknown
}
