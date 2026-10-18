# system-online-sdk

The SystemOnline SDK: the shell (applications over one desktop: window
manager, menu bar, catalog, the stock Finder, saved state) and app files (an
application as one PNG: the reader, the writer, the box and two Vite
plugins), over the vintage-frames elements. Published to npm as
`system-online-sdk`. It moved here from vintage-frames on 2026-10-10, at
vintage-frames 0.19.1; that repo's history holds everything before.

## Commands

- `npm run dev` — Vite dev server on :5174 for the reference page
  (`index.html`, `demo/main.ts`). Not 5173, which is vintage-frames'.
- `npm test` — the whole suite: `verify:unit` (Node unit tests in `test/`)
  and five Playwright drivers over the reference page (`verify:front`,
  `verify:windows`, `verify:finder`, `verify:fonts`, `verify:installs`), in
  parallel against a server it starts itself. Filter by name
  (`npm test -- finder`).
- `npm run verify:<name>` — one script against a dev server you started
- `npm run typecheck` / `npm run build` (`dist/` and `app-api.json`)
- `npm run check:app-api` — what changed in the app API since the last
  release; `npm version` runs it first and stops on a removal or change that
  `APP_API` doesn't cover
- Always invoke project scripts through their `npm run` alias, not
  `node scripts/…` directly.

## Invariants — don't break, don't re-litigate

- **A layer over vintage-frames.** The runtime (`src/*.ts`) imports the kit
  only as `vintage-frames`, its root, registers no elements, writes no styles
  and ships no art or fonts. vintage-frames is a peer dependency, never a
  dependency: a page loads one copy of the elements. `verify:unit` checks.
- **The pure modules run under Node.** `src/app-file.ts`, `catalog.ts`,
  `fonts.ts`, `geometry.ts`, `state.ts`, `version.ts` and the entry
  `src/pure.ts` import nothing of the kit and touch no DOM at import.
- **The build entry runs under Node.** `src/build/` reaches no element and
  nothing that touches the DOM at import, no page imports it, and nothing in
  the runtime imports it.
- **The app API has a level.** It covers the SDK's two runtime entries and
  vintage-frames' root exports, elements and tokens. Removing or changing
  anything `app-api.json` lists raises `APP_API` in `src/app-file.ts`; an
  addition doesn't. Moving vintage-frames' range is an SDK release, judged
  the same way. Details: `docs/APP-FILES.md` § The app API.
- **App files are format 2**: chunks `system-online.app` and
  `system-online.code`, `requires` the SDK range, `api` required. Format 1,
  which vintage-frames 0.17 to 0.19 wrote, is refused with a reason.
- **The shell composes no UI.** Every window and alert on screen is an
  application's or the page's. Desktop mechanics belong here; an
  application's choices belong to the application. The shell is experimental
  until sprite-machine runs on all of it.
- Everything is authored in **system pixels** on the 1-bit grid, and every
  box the shell places is whole system px.
- The box is lettered in vintage-frames' faces: the kit's **own re-drawn
  strikes**. Credit Susan Kare and Apple as the original designers; never
  describe them as Apple's files.
- `dist/` and `app-api.json` are build outputs (`npm run build` /
  `npm run analyze`) — regenerate, don't hand-edit. So are `src/version.ts`
  (`npm version`) and `src/build/frame-picture.ts` (`npm run embed:frame`).
  `src/build/*-strike.ts` are copies of the faces as data, as vintage-frames
  0.19.1 generated them from its glyph manifests: never edit a glyph here.

## Commits

Concise messages: a summary line plus at most a few sentences. No co-author
or generated-by trailers.

CI fails if `app-api.json` doesn't match a fresh `npm run analyze` — after
touching `src/` or moving vintage-frames, rerun it and commit the result with
the change.

## Where things are

- `src/index.ts` — the entry `system-online-sdk`; `src/pure.ts` —
  `system-online-sdk/pure`; `src/shell.ts` — `createShell`, `defineApp`;
  `src/windows.ts` — the window manager; `src/finder.ts` — the stock Finder;
  `src/catalog.ts`, `src/storage.ts` — the catalog and its storage;
  `src/fonts.ts` — the system's fonts, which are installed (pure);
  `src/strikes.ts` — loading a strike through the FontFace API;
  `src/state.ts` — the saved session; `src/geometry.ts`; `src/filing.ts` —
  filing by drag; `src/app-file.ts` — the app file reader, its signature
  check and the levels; `src/installs.ts` — app files installed at runtime;
  `src/loader.ts` — loading an installed application's code
- `src/build/` — `system-online-sdk/build`: the plugins, the packer, the
  signer, the box, its frame (`box/frame.png`), PNG pixels, and the faces as
  data
- `test/*.test.mjs` — the unit tests; `scripts/` — the Playwright scripts,
  their harness, the test runner, the app API's list and its release check
- `index.html`, `demo/` — the reference page; `demo/icons/` is its own art,
  and `demo/fonts/` its system's fonts (vintage-frames' own faces): neither
  ships
- `docs/` — GUIDE (each kind of consumer step by step: a site, an
  application, one in its own repo, a tool that reads app files; moving to a
  new release; the sibling repos' moves onto the SDK), SHELL (the shell's
  reference), APP-FILES (the format, the box, the plugins, the app API),
  DEVELOPING, PUBLISHING
- `README.md` — the storefront, shared by GitHub and npm
- Asks from the sites arrive as `feature-requests/<name>.md`
- Siblings: **vintage-frames** (the elements), **system-online** and
  **sprite-machine** (the sites), **meteors-app** (an application in its own
  repo), **system-online-app-index** (an index of app files)
