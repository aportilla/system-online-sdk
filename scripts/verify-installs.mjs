/**
 * Verifies installing app files at runtime (docs/SHELL.md § Installing
 * applications), on the reference page (index.html) and on fixtures. The app
 * files are made here, with the SDK's own packer and signer, compiled for
 * Node by the npm script.
 *
 *  - DROP: a dropped app file installs where it was let go, in its
 *    manifest's art, and opens; its code reaches the page's own modules.
 *  - RELOAD: a reload loads it before the session reopens its window.
 *  - SKIP: one whose init throws is skipped and the rest boot; its icon says
 *    why; its open window stays marked open through a write, and reopens
 *    when a file that runs is installed for it.
 *  - EMPTY TRASH: emptying the Trash with its icon in it uninstalls it, its
 *    open window closing; the alert weighs its file.
 *  - UNINSTALL: uninstall() takes every icon of it, one on the desktop and
 *    one in the Trash, and closes its window; an alias of it stays.
 *  - DOCUMENTS: its documents stay, drawn plain, say so when opened, and
 *    take their icon back when it's installed again.
 *  - UPDATE: a file whose application is installed answers present, the drop
 *    asks before it replaces, and replacing keeps the icon and its place.
 *  - REFUSED: a built-in's id, a kind another application has, an icon of
 *    an application that isn't here, and a PNG that isn't an app file.
 *  - COPY: Copy puts the file on the clipboard, and Paste on another desktop
 *    installs it, byte for byte.
 *  - TRUST (fixtures): a held key installs without asking, an unsigned file
 *    or another key's is asked about, a changed byte is refused, `refuse`
 *    refuses and no trust installs; every boot checks again.
 *  - CONTEXT (a fixture): ctx.index, ctx.ready and onInstalled.
 *  - ISOLATION, DUPLICATES (fixtures): an init that throws and a reopen that
 *    rejects take down one application alone; two of one id, or one kind
 *    two register, are refused.
 *  - BUNDLED (a fixture): in a site's production build, which inlines the
 *    kit and the SDK into its own chunks, an installed application's code
 *    still reaches the page's own copies.
 *
 *   npm run dev        # in another shell (port 5174)
 *   npm run verify:installs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { check, launch, openShell, ORIGIN, report, SHELL_ART, shellFixture, shellOn } from './harness.mjs'

const BUILT = new URL('./.tmp/installs/', import.meta.url)
const { generateSigningKeys, packApp, signAppFile } = await import(new URL('build/index.js', BUILT).href)
const { concat, encodePng, pngChunk } = await import(new URL('build/png.js', BUILT).href)
const { PNG_SIGNATURE, deflate, itxtKeyword, pngChunks } = await import(new URL('app-file.js', BUILT).href)

const browser = await launch()

/* ── The app files ──────────────────────────────────────────────────────── */

/**
 * An application's code as appFile() builds it: static imports of the three
 * entries at its head, then its factory. It registers `<id>-doc`, opens a
 * window of its own and one for each of its documents, puts its context and
 * what it imported on `window.probes`, and throws in its init while
 * localStorage holds `explode:<id>`.
 */
const appCode = ({ id, name, kind = `${id}-doc` }) => `
import { defineApp } from "system-online-sdk";
import { VfWindow } from "vintage-frames";
import { APP_KIND } from "system-online-sdk/pure";
const ID = ${JSON.stringify(id)};
const NAME = ${JSON.stringify(name)};
export default function factory() {
  let open = () => {};
  return defineApp({
    id: ID,
    name: NAME,
    kinds: { ${JSON.stringify(kind)}: { art: "/demo/icons/app-icon.png", open: (item, from) => open(item.id, item.name, from) } },
    init(ctx) {
      if (localStorage.getItem("explode:" + ID)) throw new Error(NAME + " won't start");
      const probes = (window.probes ??= {});
      probes[ID] = { ctx, VfWindow, defineApp, APP_KIND, disposed: false };
      open = (item, heading, from) =>
        ctx.windows.open({
          app: ID,
          item,
          from,
          create: () => Object.assign(document.createElement("vf-window"), { heading, width: 220, height: 120, closable: true, movable: true }),
        });
      ctx.onDispose(() => (probes[ID].disposed = true));
      return {
        open({ item, from = null } = {}) {
          const doc = item != null && item !== ID ? ctx.catalog?.item(item) : null;
          if (doc) open(doc.id, doc.name, from);
          else if (item == null || item === ID) open(ID, NAME, from);
        },
      };
    },
  });
}
`

const ICON = await encodePng({
  width: 32,
  height: 32,
  data: Uint8Array.from({ length: 32 * 32 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i >> 6) % 2 ? 0 : 255)),
})

