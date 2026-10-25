/**
 * Installed applications: app files a desktop took after the shell started,
 * kept with its catalog and loaded at every boot.
 *
 * - One door. `install()` reads the file (`inspectAppFile`), checks that it
 *   runs here (`appRuns`) and its signature against the site's trust,
 *   asking first through the Finder when the trust says to; keeps the file;
 *   loads its code; and registers the application. A drop, a paste (the
 *   `app` kind's `claim`), a seed, a site's command and an application all
 *   go through it, one install at a time.
 * - The file is a record of the catalog's own storage, `#app:<id>`, one per
 *   application however many icons it has, so wherever the site's storage
 *   keeps items it keeps installs: `memoryStorage()` forgets them with the
 *   rest. The record is written before the icon: a file no icon names is
 *   dropped at the next boot, never loaded.
 * - A file whose application is already on the desktop, its file kept or
 *   its icons alone, changes nothing unless the caller says to replace it.
 *   Then the icons, their places and the session's windows stay. A loaded
 *   application's code keeps running, and the new file runs once it
 *   restarts, or from the next load; one that didn't load loads at once, and
 *   its windows from the last visit reopen.
 * - `restart()` runs a running application's kept file in place of its
 *   code: the pending one, or its own again, fresh. The file is loaded and
 *   checked as an install checks it before anything closes, then the shell
 *   swaps it in (`host.swap`), asking the application before it quits, and
 *   `pending` clears once the new code runs. It takes its turn with the
 *   installs, so it never races one.
 * - An application is installed while an icon names it. `uninstall()` takes
 *   every icon of it at once, the Trash's included, and its file; and when
 *   the catalog is left with no icon of an installed application, Empty
 *   Trash's doing or a restore's, it's uninstalled the same way. A running
 *   one comes down first: its windows, its menus and kinds, its setup.
 * - The boot loads every kept file an icon names, after the seed and before
 *   the session reopens. One that doesn't load is skipped, and says why: a
 *   file that no longer reads, an `api` this SDK doesn't run, a signature
 *   that no longer holds, a trust that no longer takes it, code that fails.
 *   A file is checked at every load: the trust's question, which can't be
 *   asked at a boot, takes the visitor's answer for that standing and key.
 */

import {
  APP_API,
  APP_API_OLDEST,
  appRuns,
  base64Of,
  bytesOf,
  carriesApp,
  checkSignature,
  inspectAppFile,
  judgeSignature,
} from './app-file.js'
import type { AppManifest, Standing, Trust } from './app-file.js'
import { APP_KIND, appIdOf, containerOf, isTrashed } from './catalog.js'
import type { Catalog, CatalogState, CatalogStorage, Item } from './catalog.js'
import type { FinderAlert, FinderAlerts } from './finder.js'
import type { Point } from './geometry.js'
import { loadCode } from './loader.js'
import type { AppDefinition } from './shell.js'

/** Where `install()` puts a new application's icon, and whether it replaces what's there. */
export interface InstallOptions {
  /** The container the icon goes in: a folder's id, or null for the desktop. Default the desktop. */
  parent?: string | null
  /** The icon's place there, whole system px. Unset, the container's next free cell. */
  at?: Point | null
  /**
   * Put the file in place of what's installed under its id, whatever its
   * version, or give it to the icons that have no file. Without it, a file
   * whose application is already on the desktop changes nothing and answers
   * `present`.
   */
  replace?: boolean
}

/** Why `install()` refused a file. */
export type InstallRefusal =
  /** It isn't an app file, or not one this SDK reads. */
  | 'not-app-file'
  /** It's built for an app API this SDK doesn't run. */
  | 'api'
  /** Its signature doesn't hold. */
  | 'signature'
  /** The site's trust refuses it, or there is no Finder to ask. */
  | 'untrusted'
  /** An application built into the site has its id. */
  | 'built-in'
  /** Nothing keeps files: no storage, or storage that doesn't answer. */
  | 'storage'
  /** The visitor said no at the site's question. */
  | 'cancelled'
  /** It registers a kind another application registers. */
  | 'kind'
  /** Its code didn't load, or its `init` threw. */
  | 'code'

/** Why an installed application, or one built in, didn't load. */
export type SkipReason = 'not-app-file' | 'api' | 'signature' | 'untrusted' | 'kind' | 'code'

