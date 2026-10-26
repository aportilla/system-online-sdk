/**
 * The shell: applications over one desktop.
 *
 * - The menu bar holds the system menu — the page's own first menu, the
 *   Apple menu — then the front application's menus, then the clock in the
 *   bar's `end` slot. Each application's menus are parsed once and the same
 *   nodes come back each time it is front, so items keep their state. A menu
 *   off the bar has no key equivalents, so only the front application's fire.
 *   The bar's label is the front application's name.
 * - The system menu is the page's own items, then what Apple Menu Items
 *   holds, by name, following the folder as it changes. Choosing an entry
 *   opens its item as a double-click would. No application adds to it.
 * - While an application's held dialog is open, the bar shows that
 *   application's name and menus instead; nothing else changes.
 * - A press on the bezel brings the default application forward, but for a
 *   window that has the screen (the window manager's `fullScreen`), which
 *   keeps it: the bar is covered then, and still answers key equivalents.
 * - Each application's `init(ctx)` gets the desktop, the window manager, its
 *   own menus, dialogs and window markup, the other applications' actions
 *   (read at the call), the catalog when a Finder runs, the system's fonts,
 *   the site's services and index, `ask()`, `gate()`, `onFront()`,
 *   `onDispose()`, `beforeQuit()`, and the installs: `install()`,
 *   `uninstall()`, `restart()` and what's installed. Everything it sets up
 *   comes down through `onDispose()`, and its dialogs with it, so a hot
 *   reload starts clean. The shell composes no UI of its own.
 * - An application says, through `beforeQuit()`, whether it holds user data
 *   it hasn't saved, and offers to save it. The shell asks the offer before
 *   it takes the application down, and only while something is unsaved;
 *   leaving the page asks first then too, in the browser's own words.
 * - `restart()` runs an installed application's kept file in place of its
 *   code, without a reload: asked before it quits, through its hook or else
 *   its windows' own closes, then the old code stopped and the new started
 *   in one step, and its windows reopened on the new code at their boxes
 *   and depths. New code that fails puts the old back.
 * - Applications come from `apps`, built in, and from app files installed at
 *   runtime (installs.ts), which register as the built-in ones do and come
 *   down when they're uninstalled. Two applications with one id, or one kind
 *   two applications register, are refused. An `init` that throws, or a
 *   reopen that rejects, takes that application down alone.
 * - The shell registers three kinds itself, which no application's `kinds`
 *   replaces: `app`, an application's icon, which opens the application and
 *   claims app files; `alias`, which opens its original; and `font`, a
 *   suitcase, which opens in the first application that says it opens
 *   suitcases (`opens`).
 * - The system's fonts are the families the site serves. A suitcase
 *   directly in the System Folder's Fonts installs its family. `ctx.fonts`
 *   gives every application the installed families, any family by name and
 *   a strike loaded when it asks, and says when the installed families
 *   change, and only then.
 * - A window showing a catalog item follows it: its title follows a rename,
 *   and it closes when the item is removed.
 * - The boot waits for the desktop and its menu bar to render, reads the
 *   catalog, seeds it once, loads the installed applications, reopens the
 *   last session's windows deepest first and the active one last, opens
 *   what Startup Items holds, then starts saving. A window of an application
 *   that didn't load stays in the session, and reopens once it loads.
 */

import { onScaleChange, VfWindow } from 'vintage-frames'
import type {
  VfCloseDetail,
  VfDesktop,
  VfDialog,
  VfMenu,
  VfMenuBar,
  VfMenuItem,
  VfModalDialog,
  VfViewportBox,
} from 'vintage-frames'
import { keyOf } from './app-file.js'
import type { AppManifest, Trust } from './app-file.js'
import {
  ALIAS_KIND,
  APP_KIND,
  FONT_KIND,
  appIdOf,
  appleMenuOf,
  createCatalog,
  fontFamilyOf,
  resolve,
  startupItemsOf,
} from './catalog.js'
import type { AppleMenuEntry, Catalog, CatalogStorage, Item, SystemFolders, Volumes } from './catalog.js'
import type { FinderAlert, FinderAlerts } from './finder.js'
import { installedFamiliesOf } from './fonts.js'
import type { FontFamily } from './fonts.js'
import type { Point } from './geometry.js'
import { createInstalls } from './installs.js'
import type { Install, InstallOptions, InstallResult, InstalledApp, RestartResult, Swapped, UninstallResult } from './installs.js'
import { loadStrike } from './strikes.js'
import { createWindowManager, deepActiveElement, desktopRendered } from './windows.js'
import type { WindowManager } from './windows.js'
import { openWindowsOf } from './state.js'
import type { ShellState } from './state.js'
import { startClock } from './clock.js'

/** A kind of catalog item an application registers: how it looks and opens. */
export interface KindDefinition {
  /** Its 32×32 art: one URL, or one per item. */
  art: string | ((item: Item) => string)
  /** Open the item, its window out of `from` (its icon's box). */
  open(item: Item, from: VfViewportBox | null): void
  /** Renameable in place. Default true. */
  editable?: boolean
  /** Bytes, for Empty Trash's alert. */
  size?(item: Item): number
  /** Copy `from`'s payload to `to` when the Finder copies the item. */
  copy?(from: Item, to: Item): void | Promise<void>
  /** Empty Trash removed the item: drop its payload. */
  onRemove?(item: Item): void | Promise<void>
  /**
   * Make an item of a pasted or dropped file in `parent`; resolves whether it
   * did. `at` is where a dropped file was let go, the item's place in
   * `parent`, whole system px; a paste gives none, for the next free cell.
   */
  claim?(file: Blob, parent: string | null, at?: Point | null): Promise<boolean>
  /** The item on the system clipboard, as a file. */
  export?(item: Item): Promise<Blob | null>
}

/** The catalog a Finder brings: where it is stored, its volumes, its System Folder and its seed. */
export interface CatalogSetup {
  storage: CatalogStorage | null
  volumes?: Volumes
  /** The System Folder, named; its folders drive the Apple menu, what opens at startup and the fonts installed. */
  system?: SystemFolders
  /** Run once per storage, to store the site's defaults: the catalog, and the install door for the applications a new desktop comes with. */
  seed?: (catalog: Catalog, install: Install) => void | Promise<void>
}