/** An app file of the application above. */
const pack = ({ id = 'probe', name = 'Probe', version = '1.0.0', kind } = {}) =>
  packApp({
    manifest: { id, name, version, requires: '^0.2.0', author: 'Tester', description: `${name}, for the tests.` },
    icon: ICON,
    code: appCode({ id, name, kind }),
  })

const encoder = new TextEncoder()
/** `file` with its code swapped for `code`, every other byte as it was: a forger's file, a whole PNG. */
async function withCode(file, code) {
  const chunks = pngChunks(file)
  const head = encoder.encode('system-online.code')
  const swapped = pngChunk('iTXt', concat([head, Uint8Array.of(0, 1, 0, 0, 0), await deflate(encoder.encode(code))]))
  return concat([
    PNG_SIGNATURE,
    ...chunks.map((c) => (c.type === 'iTXt' && itxtKeyword(c.data) === 'system-online.code' ? swapped : file.subarray(c.start, c.end))),
  ])
}

const base64 = (bytes) => Buffer.from(bytes).toString('base64')
const KEYS = await generateSigningKeys()
const OTHER = await generateSigningKeys()

const PROBE = await pack()
const PROBE_NEXT = await pack({ version: '1.1.0' })
const PROBE_LAST = await pack({ version: '1.2.0' })
const SIGNED = await signAppFile(PROBE, KEYS.privateKey)
const FORGED = await withCode(SIGNED, appCode({ id: 'probe', name: 'Probe' }).replace('won\'t start', 'will not start'))
const STRANGER = await signAppFile(await pack({ id: 'stranger', name: 'Stranger' }), OTHER.privateKey)
const LOOSE = await pack({ id: 'loose', name: 'Loose' })
const SQUATTER = await pack({ id: 'squatter', name: 'Squatter', kind: 'note' })
const IMPOSTOR = await pack({ id: 'note-pad', name: 'Note Pad' })
const PICTURE = new Uint8Array(readFileSync(new URL('../demo/icons/folder.png', import.meta.url)))

/* ── In the page ────────────────────────────────────────────────────────── */

/** Install bytes through the shell, and resolve the answer: its status, why, and the app's version. */
const install = (page, bytes, options = {}) =>
  page.evaluate(
    async ([b64, opts]) => {
      const answer = await window.shell.install(
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
        opts
      )
      return {
        status: answer.status,
        why: answer.why ?? null,
        reason: answer.reason ?? null,
        version: answer.app?.manifest?.version ?? null,
        previous: answer.previous ?? null,
        loaded: answer.app?.loaded ?? null,
        pending: answer.app?.pending ?? null,
        standing: answer.app?.standing ?? answer.standing ?? null,
        key: answer.app?.key ?? null,
      }
    },
    [base64(bytes), options]
  )

/** Drop bytes on the page as a file from outside it, at `at`, viewport CSS px. */
const drop = (page, bytes, name, at) =>
  page.evaluate(
    ([b64, n, p]) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], n, { type: 'image/png' }))
      const target = document.elementFromPoint(p.x, p.y)
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, composed: true, dataTransfer }))
      }
    },
    [base64(bytes), name, at]
  )

/** One application of what's installed, or null. */
const entry = (page, id) =>
  page.evaluate((i) => {
    const a = window.shell.installed().find((x) => x.id === i)
    return a ? { ...a, manifest: a.manifest && { version: a.manifest.version, name: a.manifest.name } } : null
  }, id)
/** Every icon of an application, wherever it is: its item's parent and place. */
const iconsOf = (page, id) =>
  page.evaluate(
    (i) => window.shell.catalog.get().items.filter((x) => x.kind === 'app' && x.data?.app === i).map((x) => ({ id: x.id, parent: x.parent, left: x.left, top: x.top })),
    id
  )
const openIcon = async (s, name) => {
  const at = await s.icon(name)
  await s.page.mouse.dblclick(at.x, at.y)
  await s.settle()
}
const dialogText = (page) =>
  page.waitForFunction(() => document.querySelector('vf-dialog[open] vf-paragraph')?.textContent || null).then((h) => h.jsonValue())
const answer = async (page, label) => {
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-button'))
  const at = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('vf-dialog[open] vf-button')].find((x) => x.textContent === l)
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, label)
  await page.mouse.click(at.x, at.y)
  await page.waitForFunction(() => !document.querySelector('vf-dialog[open]'))
}
const dialogOpen = (page) => page.evaluate(() => !!document.querySelector('vf-dialog[open]'))
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 10_000 }).then(() => true, () => false)

