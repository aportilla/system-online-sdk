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
 *  - RESTART: restart() runs a running application's pending file in place
 *    with no saved session: its windows back at their boxes and depths among
 *    every window, the front application and its menus as they were, behind
 *    another's window, in front, or with none active; again, fresh, with
 *    nothing pending.
 *  - ROLLBACK: a new file whose init throws, or whose open rejects as the
 *    windows reopen, is refused, the old version running again with its
 *    windows back, still pending.
 *  - KIND: a pending file with a kind another application has is refused
 *    before anything closes.
 *  - ITSELF, ART: an application restarts itself through its own ctx; its
 *    document's icon never shows the Finder's document art on the way, and
 *    takes the new code's art.
 *  - REFUSED: restart() refuses one built in, one not installed, and one the
 *    boot skipped.
 *  - BEFORE QUIT: an application's offer to save is asked only while it holds
 *    something unsaved, once, and its answer stands: going on restarts it,
 *    over a window's own close that would stay; staying cancels; throwing
 *    refuses.
 *  - CANCELLED: without a hook, its windows' own closes are asked, and one
 *    that stays open cancels.
 *  - SAVED: an untitled window its own close saves comes back as the
 *    document it became.
 *  - LEAVING: leaving the page asks first while an application holds
 *    something unsaved, and not once it's saved or uninstalled.
 *  - SESSION: a page left mid-restart, one window closed and another's
 *    question open, reopens both on the kept file.
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
 * entries at its head, then its factory. It registers `<id>-doc`, drawn in
 * `art`, opens a window of its own and one for each of its documents, puts
 * its context, its version and what it imported on `window.probes`, and
 * throws in its init while localStorage holds `explode:<id>`.
 *
 * A version can break: its init throws, or its `open` of its own window, a
 * document's opening first (`breaks`). Its
 * windows' close can keep them open, a Cancel; hold its question until the
 * check answers through `window.probeHeld`; or save an untitled one, a
 * `draft()`, as a document first (`close`). With `quits` it asks before it
 * quits: whether it holds something unsaved, and whether its offer to save
 * goes on, stays or throws, are `window.probeQuit[id]`'s, which counts the
 * offers.
 */
