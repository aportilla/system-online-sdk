/**
 * Verifies the system's fonts (docs/SHELL.md § Fonts), on fixtures and on
 * the reference page (index.html):
 *
 *  - OPENS: a suitcase opens in the first application that says it opens
 *    suitcases, with the suitcase's id: from Startup Items at boot, a
 *    double-click, an alias, the Apple menu and File → Open. An application
 *    that registers the kind itself opens nothing.
 *  - FONTS FOLDER: a System Folder that names Fonts holds it after Startup
 *    Items, in the site's art.
 *  - SUITCASE: a suitcase is listed though no application registers its
 *    kind, wears the site's suitcase art, its alias too, and is renamed in
 *    place.
 *  - INSTALLED: before the boot reads the catalog, every family the site
 *    serves; then those of the suitcases in Fonts the site serves, by name,
 *    each once, which onChange announces.
 *  - CHANGES: onChange fires as a suitcase leaves or joins Fonts, and not for
 *    a placement, a rename, or a second suitcase of a family installed.
 *  - LOAD: a strike registers once, at weight 100 to 900, and resolves its
 *    quoted name, which draws it; a strike the site doesn't serve resolves
 *    null, and one whose file doesn't load resolves null and is tried again.
 *    A shell made again finds it registered.
 *  - SIZE: Empty Trash weighs a suitcase as its family's strikes, and one of
 *    a family the site doesn't serve as nothing.
 *  - KINDS: an application's kind under one of the shell's names is left out,
 *    and the console names the application; its own kinds are kept.
 *  - NO FONTS FOLDER (a fixture): every family the site serves is installed.
 *  - NO APPLICATION (the reference page): opening a suitcase while nothing
 *    opens suitcases raises the Finder's alert; `alertWith` answers it.
 *  - NOTE PAD (the reference page): its Font menu lists the installed
 *    families and follows Fonts, and a pick sets the document in the strike.
 *
 *   npm run dev        # in another shell (port 5174)
 *   npm run verify:fonts
 */
import { fileURLToPath } from 'node:url'
import { check, launch, openShell, report, SHELL_ART, shellFixture, shellOn } from './harness.mjs'

const browser = await launch()

/** The families a fixture's site serves: the reference page's two, one that 404s, one that fails once, one in no suitcase. */
const strike = (size, file, bytes) => ({ size, line: 16, pitch: 16, url: `/demo/fonts/${file}`, bytes, chars: 'Aa' })
const FAMILIES = [
  { name: 'VF Display', strikes: [strike(12, 'VF-Display.woff2', 4608)] },
  { name: 'VF Body', strikes: [{ ...strike(9, 'VF-Body.woff2', 4432), pitch: 12 }] },
  { name: 'Missing', strikes: [strike(10, 'missing.woff2', 1000)] },
  { name: 'Flaky', strikes: [strike(10, 'flaky.woff2', 1000)] },
  { name: 'Extra', strikes: [strike(10, 'extra.woff2', 1000)] },
]
const FIXTURE_ART = { ...SHELL_ART, fonts: '/demo/icons/trash-indicator.png', suitcase: '/demo/icons/app-icon.png' }
const BODY = fileURLToPath(new URL('../demo/fonts/VF-Body.woff2', import.meta.url))