// ── DROP, RELOAD, SKIP ──────────────────────────────────────────────────────
{
  const page = await openShell(browser, { query: '?save=1' })
  const s = shellOn(page)
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const scr = await s.screen()
  await drop(page, PROBE, 'Probe.png', { x: 520, y: 360 })
  const installed = await until(page, () => window.shell.installed().some((a) => a.id === 'probe' && a.loaded))
  await s.settle()
  const icon = await s.iconState('Probe')
  const [item] = await iconsOf(page, 'probe')
  // Its art centred on the pointer: the icon's 64-wide cell, its 32 px art at its top.
  check(
    'DROP  a dropped app file installs, its icon where it was let go, in its manifest’s art',
    installed && item?.parent === null && item.left === 520 - scr.x - 32 && item.top === 360 - scr.y - 16 && icon?.art?.startsWith('data:image/png'),
    JSON.stringify({ item, icon, scr })
  )
  await openIcon(s, 'Probe')
  const opened = await s.window('Probe')
  const reach = await page.evaluate(async () => {
    const vf = await import('/demo/kit.ts')
    const sdk = await import('/src/index.ts')
    const probe = window.probes.probe
    const win = [...document.querySelectorAll('vf-window')].find((w) => w.heading === 'Probe')
    return {
      window: probe.VfWindow === vf.VfWindow && win instanceof probe.VfWindow,
      sdk: probe.defineApp === sdk.defineApp,
      pure: probe.APP_KIND === 'app',
      front: window.shell.windows.front,
      bar: document.querySelector('vf-menu-bar').label,
    }
  })
  check('DROP  …and opens: its window, its name on the bar', !!opened && reach.front === 'probe' && reach.bar === 'Probe', JSON.stringify(reach))
  check('DROP  its code reaches the page’s own modules: VfWindow, defineApp, the pure entry', reach.window && reach.sdk && reach.pure, JSON.stringify(reach))

  await page.reload()
  const boxAtBoot = await page.evaluate(async () => {
    await window.shell.ready
    const win = [...document.querySelectorAll('vf-window')].find((w) => w.heading === 'Probe')
    return win ? { left: win.left, top: win.top } : null
  })
  check(
    'RELOAD  a reload loads it before the session reopens its window',
    !!boxAtBoot && boxAtBoot.left === opened.left && boxAtBoot.top === opened.top && (await entry(page, 'probe'))?.loaded === true,
    JSON.stringify({ boxAtBoot, opened })
  )

  await page.evaluate(() => localStorage.setItem('explode:probe', '1'))
  errors.length = 0
  await page.reload()
  await page.evaluate(() => window.shell.ready)
  await s.settle()
  const skipped = await entry(page, 'probe')
  check(
    'SKIP  one whose init throws is skipped, saying why; the console names it',
    skipped?.loaded === false && skipped.why === 'code' && /won't start/.test(skipped.reason) &&
      errors.some((e) => e.includes('system-online-sdk (probe)') && e.includes("won't start")),
    JSON.stringify({ skipped, errors })
  )
  await s.pick('Apple', 'Note Pad')
  await s.settle()
  check('SKIP  …and the rest boot: Note Pad opens from the Apple menu', (await s.front()) === 'note-pad' && !(await s.window('Probe')))
  await page.keyboard.press('Control+w')
  await s.settle()
  // A write since the boot: a folder window opened and closed.
  await openIcon(s, 'Documents')
  await page.keyboard.press('Control+w')
  await s.settle()
  const marked = await until(page, () => {
    const saved = JSON.parse(localStorage.getItem('system-online-sdk-reference') ?? 'null')
    return Number.isInteger(saved?.windows?.probe?.z) && saved.windows.Documents === undefined && Object.values(saved.windows).some((w) => w.app === 'finder' && w.z === undefined)
  })
  check('SKIP  its open window stays marked open through a write', marked)
  await openIcon(s, 'Probe')
  const said = await dialogText(page)
  await answer(page, 'OK')
  check(
    'SKIP  opening its icon says why it didn’t load',
    said === 'The application “Probe” could not be opened, because its code failed: Probe won\'t start.',
    said
  )
  await page.evaluate(() => localStorage.removeItem('explode:probe'))
  const updated = await install(page, PROBE_NEXT, { replace: true })
  await s.settle()
  const back = await s.window('Probe')
  check(
    'SKIP  a file that runs, installed for it, loads at once and reopens its window where it was',
    updated.status === 'updated' && updated.previous === '1.0.0' && updated.loaded && !updated.pending && back?.left === opened.left && back?.top === opened.top,
    JSON.stringify({ updated, back, opened })
  )
  await page.close()
}