const appCode = ({ id, name, version = '1.0.0', kind = `${id}-doc`, art = '/demo/icons/app-icon.png', breaks = null, close = null, quits = false }) => `
import { defineApp } from "system-online-sdk";
import { VfWindow } from "vintage-frames";
import { APP_KIND } from "system-online-sdk/pure";
const ID = ${JSON.stringify(id)};
const NAME = ${JSON.stringify(name)};
const KIND = ${JSON.stringify(kind)};
const VERSION = ${JSON.stringify(version)};
const BREAKS = ${JSON.stringify(breaks)};
const CLOSE = ${JSON.stringify(close)};
const QUITS = ${JSON.stringify(quits)};
export default function factory() {
  let open = () => {};
  return defineApp({
    id: ID,
    name: NAME,
    kinds: { [KIND]: { art: ${JSON.stringify(art)}, open: (item, from) => open(item.id, item.name, from) } },
    init(ctx) {
      if (localStorage.getItem("explode:" + ID)) throw new Error(NAME + " won't start");
      if (BREAKS === "init") throw new Error(NAME + " " + VERSION + " breaks as it starts");
      const probes = (window.probes ??= {});
      const me = (probes[ID] = { ctx, version: VERSION, VfWindow, defineApp, APP_KIND, disposed: false });
      const close =
        CLOSE === "keeps" ? () => {}
        : CLOSE === "holds" ? (win) => new Promise((done) => (window.probeHeld ??= []).push((yes) => { if (yes) ctx.windows.close(win); done(); }))
        : CLOSE === "saves" ? async (win) => {
            if (ctx.windows.itemOf(win) == null) ctx.windows.setItem(win, (await ctx.catalog.create({ kind: KIND, name: win.heading })).id);
            ctx.windows.close(win);
          }
        : null;
      open = (item, heading, from) =>
        ctx.windows.open({
          app: ID,
          item,
          from,
          close,
          create: () => Object.assign(document.createElement("vf-window"), { heading, width: 220, height: 120, closable: true, movable: true }),
        });
      if (QUITS) {
        const quit = () => ((window.probeQuit ??= {})[ID] ??= { unsaved: false, save: "goes", asked: 0 });
        ctx.beforeQuit({
          unsaved: () => quit().unsaved,
          async save() {
            const q = quit();
            q.asked++;
            if (q.save === "throws") throw new Error(NAME + " can't save");
            return q.save === "goes";
          },
        });
      }
      ctx.onDispose(() => (me.disposed = true));
      return {
        open({ item, from = null } = {}) {
          if (BREAKS === "open" && (item == null || item === ID)) throw new Error(NAME + " " + VERSION + " can't open its window");
          const doc = item != null && item !== ID ? ctx.catalog?.item(item) : null;
          if (doc) open(doc.id, doc.name, from);
          else if (item == null || item === ID) open(ID, NAME, from);
        },
        draft: (heading) => open(null, heading, null),
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
const pack = ({ id = 'probe', name = 'Probe', version = '1.0.0', ...code } = {}) =>
  packApp({
    manifest: { id, name, version, requires: '^0.2.0', author: 'Tester', description: `${name}, for the tests.` },
    icon: ICON,
    code: appCode({ id, name, version, ...code }),
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
// Restarts: versions that break, one with Note Pad's kind, one drawn anew,
// and applications that ask before they quit or whose windows' close asks.
const BREAKS_INIT = await pack({ version: '1.3.0', breaks: 'init' })
const BREAKS_OPEN = await pack({ version: '1.4.0', breaks: 'open' })
const CLASHING = await pack({ version: '1.5.0', kind: 'note' })
const REDRAWN = await pack({ version: '1.6.0', art: '/demo/icons/trash.png' })
const QUITTER = await pack({ id: 'quitter', name: 'Quitter', quits: true })
const QUITTER_NEXT = await pack({ id: 'quitter', name: 'Quitter', version: '1.1.0', quits: true })
const STUBBORN = await pack({ id: 'stubborn', name: 'Stubborn', quits: true, close: 'keeps' })
const KEEPER = await pack({ id: 'keeper', name: 'Keeper', close: 'keeps' })
const KEEPER_NEXT = await pack({ id: 'keeper', name: 'Keeper', version: '1.1.0', close: 'keeps' })
const HOLDER = await pack({ id: 'holder', name: 'Holder', close: 'holds' })
const HOLDER_NEXT = await pack({ id: 'holder', name: 'Holder', version: '1.1.0', close: 'holds' })
const SAVER = await pack({ id: 'saver', name: 'Saver', close: 'saves' })

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

/** Restart an application through the shell, and resolve the answer: its status, why, and the app's version. */
const restart = (page, id) =>
  page.evaluate(async (i) => {
    const answer = await window.shell.restart(i)
    return {
      status: answer.status,
      why: answer.why ?? null,
      reason: answer.reason ?? null,
      version: answer.app?.manifest?.version ?? null,
      previous: answer.previous ?? null,
      loaded: answer.app?.loaded ?? null,
      pending: answer.app?.pending ?? null,
    }
  }, id)

/** The version of an application's code that runs, as it put it on `window.probes`. */
const running = (page, id) => page.evaluate((i) => window.probes[i]?.version ?? null, id)

/**
 * Watch the art of the icon labelled `label`: read at every frame, and every
 * value it holds, painted or not. `artSeen()` stops and resolves both, each
 * value once, in order.
 */
const watchArt = (page, label) =>
  page.evaluate((l) => {
    const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === l)
    const src = () => icon.querySelector('img')?.getAttribute('src') ?? null
    const frames = [src()]
    const held = []
    const heard = (records) => {
      for (const r of records) held.push(r.oldValue)
    }
    const observer = new MutationObserver(heard)
    observer.observe(icon, { attributeFilter: ['src'], attributeOldValue: true, subtree: true })
    let sampling = true
    const sample = () => {
      frames.push(src())
      if (sampling) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    window.artSeen = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      sampling = false
      heard(observer.takeRecords())
      observer.disconnect()
      return { frames: [...new Set(frames)], held: [...new Set([...held, src()])] }
    }
  }, label)
const artSeen = (page) => page.evaluate(() => window.artSeen())

/** Whether leaving the page would ask first: a cancelable beforeunload, cancelled. */
const leaveAsks = (page) =>
  page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  })

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

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
  const notRunning = await restart(page, 'probe')
  check(
    'REFUSED  restart() refuses one the boot skipped: not running, saying why',
    notRunning.status === 'refused' && notRunning.why === 'not-running' && notRunning.reason === 'it isn’t running, since its code failed: Probe won\'t start',
    JSON.stringify(notRunning)
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

// ── RESTART, ROLLBACK, KIND, ITSELF, ART ────────────────────────────────────
{
  // No ?save=1: the shell has no saved session to reopen windows from.
  const page = await openShell(browser)
  const s = shellOn(page)
  /** What the shell says in the console, as errors. */
  const errors = []
  page.on('console', (m) => m.type() === 'error' && m.text().startsWith('system-online-sdk') && errors.push(m.text()))
  /** The windows shown, bottom first, palettes aside, each at its box; the active one; the front application; the bar's label and menus. */
  const desk = () =>
    page.evaluate(() => {
      const d = document.querySelector('vf-desktop')
      const bar = document.querySelector('vf-menu-bar')
      return {
        windows: d.stackingOrder.filter((w) => !w.hidden && !window.shell.windows.isPalette(w)).map((w) => `${w.heading}@${w.left},${w.top}`),
        active: d.activeWindow?.heading ?? null,
        front: window.shell.windows.front,
        bar: [bar.label, ...[...bar.querySelectorAll(':scope > vf-menu')].slice(1).map((m) => m.label)].join(),
      }
    })
  const headings = (d) => d.windows.map((w) => w.slice(0, w.indexOf('@'))).join()
  await install(page, PROBE)
  const notes = await page.evaluate(async () => (await window.shell.catalog.create({ kind: 'probe-doc', name: 'Probe Notes', left: 400, top: 200 })).id)
  const documents = (await s.item('Documents')).id
  // Probe Notes at the bottom, the Documents folder over it, Probe over that, each moved; then a note in front.
  await page.evaluate(
    ([notes, documents]) => {
      const { apps, windows } = window.shell
      apps.probe.open({ item: notes })
      windows.write(windows.windowFor(notes), { left: 120, top: 80 })
      apps.finder.open({ item: documents })
      apps.probe.open({})
      windows.write(windows.windowFor('probe'), { left: 300, top: 200 })
    },
    [notes, documents]
  )
  await s.settle()
  await s.pick('Apple', 'Note Pad')
  await s.settle()
  const pending = await install(page, PROBE_NEXT, { replace: true })
  const before = await desk()
  await page.evaluate(() => (window.oldProbe = window.probes.probe))
  const restarted = await restart(page, 'probe')
  await s.settle()
  const after = await desk()
  check(
    'RESTART  restart() runs the pending file in place: restarted from 1.0.0, nothing pending, the new code running, the old context disposed',
    pending.pending && restarted.status === 'restarted' && restarted.previous === '1.0.0' && restarted.version === '1.1.0' && restarted.loaded && restarted.pending === false &&
      (await running(page, 'probe')) === '1.1.0' && (await page.evaluate(() => window.oldProbe.disposed && window.probes.probe !== window.oldProbe)),
    JSON.stringify({ pending, restarted })
  )
  check(
    'RESTART  its windows come back at their boxes and depths among every window, and Note Pad stays in front with its menus',
    headings(before) === 'Probe Notes,Documents,Probe,Untitled' && before.windows.includes('Probe Notes@120,80') && before.windows.includes('Probe@300,200') && same(after, before) &&
      after.active === 'Untitled' && after.front === 'note-pad' && after.bar === 'Note Pad,File,Font,Window',
    JSON.stringify({ before, after })
  )

  await page.evaluate(() => document.querySelector('vf-desktop').bringToFront(window.shell.windows.windowFor('probe')))
  await s.settle()
  const inFront = await desk()
  const fresh = await restart(page, 'probe')
  await s.settle()
  const still = await desk()
  check(
    'RESTART  …and in front, with nothing pending: its window active before and after, the bar its own, its code fresh',
    inFront.active === 'Probe' && fresh.status === 'restarted' && fresh.previous === '1.1.0' && fresh.version === '1.1.0' && same(still, inFront) &&
      still.front === 'probe' && still.bar === 'Probe',
    JSON.stringify({ inFront, fresh, still })
  )
  // The desktop pressed: no window active, the Finder in front.
  await page.evaluate(() => document.querySelector('vf-desktop').clearActive())
  await s.settle()
  const none = await desk()
  const unasked = await restart(page, 'probe')
  await s.settle()
  const stillNone = await desk()
  check(
    'RESTART  …and with no window active, none is after, the Finder still in front',
    none.active === null && none.front === 'finder' && unasked.status === 'restarted' && same(stillNone, none),
    JSON.stringify({ none, unasked, stillNone })
  )

  // ROLLBACK: its init throws, or its open rejects as the windows reopen.
  for (const [file, what, failed] of [
    [BREAKS_INIT, 'init throws', 'its init threw'],
    [BREAKS_OPEN, 'open rejects', 'reopening its windows failed'],
  ]) {
    await install(page, file, { replace: true })
    const was = await desk()
    errors.length = 0
    await watchArt(page, 'Probe Notes')
    const refused = await restart(page, 'probe')
    const art = await artSeen(page)
    await s.settle()
    const now = await desk()
    const listed = await entry(page, 'probe')
    check(
      `ROLLBACK  a pending file whose ${what} is refused with code, the old version running again with its windows back, still pending; the console says so`,
      refused.status === 'refused' && refused.why === 'code' && refused.reason.startsWith('its code failed: Probe 1.') &&
        (await running(page, 'probe')) === '1.1.0' && same(now, was) && listed.loaded && listed.pending &&
        errors.length === 1 && errors[0].startsWith(`system-online-sdk (probe): ${failed}, so the code it ran starts again — Error: ${refused.reason.slice('its code failed: '.length)}`),
      JSON.stringify({ refused, was, now, listed, errors })
    )
    check(
      `ROLLBACK  …its documents keeping their art throughout, the old code put back in the step the new comes down in (${what})`,
      art.frames.join() === '/demo/icons/app-icon.png' && art.held.join() === '/demo/icons/app-icon.png',
      JSON.stringify(art)
    )
  }

  await install(page, CLASHING, { replace: true })
  await page.evaluate(() => (window.heldWindow = window.shell.windows.windowFor('probe')))
  const clash = await restart(page, 'probe')
  check(
    'KIND  a pending file with a kind another application registers is refused before anything closes',
    clash.why === 'kind' && clash.reason === 'it registers the kind note, which Note Pad registers' && (await running(page, 'probe')) === '1.1.0' &&
      (await page.evaluate(() => window.heldWindow.isConnected && window.shell.windows.windowFor('probe') === window.heldWindow)),
    JSON.stringify(clash)
  )

  await install(page, PROBE_LAST, { replace: true })
  const itself = await page.evaluate(async () => {
    const answer = await window.probes.probe.ctx.restart('probe')
    return { status: answer.status, version: window.probes.probe.version }
  })
  check(
    'ITSELF  an application restarts itself through its own ctx: restarted, the new version running',
    itself.status === 'restarted' && itself.version === '1.2.0',
    JSON.stringify(itself)
  )

  // ART: Probe Notes' icon through a restart onto new art.
  await install(page, REDRAWN, { replace: true })
  await watchArt(page, 'Probe Notes')
  const redrawn = await restart(page, 'probe')
  const art = await artSeen(page)
  check(
    'ART  a document’s icon through a restart: never the Finder’s document art, at a frame or between, and the new code’s art once it runs',
    redrawn.status === 'restarted' && art.frames.join() === '/demo/icons/app-icon.png,/demo/icons/trash.png' &&
      art.held.join() === '/demo/icons/app-icon.png,/demo/icons/trash.png',
    JSON.stringify({ redrawn, art })
  )

  const refusals = await page.evaluate(async () => [await window.shell.restart('note-pad'), await window.shell.restart('ghost')])
  check(
    'REFUSED  restart() refuses an application built in, and an id nothing has',
    refusals[0].status === 'refused' && refusals[0].why === 'built-in' && refusals[1].status === 'refused' && refusals[1].why === 'not-installed',
    JSON.stringify(refusals)
  )
  await page.close()
}

// ── BEFORE QUIT, CANCELLED, LEAVING ─────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  /** Set what an application that quits says: whether it holds something unsaved, and what its offer to save does. */
  const quitAs = (id, says) => page.evaluate(([i, x]) => Object.assign(((window.probeQuit ??= {})[i] ??= { asked: 0 }), x), [id, says])
  const asked = (id) => page.evaluate((i) => window.probeQuit[i].asked, id)
  /** Note an application's window, to tell it from one reopened later; whether the one noted is still the one open. */
  const noteWindow = (id) => page.evaluate((i) => ((window.noted ??= {})[i] = window.shell.windows.windowFor(i)) !== null, id)
  const sameWindow = (id) => page.evaluate((i) => window.noted[i].isConnected && window.shell.windows.windowFor(i) === window.noted[i], id)
  const opened = (id) => page.evaluate((i) => window.shell.windows.windowFor(i) !== null, id)

  await install(page, QUITTER)
  await install(page, QUITTER_NEXT, { replace: true })
  await page.evaluate(() => window.shell.apps.quitter.open({}))
  await s.settle()
  await noteWindow('quitter')
  await quitAs('quitter', { unsaved: true, save: 'stays' })
  const stays = await restart(page, 'quitter')
  check(
    'BEFORE QUIT  holding something unsaved, its offer to save is asked once; staying cancels: its window open, the old version running, still pending',
    stays.status === 'refused' && stays.why === 'cancelled' && (await asked('quitter')) === 1 && (await sameWindow('quitter')) &&
      (await running(page, 'quitter')) === '1.0.0' && (await entry(page, 'quitter')).pending,
    JSON.stringify(stays)
  )
  await quitAs('quitter', { save: 'throws' })
  const throws = await restart(page, 'quitter')
  check(
    'BEFORE QUIT  an offer to save that throws refuses with code, the old version running',
    throws.why === 'code' && throws.reason === "its beforeQuit failed: Quitter can't save" && (await asked('quitter')) === 2 &&
      (await sameWindow('quitter')) && (await running(page, 'quitter')) === '1.0.0',
    JSON.stringify(throws)
  )
  await quitAs('quitter', { unsaved: false, save: 'stays' })
  const clean = await restart(page, 'quitter')
  await s.settle()
  check(
    'BEFORE QUIT  with nothing unsaved, nothing asks, and it restarts, its window back',
    clean.status === 'restarted' && (await asked('quitter')) === 2 && (await running(page, 'quitter')) === '1.1.0' && (await opened('quitter')) && !(await sameWindow('quitter')),
    JSON.stringify(clean)
  )
  await noteWindow('quitter')
  await quitAs('quitter', { unsaved: true, save: 'goes' })
  const goes = await restart(page, 'quitter')
  await s.settle()
  check(
    'BEFORE QUIT  …and holding something unsaved, going on at its offer restarts it, asked once, its window back',
    goes.status === 'restarted' && (await asked('quitter')) === 3 && (await opened('quitter')) && !(await sameWindow('quitter')),
    JSON.stringify(goes)
  )

  await install(page, STUBBORN)
  await page.evaluate(() => window.shell.apps.stubborn.open({}))
  await s.settle()
  await noteWindow('stubborn')
  await quitAs('stubborn', { unsaved: true, save: 'goes' })
  const stood = await restart(page, 'stubborn')
  await s.settle()
  check(
    'BEFORE QUIT  its answer stands: a window whose own close keeps it open closes unasked, and comes back',
    stood.status === 'restarted' && (await asked('stubborn')) === 1 && (await opened('stubborn')) && !(await sameWindow('stubborn')),
    JSON.stringify(stood)
  )

  await install(page, KEEPER)
  await install(page, KEEPER_NEXT, { replace: true })
  await page.evaluate(() => window.shell.apps.keeper.open({}))
  await s.settle()
  await noteWindow('keeper')
  const kept = await restart(page, 'keeper')
  check(
    'CANCELLED  without a hook, its windows are asked as its Quit asks them: one that stays open cancels, the old version running',
    kept.status === 'refused' && kept.why === 'cancelled' && (await sameWindow('keeper')) && (await running(page, 'keeper')) === '1.0.0' && (await entry(page, 'keeper')).pending,
    JSON.stringify(kept)
  )

  await install(page, SAVER)
  await page.evaluate(() => window.shell.apps.saver.draft('Draft'))
  await s.settle()
  const draft = await s.window('Draft')
  const filed = await restart(page, 'saver')
  await s.settle()
  const doc = await s.item('Draft')
  const showing = await page.evaluate(() => window.shell.windows.itemOf([...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'Draft') ?? null))
  check(
    'SAVED  an untitled window its own close saves comes back as the document it became, where it was',
    filed.status === 'restarted' && doc?.kind === 'saver-doc' && showing === doc.id && same(await s.window('Draft'), draft),
    JSON.stringify({ filed, doc, showing, draft })
  )

  // LEAVING: Note Pad, Stubborn and Quitter have hooks; Keeper has none.
  await quitAs('stubborn', { unsaved: false })
  await quitAs('quitter', { unsaved: true })
  const unsaved = await leaveAsks(page)
  await quitAs('quitter', { unsaved: false })
  const saved = await leaveAsks(page)
  await quitAs('quitter', { unsaved: true })
  await page.evaluate(() => window.shell.uninstall('quitter'))
  const gone = await leaveAsks(page)
  check('LEAVING  leaving the page asks first while an application holds something unsaved', unsaved, JSON.stringify({ unsaved }))
  check(
    'LEAVING  …and not once it’s saved, nor for one without a hook, nor once the unsaved one is uninstalled',
    !saved && !gone,
    JSON.stringify({ saved, gone })
  )
  await page.close()
}

// ── SESSION ─────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser, { query: '?save=1' })
  const s = shellOn(page)
  await install(page, HOLDER)
  const notes = await page.evaluate(async () => (await window.shell.catalog.create({ kind: 'holder-doc', name: 'Holder Notes', left: 400, top: 300 })).id)
  await page.evaluate((notes) => {
    const { apps, windows } = window.shell
    apps.holder.open({})
    windows.write(windows.windowFor('holder'), { left: 200, top: 100 })
    apps.holder.open({ item: notes })
    windows.write(windows.windowFor(notes), { left: 320, top: 180 })
  }, notes)
  await s.settle()
  await install(page, HOLDER_NEXT, { replace: true })
  const before = [await s.window('Holder'), await s.window('Holder Notes')]
  const written = await until(
    page,
    (id) => {
      const saved = JSON.parse(localStorage.getItem('system-online-sdk-reference') ?? 'null')
      return Number.isInteger(saved?.windows?.holder?.z) && saved.windows[id]?.z > saved.windows.holder.z
    },
    notes
  )
  // Front to back: Holder Notes' question first, answered, and its window
  // closes; then Holder's, held open while the page goes.
  await page.evaluate(() => void window.shell.restart('holder'))
  const asked = await until(page, () => window.probeHeld?.length === 1)
  if (asked) await page.evaluate(() => window.probeHeld.shift()(true))
  const held =
    asked &&
    (await until(
      page,
      (id) => window.probeHeld.length === 1 && !!window.shell.windows.windowFor('holder') && !window.shell.windows.windowFor(id),
      notes
    ))
  await page.reload()
  await page.evaluate(() => window.shell.ready)
  await s.settle()
  const after = [await s.window('Holder'), await s.window('Holder Notes')]
  const order = await page.evaluate(() => document.querySelector('vf-desktop').stackingOrder.filter((w) => !w.hidden).map((w) => w.heading))
  check(
    'SESSION  a page left mid-restart, one window closed and another’s question open: the boot reopens both where they were, on the kept file',
    written && held && same(after, before) && order.indexOf('Holder') < order.indexOf('Holder Notes') && (await running(page, 'holder')) === '1.1.0',
    JSON.stringify({ written, held, before, after, order })
  )
  await page.close()
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