const openIcon = async (s, name) => {
  const at = await s.icon(name)
  await s.page.mouse.dblclick(at.x, at.y)
  await s.settle()
}
const answer = async (s, label) => {
  await s.page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-button'))
  const at = await s.page.evaluate((l) => {
    const b = [...document.querySelectorAll('vf-dialog[open] vf-button')].find((x) => x.textContent === l)
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, label)
  await s.page.mouse.click(at.x, at.y)
  await s.page.waitForFunction(() => !document.querySelector('vf-dialog[open]'))
  await s.settle()
}
/** What the viewer was asked to open since the last read, as seed keys. */
const opened = (page) =>
  page.evaluate(() => {
    const keys = Object.fromEntries(Object.entries(window.ids).map(([k, id]) => [id, k]))
    return window.opened.splice(0).map(({ item, from }) => `${keys[item] ?? item}${from ? '+from' : ''}`)
  })

/**
 * A desktop with the Finder, a System Folder holding Fonts, the families
 * above, and three applications: a viewer that says it opens suitcases, a
 * writer that follows the installed families, and a squatter that registers
 * the shell's kinds as its own. The seed files suitcases in Fonts and on the
 * desktop, and aliases of them in the Apple menu and Startup Items.
 */
const boot = (page) =>
  page.evaluate(
    ([art, families]) => {
      document.body.innerHTML =
        '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
      const desktop = document.querySelector('vf-desktop')
      const { createShell, defineApp, finder, memoryStorage, ALIAS_KIND, APPLE_MENU_ITEMS, FONTS, FONT_KIND, STARTUP_ITEMS } =
        window.vfShell
      const ids = (window.ids = {})
      window.opened = []
      window.changes = []
      window.squatted = false
      const viewer = defineApp({
        id: 'viewer',
        name: 'Viewer',
        opens: [FONT_KIND],
        init(ctx) {
          window.viewerCtx = ctx
          return { open: ({ item, from }) => window.opened.push({ item, from: !!from }) }
        },
      })
      const writer = defineApp({
        id: 'writer',
        name: 'Writer',
        init(ctx) {
          window.fonts = ctx.fonts
          window.atInit = ctx.fonts.installed().map((f) => f.name)
          ctx.fonts.onChange((installed) => window.changes.push(installed.map((f) => f.name)))
        },
      })
      const squatter = defineApp({
        id: 'squatter',
        name: 'Squatter',
        kinds: {
          [FONT_KIND]: { art: '/demo/icons/apple.png', open: () => (window.squatted = true) },
          app: { art: '/demo/icons/apple.png', open: () => (window.squatted = true) },
          'squatter-note': { art: '/demo/icons/doc-icon.png', open: () => {} },
        },
        init() {},
      })
      window.shell = createShell(desktop, {
        apps: [
          finder({
            storage: memoryStorage(),
            system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items', fonts: 'Fonts' },
            art,
            seed: async (catalog) => {
              let at = Date.now()
              const make = async (key, fields) => (ids[key] = (await catalog.create({ ...fields, at: at++ })).id)
              const suitcase = (key, family, parent, name = family) =>
                make(key, { kind: FONT_KIND, name, parent, data: { family } })
              const alias = (key, name, parent, original) =>
                make(key, { kind: ALIAS_KIND, name, parent, data: { original, kind: FONT_KIND } })
              await suitcase('display', 'VF Display', FONTS)
              await suitcase('body', 'VF Body', FONTS)
              await suitcase('bodyCopy', 'VF Body', FONTS, 'VF Body copy')
              await suitcase('unserved', 'Unserved', FONTS)
              await suitcase('missing', 'Missing', FONTS)
              await suitcase('flaky', 'Flaky', FONTS)
              await suitcase('loose', 'VF Body', null, 'Loose Body')
              await alias('looseAlias', 'Loose Body alias', null, ids.loose)
              await alias('menuAlias', 'Display Sample', APPLE_MENU_ITEMS, ids.display)
              await alias('startupAlias', 'Startup Display', STARTUP_ITEMS, ids.display)
            },
          }),
          viewer,
          writer,
          squatter,
        ],
        fonts: families,
        fit: 'viewport',
      })
      return window.shell.ready
    },
    [FIXTURE_ART, FAMILIES]
  )

// ── OPENS, FONTS FOLDER, SUITCASE, INSTALLED, CHANGES, KINDS ────────────────
{
  const page = await shellFixture(browser)
  const warnings = []
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
  await boot(page)
  const s = shellOn(page)
  await s.settle()

  check('OPENS  at boot, a suitcase’s alias in Startup Items opens it in the viewer', (await opened(page)).join() === 'display')
  await openIcon(s, 'Loose Body')
  await openIcon(s, 'Loose Body alias')
  await s.pick('Apple', 'Display Sample')
  await s.settle()
  check(
    'OPENS  a double-click opens a suitcase in the viewer out of its icon, an alias its original, the Apple menu its entry’s',
    (await opened(page)).join() === 'loose+from,loose+from,display',
    JSON.stringify(await page.evaluate(() => window.opened))
  )

  await openIcon(s, 'System Folder')
  const system = await page.evaluate(() => {
    const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'System Folder')
    return [...win.querySelectorAll(':scope > vf-icon-field > vf-icon')].map((i) => `${i.label}:${i.querySelector('img').getAttribute('src')}`)
  })
  check(
    'FONTS FOLDER  the System Folder holds Fonts after Startup Items, in the site’s art',
    system.join() ===
      'Apple Menu Items:/demo/icons/folder.png,Startup Items:/demo/icons/folder.png,Fonts:/demo/icons/trash-indicator.png',
    system.join()
  )
  await openIcon(s, 'Fonts')
  await page.evaluate(() => window.shell.apps.finder.select([window.ids.body]))
  await s.pick('File', 'open')
  await s.settle()
  check('OPENS  File → Open opens the selected suitcase', (await opened(page)).join() === 'body+from')
  check('OPENS  …and the squatter’s own kind opens nothing', (await page.evaluate(() => window.squatted)) === false)

  const icons = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('vf-icon[data-id]')]
        .filter((i) => ['VF Body', 'Unserved', 'Loose Body', 'Loose Body alias'].includes(i.label))
        .map((i) => [i.label, { art: i.querySelector('img').getAttribute('src'), alias: i.alias, editable: i.editable }])
    )
  )
  const suitcaseArt = FIXTURE_ART.suitcase
  check(
    'SUITCASE  listed though no application registers the kind, in the site’s suitcase art, its alias too, renamed in place',
    ['VF Body', 'Unserved', 'Loose Body'].every((n) => icons[n]?.art === suitcaseArt && !icons[n].alias && icons[n].editable) &&
      icons['Loose Body alias']?.art === suitcaseArt &&
      icons['Loose Body alias'].alias,
    JSON.stringify(icons)
  )

  const installed = () => page.evaluate(() => window.fonts.installed().map((f) => f.name).join())
  /** The announcements since the first `since`, each the installed families' names. */
  const changes = (since = 0) => page.evaluate((n) => window.changes.slice(n).map((c) => `[${c}]`).join(' '), since)
  check(
    'INSTALLED  before the boot reads the catalog, every family the site serves',
    (await page.evaluate(() => window.atInit.join())) === 'Extra,Flaky,Missing,VF Body,VF Display',
    await page.evaluate(() => window.atInit.join())
  )
  // A fresh storage: the seed fills Fonts a suitcase at a time, and each new family is announced.
  const seeded = await page.evaluate(() => window.changes.length)
  check(
    'INSTALLED  then the suitcases’ in Fonts the site serves, by name, each once, as onChange last announced',
    (await installed()) === 'Flaky,Missing,VF Body,VF Display' && (await changes(seeded - 1)) === '[Flaky,Missing,VF Body,VF Display]',
    `${await installed()}; ${await changes()}`
  )

  // A placement, a rename and a second suitcase of an installed family change nothing installed.
  await page.evaluate(async () => {
    const c = window.shell.catalog
    c.place(new Map([[window.ids.body, { left: 240, top: 160 }]]))
    await c.rename(window.ids.bodyCopy, 'Second Body')
    await c.move([window.ids.loose], 'fonts')
  })
  await s.settle()
  const quiet = await changes(seeded)
  await page.evaluate(() => window.shell.catalog.move([window.ids.display], null))
  await page.evaluate(() => window.shell.catalog.move([window.ids.display], 'fonts'))
  const moved = await changes(seeded)
  check('CHANGES  no change for a placement, a rename, or a second suitcase of an installed family', quiet === '', quiet)
  check(
    'CHANGES  a suitcase leaving Fonts uninstalls its family, and one joining installs it, each announced once',
    moved === '[Flaky,Missing,VF Body] [Flaky,Missing,VF Body,VF Display]',
    moved
  )

  // ── SIZE ──
  await page.evaluate(() => window.shell.catalog.move([window.ids.bodyCopy, window.ids.unserved], 'trash'))
  const bytes = await page.evaluate(() => window.shell.catalog.trashSize())
  check('SIZE  Empty Trash weighs a suitcase as its family’s strikes, and an unserved family’s as nothing', bytes === 4432, `${bytes}`)

  // ── KINDS ──
  const kinds = await page.evaluate(() => {
    const ctx = window.viewerCtx
    return {
      font: ctx.kind('font')?.art,
      app: typeof ctx.kind('app')?.art,
      own: ctx.kind('squatter-note')?.art,
      opener: ctx.opener('font')?.id,
      other: ctx.opener('squatter-note') ?? null,
      order: [...ctx.kinds.keys()].join(),
    }
  })
  const said = warnings.filter((w) => w.startsWith('system-online-sdk (squatter)'))
  check(
    'KINDS  the shell’s app and font kinds stand, and the console names the squatter for each',
    kinds.font === '' &&
      kinds.app === 'function' &&
      said.length === 2 &&
      said.some((w) => w.includes("the font kind is the shell's own") && w.includes("opens: ['font']")) &&
      said.some((w) => w.includes("the app kind is the shell's own")),
    JSON.stringify(said)
  )
  check(
    'KINDS  …its own kind is kept, after the shell’s three; opener() names the viewer for font alone',
    kinds.own === '/demo/icons/doc-icon.png' && kinds.order === 'app,alias,font,squatter-note' && kinds.opener === 'viewer' && kinds.other === null,
    JSON.stringify(kinds)
  )

  // ── LOAD ──
  let attempts = 0
  await page.route('**/demo/fonts/flaky.woff2', (route) => (++attempts === 1 ? route.abort() : route.fulfill({ path: BODY })))
  const load = await page.evaluate(async () => {
    const faces = (family) => [...document.fonts].filter((f) => f.family === family || f.family === `"${family}"`)
    const first = await window.fonts.load('VF Body', 9)
    const again = await window.fonts.load('VF Body', 9)
    const [face] = faces('VF Body 9')
    const p = document.createElement('vf-paragraph')
    p.textContent = 'Hamburgefonstiv'
    p.style.setProperty('--vf-font-family', first)
    p.style.setProperty('--vf-font-size', '16px')
    document.querySelector('vf-desktop').append(p)
    await p.updateComplete
    const drawn = getComputedStyle(p.shadowRoot.querySelector('p') ?? p).fontFamily
    p.remove()
    return {
      first,
      again,
      count: faces('VF Body 9').length,
      weight: face?.weight,
      status: face?.status,
      drawn,
      ready: document.fonts.check(`16px ${first}`),
      noStrike: await window.fonts.load('VF Body', 12),
      unserved: await window.fonts.load('Unserved', 9),
      missing: await window.fonts.load('Missing', 10),
      flaky: [await window.fonts.load('Flaky', 10), await window.fonts.load('Flaky', 10)],
      family: window.fonts.family('Extra')?.name ?? null,
      noFamily: window.fonts.family('Unserved'),
    }
  })
  check(
    'LOAD  a strike registers once, at weight 100 to 900, and resolves its quoted name',
    load.first === '"VF Body 9"' && load.again === load.first && load.count === 1 && load.weight === '100 900' && load.status === 'loaded',
    JSON.stringify(load)
  )
  check('LOAD  …which draws it', load.ready && load.drawn === '"VF Body 9"', `${load.ready} ${load.drawn}`)
  check(
    'LOAD  a strike the site doesn’t serve, or whose file doesn’t load, resolves null',
    load.noStrike === null && load.unserved === null && load.missing === null,
    JSON.stringify(load)
  )
  check(
    'LOAD  …and a failure is forgotten: the next call fetches it again',
    load.flaky[0] === null && load.flaky[1] === '"Flaky 10"' && attempts === 2,
    `${JSON.stringify(load.flaky)} after ${attempts} requests`
  )
  check('LOAD  family() gives any family the site serves, installed or not', load.family === 'Extra' && load.noFamily === null)

  // A shell made again, as after a hot reload, finds the strike registered.
  await page.evaluate(() => window.shell.dispose())
  await boot(page)
  const reloaded = await page.evaluate(async () => {
    const family = await window.fonts.load('VF Body', 9)
    return { family, count: [...document.fonts].filter((f) => f.family === '"VF Body 9"' || f.family === 'VF Body 9').length }
  })
  check('LOAD  a shell made again finds the strike registered', reloaded.family === '"VF Body 9"' && reloaded.count === 1, JSON.stringify(reloaded))
  await page.close()
}