/** One application. */
export interface AppDefinition<Actions = unknown> {
  id: string
  /** The bar's accessible name while it is front. */
  name: string
  /** Its 32×32 art, for the Finder's icon of it. */
  icon?: string
  /** The app file it came from's manifest: `?app` and an install set it. */
  manifest?: AppManifest
  /** A fragment of `vf-menu` elements, each with a `data-menu` name. */
  menus?: string
  /**
   * A fragment of dialogs, each with a `data-dialog` name: a `vf-dialog`, or
   * an element that renders one inside itself. Held under the application.
   */
  dialogs?: string
  /**
   * A fragment of windows, each with a `data-window` name, kept inert:
   * `ctx.window(name)` makes a fresh copy of one on each call.
   */
  windows?: string
  /** The catalog kinds it registers and opens; one of the shell's own (`app`, `alias`, `font`) is left out. */
  kinds?: Record<string, KindDefinition>
  /**
   * The shell's kinds it opens: `['font']`. Opening a suitcase goes to the
   * first application that names its kind here, through its
   * `open({ item, from })`.
   */
  opens?: readonly string[]
  /** The Finder's: the catalog every application shares. */
  catalog?: CatalogSetup
  /**
   * Set everything up and return what other applications may call. An
   * application that reopens windows across a reload — or opens from an
   * icon — provides `open({ item, from })`.
   */
  init(ctx: AppContext): Actions | void
}

/** What an application's `init` gets. */
export interface AppContext {
  readonly desktop: VfDesktop
  readonly windows: WindowManager
  /** Its own menus, parsed from `menus`. */
  readonly menus: VfMenu[]
  /** Every application's actions by id, read at the call. */
  readonly apps: Record<string, any>
  /** The catalog, when a Finder runs; read before the boot has refreshed it, it lists the kept containers alone. */
  readonly catalog: Catalog | null
  /** The site's own services. */
  readonly services: Record<string, any>
  /** The URL of the site's index of app files, or null when it gives none. */
  readonly index: string | null
  /** The saved session, or null. */
  readonly state: ShellState | null
  /** The system's fonts: the families the site serves, and which are installed. */
  readonly fonts: SystemFonts
  /** Every kind the applications register, the shell's `app`, `alias` and `font` first, in registration order. */
  readonly kinds: ReadonlyMap<string, KindDefinition>
  /** Settles once the boot is done: every application loaded or skipped, the session reopened. */
  readonly ready: Promise<void>
  /** A kind's definition, or undefined. */
  kind(kind: string): KindDefinition | undefined
  /** The application definition with `id`. */
  app(id: string): AppDefinition | undefined
  /**
   * The application that opens items of the shell's `kind`: for `font`, the
   * first whose `opens` names it. Undefined when none does, and for any
   * other kind, which opens itself.
   */
  opener(kind: string): AppDefinition | undefined
  /**
   * Install an app file, through the site's trust: its icon in `parent`, at
   * `at` or the next free cell, and the application loaded. Resolves what
   * happened: installed, updated, present (say `replace` to go ahead), or
   * refused and why.
   */
  install(file: Blob | ArrayBuffer | Uint8Array, options?: InstallOptions): Promise<InstallResult>
  /** Uninstall an installed application: every icon of it, wherever it is, and its file. It asks nothing. */
  uninstall(id: string): Promise<UninstallResult>
  /**
   * Restart an installed application on its kept file, the pending one if
   * there is one: asked before it quits (`beforeQuit`), then reopened on the
   * new code where its windows were. Resolves restarted, or refused and why,
   * the old code running on. An application that restarts itself does
   * nothing after the call.
   */
  restart(id: string): Promise<RestartResult>
  /** Every application on the desktop, built in or installed, loaded or not. */
  installed(): InstalledApp[]
  /** Follow what's installed: `fn` gets it each time any of it changes. Torn down with the application. */
  onInstalled(fn: (apps: InstalledApp[]) => void): void
  /** An installed application's file, by id, named for it; null for one built in or not installed. */
  appFile(id: string): Promise<File | null>
  /** One of its menus by `data-menu`; throws when the markup drifts. */
  menu(name: string): VfMenu
  /** One of its menu items by `value`; throws when the markup drifts. */
  item(value: string): VfMenuItem
  /** Every pick from its menus — never while a modal is open. */
  onMenu(fn: (value: string, item: VfMenuItem) => void): void
  /** One of its dialogs by `data-dialog`; throws when the markup drifts. */
  dialog<T extends HTMLElement = VfDialog>(name: string): T
  /**
   * A fresh copy of one of its windows by `data-window`, upgraded and not yet
   * appended: `open({ create: () => ctx.window('viewer') })`. Throws when the
   * markup drifts.
   */
  window<T extends HTMLElement = VfWindow>(name: string): T
  /** Hold a dialog it made in code: appended to the desktop, held under it, removed with it. Returns it. */
  hold<T extends Element>(dialog: T): T
  /** Let a dialog it holds go, and remove it. */
  release(dialog: Element): void
  /**
   * Show a dialog it holds, and resolve its `returnValue`: the value of the
   * button that submitted it, or null when it closed without one. Throws for
   * a dialog it doesn't hold.
   */
  ask(dialog: VfModalDialog): Promise<string | null>
  /** Keep `item` disabled while `test` is false: re-run on every press, key, selection change and activation. */
  gate(item: VfMenuItem, test: () => boolean): void
  /** Whether a text field has keyboard focus, read through shadow roots at the call. */
  typing(): boolean
  /** Whether a modal dialog is open. */
  modalOpen(): boolean
  /** Follow whether this application is front; called at once with the current state. */
  onFront(fn: (front: boolean) => void): void
  /** A listener torn down with the application. */
  on(target: EventTarget, type: string, fn: (e: Event) => void, options?: boolean | AddEventListenerOptions): void
  /** Run `fn` when the shell is disposed, or the application is uninstalled or restarts. */
  onDispose(fn: () => void): void
  /**
   * Ask before it quits. Before the shell takes the application down, a
   * restart say, it reads `unsaved()`, and only while that holds asks
   * `save()`, the application's own offer to save; while it holds, leaving
   * the page asks first, in the browser's own words. Without a hook, a
   * restart asks each of its windows to close, as its Quit does. One per
   * application: a second call replaces the first. Torn down with it.
   */
  beforeQuit(hooks: QuitHooks): void
}