// ── EMPTY TRASH, UNINSTALL ──────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await install(page, PROBE)
  await page.evaluate(() => window.shell.apps.probe.open({}))
  await s.settle()
  const [icon] = await iconsOf(page, 'probe')
  await page.evaluate((id) => window.shell.catalog.move([id], 'trash'), icon.id)
  // The Finder forward, its Special menu on the bar.
  await page.mouse.click(400, 600)
  await s.settle()
  await s.pick('Special', 'empty-trash')
  const asked = await dialogText(page)
  await answer(page, 'OK')
  const gone = await until(page, () => !window.shell.installed().some((a) => a.id === 'probe'))
  await s.settle()
  check(
    'EMPTY TRASH  the alert weighs its file',
    asked === `The Trash contains 1 item, which uses ${Math.ceil(PROBE.length / 1024)}K of disk space. Are you sure you want to permanently remove it?`,
    asked
  )
  check(
    'EMPTY TRASH  emptying the Trash with its last icon in it uninstalls it, its open window closing',
    gone && !(await s.window('Probe')) && (await page.evaluate(() => window.shell.appFile('probe'))) === null && (await iconsOf(page, 'probe')).length === 0 &&
      (await page.evaluate(() => window.probes.probe.disposed)),
    JSON.stringify(await entry(page, 'probe'))
  )

  await install(page, PROBE)
  await page.evaluate(async () => {
    const c = window.shell.catalog
    const original = c.get().items.find((i) => i.kind === 'app' && i.data?.app === 'probe')
    const [copy] = await c.copy([original.id], null)
    await c.move([copy.id], 'trash')
    await c.create({ kind: 'alias', name: 'Probe alias', data: { original: original.id, kind: 'app' } })
    window.shell.apps.probe.open({})
  })
  await s.settle()
  const before = await iconsOf(page, 'probe')
  const result = await page.evaluate(async () => (await window.shell.uninstall('probe')).status)
  await s.settle()
  check(
    'UNINSTALL  uninstall() takes every icon of it, one on the desktop and one in the Trash, and closes its window',
    before.length === 2 && before.some((i) => i.parent === 'trash') && result === 'uninstalled' && (await iconsOf(page, 'probe')).length === 0 && !(await s.window('Probe')),
    JSON.stringify({ before, result })
  )
  await openIcon(s, 'Probe alias')
  const missing = await dialogText(page)
  await answer(page, 'OK')
  check(
    'UNINSTALL  …and an alias of it stays, as an alias whose original is gone',
    missing === 'The alias “Probe alias” could not be opened, because the original item could not be found.',
    missing
  )
  const refusals = await page.evaluate(async () => [
    await window.shell.uninstall('probe'),
    await window.shell.uninstall('note-pad'),
  ])
  check(
    'UNINSTALL  …refused once it’s gone, and for an application built in',
    refusals[0].status === 'refused' && refusals[0].why === 'not-installed' && refusals[1].why === 'built-in',
    JSON.stringify(refusals)
  )
  await page.close()
}