// ── NO FONTS FOLDER ─────────────────────────────────────────────────────────
{
  const page = await shellFixture(browser)
  const names = await page.evaluate(
    async ([art, families]) => {
      document.body.innerHTML =
        '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
      const { createShell, defineApp, finder, memoryStorage, FONT_KIND } = window.vfShell
      let fonts = null
      window.shell = createShell(document.querySelector('vf-desktop'), {
        apps: [
          finder({
            storage: memoryStorage(),
            system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items' },
            art,
            seed: (catalog) => catalog.create({ kind: FONT_KIND, name: 'VF Body', data: { family: 'VF Body' } }),
          }),
          defineApp({ id: 'writer', name: 'Writer', init: (ctx) => void (fonts = ctx.fonts) }),
        ],
        fonts: families,
      })
      await window.shell.ready
      return { installed: fonts.installed().map((f) => f.name).join(), fonts: !!window.shell.catalog.item('fonts') }
    },
    [SHELL_ART, FAMILIES]
  )
  check(
    'NO FONTS FOLDER  a site that names none has every family it serves installed',
    names.installed === 'Extra,Flaky,Missing,VF Body,VF Display' && !names.fonts,
    JSON.stringify(names)
  )
  await page.close()
}

// ── NO APPLICATION, NOTE PAD (the reference page) ──────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await openIcon(s, 'System Folder')
  await openIcon(s, 'Fonts')
  await openIcon(s, 'VF Body')
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-paragraph'))
  const said = await page.evaluate(() => document.querySelector('vf-dialog[open] vf-paragraph').textContent)
  const asking = await page.evaluate(() => window.shell.windows.asking)
  await answer(s, 'OK')
  check(
    'NO APPLICATION  opening a suitcase nothing opens raises the Finder’s alert',
    said === 'The document “VF Body” could not be opened, because the application that opens it could not be found.' &&
      asking === 'finder',
    `${asking}: ${said}`
  )
  await page.evaluate(() => {
    window.__noApplication = []
    window.shell.apps.finder.alertWith('no-application', (details) => {
      window.__noApplication.push(details.item.name)
      return null
    })
  })
  await openIcon(s, 'VF Display')
  const answered = await page.evaluate(() => ({ asked: window.__noApplication, shown: !!document.querySelector('vf-dialog[open]') }))
  check(
    'NO APPLICATION  …which the site answers through alertWith, with the suitcase',
    answered.asked.join() === 'VF Display' && !answered.shown,
    JSON.stringify(answered)
  )

  /** Note Pad's Font menu, while it is on the bar: each item's name, and whether it is checked. */
  const fontMenu = () =>
    page.evaluate(() => {
      const menu = [...document.querySelectorAll('vf-menu-bar > vf-menu')].find((m) => m.label === 'Font')
      return menu ? [...menu.querySelectorAll('vf-menu-item')].map((i) => `${i.textContent}${i.checked ? '✓' : ''}`).join() : null
    })
  await s.pick('Apple', 'Note Pad')
  await page.waitForFunction(() => window.shell.windows.front === 'note-pad')
  await s.settle()
  const bar = await s.bar()
  const listed = await fontMenu()
  check(
    'NOTE PAD  its Font menu lists the installed families, by name',
    bar.menus.join() === 'File,Font,Window' && listed === 'VF Body,VF Display',
    `${bar.menus.join()}: ${listed}`
  )
  await s.pick('Font', 'VF Body')
  await page.waitForFunction(() =>
    document.querySelector('vf-window vf-text-area')?.style.getPropertyValue('--vf-font-family-display') === '"VF Body 9"'
  )
  await page.keyboard.press('Shift') // a key syncs the gates, the checkmark with them
  const set = await page.evaluate(() => {
    const area = document.querySelector('vf-window vf-text-area')
    return {
      size: area.style.getPropertyValue('--vf-font-size-display'),
      pitch: area.style.getPropertyValue('--vf-line-height-display'),
      ready: document.fonts.check('16px "VF Body 9"'),
    }
  })
  const checked = await fontMenu()
  check(
    'NOTE PAD  a pick sets the document in the family’s strike, checked in the menu',
    set.size === '16px' && set.pitch === '12px' && set.ready && checked === 'VF Body✓,VF Display',
    `${JSON.stringify(set)} ${checked}`
  )
  await page.evaluate(async () => {
    const c = window.shell.catalog
    await c.move([c.get().items.find((i) => i.name === 'VF Display').id], null)
  })
  await s.settle()
  check('NOTE PAD  …and the menu follows Fonts: a suitcase dragged out leaves it', (await fontMenu()) === 'VF Body✓', await fontMenu())
  await page.close()
}

await report(browser)