/** The system's fonts, on every application's context. */
export interface SystemFonts {
  /**
   * The installed families, by name: those of the suitcases directly in
   * Fonts that the site serves, each once. Without a Fonts folder, without a
   * catalog, or while it isn't available, every family the site serves.
   */
  installed(): FontFamily[]
  /** A family the site serves, installed or not, by name; null for any other. */
  family(name: string): FontFamily | null
  /**
   * Register a strike of a family the site serves, by the family's name and
   * the strike's size, and resolve its `font-family`: the strike's own name,
   * quoted (`"Geneva 9"`), ready to set as `--vf-font-family`. A strike
   * registers once per page. Null for a strike the site doesn't serve, and
   * when its file doesn't load, which a later call tries again.
   */
  load(family: string, size: number): Promise<string | null>
  /** Follow the installed families: `fn` gets them each time they change, and only then. Torn down with the application. */
  onChange(fn: (installed: FontFamily[]) => void): void
}

/** What an application tells the shell before it quits: whether it holds user data not yet saved, and its offer to save it. */
export interface QuitHooks {
  /** Whether it holds user data not yet saved, at the moment it's asked: an edited document, say. Synchronous, so leaving the page can ask it. */
  unsaved(): boolean
  /**
   * Offer to save that data, in its own alert: called only while `unsaved()`
   * holds. Resolves true to go on, saved or let go at the visitor's word, and
   * false to stay, a Cancel.
   */
  save(): Promise<boolean>
}

/** Declare an application, with its actions' type. */
export function defineApp<Actions>(definition: AppDefinition<Actions>): AppDefinition<Actions> {
  return definition
}

export interface ShellOptions {
  /** The applications built in; the first with a `catalog` is the Finder. */
  apps: AppDefinition<any>[]
  /** The application front while no window is active. Default the Finder, else the first. */
  defaultApp?: string
  /** `'viewport'` sizes the desktop to the viewport on every resize and scale change. */
  fit?: 'viewport' | false
  /** Where the session is saved; null keeps nothing, so a reload resets. */
  state?: ShellState | null
  /** The site's own services, handed to every application. */
  services?: Record<string, unknown>
  /** The families the site serves its system; a strike is fetched only when an application loads it. Default none. */
  fonts?: readonly FontFamily[]
  /** The clock in the menu bar's `end` slot. Default true. */
  clock?: boolean
  /** Open what Startup Items holds once the session is back. Default true; false skips it for this boot. */
  startup?: boolean
  /** The public keys the site trusts, and what a file none of them signed gets. Unset, any app file installs. */
  trust?: Trust | null
  /** The URL of the site's index of app files, handed to every application as `ctx.index`. */
  index?: string | null
}

/** A running shell. */
export interface Shell {
  readonly desktop: VfDesktop
  readonly windows: WindowManager
  readonly catalog: Catalog | null
  readonly apps: Record<string, any>
  /** Settles once the boot has read the catalog, loaded the installed applications and reopened the session. */
  readonly ready: Promise<void>
  /** Install an app file, as `ctx.install` does. */
  install(file: Blob | ArrayBuffer | Uint8Array, options?: InstallOptions): Promise<InstallResult>
  /** Uninstall an installed application, as `ctx.uninstall` does. */
  uninstall(id: string): Promise<UninstallResult>
  /** Restart an installed application on its kept file, as `ctx.restart` does. */
  restart(id: string): Promise<RestartResult>
  /** Every application on the desktop, built in or installed, loaded or not. */
  installed(): InstalledApp[]
  /** Follow what's installed. Returns the unsubscribe. */
  onInstalled(fn: (apps: InstalledApp[]) => void): () => void
  /** An installed application's file, by id, named for it, or null. */
  appFile(id: string): Promise<File | null>
  dispose(): void
}

/** Whether an element is a text field, by its own tag. */
const isTextField = (el: Element | null): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable === true

/** What an error says. */
const said = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** One application the shell runs: its definition, its parsed markup, the kinds it set and its setup's teardown. */
interface Running {
  def: AppDefinition
  menus: VfMenu[]
  dialogs: HTMLElement[]
  windows: DocumentFragment
  /** The kinds it registered, to take back when it comes down. */
  kinds: string[]
  /** Its setup, undone in reverse. */
  own: (() => void)[]
  /** Whether its `init` has returned. */
  started: boolean
  /** What it said to ask before it quits, or null. */
  quit: QuitHooks | null
}

/** Check a site's trust, which a typo would otherwise leave open. */
function checkTrust(trust: Trust): void {
  if (!Array.isArray(trust.keys)) throw new Error('system-online-sdk: trust.keys is not a list of public keys')
  trust.keys.forEach((key, i) => {
    if (!keyOf(key)) throw new Error(`system-online-sdk: trust.keys[${i}] is not an Ed25519 public key`)
  })
  if (trust.otherwise != null && !['install', 'ask', 'refuse'].includes(trust.otherwise)) {
    throw new Error(`system-online-sdk: trust.otherwise is ${JSON.stringify(trust.otherwise)}, and it is 'install', 'ask' or 'refuse'`)
  }
}

