/**
 * The shared harness behind the `verify:*` Playwright scripts.
 *
 * The scripts are Playwright *drivers*: Node reaches into the reference page
 * (index.html, demo/main.ts) and asserts what the browser actually did. Menus,
 * the keyboard focus and drags only respond to *trusted* input, which nothing
 * running inside the page can produce.
 *
 * A script stays runnable on its own (`npm run verify:finder`, against a dev
 * server you started), and `npm test` runs the whole suite and starts the
 * server itself — see scripts/test.mjs.
 */
import { chromium } from 'playwright'

/** Where the dev server is. `npm test` passes this through to every child. */
export const ORIGIN = process.env.SDK_ORIGIN ?? 'http://localhost:5174/'

// ─────────────────────────────────────────────────────────── checks & tally

/** Every check's outcome, in order, for {@link report} to count. */
export const results = []

// ───────────────────────────────────────────────────────────── the watchdog

/**
 * A stalled script must not be able to stall the suite.
 *
 * Playwright bounds its own calls, but not a promise the *page* returns: the
 * idiom `page.evaluate(() => new Promise(r => el.addEventListener(evt, r)))`
 * waits forever if the event never fires. So: no progress for this long and
 * the script prints what it got, names the check it stalled *after*, and
 * exits 1. `SDK_STALL_TIMEOUT=0` turns it off (for a debugging session under a
 * breakpoint).
 */
const STALL_MS = Number(process.env.SDK_STALL_TIMEOUT ?? 120_000)
let stallTimer
let lastProgress = 'the first check (nothing has been checked yet)'

function onStall() {
  const failed = results.filter((r) => !r).length
  console.log(
    `\n[watchdog] no progress for ${STALL_MS / 1000}s after: ${lastProgress}\n` +
      '[watchdog] whatever ran next never resolved — usually an in-page promise ' +
      'waiting for an event that never fired.'
  )
  console.log(`\n${results.length - failed}/${results.length} checks passed (STALLED — incomplete)`)
  process.exit(1)
}

/** Restart the stall clock. {@link check} calls it. */
export function heartbeat(label) {
  if (!(STALL_MS > 0)) return
  if (label) lastProgress = label
  clearTimeout(stallTimer)
  stallTimer = setTimeout(onStall, STALL_MS)
  // Never the reason the process stays alive — only the reason it stops.
  stallTimer.unref?.()
}
heartbeat()

/**
 * Record one assertion. Deliberately not `expect`: a script runs ALL of its
 * checks and reports every failure, where a throwing assertion would abandon
 * the rest of the file at the first one. `detail` carries the measured value,
 * which is what makes a failure diagnosable without a re-run.
 */
export function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  heartbeat(name)
}

/**
 * Close the browser, print the tally, exit with the suite's verdict. The
 * "N/M checks passed" line is the format scripts/test.mjs reads back for its
 * summary column.
 */
export async function report(browser) {
  if (browser) await browser.close()
  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}

// ────────────────────────────────────────────────────────────── the browser

/**
 * One Chromium for a script. The args pin text rasterization, which is
 * otherwise not the same on every machine: rasterize glyph outlines as
 * authored, and antialias in grayscale.
 */
export const launch = (options = {}) =>
  chromium.launch({
    ...options,
    args: ['--font-render-hinting=none', '--disable-lcd-text', ...(options.args ?? [])],
  })

// ─────────────────────────────────────────────────────── the reference page

/**
 * The reference page (index.html, demo/main.ts), booted: the catalog read
 * and seeded, the session reopened, the fonts in. At dpr 1 the scale is 1,
 * so a system px is a CSS px; the screen sits behind the desktop's bezel,
 * and `shellOn(page).screen()` says where. Reduced motion by default: a menu
 * pick runs within the release, and windows open and close without zoom
 * rects. A script that watches the rects passes `reducedMotion: false`.
 */
export async function openShell(
  browser,
  { query = '', viewport = { width: 1100, height: 760 }, reducedMotion = true } = {}
) {
  const page = await browser.newPage({ viewport })
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(new URL(`/${query}`, ORIGIN).href)
  await page.evaluate(() => window.shell.ready)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  return page
}

/** The Finder's art for a fixture: the reference page's. */
export const SHELL_ART = {
  folder: '/demo/icons/folder.png',
  trash: '/demo/icons/trash.png',
  trashFull: '/demo/icons/trash-full.png',
  document: '/demo/icons/doc-icon.png',
  caution: '/demo/icons/alert.png',
}

/**
 * A blank page on the dev server's origin with vintage-frames and the SDK
 * imported, as `window.vf` and `window.vfShell`, for a shell the reference
 * page doesn't run. The script writes its desktop and calls `createShell` in
 * one evaluate, so the shell starts before the desktop's first render, as a
 * page's own module does. The kit comes in through demo/kit.ts, so the page
 * and the SDK share the one copy the dev server serves.
 */