// ── DOCUMENTS, UPDATE ───────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await install(page, PROBE)
  await page.evaluate(() => window.shell.catalog.create({ kind: 'probe-doc', name: 'Probe Notes', left: 400, top: 200 }))
  await s.settle()
  const drawn = (await s.iconState('Probe Notes'))?.art
  await page.evaluate(() => window.shell.uninstall('probe'))
  await s.settle()
  const plain = await s.iconState('Probe Notes')
  check(
    'DOCUMENTS  its documents stay where they were, drawn plain',
    drawn === '/demo/icons/app-icon.png' && plain?.art === '/demo/icons/doc-icon.png' && plain.left === 400 && plain.top === 200,
    JSON.stringify({ drawn, plain })
  )
  await openIcon(s, 'Probe Notes')
  const said = await dialogText(page)
  await answer(page, 'OK')
  check(
    'DOCUMENTS  …and say so when opened',
    said === 'The document “Probe Notes” could not be opened, because the application that opens it could not be found.',
    said
  )
  await install(page, PROBE)
  await s.settle()
  const again = (await s.iconState('Probe Notes'))?.art
  await openIcon(s, 'Probe Notes')
  check(
    'DOCUMENTS  …and take their icon back when it’s installed again, and open',
    again === '/demo/icons/app-icon.png' && !!(await s.window('Probe Notes')),
    again
  )
  await page.keyboard.press('Control+w')
  await s.settle()

  // UPDATE: the icon moved first, so its place is the visitor's.
  const [icon] = await iconsOf(page, 'probe')
  await page.evaluate((id) => window.shell.catalog.place(new Map([[id, { left: 300, top: 300 }]])), icon.id)
  await s.settle()
  const present = await install(page, PROBE_NEXT)
  check(
    'UPDATE  a file whose application is installed answers present, at the installed version, and changes nothing',
    present.status === 'present' && present.version === '1.0.0' && (await entry(page, 'probe')).manifest.version === '1.0.0',
    JSON.stringify(present)
  )
  await drop(page, PROBE_NEXT, 'Probe.png', { x: 700, y: 500 })
  const question = await dialogText(page)
  await answer(page, 'Cancel')
  check(
    'UPDATE  a drop asks before it replaces, and Cancel keeps what’s there',
    question === '“Probe” 1.0.0 is already on this desktop. Do you want to replace it with version 1.1.0?' &&
      (await entry(page, 'probe')).manifest.version === '1.0.0' && (await iconsOf(page, 'probe')).length === 1,
    question
  )
  const replaced = await install(page, PROBE_NEXT, { replace: true })
  const kept = await iconsOf(page, 'probe')
  const file = await page.evaluate(async () => [...new Uint8Array(await (await window.shell.appFile('probe')).arrayBuffer())])
  check(
    'UPDATE  with the say-so it replaces the file and keeps the icon and its place; the loaded code runs on, the new from the next load',
    replaced.status === 'updated' && replaced.previous === '1.0.0' && replaced.version === '1.1.0' && replaced.pending && replaced.loaded &&
      kept.length === 1 && kept[0].left === 300 && kept[0].top === 300 && Buffer.from(file).equals(Buffer.from(PROBE_NEXT)),
    JSON.stringify({ replaced, kept })
  )
  await drop(page, PROBE_LAST, 'Probe.png', { x: 700, y: 500 })
  await dialogText(page)
  await answer(page, 'Replace')
  check(
    'UPDATE  …and the drop’s Replace replaces',
    await until(page, () => window.shell.installed().find((a) => a.id === 'probe')?.manifest?.version === '1.2.0'),
    JSON.stringify(await entry(page, 'probe'))
  )

  // REFUSED
  const refusals = await Promise.all([install(page, IMPOSTOR), install(page, SQUATTER)])
  check(
    'REFUSED  a built-in’s id, and a kind another application registers, naming it',
    refusals[0].why === 'built-in' && refusals[1].why === 'kind' && refusals[1].reason === 'it registers the kind note, which Note Pad registers',
    JSON.stringify(refusals)
  )
  await page.evaluate(() => window.shell.catalog.create({ kind: 'app', name: 'Ghost', data: { app: 'ghost' } }))
  await s.settle()
  await openIcon(s, 'Ghost')
  const ghost = await dialogText(page)
  await answer(page, 'OK')
  check(
    'REFUSED  an icon of an application neither built in nor installed says so when opened',
    ghost === 'The application “Ghost” could not be opened, because it isn’t installed on this desktop.',
    ghost
  )
  const items = (await page.evaluate(() => window.shell.catalog.get().items.length))
  await drop(page, PICTURE, 'folder.png', { x: 600, y: 400 })
  await s.settle()
  check(
    'REFUSED  a PNG that isn’t an app file isn’t claimed: nothing is made, and nothing asks',
    (await page.evaluate(() => window.shell.catalog.get().items.length)) === items && !(await dialogOpen(page))
  )
  await drop(page, FORGED, 'Probe.png', { x: 600, y: 400 })
  const forged = await dialogText(page)
  await answer(page, 'OK')
  check(
    'REFUSED  a dropped file the shell refuses says why',
    forged === '“Probe.png” could not be installed, because it was changed after it was signed.',
    forged
  )
  await page.close()
}