/** Start the shell over `desktop`. The page has imported `vintage-frames` first. */
export function createShell(desktop: VfDesktop, options: ShellOptions): Shell {
  const definitions = options.apps
  const ids = new Set<string>()
  for (const def of definitions) {
    if (ids.has(def.id)) throw new Error(`system-online-sdk: two applications have the id ${def.id}`)
    ids.add(def.id)
  }
  const finderDef = definitions.find((d) => d.catalog)
  const defaultApp = options.defaultApp ?? finderDef?.id ?? definitions[0]?.id ?? ''
  const state = options.state ?? null
  const services = options.services ?? {}
  const trust = options.trust ?? null
  if (trust) checkTrust(trust)
  const index = typeof options.index === 'string' && options.index ? options.index : null
  const teardown: (() => void)[] = []

  const bar = desktop.querySelector<VfMenuBar>(':scope > vf-menu-bar')
  if (!bar) throw new Error('system-online-sdk: the desktop has no vf-menu-bar')
  const systemMenu = bar.querySelector<VfMenu>(':scope > vf-menu')
  if (!systemMenu) throw new Error('system-online-sdk: the menu bar has no system menu')
  bar.shortcuts = true

  // The boot's promises, made first, so every context hands them on.
  let settle!: () => void
  let fail!: (err: unknown) => void
  const ready = new Promise<void>((done, failed) => {
    settle = done
    fail = failed
  })
  let markRead!: () => void
  const read = new Promise<void>((done) => (markRead = done))

  // The desktop's pattern, as the last session left it, before the first paint.
  const savedPattern = state?.saved?.pattern
  if (savedPattern) desktop.pattern = savedPattern

  // The raster, fit to the viewport.
  let windows: WindowManager | null = null
  if (options.fit === 'viewport') {
    const fit = () => {
      const before = { width: desktop.width, height: desktop.height }
      desktop.fitWithin(document.documentElement.clientWidth, document.documentElement.clientHeight)
      windows?.resized(before)
    }
    fit()
    window.addEventListener('resize', fit)
    const offScale = onScaleChange(fit)
    teardown.push(() => {
      window.removeEventListener('resize', fit)
      offScale()
    })
  }

  const wm = createWindowManager(desktop, { defaultApp, savedPin: (item) => state?.pin(item) ?? null })
  windows = wm

  // A press on the desktop itself — its bezel — brings the default
  // application forward, but for a window that has the screen, which keeps it.
  const onDesktopPress = (e: Event) => {
    if (e.target === desktop && !wm.fullScreenWindow) desktop.clearActive()
  }
  desktop.addEventListener('pointerdown', onDesktopPress)
  teardown.push(() => desktop.removeEventListener('pointerdown', onDesktopPress))

  // The applications the shell runs, built in and installed, in registration
  // order; one leaves when it comes down. A built-in that didn't load says why.
  const apps = new Map<string, Running>()
  const failures = new Map<string, string>()
  const builtIn = (id: string | null | undefined) => definitions.some((d) => d.id === id)

  /** One of the Finder's alerts, its site's answer where it gave one; null with no Finder to raise it. */
  const finderAlert = <K extends FinderAlert>(id: K, details: FinderAlerts[K]): Promise<string | null> | null => {
    const finder = finderDef ? actions[finderDef.id] : undefined
    return typeof finder?.alert === 'function' ? finder.alert(id, details) : null
  }

  // Kinds: the shell's own three, then every application's. An
  // application's icon opens the application, and claims an app file
  // dropped or pasted. An alias opens its original as a double-click would,
  // through the Finder, which says so when it's gone. A suitcase opens in
  // the first application that says it opens suitcases, and weighs its
  // family's strikes; the Finder draws it, and says so when nothing opens it.
  // An application's kind under one of the shell's names is left out, and
  // the console names the application.
  const actions: Record<string, any> = {}
  const openAsDoubleClick = (item: string, from: VfViewportBox | null = null) =>
    actions[finderDef?.id ?? '']?.open?.({ item, from })
  const opener = (kind: string): AppDefinition | undefined =>
    kind === FONT_KIND ? [...apps.values()].find((a) => a.def.opens?.includes(kind))?.def : undefined
  const families = options.fonts ?? []
  const familyNamed = (name: string | null): FontFamily | null => families.find((f) => f.name === name) ?? null
  const kinds = new Map<string, KindDefinition>()
  kinds.set(APP_KIND, {
    art: (item) => {
      const id = appIdOf(item)
      return (apps.get(id ?? '')?.def ?? definitions.find((d) => d.id === id))?.icon ?? installs.art(id) ?? ''
    },
    open: (item, from) => openApplication(item, from),
    editable: false,
    size: (item) => installs.size(item),
    claim: (file, parent, at) => installs.claim(file, parent, at),
    export: async (item) => installs.exported(item),
  })
  kinds.set(ALIAS_KIND, {
    art: (item) => {
      const original = catalog && resolve(catalog.get(), item.id)
      const kind = original && kinds.get(original.kind)
      if (!original || !kind) return ''
      return typeof kind.art === 'function' ? kind.art(original) : kind.art
    },
    open: (item, from) => void openAsDoubleClick(item.id, from),
  })
  kinds.set(FONT_KIND, {
    art: '',
    open: (item, from) => void actions[opener(FONT_KIND)?.id ?? '']?.open?.({ item: item.id, from }),
    size: (item) => familyNamed(fontFamilyOf(item))?.strikes.reduce((sum, s) => sum + s.bytes, 0) ?? 0,
  })
  const shellKinds = new Set(kinds.keys())
  const owners = new Map<string, string>()
  for (const def of definitions) {
    for (const kind of Object.keys(def.kinds ?? {})) {
      if (shellKinds.has(kind)) continue
      const other = owners.get(kind)
      if (other != null) throw new Error(`system-online-sdk: the ${kind} kind is registered by both ${other} and ${def.id}`)
      owners.set(kind, def.id)
    }
  }

  /**
   * Open an application from its icon. One that runs opens through its
   * `open`; one that didn't load, or isn't on this desktop at all, says why
   * in the Finder's alert. One still starting opens nothing yet.
   */
  function openApplication(item: Item, from: VfViewportBox | null): void {
    const id = appIdOf(item)
    const running = apps.get(id ?? '')
    if (running) {
      if (running.started) void actions[id!]?.open?.({ from })
      return
    }
    const installed = installs.get(id)
    const def = definitions.find((d) => d.id === id)
    let why: FinderAlerts['application-unavailable']['why']
    let reason: string
    let manifest: AppManifest | null = null
    if (installed) {
      if (!installed.why) return
      ;({ why, reason, manifest } = { why: installed.why, reason: installed.reason ?? '', manifest: installed.manifest })
    } else if (def) {
      const failure = failures.get(def.id)
      if (!failure) return
      ;({ why, reason, manifest } = { why: 'code', reason: failure, manifest: def.manifest ?? null })
    } else {
      why = 'missing'
      reason = 'it isn’t installed on this desktop'
    }
    void finderAlert('application-unavailable', { item, app: id ?? '', manifest, why, reason })
  }

  const catalog = finderDef?.catalog
    ? createCatalog({
        storage: finderDef.catalog.storage,
        volumes: finderDef.catalog.volumes,
        system: finderDef.catalog.system,
        hooks: (kind) => kinds.get(kind),
      })
    : null

  // The installed families, followed through the catalog and announced only
  // when they change: the catalog announces every placement too.
  let installedFamilies = installedFamiliesOf(catalog?.get() ?? null, families)
  const fontListeners = new Set<(installed: FontFamily[]) => void>()
  if (catalog) {
    teardown.push(
      catalog.subscribe((st) => {
        const next = installedFamiliesOf(st, families)
        if (next.length === installedFamilies.length && next.every((family, i) => family === installedFamilies[i])) return
        installedFamilies = next
        for (const fn of [...fontListeners]) fn(installedFamilies.slice())
      })
    )
  }

  // Modals, typing and gates.
  const modalOpen = () => !!document.querySelector('vf-dialog[open]')
  const typing = () => isTextField(deepActiveElement())
  const gates = new Map<VfMenuItem, () => boolean>()
  const syncGates = () => {
    for (const [item, test] of gates) {
      const off = !test()
      if (item.disabled !== off) item.disabled = off
    }
  }
  // Capture phase on the document: a press or key syncs the gates before
  // any item can take it, its key equivalent included.
  document.addEventListener('pointerdown', syncGates, true)
  document.addEventListener('keydown', syncGates, true)
  desktop.addEventListener('vf-select', syncGates)
  desktop.addEventListener('vf-activate', syncGates)
  teardown.push(
    () => document.removeEventListener('pointerdown', syncGates, true),
    () => document.removeEventListener('keydown', syncGates, true),
    () => desktop.removeEventListener('vf-select', syncGates),
    () => desktop.removeEventListener('vf-activate', syncGates),
    wm.onWindows(syncGates),
    wm.onLayout(syncGates)
  )
  if (catalog) teardown.push(catalog.subscribe(syncGates))

  // What's installed, and who follows it.
  const installedListeners = new Set<(apps: InstalledApp[]) => void>()
  const installedList = (): InstalledApp[] => [
    ...definitions.map((def): InstalledApp => {
      const failure = failures.get(def.id) ?? null
      return {
        id: def.id,
        name: def.name,
        source: 'built-in',
        manifest: def.manifest ?? null,
        standing: null,
        key: null,
        loaded: !!apps.get(def.id)?.started,
        why: failure ? 'code' : null,
        reason: failure,
        pending: false,
        bytes: null,
      }
    }),
    ...installs.list(),
  ]
  const announce = () => {
    const list = installedList()
    for (const fn of [...installedListeners]) fn(list.slice())
  }

  // Menus and dialogs: each application's parsed once into detached nodes of this document.
  const parse = (html: string | undefined): HTMLElement[] => {
    if (!html) return []
    const host = document.createElement('div')
    host.innerHTML = html
    customElements.upgrade(host)
    const nodes = [...host.children].filter((el): el is HTMLElement => el instanceof HTMLElement)
    for (const node of nodes) node.remove()
    return nodes
  }

  // The menu swap: the front application's menus after the system menu, or,
  // while one of its held dialogs is open, the asking application's.
  let slotted: Running | null = null
  function sync(): void {
    const app = wm.asking ?? wm.front
    const entry = apps.get(app) ?? apps.get(defaultApp) ?? null
    if (!entry || entry === slotted) return
    if (slotted) for (const menu of slotted.menus) menu.remove()
    systemMenu!.after(...entry.menus)
    bar!.label = entry.def.name
    slotted = entry
    syncGates()
  }

  /** An application's markup, parsed, and its kinds registered: built-in ones all before any `init`. */
  function admit(def: AppDefinition): Running {
    const entry: Running = {
      def,
      menus: parse(def.menus).filter((el): el is VfMenu => el.localName === 'vf-menu'),
      dialogs: parse(def.dialogs).filter((el) => el.dataset.dialog != null),
      // Windows stay inert in a template, copied on each ask.
      windows: (() => {
        const template = document.createElement('template')
        template.innerHTML = def.windows ?? ''
        return template.content
      })(),
      kinds: [],
      own: [],
      started: false,
      quit: null,
    }
    for (const [kind, k] of Object.entries(def.kinds ?? {})) {
      if (!shellKinds.has(kind)) {
        kinds.set(kind, k)
        entry.kinds.push(kind)
        continue
      }
      const hint = kind === FONT_KIND ? `; one that opens suitcases says so: opens: ['${FONT_KIND}']` : ''
      console.warn(`system-online-sdk (${def.id}): the ${kind} kind is the shell's own, so the application's is left out${hint}`)
    }
    apps.set(def.id, entry)
    return entry
  }

  /**
   * Run an admitted application's `init`. One that throws comes down alone,
   * the console saying so and what follows, `then`: what it threw, or null
   * once it runs.
   */
  function begin(entry: Running, then = "so it doesn't run"): { error: unknown } | null {
    const { def, menus, dialogs, windows: windowMarkup, own } = entry
    const where = `system-online-sdk (${def.id})`
    // Its dialogs, held under it from the start and removed with it last.
    const held = new Set<Element>()
    for (const dialog of dialogs) {
      wm.holdDialog(dialog, { app: def.id })
      held.add(dialog)
    }
    own.push(() => {
      for (const dialog of held) {
        wm.releaseDialog(dialog)
        dialog.remove()
      }
      held.clear()
    })
    const ctx: AppContext = {
      desktop,
      windows: wm,
      menus,
      apps: actions,
      catalog,
      services,
      index,
      state,
      ready,
      fonts: {
        installed: () => installedFamilies.slice(),
        family: familyNamed,
        load: (family, size) => loadStrike(familyNamed(family), size),
        onChange(fn) {
          fontListeners.add(fn)
          own.push(() => fontListeners.delete(fn))
        },
      },
      kinds,
      kind: (kind) => kinds.get(kind),
      app: (id) => apps.get(id)?.def ?? definitions.find((d) => d.id === id),
      opener,
      install: (file, opts) => installs.install(file, opts),
      uninstall: (id) => installs.uninstall(id),
      restart,
      installed: installedList,
      onInstalled(fn) {
        installedListeners.add(fn)
        own.push(() => installedListeners.delete(fn))
      },
      appFile: async (id) => installs.file(id),
      menu(name) {
        const menu = menus.find((m) => m.dataset.menu === name)
        if (!menu) throw new Error(`${where}: missing menu ${name}`)
        return menu
      },
      item(value) {
        for (const menu of menus) {
          const item = menu.querySelector<VfMenuItem>(`vf-menu-item[value="${CSS.escape(value)}"]`)
          if (item) return item
        }
        throw new Error(`${where}: missing menu item ${value}`)
      },
      onMenu(fn) {
        for (const menu of menus) {
          ctx.on(menu, 'vf-menu-select', (e) => {
            if (modalOpen()) return
            const { value, item } = (e as CustomEvent<{ value: string; item: VfMenuItem }>).detail
            fn(value, item)
          })
        }
      },
      dialog<T extends HTMLElement = VfDialog>(name: string): T {
        const dialog = dialogs.find((d) => d.dataset.dialog === name)
        if (!dialog) throw new Error(`${where}: missing dialog ${name}`)
        return dialog as T
      },
      window<T extends HTMLElement = VfWindow>(name: string): T {
        const source = [...windowMarkup.children].find((el) => (el as HTMLElement).dataset.window === name)
        if (!source) throw new Error(`${where}: missing window ${name}`)
        const win = document.importNode(source, true) as T
        customElements.upgrade(win)
        return win
      },
      hold(dialog) {
        wm.holdDialog(dialog, { app: def.id })
        held.add(dialog)
        return dialog
      },
      release(dialog) {
        if (!held.delete(dialog)) return
        wm.releaseDialog(dialog)
        dialog.remove()
      },
      ask(dialog) {
        if (wm.appOf(dialog) !== def.id) throw new Error(`${where}: ask() takes a dialog the application holds`)
        return new Promise((resolve) => {
          const closed = (e: Event) => {
            if (e.target !== dialog) return
            dialog.removeEventListener('vf-close', closed)
            resolve((e as CustomEvent<VfCloseDetail>).detail.returnValue)
          }
          // Listen once it's shown: a dialog shown again before its last close
          // was announced announces that close inside show(), and that answer
          // isn't this ask's.
          dialog.show()
          dialog.addEventListener('vf-close', closed)
        })
      },
      gate(item, test) {
        gates.set(item, test)
        own.push(() => gates.delete(item))
        const off = !test()
        if (item.disabled !== off) item.disabled = off
      },
      typing,
      modalOpen,
      onFront(fn) {
        fn(wm.front === def.id)
        own.push(wm.onFront((app) => fn(app === def.id)))
      },
      on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts)
        own.push(() => target.removeEventListener(type, fn, opts))
      },
      onDispose(fn) {
        own.push(fn)
      },
      beforeQuit(hooks) {
        entry.quit = hooks
        syncLeaving()
        own.push(() => {
          if (entry.quit === hooks) entry.quit = null
          syncLeaving()
        })
      },
    }
    try {
      const result = def.init(ctx)
      if (result) actions[def.id] = result
      entry.started = true
      return null
    } catch (error) {
      console.error(`${where}: its init threw, ${then} —`, error)
      stop(def.id)
      return { error }
    }
  }

  /**
   * Take a running application down, as `dispose()` takes every one down:
   * its windows close, its menus and kinds go, and its setup comes down
   * through its own `onDispose`, its dialogs with it. Its documents stay.
   */
  function stop(id: string): void {
    const entry = apps.get(id)
    if (!entry) return
    apps.delete(id)
    for (const win of wm.windowsOf(id)) void wm.close(win)
    if (slotted === entry) {
      for (const menu of entry.menus) menu.remove()
      slotted = null
    }
    for (const fn of entry.own.splice(0).reverse()) {
      try {
        fn()
      } catch (err) {
        console.error(`system-online-sdk (${id}): its teardown threw —`, err)
      }
    }
    for (const kind of entry.kinds) if (kinds.get(kind) === entry.def.kinds?.[kind]) kinds.delete(kind)
    delete actions[id]
    sync()
  }

  /** A running application failed after it started: its reopen rejected, say. It comes down alone, and says why. */
  function failed(id: string, error: unknown): void {
    console.error(`system-online-sdk (${id}): reopening its windows failed, so it doesn't run —`, error)
    down(id, error)
  }

  /** An application that failed comes down for good, and what's installed says why. */
  function down(id: string, error: unknown): void {
    stop(id)
    if (builtIn(id)) failures.set(id, `its code failed: ${said(error)}`)
    else installs.failed(id, error)
    announce()
  }

  /** The applications whose windows the boot reopened, or will: a later load reopens its own once. */
  const reopened = new Set<string>()
  let sessionBack = false
  /** Reopen an application's windows from the last visit, deepest first, as the boot would have. */
  async function reopen(id: string): Promise<void> {
    if (!sessionBack || reopened.has(id)) return
    reopened.add(id)
    for (const { item, app } of openWindowsOf(state?.saved ?? null)) {
      if (app !== id) continue
      try {
        await actions[id]?.open?.({ item })
      } catch (err) {
        failed(id, err)
        return
      }
    }
  }

  // Leaving the page asks first while an application holds something
  // unsaved: the browser's own question, the only one it allows there. Heard
  // only while an application has a hook.
  let leaving = false
  const onLeave = (e: BeforeUnloadEvent) => {
    for (const { def, quit } of apps.values()) {
      let unsaved = false
      try {
        unsaved = !!quit?.unsaved()
      } catch (err) {
        // A hook that throws errs on the data's side.
        console.error(`system-online-sdk (${def.id}): its unsaved() threw —`, err)
        unsaved = true
      }
      if (!unsaved) continue
      e.preventDefault()
      // For browsers that read the legacy property.
      e.returnValue = ''
      return
    }
  }
  const syncLeaving = () => {
    const want = [...apps.values()].some((a) => a.quit)
    if (want === leaving) return
    leaving = want
    if (want) window.addEventListener('beforeunload', onLeave)
    else window.removeEventListener('beforeunload', onLeave)
  }
  teardown.push(() => {
    leaving = false
    window.removeEventListener('beforeunload', onLeave)
  })

  /**
   * Ask an application before it's taken down: its offer to save, only while
   * it holds something unsaved, else each of its windows as its Quit asks
   * them. True to go on, false at a Cancel, or why asking failed.
   */
  async function mayQuit(id: string): Promise<boolean | { reason: string }> {
    const hooks = apps.get(id)?.quit
    try {
      if (!hooks) return await wm.closeAll(id)
      // Its answer stands: Don't Save goes on, the data let go.
      return !hooks.unsaved() || (await hooks.save()) === true
    } catch (error) {
      const asking = hooks ? 'its beforeQuit' : 'closing its windows'
      console.error(`system-online-sdk (${id}): ${asking} threw, so it keeps running —`, error)
      return { reason: `${asking} failed: ${said(error)}` }
    }
  }

  /** Stop what runs under `def`'s id and start `def` in its place, in one step: what its init threw, or null once it runs. */
  function startInPlace(def: AppDefinition, then?: string): { error: unknown } | null {
    stop(def.id)
    const thrown = begin(admit(def), then)
    // stop() slotted the default application's menus, never painted: the new code's, if it's in front.
    sync()
    return thrown
  }

  /** Reopen `items` on what runs under `id`, in order: what an `open` threw, said in the console with `then`, or null. */
  async function reopenOn(id: string, items: string[], then = "so it doesn't run"): Promise<{ error: unknown } | null> {
    for (const item of items) {
      try {
        await actions[id]?.open?.({ item })
      } catch (error) {
        console.error(`system-online-sdk (${id}): reopening its windows failed, ${then} —`, error)
        return { error }
      }
    }
    return null
  }

  /**
   * Raise the windows again in `stack`'s order, from the lowest of the
   * restarted application's up, each of its by the item it showed: the
   * active window is the front one again, or none when none was.
   */
  function restack(stack: HTMLElement[], items: Map<Element, string | null>, active: HTMLElement | null): void {
    const from = stack.findIndex((win) => items.has(win))
    for (const win of from < 0 ? [] : stack.slice(from)) {
      const item = items.get(win)
      const now = item === undefined ? win : item === null ? null : wm.windowFor(item)
      if (now?.isConnected) desktop.bringToFront(now)
    }
    if (!active) desktop.clearActive()
  }

  /**
   * Put `next` in place of the running application of its id: asked before
   * it quits, the old stopped and the new started in one step, and its
   * windows reopened on the new code at their boxes and depths. New code
   * that fails, its init or a reopen, comes down and the old starts again in
   * its place, in one step too. The session holds throughout: a write while
   * its windows are closed would drop their depth.
   */
  async function swap(next: AppDefinition): Promise<Swapped> {
    const id = next.id
    const running = apps.get(id)
    if (!running?.started) return { why: 'not-running', reason: 'it isn’t running' }
    const old = running.def
    // The stack before anything closes, and each window's item as it
    // changes: a Save at its question gives an untitled one its item.
    const stack = desktop.stackingOrder
    const active = desktop.activeWindow
    const items = new Map<Element, string | null>()
    const note = () => {
      for (const win of wm.windowsOf(id)) if (!wm.isPalette(win)) items.set(win, wm.itemOf(win))
    }
    note()
    const offNote = wm.onWindows(note)
    state?.hold()
    try {
      const may = await mayQuit(id)
      offNote()
      if (may === false) return { why: 'cancelled', reason: 'the visitor kept it running at its own question' }
      if (may !== true) return { why: 'code', reason: may.reason }
      // The items its windows showed, deepest first, as the boot reopens a session.
      const shown = stack.flatMap((win) => {
        const item = items.get(win)
        return item == null ? [] : [item]
      })
      const again = 'so the code it ran starts again'
      const failure = startInPlace(next, again) ?? (await reopenOn(id, shown, again))
      if (!failure) {
        restack(stack, items, active)
        return { previous: old.manifest?.version ?? null }
      }
      // The old code in its place, in the step the new comes down in, and its
      // windows again; failing too, it's down, as a failed reopen leaves one.
      const back = startInPlace(old) ?? (await reopenOn(id, shown))
      if (back) {
        down(id, back.error)
      } else {
        restack(stack, items, active)
        // Its kinds are the old code's again: the Finder draws them.
        announce()
      }
      return { why: 'code', reason: `its code failed: ${said(failure.error)}` }
    } finally {
      offNote()
      state?.release()
    }
  }

  const installs = createInstalls({
    catalog,
    storage: finderDef?.catalog?.storage ?? null,
    trust,
    read,
    builtIn,
    conflict(def) {
      for (const kind of Object.keys(def.kinds ?? {})) {
        if (shellKinds.has(kind)) continue
        const owner = [...apps.values()].find((a) => a.def.id !== def.id && a.kinds.includes(kind))
        if (owner) return { kind, app: owner.def.name }
      }
      return null
    },
    start: (def) => begin(admit(def)),
    stop,
    reopen,
    swap,
    alert: finderAlert,
    changed: announce,
  })

  /**
   * Restart an installed application on its kept file, once the boot is
   * done, in its turn with the installs. It waits for the boot outside the
   * queue: inside, it would wait on the boot's own turn, queued behind it.
   */
  const restart = async (id: string): Promise<RestartResult> => {
    await ready.catch(() => {})
    return installs.restart(id)
  }

  // Applications: every built-in one's kinds first, then each one's init, in order.
  for (const entry of definitions.map(admit)) {
    const failure = begin(entry)
    if (failure) failures.set(entry.def.id, `its code failed: ${said(failure.error)}`)
  }
  if (failures.size) announce()
  teardown.push(wm.onFront(sync), wm.onDialogs(sync))
  sync()

  // The Apple menu: under the page's own items, what Apple Menu Items holds,
  // by name, and a folder's entries as its submenu (appleMenuOf). Each
  // entry's value is its item's id.
  const appleItems = new Map<VfMenuItem, string>()
  /** The entries at every depth, in the order flatten() walks the tree. */
  let appleEntries: VfMenuItem[] = []
  /** The tree's ids and nesting: a name can change without a rebuild, nothing else. */
  let appleShape = ''
  const shapeOf = (tree: AppleMenuEntry[]): string =>
    tree.map((e) => (e.entries ? `${e.item.id}(${shapeOf(e.entries)})` : e.item.id)).join(',')
  const flatten = (tree: AppleMenuEntry[]): Item[] =>
    tree.flatMap((e) => [e.item, ...(e.entries ? flatten(e.entries) : [])])
  const build = (tree: AppleMenuEntry[], into: Element): void => {
    for (const { item, entries } of tree) {
      const entry = document.createElement('vf-menu-item')
      entry.setAttribute('value', item.id)
      entry.append(item.name)
      into.append(entry)
      appleItems.set(entry, item.id)
      appleEntries.push(entry)
      if (entries) {
        const submenu = document.createElement('vf-menu')
        submenu.slot = 'submenu'
        entry.append(submenu)
        build(entries, submenu)
      }
    }
  }
  const syncAppleMenu = () => {
    const tree = catalog ? appleMenuOf(catalog.get()) : []
    const shape = shapeOf(tree)
    if (shape === appleShape) {
      // The same items in the same places: a name may have changed, nothing
      // else. The label's text node is replaced, not edited, so the item
      // hears it (its name follows its default slot).
      flatten(tree).forEach((item, i) => {
        const entry = appleEntries[i]!
        if (entry.labelText !== item.name) entry.firstChild!.replaceWith(item.name)
      })
      return
    }
    for (const [entry] of appleItems) entry.remove()
    appleItems.clear()
    appleEntries = []
    appleShape = shape
    build(tree, systemMenu)
  }
  const onSystemPick = (e: Event) => {
    const id = appleItems.get((e as CustomEvent<{ item: VfMenuItem }>).detail.item)
    if (id != null && !modalOpen()) void openAsDoubleClick(id)
  }
  systemMenu.addEventListener('vf-menu-select', onSystemPick)
  teardown.push(() => {
    systemMenu.removeEventListener('vf-menu-select', onSystemPick)
    for (const [entry] of appleItems) entry.remove()
    appleItems.clear()
  })
  if (catalog) teardown.push(catalog.subscribe(syncAppleMenu))

  // The clock, in the bar's end slot.
  if (options.clock !== false) {
    let label = bar.querySelector<HTMLElement>(':scope > [slot="end"]')
    const made = !label
    if (!label) {
      label = document.createElement('vf-label')
      label.slot = 'end'
      bar.append(label)
    }
    const stopClock = startClock(label)
    teardown.push(() => {
      stopClock()
      if (made) label!.remove()
    })
  }

  // A window showing a catalog item follows it.
  const backed = new WeakSet<Element>()
  const follow = () => {
    if (!catalog) return
    for (const win of desktop.stackingOrder) {
      if (!(win instanceof VfWindow)) continue
      const item = wm.itemOf(win)
      if (item == null) continue
      const it = catalog.item(item)
      if (it) {
        backed.add(win)
        if (win.heading !== it.name) win.heading = it.name
      } else if (backed.has(win) && catalog.get().available) {
        void wm.close(win, { to: null })
      }
    }
  }
  if (catalog) teardown.push(catalog.subscribe(follow), wm.onWindows(follow))

  /**
   * The applications whose saved windows wait for them: every one an icon
   * names, every built-in one and every installed one, that isn't running.
   */
  const waiting = (): string[] => {
    const named = catalog?.get().items.flatMap((i) => (i.kind === APP_KIND ? [appIdOf(i) ?? ''] : [])) ?? []
    const known = new Set([...named, ...definitions.map((d) => d.id), ...installs.list().map((a) => a.id)])
    return [...known].filter((id) => id && !apps.get(id)?.started)
  }

  // The boot.
  state?.hold()
  void (async () => {
    try {
      // The menu bar renders first, so the work area, the seed and the
      // session's windows all measure it.
      await desktopRendered(desktop)
      if (catalog) {
        await catalog.refresh()
        markRead()
        const seed = finderDef?.catalog?.seed
        if (seed) await catalog.seed((c) => seed(c, installs.install))
        await installs.boot()
      }
      markRead()
      // The session, for every application that runs; one that doesn't
      // keeps its windows for when it loads.
      for (const [id, app] of apps) if (app.started) reopened.add(id)
      sessionBack = true
      for (const { item, app } of openWindowsOf(state?.saved ?? null)) {
        if (!apps.get(app)?.started) continue
        try {
          await actions[app]?.open?.({ item })
        } catch (err) {
          failed(app, err)
        }
      }
      const active = state?.saved?.active
      if (active) {
        const win = wm.windowFor(active)
        if (win) desktop.bringToFront(win)
      }
      // After the session, so what they open comes to the front.
      if (catalog && options.startup !== false) {
        for (const item of startupItemsOf(catalog.get())) {
          try {
            await openAsDoubleClick(item.id)
          } catch (err) {
            console.error(`system-online-sdk: opening ${item.name} at startup failed —`, err)
          }
        }
      }
    } finally {
      markRead()
      if (state) {
        const stopSaving = state.start(
          () => ({
            windows: wm.snapshot(),
            active: wm.itemOf(desktop.activeWindow),
            pattern: desktop.pattern ?? null,
            waiting: waiting(),
          }),
          (fn) => {
            const offs = [wm.onLayout(fn), wm.onWindows(fn), ...(catalog ? [catalog.subscribe(fn)] : [])]
            desktop.addEventListener('vf-activate', fn)
            // `pattern` reflects: a new desktop pattern is saved on its own.
            const pattern = new MutationObserver(fn)
            pattern.observe(desktop, { attributes: true, attributeFilter: ['pattern'] })
            return () => {
              for (const off of offs) off()
              desktop.removeEventListener('vf-activate', fn)
              pattern.disconnect()
            }
          }
        )
        teardown.push(stopSaving)
        // Writes what the boot left on screen.
        state.release()
      }
    }
  })().then(settle, fail)

  return {
    desktop,
    windows: wm,
    catalog,
    apps: actions,
    ready,
    install: (file, opts) => installs.install(file, opts),
    uninstall: (id) => installs.uninstall(id),
    restart,
    installed: installedList,
    onInstalled(fn) {
      installedListeners.add(fn)
      return () => void installedListeners.delete(fn)
    },
    appFile: async (id) => installs.file(id),
    dispose(): void {
      installs.dispose()
      for (const entry of [...apps.values()].reverse()) {
        for (const fn of entry.own.splice(0).reverse()) fn()
      }
      apps.clear()
      if (slotted) for (const menu of slotted.menus) menu.remove()
      slotted = null
      installedListeners.clear()
      for (const fn of teardown.splice(0)) fn()
      wm.dispose()
      void catalog?.dispose()
    },
  }
}