export async function shellFixture(browser, { viewport = { width: 1100, height: 760 }, reducedMotion = true } = {}) {
  const page = await browser.newPage({ viewport })
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(ORIGIN, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:#000">',
    })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.evaluate(async () => {
    window.vf = await import('/demo/kit.ts')
    window.vfShell = await import('/src/index.ts')
  })
  return page
}

/** The reads and gestures the scripts share, on a page {@link openShell} made. */
export function shellOn(page) {
  const centreOf = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, sel)
  const api = {
    page,
    /** Two frames: slot changes, Lit's updates and the kit's placement writes settle. */
    settle: () =>
      page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))),
    /** The catalog item named `name`, or null. */
    item: (name) =>
      page.evaluate((n) => window.shell.catalog.get().items.find((i) => i.name === n) ?? null, name),
    /** The front application's id. */
    front: () => page.evaluate(() => window.shell.windows.front),
    /** The screen: its size in system px, and its corner in viewport CSS px. */
    screen: () =>
      page.evaluate(() => {
        const d = document.querySelector('vf-desktop')
        const r = d.shadowRoot.querySelector('[part=desktop]').getBoundingClientRect()
        return { width: d.width, height: d.height, x: r.x, y: r.y }
      }),
    /** The bar's accessible name and the menus after the system menu. */
    bar: () =>
      page.evaluate(() => {
        const bar = document.querySelector('vf-menu-bar')
        return { label: bar.label, menus: [...bar.querySelectorAll(':scope > vf-menu')].slice(1).map((m) => m.label) }
      }),
    /** The active window's heading, or null. */
    active: () => page.evaluate(() => document.querySelector('vf-desktop').activeWindow?.heading ?? null),
    /** The centre of the art of the icon labelled `name`, viewport CSS px. */
    icon: (name) =>
      page.evaluate((n) => {
        const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === n)
        if (!icon) return null
        const r = icon.shadowRoot.querySelector('.frame').getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, name),
    /** The icon labelled `name`: where it sits, whether it is selected and drawn open, and its container's window. */
    iconState: (name) =>
      page.evaluate((n) => {
        const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === n)
        if (!icon) return null
        return {
          left: icon.left,
          top: icon.top,
          selected: icon.selected,
          open: icon.open,
          target: icon.target,
          in: icon.closest('vf-window')?.heading ?? null,
          art: icon.querySelector('img')?.getAttribute('src') ?? null,
        }
      }, name),
    /** The window headed `heading`: its box, whether it is shown and active. */
    window: (heading) =>
      page.evaluate((h) => {
        const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === h)
        if (!win) return null
        return { left: win.left, top: win.top, width: win.width, height: win.height, hidden: win.hidden, active: win.active }
      }, heading),
    /** The centre of a window's title bar, viewport CSS px. */
    titleBar: (heading) =>
      page.evaluate((h) => {
        const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === h)
        const r = win?.shadowRoot.querySelector('[part=title-bar]')?.getBoundingClientRect()
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
      }, heading),
    /** A point on a window's plane, system px from the plane's origin, as viewport CSS px. */
    onPlane: (heading, left, top) =>
      page.evaluate(
        ([h, x, y]) => {
          const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === h)
          const r = win.querySelector(':scope > vf-icon-field').getBoundingClientRect()
          return { x: r.x + x, y: r.y + y }
        },
        [heading, left, top]
      ),
    /** Whether a menu item in the bar is enabled, by its menu's label and its value. */
    enabled: (menu, value) =>
      page.evaluate(
        ([m, v]) => {
          const el = [...document.querySelectorAll('vf-menu-bar > vf-menu')].find((x) => x.label === m)
          const item = el?.querySelector(`vf-menu-item[value="${v}"]`)
          return item ? !item.disabled : null
        },
        [menu, value]
      ),
    /**
     * Pick a menu item, by its value or, for the Apple menu's entries, whose
     * values are item ids, its text: press the bar's title, slide onto the
     * row, release over it.
     */
    async pick(menu, value) {
      const title = await page.evaluate((m) => {
        const el = [...document.querySelectorAll('vf-menu-bar > vf-menu')].find((x) => x.label === m)
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, menu)
      await page.mouse.move(title.x, title.y)
      await page.mouse.down()
      const row = await page.evaluate(
        ([m, v]) => {
          const el = [...document.querySelectorAll('vf-menu-bar > vf-menu')].find((x) => x.label === m)
          const item = [...el.querySelectorAll('vf-menu-item')].find((i) => i.getAttribute('value') === v || i.textContent === v)
          const r = item.getBoundingClientRect()
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        },
        [menu, value]
      )
      await page.mouse.move(row.x, row.y, { steps: 3 })
      await page.mouse.up()
    },
    /** Press at `from`, travel to `to` in steps, release. */
    async drag(from, to, steps = 8) {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps })
      await page.mouse.up()
    },
    /** Click the centre of `selector`'s box. */
    async click(selector) {
      const at = await centreOf(selector)
      await page.mouse.click(at.x, at.y)
    },
  }
  return api
}