// ── COPY ────────────────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(ORIGIN).origin })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ORIGIN)
  await page.evaluate(() => window.shell.ready)
  const s = shellOn(page)
  await install(page, SIGNED)
  await s.settle()
  const icon = await s.icon('Probe')
  await page.mouse.click(icon.x, icon.y)
  await page.keyboard.press('Meta+c')
  await page.waitForTimeout(200)
  const other = await context.newPage()
  await other.route(ORIGIN, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:#000">' }))
  await other.goto(ORIGIN)
  await other.unroute(ORIGIN)
  await other.evaluate(async (art) => {
    window.vfShell = await import('/src/index.ts')
    document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
    const { createShell, finder, memoryStorage } = window.vfShell
    window.shell = createShell(document.querySelector('vf-desktop'), { apps: [finder({ storage: memoryStorage(), art })], fit: 'viewport' })
    await window.shell.ready
  }, SHELL_ART)
  await other.bringToFront()
  await other.mouse.click(500, 400)
  await other.keyboard.press('Meta+v')
  const arrived = await until(other, () => window.shell.installed().some((a) => a.id === 'probe' && a.loaded))
  const bytes = arrived ? await other.evaluate(async () => [...new Uint8Array(await (await window.shell.appFile('probe')).arrayBuffer())]) : []
  check(
    'COPY  Copy puts the file on the clipboard, and Paste on another desktop installs it, byte for byte',
    arrived && Buffer.from(bytes).equals(Buffer.from(SIGNED)) && (await entry(other, 'probe')).standing === 'untrusted',
    `${arrived} ${bytes.length}/${SIGNED.length}`
  )
  await context.close()
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

/**
 * A desktop with the Finder over a memory storage kept on the page, so a
 * shell made again finds what the last one installed, and Watcher, which
 * follows what's installed. `keep` reuses the last storage.
 */
const boot = (page, { trust = null, index = null, keep = false } = {}) =>
  page.evaluate(
    async ({ art, trust, index, keep }) => {
      window.shell?.dispose()
      document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
      const { createShell, defineApp, finder, memoryStorage } = window.vfShell
      if (!keep || !window.storage) window.storage = memoryStorage()
      window.heard = []
      const watcher = defineApp({
        id: 'watcher',
        name: 'Watcher',
        init(ctx) {
          window.watcher = ctx
          ctx.onInstalled((apps) => window.heard.push(apps.map((a) => `${a.id}${a.loaded ? '' : '!'}`).join()))
        },
      })
      window.shell = createShell(document.querySelector('vf-desktop'), {
        apps: [finder({ storage: window.storage, art }), watcher],
        trust,
        index,
        fit: 'viewport',
      })
      await window.shell.ready
    },
    { art: SHELL_ART, trust, index, keep }
  )

// ── TRUST ───────────────────────────────────────────────────────────────────
{
  const page = await shellFixture(browser)
  await boot(page, { trust: { keys: [KEYS.publicKey] } })
  const held = await install(page, SIGNED)
  check(
    'TRUST  a file signed by a key the site holds installs without asking',
    held.status === 'installed' && held.standing === 'trusted' && held.key === KEYS.publicKey && !(await dialogOpen(page)),
    JSON.stringify(held)
  )

  const asking = install(page, LOOSE)
  const question = await dialogText(page)
  await answer(page, 'Cancel')
  const cancelled = await asking
  const asked = install(page, LOOSE)
  await dialogText(page)
  await answer(page, 'Install')
  const accepted = await asked
  check(
    'TRUST  an unsigned file is asked about first, in the Finder’s alert: Cancel refuses it, Install installs it',
    question === '“Loose” by Tester isn’t signed. Once it’s installed, it can read and change everything on this desktop. Do you want to install it?' &&
      cancelled.status === 'refused' && cancelled.why === 'cancelled' && accepted.status === 'installed' && accepted.standing === 'unsigned',
    JSON.stringify({ question, cancelled, accepted })
  )
  const strange = install(page, STRANGER)
  const otherKey = await dialogText(page)
  await answer(page, 'Install')
  const stranger = await strange
  check(
    'TRUST  …and so is one signed by a key the site doesn’t hold',
    /^“Stranger” by Tester is signed by a key this desktop doesn’t trust\./.test(otherKey) && stranger.standing === 'untrusted' && stranger.key === OTHER.publicKey,
    JSON.stringify({ otherKey, stranger })
  )
  const forged = await install(page, FORGED)
  check(
    'TRUST  a file with a byte of its code changed since it was signed is refused, asking nothing',
    forged.status === 'refused' && forged.why === 'signature' && forged.reason === 'it was changed after it was signed' && !(await dialogOpen(page)),
    JSON.stringify(forged)
  )

  // Every boot checks again: a kept file changed in storage loses its standing.
  await page.evaluate(
    ([from, to]) => {
      const record = window.storage.records.get('#app:probe')
      record.data = { ...record.data, file: record.data.file.replace(from, to) }
    },
    [base64(SIGNED), base64(FORGED)]
  )
  await boot(page, { trust: { keys: [KEYS.publicKey] }, keep: true })
  const recheck = await page.evaluate(() =>
    Object.fromEntries(window.shell.installed().map((a) => [a.id, `${a.loaded ? 'loaded' : a.why}:${a.standing}`]))
  )
  check(
    'TRUST  every boot checks again: a file changed in storage is skipped; one the visitor said to install loads',
    recheck.probe === 'signature:broken' && recheck.loose === 'loaded:unsigned' && recheck.stranger === 'loaded:untrusted',
    JSON.stringify(recheck)
  )
  await boot(page, { trust: { keys: [KEYS.publicKey], otherwise: 'refuse' }, keep: true })
  const refusing = await page.evaluate(() => window.shell.installed().find((a) => a.id === 'loose'))
  const refused = await install(page, await pack({ id: 'another', name: 'Another' }))
  check(
    'TRUST  with otherwise: refuse, an unsigned file is refused, and one kept is skipped at the boot',
    refusing.why === 'untrusted' && refused.status === 'refused' && refused.why === 'untrusted' && !(await dialogOpen(page)),
    JSON.stringify({ refusing, refused })
  )
  await boot(page)
  const open = await install(page, LOOSE)
  check('TRUST  without a trust, any app file installs', open.status === 'installed' && open.standing === 'unsigned' && !(await dialogOpen(page)), JSON.stringify(open))
  const thrown = await page.evaluate(() => {
    try {
      window.vfShell.createShell(document.querySelector('vf-desktop'), { apps: [], trust: { keys: ['banana'] } })
      return null
    } catch (err) {
      return err.message
    }
  })
  check('TRUST  a key that isn’t one stops createShell', thrown === 'system-online-sdk: trust.keys[0] is not an Ed25519 public key', thrown)
  await page.close()
}

// ── CONTEXT ─────────────────────────────────────────────────────────────────
{
  const page = await shellFixture(browser)
  await boot(page, { index: 'https://apps.example/index.json' })
  await install(page, PROBE)
  const ctx = await page.evaluate(async () => {
    const probe = window.probes.probe.ctx
    let settled = false
    await Promise.race([probe.ready.then(() => (settled = true)), new Promise((r) => setTimeout(r, 100))])
    return {
      index: [window.watcher.index, probe.index],
      settled,
      heard: window.heard,
      listed: window.watcher.installed().map((a) => `${a.id}:${a.source}`),
    }
  })
  await page.evaluate(() => window.shell.uninstall('probe'))
  const after = await page.evaluate(() => window.heard.at(-1))
  check(
    'CONTEXT  ctx.index is the site’s, and an application installed after the boot finds ctx.ready settled',
    ctx.index.every((i) => i === 'https://apps.example/index.json') && ctx.settled,
    JSON.stringify(ctx)
  )
  check(
    'CONTEXT  what’s installed lists every application, built in first, and onInstalled follows it',
    ctx.listed.join() === 'finder:built-in,watcher:built-in,probe:installed' && ctx.heard.at(-1) === 'finder,watcher,probe' && after === 'finder,watcher',
    JSON.stringify({ ctx, after })
  )
  await boot(page)
  check('CONTEXT  …and ctx.index is null when the site gives none', (await page.evaluate(() => window.watcher.index)) === null)
  const noStorage = await page.evaluate(async (b64) => {
    window.shell.dispose()
    document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
    const { createShell, finder } = window.vfShell
    window.shell = createShell(document.querySelector('vf-desktop'), { apps: [finder({ storage: null, art: {} })], fit: 'viewport' })
    await window.shell.ready
    return (await window.shell.install(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).why
  }, base64(PROBE))
  check('CONTEXT  no storage, no installs', noStorage === 'storage', noStorage)
  await page.close()
}

// ── ISOLATION, DUPLICATES ───────────────────────────────────────────────────
{
  const page = await shellFixture(browser)
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const isolated = await page.evaluate(async () => {
    document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
    const { createShell, defineApp, frameOf, pinOf } = window.vfShell
    const pin = pinOf({ left: 40, top: 40, width: 200, height: 100 }, { width: 1080, height: 740 }, frameOf(20))
    const saved = {
      v: 1,
      windows: { 'flaky-main': { app: 'flaky', pin, z: 0 }, 'steady-main': { app: 'steady', pin, z: 1 } },
      active: null,
      pattern: null,
      extra: {},
    }
    const state = { saved, pin: (item) => saved.windows[item]?.pin ?? null, get: () => undefined, set() {}, hold() {}, release() {}, start: () => () => {} }
    const window_ = (heading) => () => Object.assign(document.createElement('vf-window'), { heading, width: 200, height: 100 })
    const ran = []
    const apps = [
      defineApp({ id: 'broken', name: 'Broken', init: () => { throw new Error('no luck') } }),
      defineApp({
        id: 'flaky',
        name: 'Flaky',
        init: (ctx) => ({ open: async () => { ctx.windows.open({ app: 'flaky', item: 'flaky-main', create: window_('Flaky') }); throw new Error('lost its file') } }),
      }),
      defineApp({
        id: 'steady',
        name: 'Steady',
        init: (ctx) => {
          ran.push('steady')
          return { open: () => void ctx.windows.open({ app: 'steady', item: 'steady-main', create: window_('Steady') }) }
        },
      }),
    ]
    const shell = createShell(document.querySelector('vf-desktop'), { apps, state, defaultApp: 'steady', fit: 'viewport' })
    let rejected = null
    await shell.ready.catch((err) => (rejected = err.message))
    const headings = [...document.querySelectorAll('vf-window')].map((w) => w.heading)
    const listed = Object.fromEntries(shell.installed().map((a) => [a.id, a.loaded ? 'loaded' : a.why]))
    shell.dispose()
    return { ran, rejected, headings, listed }
  })
  check(
    'ISOLATION  an init that throws, or a reopen that rejects, takes down that application alone; the rest boot',
    isolated.ran.join() === 'steady' && isolated.rejected === null && isolated.headings.join() === 'Steady' &&
      isolated.listed.broken === 'code' && isolated.listed.flaky === 'code' && isolated.listed.steady === 'loaded',
    JSON.stringify(isolated)
  )
  check(
    'ISOLATION  …and the console names each, with its error',
    errors.some((e) => e.includes('system-online-sdk (broken)') && e.includes('no luck')) &&
      errors.some((e) => e.includes('system-online-sdk (flaky)') && e.includes('lost its file')),
    JSON.stringify(errors)
  )
  const duplicates = await page.evaluate(() => {
    const { createShell, defineApp } = window.vfShell
    const tryShell = (apps) => {
      document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
      try {
        createShell(document.querySelector('vf-desktop'), { apps }).dispose()
        return null
      } catch (err) {
        return err.message
      }
    }
    const app = (id, kinds) => defineApp({ id, name: id, kinds, init() {} })
    const kind = { art: '', open() {} }
    return [tryShell([app('one'), app('one')]), tryShell([app('one', { doc: kind }), app('two', { doc: kind })]), tryShell([app('one', { doc: kind })])]
  })
  check(
    'DUPLICATES  createShell refuses two applications with one id, and a kind two applications register',
    duplicates[0] === 'system-online-sdk: two applications have the id one' &&
      duplicates[1] === 'system-online-sdk: the doc kind is registered by both one and two' && duplicates[2] === null,
    JSON.stringify(duplicates)
  )
  await page.close()
}

// ── BUNDLED ─────────────────────────────────────────────────────────────────
{
  // A site's production build: the kit and the SDK's sources bundled into one
  // chunk of the site's, minified, as Vite builds a site.
  const site = new URL('./.tmp/site/', import.meta.url)
  mkdirSync(site, { recursive: true })
  const entry = new URL('entry.js', site)
  writeFileSync(entry, "import * as vf from 'vintage-frames'\nimport * as sdk from '../../../src/index.ts'\nObject.assign(window, { vf, vfShell: sdk })\n")
  const out = new URL('out/', site)
  await build({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    logLevel: 'error',
    build: {
      outDir: fileURLToPath(out),
      emptyOutDir: true,
      modulePreload: false,
      rolldownOptions: { input: fileURLToPath(entry), output: { entryFileNames: 'site.js', assetFileNames: '[name][extname]' } },
    },
  })
  // A page of the bundle's alone: no other copy of the kit registers its elements first.
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:#000">' })
  )
  await page.route(`${ORIGIN}site/**`, (route) =>
    route.fulfill({ path: fileURLToPath(new URL(new URL(route.request().url()).pathname.slice('/site/'.length), out)) })
  )
  await page.goto(ORIGIN)
  const bundled = await page.evaluate(
    async ([art, b64]) => {
      await import('/site/site.js')
      document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
      const { createShell, finder, memoryStorage } = window.vfShell
      const shell = createShell(document.querySelector('vf-desktop'), { apps: [finder({ storage: memoryStorage(), art })], fit: 'viewport' })
      await shell.ready
      const answer = await shell.install(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      window.shell = shell
      shell.apps.probe?.open({})
      await new Promise((r) => setTimeout(r, 50))
      const probe = window.probes?.probe
      const win = [...document.querySelectorAll('vf-window')].find((w) => w.heading === 'Probe')
      return {
        status: answer.status,
        reason: answer.reason ?? null,
        window: !!probe && probe.VfWindow === window.vf.VfWindow && win instanceof window.vf.VfWindow,
        sdk: probe?.defineApp === window.vfShell.defineApp,
      }
    },
    [SHELL_ART, base64(PROBE)]
  )
  check(
    'BUNDLED  in a site’s production build, an installed application loads against the page’s own kit and SDK',
    bundled.status === 'installed' && bundled.window && bundled.sdk,
    JSON.stringify(bundled)
  )
  await page.close()
}

await report(browser)