/** One application on the desktop, built in or installed, loaded or not. */
export interface InstalledApp {
  id: string
  /** Its name: its manifest's, or its definition's. */
  name: string
  /** Built in through `createShell`'s `apps`, or installed from an app file. */
  source: 'built-in' | 'installed'
  /** Its app file's manifest: an installed one's, and a built-in's that came from an app file (`?app`). Null for any other. */
  manifest: AppManifest | null
  /** An installed one's standing with the site's trust, at its last check; null for one built in. */
  standing: Standing | null
  /** The public key that signed an installed one, base64, or null. */
  key: string | null
  /** Whether it loaded and runs. */
  loaded: boolean
  /** Why it didn't load, a word to branch on; null when it loaded, or hasn't yet. */
  why: SkipReason | null
  /** Why it didn't load, for people; null when `why` is. */
  reason: string | null
  /** A newer file than the code running is kept, and runs once it restarts, or from the next load. */
  pending: boolean
  /** An installed one's file's size; null for one built in. */
  bytes: number | null
}

/** What `install()` did. */
export type InstallResult =
  /** Installed: its icon is new, and it runs. */
  | { status: 'installed'; app: InstalledApp }
  /** Its file replaced the one kept, or went to icons that had none; `previous` is the version it replaced, or null. */
  | { status: 'updated'; app: InstalledApp; previous: string | null }
  /**
   * Nothing changed: the application is already on the desktop, as `app` or
   * as icons with no file (`app` null). `manifest` and `standing` are the
   * file's, for the question a caller asks before it says to replace.
   */
  | { status: 'present'; app: InstalledApp | null; manifest: AppManifest; standing: Standing }
  /** Refused: `why` to branch on, `reason` for people, and the file's manifest when it read. */
  | { status: 'refused'; why: InstallRefusal; reason: string; manifest: AppManifest | null }

/** What `uninstall()` did. */
export type UninstallResult =
  | { status: 'uninstalled'; app: InstalledApp }
  | { status: 'refused'; why: 'not-installed' | 'built-in'; reason: string }

/** Why `restart()` refused. */
export type RestartRefusal =
  /** No application has the id. */
  | 'not-installed'
  /** It's built into the site: its code is the page's own. */
  | 'built-in'
  /** It isn't running: the boot skipped it, or it failed. */
  | 'not-running'
  /** The visitor cancelled at its offer to save, or a window of it stayed open at its own question. */
  | 'cancelled'
  /** Its kept file registers a kind another application registers. */
  | 'kind'
  /** Its kept file's code didn't load or start, a window of it didn't reopen on it, or asking it before it quit threw. */
  | 'code'

/** What `restart()` did. */
export type RestartResult =
  /** It runs its kept file now; `previous` is the version that ran before. */
  | { status: 'restarted'; app: InstalledApp; previous: string | null }
  /** Refused, the old code running on where any ran: `why` to branch on, `reason` for people. */
  | { status: 'refused'; why: RestartRefusal; reason: string }

/** What putting new code in place of a running application's came to: the version that ran before, or why not, the old code running on. */
export type Swapped = { previous: string | null } | { why: 'not-running' | 'cancelled' | 'code'; reason: string }

/** The install door, as `ctx.install`, `shell.install` and a seed's second argument have it. */
export type Install = (file: Blob | ArrayBuffer | Uint8Array, options?: InstallOptions) => Promise<InstallResult>

/** What the shell does for its installs. */
export interface InstallsHost {
  readonly catalog: Catalog | null
  readonly storage: CatalogStorage | null
  readonly trust: Trust | null
  /** Settles once the boot has read the catalog, or found none to read. */
  readonly read: Promise<void>
  /** Whether an application built into the site has `id`. */
  builtIn(id: string): boolean
  /** A kind of `def`'s that a running application registers, and that application's name, or null. */
  conflict(def: AppDefinition): { kind: string; app: string } | null
  /** Register `def` and run its init: what it threw, or null once it runs. */
  start(def: AppDefinition): { error: unknown } | null
  /** Take a running application down: its windows close, its menus, kinds and setup go. */
  stop(id: string): void
  /** Reopen an application's windows from the last visit, as the boot would have, once a page. */
  reopen(id: string): Promise<void>
  /**
   * Put `def` in place of the running application of its id: asked before it
   * quits, then started, its windows reopened on it where they were. A `def`
   * that fails puts the old code back.
   */
  swap(def: AppDefinition): Promise<Swapped>
  /** Raise one of the Finder's alerts and resolve its answer; null with no Finder to raise it. */
  alert<K extends FinderAlert>(id: K, details: FinderAlerts[K]): Promise<string | null> | null
  /** What's installed changed. */
  changed(): void
}

/** An installed application's file record's id: its own id after this. */
const FILE = '#app:'
/** A file record's kind, which no item has. */
const FILE_KIND = '#app'

/** What a file record keeps: the file, and the standing and key the visitor said to install at the site's question. */
interface FileData {
  file: string
  accepted?: { standing: Standing; key: string | null }
}

/** One installed application, as the shell keeps it. */
interface Kept {
  id: string
  record: Item
  bytes: Uint8Array
  manifest: AppManifest | null
  standing: Standing | null
  key: string | null
  loaded: boolean
  why: SkipReason | null
  reason: string | null
  pending: boolean
}

const byCreation = (a: Item, b: Item) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)

/** The application ids a listing's icons name. */
const iconIds = (state: CatalogState): Set<string> =>
  new Set(state.items.flatMap((i) => (i.kind === APP_KIND ? [appIdOf(i) ?? ''] : [])))

/** The app API levels this SDK runs, in words. */
const RUNS = APP_API_OLDEST === APP_API ? `${APP_API}` : `${APP_API_OLDEST} to ${APP_API}`

/** Why the trust doesn't take a file, for people. */
const untrusted = (standing: Standing) =>
  standing === 'unsigned' ? 'it isn’t signed by a key this desktop trusts' : 'it is signed by a key this desktop doesn’t trust'

/** What an error says. */
const said = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The installs over a shell. */
export function createInstalls(host: InstallsHost) {
  /** Every installed application, by id, in the order they were installed. */
  const kept = new Map<string, Kept>()
  /** Applications an install or an uninstall is working on: the sweep leaves them be. */
  const busy = new Set<string>()
  /** Whether the boot has loaded what's kept: the sweep starts then. */
  let sweeping = false

  // One at a time: a question asked, or a write, never races another install.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job)
    queue = run.catch(() => {})
    return run
  }

  const entryOf = (k: Kept): InstalledApp => ({
    id: k.id,
    name: k.manifest?.name ?? k.record.name,
    source: 'installed',
    manifest: k.manifest,
    standing: k.standing,
    key: k.key,
    loaded: k.loaded,
    why: k.why,
    reason: k.reason,
    pending: k.pending,
    bytes: k.bytes.length,
  })

  const iconsOf = (id: string): Item[] =>
    host.catalog?.get().items.filter((i) => i.kind === APP_KIND && appIdOf(i) === id) ?? []

  const refused = (why: InstallRefusal, reason: string, manifest: AppManifest | null): InstallResult => ({
    status: 'refused',
    why,
    reason,
    manifest,
  })

  /** Keep a file, under its application's id. */
  async function keep(id: string, manifest: AppManifest, bytes: Uint8Array, accepted: FileData['accepted']): Promise<Item> {
    const now = Date.now()
    const data: FileData = { file: base64Of(bytes), ...(accepted ? { accepted } : {}) }
    const record: Item = {
      id: FILE + id,
      name: manifest.name,
      kind: FILE_KIND,
      parent: null,
      createdAt: kept.get(id)?.record.createdAt ?? now,
      modifiedAt: now,
      data,
    }
    await host.storage!.put(record)
    return record
  }

  /** An app file's application, loaded and checked, or why it can't run. */
  async function definitionOf(
    manifest: AppManifest,
    code: string
  ): Promise<{ def: AppDefinition } | { why: 'code' | 'kind'; reason: string }> {
    let def: AppDefinition
    try {
      const factory = await loadCode(code, `${manifest.name}.png`)
      def = factory() as AppDefinition
    } catch (err) {
      return { why: 'code', reason: said(err).startsWith('its code') ? said(err) : `its code failed: ${said(err)}` }
    }
    if (!def || typeof def !== 'object' || typeof def.init !== 'function') {
      return { why: 'code', reason: 'its factory gives no application' }
    }
    if (def.id !== manifest.id) {
      return { why: 'code', reason: `its code is the application ${JSON.stringify(def.id)}, and its manifest names ${JSON.stringify(manifest.id)}` }
    }
    if (def.catalog) return { why: 'code', reason: 'it brings a catalog, which a Finder built into the site alone does' }
    const conflict = host.conflict(def)
    if (conflict) return { why: 'kind', reason: `it registers the kind ${conflict.kind}, which ${conflict.app} registers` }
    return { def: { ...def, icon: manifest.icon, manifest } }
  }

  async function installNow(bytes: Uint8Array, { parent = null, at = null, replace = false }: InstallOptions): Promise<InstallResult> {
    await host.read
    const read = await inspectAppFile(bytes)
    if (typeof read === 'string') return refused('not-app-file', read, null)
    const { manifest, code } = read
    const { id, name } = manifest
    if (!appRuns(manifest)) {
      return refused('api', `it is built for app API ${manifest.api}, and this desktop runs app API ${RUNS}`, manifest)
    }
    const check = await checkSignature(bytes)
    if (check.status === 'broken') return refused('signature', check.reason, manifest)
    const { standing, key, answer } = judgeSignature(check, host.trust)
    if (host.builtIn(id)) return refused('built-in', `an application built into this desktop has its id, ${id}`, manifest)
    const catalog = host.catalog
    if (!catalog || !host.storage) return refused('storage', 'this desktop keeps no files', manifest)
    if (!catalog.get().available) return refused('storage', 'files can’t be saved in this browser session', manifest)
    if (answer === 'refuse') return refused('untrusted', untrusted(standing), manifest)
    const existing = kept.get(id) ?? null
    const icons = iconsOf(id)
    if ((existing || icons.length) && !replace) {
      return { status: 'present', app: existing && entryOf(existing), manifest, standing }
    }
    let accepted: FileData['accepted']
    if (answer === 'ask') {
      const asked = host.alert('untrusted-application', { manifest, standing: standing as 'untrusted' | 'unsigned', key })
      if (!asked) return refused('untrusted', `${untrusted(standing)}, and there is no Finder to ask`, manifest)
      if ((await asked) !== 'install') return refused('cancelled', 'the visitor said not to install it', manifest)
      accepted = { standing, key }
    }

    busy.add(id)
    try {
      const previous = existing?.manifest?.version ?? null
      if (existing?.loaded) {
        // Its code keeps running: the new file runs from the next load.
        try {
          existing.record = await keep(id, manifest, bytes, accepted)
        } catch (err) {
          return refused('storage', `its file could not be saved: ${said(err)}`, manifest)
        }
        Object.assign(existing, { bytes, manifest, standing, key, pending: true })
        host.changed()
        return { status: 'updated', app: entryOf(existing), previous }
      }

      // Load it now: a new one, one the boot skipped, or icons with no file.
      const loaded = await definitionOf(manifest, code)
      if ('why' in loaded) return refused(loaded.why, loaded.reason, manifest)
      const failed = host.start(loaded.def)
      if (failed) return refused('code', `its code failed: ${said(failed.error)}`, manifest)
      let record: Item
      try {
        record = await keep(id, manifest, bytes, accepted)
      } catch (err) {
        host.stop(id)
        return refused('storage', `its file could not be saved: ${said(err)}`, manifest)
      }
      if (!icons.length) {
        const st = catalog.get()
        const into = containerOf(st, parent)
        const made = await catalog
          .create({
            kind: APP_KIND,
            name,
            parent: isTrashed(st, into) ? null : into,
            ...(at ? { left: at.left, top: at.top } : {}),
            data: { app: id },
          })
          .catch(() => null)
        if (!made) {
          host.stop(id)
          await host.storage.remove(FILE + id).catch(() => {})
          return refused('storage', 'its icon could not be saved', manifest)
        }
      }
      const entry: Kept = { id, record, bytes, manifest, standing, key, loaded: true, why: null, reason: null, pending: false }
      kept.set(id, entry)
      host.changed()
      await host.reopen(id)
      return icons.length || existing ? { status: 'updated', app: entryOf(entry), previous } : { status: 'installed', app: entryOf(entry) }
    } finally {
      busy.delete(id)
    }
  }

  async function uninstallNow(id: string): Promise<UninstallResult> {
    if (host.builtIn(id)) return { status: 'refused', why: 'built-in', reason: `${id} is built into this desktop` }
    const entry = kept.get(id)
    if (!entry) return { status: 'refused', why: 'not-installed', reason: `no application ${id} is installed` }
    busy.add(id)
    try {
      host.stop(id)
      await host.catalog?.remove(iconsOf(id).map((i) => i.id))
      await host.storage?.remove(FILE + id)
      kept.delete(id)
      host.changed()
      return { status: 'uninstalled', app: entryOf({ ...entry, loaded: false, pending: false }) }
    } finally {
      busy.delete(id)
    }
  }

  async function restartNow(id: string): Promise<RestartResult> {
    const no = (why: RestartRefusal, reason: string): RestartResult => ({ status: 'refused', why, reason })
    if (host.builtIn(id)) return no('built-in', `${id} is built into this desktop`)
    const entry = kept.get(id)
    if (!entry) return no('not-installed', `no application ${id} is installed`)
    if (!entry.loaded) return no('not-running', entry.reason ? `it isn’t running, since ${entry.reason}` : 'it isn’t running')
    busy.add(id)
    try {
      // Loaded and checked before anything closes: a file that fails leaves the old code running.
      const read = await inspectAppFile(entry.bytes)
      if (typeof read === 'string') return no('code', read)
      const loaded = await definitionOf(read.manifest, read.code)
      if ('why' in loaded) return no(loaded.why, loaded.reason)
      const swapped = await host.swap(loaded.def)
      if ('why' in swapped) return no(swapped.why, swapped.reason)
      entry.pending = false
      host.changed()
      return { status: 'restarted', app: entryOf(entry), previous: swapped.previous }
    } finally {
      busy.delete(id)
    }
  }

  /** Load a kept file at the boot, or say why it didn't load. */
  async function load(id: string, record: Item): Promise<void> {
    const data = (record.data ?? {}) as Partial<FileData>
    const bytes = bytesOf(data.file) ?? new Uint8Array(0)
    const entry: Kept = { id, record, bytes, manifest: null, standing: null, key: null, loaded: false, why: null, reason: null, pending: false }
    kept.set(id, entry)
    const skip = (why: SkipReason, reason: string) => {
      entry.why = why
      entry.reason = reason
      console.warn(`system-online-sdk (${id}): not loaded, since ${reason}`)
    }
    const read = await inspectAppFile(bytes)
    if (typeof read === 'string') return skip('not-app-file', read)
    entry.manifest = read.manifest
    if (read.manifest.id !== id) return skip('not-app-file', `its file is ${read.manifest.id}’s`)
    if (!appRuns(read.manifest)) {
      return skip('api', `it is built for app API ${read.manifest.api}, and this desktop runs app API ${RUNS}`)
    }
    const check = await checkSignature(bytes)
    if (check.status === 'broken') {
      entry.standing = 'broken'
      entry.key = check.key
      return skip('signature', check.reason)
    }
    const { standing, key, answer } = judgeSignature(check, host.trust)
    entry.standing = standing
    entry.key = key
    const accepted = data.accepted?.standing === standing && (data.accepted.key ?? null) === key
    if (answer === 'refuse' || (answer === 'ask' && !accepted)) return skip('untrusted', untrusted(standing))
    const loaded = await definitionOf(read.manifest, read.code)
    if ('why' in loaded) return skip(loaded.why, loaded.reason)
    const failed = host.start(loaded.def)
    if (failed) return skip('code', `its code failed: ${said(failed.error)}`)
    entry.loaded = true
  }

  async function bootNow(): Promise<void> {
    const { catalog, storage } = host
    if (catalog && storage && catalog.get().available) {
      let records: Item[] = []
      try {
        records = (await storage.list()).filter((r) => r.id.startsWith(FILE)).sort(byCreation)
      } catch (err) {
        console.warn('system-online-sdk: the installed applications could not be read —', err)
      }
      const named = iconIds(catalog.get())
      for (const record of records) {
        const id = record.id.slice(FILE.length)
        // Installed by the seed, or shadowed by a built-in of its id: left as it is.
        if (kept.has(id) || host.builtIn(id)) continue
        // No icon names it: the icon's write never came, or a restore replaced the catalog.
        if (!named.has(id)) {
          await storage.remove(record.id).catch(() => {})
          continue
        }
        await load(id, record)
      }
    }
    sweeping = true
    host.changed()
  }

  // An installed application with no icon left is uninstalled.
  const offSweep =
    host.catalog?.subscribe((st) => {
      if (!sweeping || !st.available) return
      const named = iconIds(st)
      for (const id of kept.keys()) {
        if (named.has(id) || busy.has(id)) continue
        busy.add(id)
        void serial(async () => {
          busy.delete(id)
          if (!kept.has(id) || iconIds(host.catalog!.get()).has(id)) return
          await uninstallNow(id)
        }).catch((err) => console.warn(`system-online-sdk (${id}): the uninstall failed —`, err))
      }
    }) ?? (() => {})

  /** A file handed to `install`, as bytes. */
  const bytesOfFile = async (file: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> =>
    file instanceof Uint8Array ? file : file instanceof ArrayBuffer ? new Uint8Array(file) : new Uint8Array(await file.arrayBuffer())

  const install: Install = async (file, options = {}) => {
    const bytes = await bytesOfFile(file)
    return serial(() => installNow(bytes, options))
  }

  return {
    install,
    uninstall: (id: string): Promise<UninstallResult> => serial(() => uninstallNow(id)),
    /** Restart a running installed application on its kept file. */
    restart: (id: string): Promise<RestartResult> => serial(() => restartNow(id)),
    /** Load what's kept, drop what no icon names, and start the sweep: the boot's step after the seed. */
    boot: (): Promise<void> => serial(bootNow),
    /** Every installed application, in the order they were installed. */
    list: (): InstalledApp[] => [...kept.values()].map(entryOf),
    /** An installed application's entry, or null. */
    get: (id: string | null): InstalledApp | null => {
      const k = id == null ? undefined : kept.get(id)
      return k ? entryOf(k) : null
    },
    /** An installed application's file, named for it, or null. */
    file(id: string): File | null {
      const k = kept.get(id)
      return k ? new File([k.bytes.slice()], `${k.manifest?.name ?? k.record.name}.png`, { type: 'image/png' }) : null
    },
    /** A loaded installed application failed after it started: its reopen threw, say. */
    failed(id: string, error: unknown): void {
      const k = kept.get(id)
      if (!k) return
      k.loaded = false
      k.why = 'code'
      k.reason = `its code failed: ${said(error)}`
      // No code runs for a newer file to wait behind.
      k.pending = false
    },

    /** The `app` kind's art for an installed application: its manifest's icon, loaded or not. */
    art: (id: string | null): string | null => (id == null ? null : (kept.get(id)?.manifest?.icon ?? null)),
    /**
     * The `app` kind's size, for Empty Trash's alert: the file's bytes, once,
     * on the first of its icons, when every icon of it is in the Trash.
     */
    size(item: Item): number {
      const k = kept.get(appIdOf(item) ?? '')
      const st = host.catalog?.get()
      if (!k || !st) return 0
      const icons = st.items.filter((i) => i.kind === APP_KIND && appIdOf(i) === k.id)
      if (icons.some((i) => !isTrashed(st, i.id))) return 0
      return icons[0]?.id === item.id ? k.bytes.length : 0
    },
    /**
     * The `app` kind's claim: an app file dropped or pasted installs at the
     * drop's place, through the Finder's questions: whether to replace one
     * already on the desktop, and the trust's. A refusal is said in the
     * Finder's alert. Any other file isn't the kind's.
     */
    async claim(file: Blob, parent: string | null, at?: Point | null): Promise<boolean> {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!carriesApp(bytes)) return false
      let answer = await install(bytes, { parent, at })
      if (answer.status === 'present') {
        const asked = host.alert('replace-application', {
          manifest: answer.manifest,
          installed: answer.app?.manifest?.version ?? null,
          standing: answer.standing,
        })
        if (!asked || (await asked) !== 'replace') return true
        answer = await install(bytes, { parent, at, replace: true })
      }
      if (answer.status === 'refused' && answer.why !== 'cancelled') {
        const name = file instanceof File && file.name ? file.name : `${answer.manifest?.name ?? 'The application'}.png`
        await host.alert('install-refused', { name, manifest: answer.manifest, why: answer.why, reason: answer.reason })
      }
      return true
    },
    /**
     * The `app` kind's export: the file, for the system clipboard, under a
     * custom format the browser carries byte for byte. As image/png it would
     * be re-encoded, its chunks dropped.
     */
    exported(item: Item): Blob | null {
      const k = kept.get(appIdOf(item) ?? '')
      return k ? new Blob([k.bytes.slice()], { type: 'web image/png' }) : null
    },

    dispose(): void {
      offSweep()
      sweeping = false
    },
  }
}

export type Installs = ReturnType<typeof createInstalls>
