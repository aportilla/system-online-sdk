# Using the SDK

The SDK has three kinds of consumer, and this guide gives each the order to do things in:

| Building | Start at |
| --- | --- |
| **A site**: the page that hosts the desktop. It holds the menu bar and the Finder, chooses the applications, keeps the visitor's files and gives the system its fonts. SystemOnline and Sprite Machine are sites. | [A site in six steps](#a-site-in-six-steps) |
| **An application**: its windows, menus and documents on the desktop. A site's own lives in the site's repo. One in a repo of its own ships as an app file, as Meteors does. | [Writing an application](#writing-an-application), then for a repo of its own [An application in its own repo](#an-application-in-its-own-repo) |
| **A tool that reads or writes app files**: an index, a store, a test. system-online-app-index is one. | [A tool that reads app files](#a-tool-that-reads-app-files) |

[SHELL.md](./SHELL.md) documents every option and call, and [APP-FILES.md](./APP-FILES.md) the app file. [Moving to a new release](#moving-to-a-new-release) is for all three. The last section is the steps the existing repos take to move onto the SDK.

## A site in six steps

### 1. The page

```sh
npm install vintage-frames system-online-sdk
```

vintage-frames draws the elements; the SDK runs applications over them. The SDK names the vintage-frames range it takes as a peer dependency, so a site moves the two together.

The page holds a `vf-desktop` with a `vf-menu-bar` and a `vf-icon-field`. The bar's first `vf-menu` is the system menu. The site supplies its items above the rule, About… for example.

```html
<vf-desktop bezel="10">
  <vf-menu-bar>
    <vf-menu id="menu-apple" label="Apple">
      <vf-menu-item value="about">About My Site…</vf-menu-item>
      <vf-separator></vf-separator>
    </vf-menu>
  </vf-menu-bar>
  <vf-icon-field label="Desktop" fill-width fill-height></vf-icon-field>
</vf-desktop>
```

```ts
import 'vintage-frames'
import { createShell, finder, indexedDbStorage, localStorageState } from 'system-online-sdk'

const shell = createShell(document.querySelector('vf-desktop')!, {
  apps: [finder({ storage: indexedDbStorage('my-site'), art }), notePad],
  fit: 'viewport',
  state: localStorageState('my-site:desktop'),
})

// The site handles its own items in the system menu.
document.getElementById('menu-apple')!.addEventListener('vf-menu-select', (e) => {
  if ((e as CustomEvent<{ value: string }>).detail.value === 'about') openAbout()
})

if (import.meta.hot) import.meta.hot.dispose(() => shell.dispose())
```

- Import `vintage-frames` before the SDK.
- Page CSS is the site's to write. A `fit: 'viewport'` desktop needs `margin: 0` and `overflow: hidden` on `html` and `body` ([SHELL.md § Setup](./SHELL.md#setup)).
- The About box belongs to the site, not to the shell.

### 2. Applications

Write each application as [Writing an application](#writing-an-application) says, and pass them in `apps`. Keep each of the site's own in a directory under `src/apps/`. An application from another repo comes in from its app file (step 6).

- `services` hands every application the site's own objects ([SHELL.md § Setup](./SHELL.md#setup)). An application from an app file uses none, so that it runs on any site.

### 3. Files

The stock Finder shows the catalog. The first application with a catalog is the Finder.

```ts
finder({
  storage: indexedDbStorage('my-site'),
  art: { folder, trash, trashFull, document, disk, caution, trashMark },
  volumes: { disk: 'Macintosh HD', trash: 'Trash' },
  system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items' },
  seed: (catalog) => restoreDefaults(catalog, DEFAULTS),
  dialogs,
  extend(finder, ctx) {
    // Restore Default Files, backups, the site's dialogs for the Finder's alerts
  },
})
```

- Each document type is a kind, which its application registers: `kinds: { note: { art, open, copy, onRemove, claim, export } }`. Small data goes in `item.data`. A large payload goes in the application's own store, keyed by the item's id.
- The seed runs once per storage. Defaults added in a later release never reach an existing visitor through it. Store the missing defaults once at boot, and offer Special → Restore Default Files for anything the visitor removes later. Keep a pure `missingDefaults(state, defaults)` that counts a trashed or renamed default as present, and a `restoreDefaults(catalog, defaults)` that stores whatever it finds missing, as SystemOnline and Sprite Machine do.
- Modules that work on the catalog import from `system-online-sdk/pure`, so their tests run under Node.

### 4. The Apple menu and startup

With `system` set, the catalog keeps a System Folder on the startup disk, or on the desktop when there's no disk. The System Folder holds Apple Menu Items and Startup Items. The Apple menu lists what Apple Menu Items holds, below the site's own items. What Startup Items holds opens at every boot.

To put an application in the Apple menu, give its icon a place in the catalog and file an alias in Apple Menu Items:

```ts
import { ALIAS_KIND, APP_KIND, APPLE_MENU_ITEMS, FOLDER, SYSTEM_FOLDER } from 'system-online-sdk/pure'

const panels = await catalog.create({ name: 'Control Panels', parent: SYSTEM_FOLDER })
const patterns = await catalog.create({
  kind: APP_KIND,
  name: 'Desktop Patterns',
  parent: panels!.id,
  data: { app: 'desktop-patterns' },
})

// Apple ▸ Desktop Patterns
await catalog.create({
  kind: ALIAS_KIND,
  name: 'Desktop Patterns',
  parent: APPLE_MENU_ITEMS,
  data: { original: patterns!.id, kind: APP_KIND },
})

// or Apple ▸ Control Panels ▸ Desktop Patterns
await catalog.create({
  kind: ALIAS_KIND,
  name: 'Control Panels',
  parent: APPLE_MENU_ITEMS,
  data: { original: panels!.id, kind: FOLDER },
})
```

- A folder in Apple Menu Items, or an alias of one, is a submenu listing its contents, nested up to five levels.
- Choosing an entry opens it as a double-click would, through the application's `open`.
- The menu updates as the folders change, so an alias a visitor files there becomes an entry.
- A storage made before `system` was set gets the System Folder and its two folders at once, empty. The site fills them once, as in step 3.
- A site without a System Folder can still list an application among its own items in the system menu, and open it with `shell.apps[id].open({})` when the item is chosen.

### 5. Fonts

A site gives its system the fonts it serves, and its System Folder a Fonts folder. A font suitcase in Fonts installs its family, and every application, one from an app file included, sets type in the installed families through `ctx.fonts` ([SHELL.md § Fonts](./SHELL.md#fonts)).

```ts
import { FONTS, FONT_KIND } from 'system-online-sdk/pure'
import { FONT_FAMILIES } from './fonts.ts'

const shell = createShell(document.querySelector('vf-desktop')!, {
  apps: [
    finder({
      storage: indexedDbStorage('my-site'),
      art: { ...art, fonts: fontsFolderArt, suitcase: suitcaseArt },
      volumes: { disk: 'Macintosh HD', trash: 'Trash' },
      system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items', fonts: 'Fonts' },
      seed: async (catalog) => {
        for (const { name } of FONT_FAMILIES) {
          await catalog.create({ kind: FONT_KIND, name, parent: FONTS, data: { family: name } })
        }
      },
    }),
    fontViewer(),
  ],
  fonts: FONT_FAMILIES,
})
```

- Serve each strike as a woff2, and list each family with its strikes: each strike's size, the font-size that draws one design px per system px, its line pitch, its URL, its bytes and every character it carries. Nothing loads at boot: a strike loads when an application asks for it.
- Build the list in a module of its own, `src/fonts.ts` say, from the site's own manifest of its collection. Its types come from `system-online-sdk/pure`, so its tests run under Node.
- File a suitcase of each family in Fonts in the seed, and keep the suitcases in `missingDefaults` and Restore Default Files like any default (step 3). A suitcase of a family the site doesn't serve installs nothing.
- A storage seeded before `fonts` was named gets the Fonts folder at once, empty, so file the suitcases there once, as in step 4. A suitcase the site already stored elsewhere moves with `catalog.move`, which keeps its id, so its open window and its aliases follow.
- Without `fonts` in `system`, every family the site serves is installed. A site that gives no fonts and names no Fonts folder sees no change.
- An application opens a suitcase by saying it does (`opens: ['font']`). With none in `apps`, opening one raises the Finder's `no-application` alert, which `alertWith` can answer.

### 6. Applications from app files

An application built in its own repo ([An application in its own repo](#an-application-in-its-own-repo)) ships as an app file, one PNG. A site builds it in, or installs it while the desktop runs.

Built in, it's one of `apps`:

```ts
// vite.config.ts
import { appFiles } from 'system-online-sdk/build'

plugins: [appFiles()]

// main.ts
import meteors from '../apps/Meteors.png?app'

createShell(desktop, { apps: [finder({ storage, art }), meteors()] })
```

Installed, it's a file the desktop keeps, and a new version is a new file, with no deploy of the site's code:

```ts
// main.ts
import meteors from '../apps/Meteors.png?app-file'

const SITE_KEY = '…' // the public key the site's files are signed with (APP-FILES.md § Signing)

createShell(desktop, {
  apps: [
    finder({
      storage,
      art,
      // A new desktop installs its defaults: files from the first.
      seed: async (catalog, install) => {
        await install(await (await fetch(meteors)).arrayBuffer())
      },
    }),
  ],
  trust: { keys: [SITE_KEY], otherwise: 'ask' },
})
```

- Add `system-online-sdk/build/client` to tsconfig's `types` for the imports' types.
- The site's build fails on an app file its SDK doesn't run, and names it.
- Changes to the application are made in its repo, and the new file is copied into the site.
- An app file a visitor drops on the desktop installs too. With `trust`, a file the site's keys didn't sign is asked about first, in the Finder's `untrusted-application` alert, which the site answers with its own through `alertWith` ([SHELL.md § Trust](./SHELL.md#trust)). Without it, any app file installs.
- The site answers the Finder's other new alerts the same way: `replace-application`, `application-unavailable` and `install-refused` ([SHELL.md § The Finder's alerts](./SHELL.md#the-finders-alerts)).
- An application built in keeps no file, carries no signature and is never uninstalled. One installed keeps its file with the catalog, wherever the Finder's storage keeps items, so under `memoryStorage()` an install lasts the page.
- A site with a Content-Security-Policy allows `blob:` in `script-src`, where installed code loads from ([SHELL.md § Loading the code](./SHELL.md#loading-the-code)).
- A site that hands its applications an index of app files to install from, a store's, sets `index` on `createShell` from a build constant ([SHELL.md § The index](./SHELL.md#the-index)).

## Writing an application

An application is a definition, `defineApp({ … })`: its menus, dialogs and windows as markup, the kinds of document it opens, and an `init(ctx)` that sets them up. The same definition runs as a site's own and from an app file. [SHELL.md § Applications](./SHELL.md#applications) has its fields and its context, with an example, and the sections after it the dialogs, the windows and the catalog.

Give each application a directory of its own:

| File | |
| --- | --- |
| `index.ts` | `defineApp({ id, name, icon, menus, dialogs, windows, kinds, init })` |
| `menus.html` | Its `vf-menu`s, each with a `data-menu` name. |
| `dialogs.html` | Its dialogs, each with a `data-dialog` name, shown with `ctx.ask()`. |
| `windows.html` | Its windows, each with a `data-window` name, copied with `ctx.window()`. |
| `windows.ts` | What its windows hold and what their close boxes do. |
| `layout.ts` | Where its windows go and their zoomed boxes. Pure. |

`index.ts` imports the markup as `?raw` strings.

- `init(ctx)` returns the application's actions. Return `open({ item, from })` so that the application can be opened from outside: from its icon, an alias, the Apple menu or Startup Items, and to reopen its windows after a reload. Without `open`, none of these do anything.
- Give it a 32×32 `icon`, which its icon and its aliases show. Without one they show no art.
- Its `id` never changes: saved icons, windows and sessions name it. Name its kinds after it.
- Browsers keep ⌘N, ⌘W and ⌘Q, so use ⌃N, ⌃W and ⌃Q.
- An application doesn't add items to the system menu. A site puts one in the Apple menu by filing an alias of it in Apple Menu Items ([step 4](#4-the-apple-menu-and-startup)).
- Fonts are the system's. An application sets type in the families the site serves through `ctx.fonts`, and carries no strikes of its own: `installed()` and `onChange()` for a Font menu, and `load()` for a strike to set on its own elements ([SHELL.md § Fonts](./SHELL.md#fonts)). One that opens font suitcases says `opens: ['font']`; the kind is the shell's.
- An application that holds user data it hasn't saved, an edited document say, registers `ctx.beforeQuit`: whether something is unsaved, and its own offer to save it. A restart asks the offer, only while something is unsaved, and leaving the page asks first then ([SHELL.md § Asking before it quits](./SHELL.md#asking-before-it-quits)). Without it, a restart asks its windows' close handlers, as a Quit does.
- Modules that only compute, `layout.ts` say, import from `system-online-sdk/pure`, so their tests run under Node.
- The shell draws no windows or dialogs of its own: every window and alert on screen belongs to an application. When an application needs something the shell doesn't do, change the SDK rather than working around it: ask for it as `feature-requests/<name>.md` in this repo. An ask about an element goes to vintage-frames.

## An application in its own repo

An application that isn't one site's own lives in a repo of its own and ships as an app file: one PNG, whose picture is the application's box and whose chunks carry its manifest and its code ([APP-FILES.md](./APP-FILES.md)). A site builds it in from the file ([step 6](#6-applications-from-app-files)). [meteors-app](https://github.com/aportilla/meteors-app) is one. The application itself is written as [Writing an application](#writing-an-application) says; this section is what a repo of its own adds.

### Setup

```sh
npm install -D system-online-sdk vintage-frames vite
```

Both packages are dev dependencies: the app file carries neither, and the page that runs it brings its own. vintage-frames goes at the range the SDK's peer dependency names.

```ts
// src/app.ts: the manifest's fields, one source for each
export const APP = {
  id: 'meteors',
  name: 'Meteors',
  version: '0.2.0',
  author: 'Adam Portilla',
  description: 'An Asteroids-style game on a 320 × 240 1-bit screen.',
} as const
```

```ts
// src/index.ts: the entry
import { defineApp } from 'system-online-sdk'
import menus from './menus.html?raw'
import icon from './art/meteors.png'
import { APP } from './app.ts'

export function meteors() {
  return defineApp({ id: APP.id, name: APP.name, icon, menus, init(ctx) { … } })
}

// The app file's code exports its factory by default.
export default meteors
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { appFile } from 'system-online-sdk/build'
import { APP } from './src/app.ts'

export default defineConfig({
  plugins: [appFile({ app: APP, entry: 'src/index.ts', icon: 'src/art/meteors.png' })],
})
```

- The entry's default export is the application's factory, a function that returns its definition. A site calls it to put the application in `apps`: `meteors()`.
- The definition and `appFile()` both read `APP`, so the manifest and the application can't drift.
- The code imports `vintage-frames`, `system-online-sdk`, `system-online-sdk/pure` and its own files, and nothing else. Art is imported, so the build inlines it. The build checks these and the other rules in [APP-FILES.md § The rules an application keeps](./APP-FILES.md#the-rules-an-application-keeps).
- tsconfig's `types` takes `vite/client`, for the art and `?raw` imports.

### A desktop to try it on

`npm run dev` serves a desktop of the repo's own: the Finder with the application's icon on it, and the application from its source. It never goes into the app file, since `appFile()` changes `npm run build` alone.

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      html,
      body {
        margin: 0;
        overflow: hidden;
        background: #000;
      }
    </style>
    <script type="module" src="/dev/main.ts"></script>
  </head>
  <body>
    <vf-desktop bezel="10">
      <vf-menu-bar>
        <vf-menu label="Apple"></vf-menu>
      </vf-menu-bar>
      <vf-icon-field label="Desktop" fill-width fill-height></vf-icon-field>
    </vf-desktop>
  </body>
</html>
```

```ts
// dev/main.ts
import 'vintage-frames'
import { APP_KIND, createShell, finder, indexedDbStorage, localStorageState, memoryStorage } from 'system-online-sdk'
import { APP } from '../src/app.ts'
import { meteors } from '../src/index.ts'
import folder from './art/folder.png'
import trash from './art/trash.png'
import trashFull from './art/trash-full.png'
import documentArt from './art/document.png'

// ?save=1 keeps the catalog and the session across a reload.
const save = new URLSearchParams(location.search).get('save') === '1'

const shell = createShell(document.querySelector('vf-desktop')!, {
  apps: [
    finder({
      storage: save ? indexedDbStorage('meteors-app') : memoryStorage(),
      art: { folder, trash, trashFull, document: documentArt },
      seed: async (catalog) => {
        await catalog.create({ kind: APP_KIND, name: APP.name, data: { app: APP.id } })
      },
    }),
    meteors(),
  ],
  fit: 'viewport',
  state: save ? localStorageState('meteors-app:desktop') : null,
})

if (import.meta.hot) import.meta.hot.dispose(() => shell.dispose())
```

- The Finder needs 32×32 art for `folder`, `trash`, `trashFull` and `document` ([SHELL.md § The Finder](./SHELL.md#the-finder)). Borrow a site's, and keep it in `dev/`.
- The seed puts the application's icon on the desktop. Open it to try the application.
- With the catalog in memory and no session, a reload starts over, and the application runs as it does on a site that saves nothing. `?save=1` keeps both, for trying what a reload reopens.

An application that sets type in the system's fonts, or opens font suitcases, gives its dev desktop a few fonts as a site does ([step 5](#5-fonts)): a handful of families borrowed from a site into `dev/fonts/`, as `dev/art/` borrows its art, a Fonts folder, and a seed that files a suitcase of each there.

```ts
// dev/fonts.ts
import type { FontFamily } from 'system-online-sdk/pure'
import geneva9 from './fonts/Geneva-9.woff2'

export const DEV_FONTS: FontFamily[] = [
  { name: 'Geneva', strikes: [{ size: 9, line: 12, pitch: 12, url: geneva9, bytes: 3412, chars: 'ABC…' }] },
]
```

```ts
// dev/main.ts
finder({
  // …
  system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items', fonts: 'Fonts' },
  seed: async (catalog) => {
    for (const { name } of DEV_FONTS) {
      await catalog.create({ kind: FONT_KIND, name, parent: FONTS, data: { family: name } })
    }
  },
}),
// … and beside `apps`:
fonts: DEV_FONTS,
```

- To try a suitcase whose family the site doesn't serve, seed one naming a family `DEV_FONTS` leaves out.
- The fonts stay in `dev/`, so the app file carries none.

### The release

- `npm run build` writes `dist/<Name>.png`. Its `requires` is the repo's `system-online-sdk` range, a caret range the installed SDK has to meet, and its `api` the SDK's `APP_API`.
- Read a built file back with the SDK's reader, from the repo's root:

  ```sh
  node --input-type=module -e "import { readFileSync } from 'node:fs'; import { inspectAppFile } from 'system-online-sdk/pure'; const read = await inspectAppFile(new Uint8Array(readFileSync('dist/Meteors.png'))); console.log(typeof read === 'string' ? read : { ...read.manifest, icon: '…' })"
  ```

  It prints the manifest, or why the file isn't an app file.
- Give each release a new `version` in `src/app.ts`. An index puts an application's builds in order by it.
- The release is the file. Copy it into each site's `apps/`, or set `copyTo` to write it there on every build. Nothing goes to npm.
- A site runs the file when its SDK runs the file's `api`. When it doesn't, the site's build refuses the file and names the SDK to build it on, and a desktop that installed it skips it at the boot, saying why.
- A file published to an index is signed there, after the build, with `signAppFile` and a key that never leaves the machine that signs ([APP-FILES.md § Signing](./APP-FILES.md#signing)). A site that holds the key installs it without asking.

## A tool that reads app files

A tool that reads app files, an index or a store say, needs `system-online-sdk/pure` alone. It runs under Node and touches no DOM.

```sh
npm install -D system-online-sdk
```

npm installs vintage-frames with it, as the SDK's peer, though the pure entry imports nothing of it.

```ts
import { readFile } from 'node:fs/promises'
import { appRuns, compareVersions, inspectAppFile } from 'system-online-sdk/pure'

const read = await inspectAppFile(new Uint8Array(await readFile('apps/Meteors.png')))
if (typeof read === 'string') throw new Error(`Meteors.png is not an app file: ${read}`)
const { manifest } = read // format, id, name, version, requires, api, author, description, icon

const runs = appRuns(manifest) // whether this SDK runs it
const order = ['0.10.0', '0.2.0'].sort(compareVersions) // ['0.2.0', '0.10.0']
```

- `inspectAppFile()` says why bytes aren't an app file, as the end of a sentence for people. `readAppFile()` gives `null` instead.
- `checkSignature()` says whether a file is signed, by which key, and whether the signature holds; `judgeSignature()` what a site's trust says of it. An index's CI checks every file this way and never signs; signing is `system-online-sdk/build`'s `signAppFile()` ([APP-FILES.md § Signing](./APP-FILES.md#signing)).
- Whether a site runs a build turns on its `api` alone: a site runs `APP_API_OLDEST` to `APP_API` of its own SDK, and `appRuns()` checks a manifest against the SDK installed beside the tool. `requires` names the SDK range the build was made with.
- A test makes its app files with `system-online-sdk/build`: `packApp({ manifest, icon, code })` writes a whole file, and `writeAppFile(box, manifest, code)` writes the chunks onto any PNG. Both throw on a manifest the reader would refuse, so neither writes a broken one. That entry imports Vite's types alone, so a tool needs no Vite.
- [APP-FILES.md § Pieces on their own](./APP-FILES.md#pieces-on-their-own) lists every function.

## Moving to a new release

1. **Read what changed.** Read the SDK's log since your version, and vintage-frames' if the SDK moved its range. The diff of the SDK's `app-api.json` between two tags lists everything an application could use that changed or went away, the elements included: `git -C ../system-online-sdk diff v0.1.0 v0.2.0 -- app-api.json`. A `-` line is one of them.
2. **Update app files first.** When the new SDK raises `APP_API_OLDEST`, the site's build refuses every app file built below it. Move each application's repo to the new SDK, build it, and copy its file in before moving the site.
3. **Then the site.** Move `system-online-sdk` and `vintage-frames` together, to the vintage-frames range the SDK's peer dependency names. Fix what the logs name, run the gates, and check the result in a browser.

A tool that reads app files moves its `system-online-sdk` range too, so that it reads what the new SDK writes.

Before 1.0, any minor release can break the shell. The shell stays experimental until sprite-machine runs on all of it.

## Moving onto the SDK

The shell and app files left vintage-frames for this repo on 2026-10-10. This section, and every repo's entry in it, is removed once each repo is on the SDK.

### In order

1. **vintage-frames 0.20.0** is published: the elements alone, without `vintage-frames/shell` and `vintage-frames/build`. Done, 2026-10-11.
2. **system-online-sdk 0.1.0** is published. Done, 2026-10-11.
3. **meteors-app** moves to the SDK and builds Meteors 0.2.0. Done, 2026-10-11.
4. **SystemOnline** moves, with that Meteors.png. Done, 2026-10-11.
5. **sprite-machine** moves, any time now.
6. **system-online-app-index** moves, any time after step 3. Done, 2026-10-17, with Meteors 0.3.0 and the other three applications' current builds.

### What changes in every repo

| Before | After |
| --- | --- |
| `vintage-frames/shell` | `system-online-sdk` |
| `vintage-frames/shell/pure` | `system-online-sdk/pure` |
| `vintage-frames/build` | `system-online-sdk/build` |
| `vintage-frames/build/client` | `system-online-sdk/build/client` |

- `package.json`: `vintage-frames` to `^0.20.0`, and `system-online-sdk` at `^0.2.0` beside it, in the same block. Then `npm install`. (meteors-app took `^0.1.0`, before system fonts.)
- Every import and JSDoc type of the old entries. From the repo's root:

  ```sh
  rg -l -g '!*.md' 'vintage-frames/(shell|build)' \
    | xargs sed -i '' -e 's#vintage-frames/shell/pure#system-online-sdk/pure#g' \
                      -e 's#vintage-frames/shell#system-online-sdk#g' \
                      -e 's#vintage-frames/build#system-online-sdk/build#g'
  ```

  It rewrites every file but Markdown that names an old entry, configs and comments included, and skips what `.gitignore` lists, `node_modules` and `dist` among them. `sed -i ''` is macOS's; GNU sed takes `-i` alone. Read the diff before committing.
- The Markdown is done by hand, since a plan or a record keeps its history as written. In the repo's CLAUDE.md, README and current docs, the shell is `system-online-sdk` now, and its guides are this repo's docs: `../system-online-sdk/docs/` in a checkout beside it, or [on GitHub](https://github.com/aportilla/system-online-sdk/tree/main/docs). An ask about the shell or app files goes to this repo's `feature-requests/`; an ask about an element still goes to vintage-frames.

What changes for applications:

- **The app API is at level 3, and the oldest level the SDK runs is 3.** Every app file built before the SDK imports `vintage-frames/shell`, which no longer exists, so every one is built again.
- **App files are format 2.** Their chunks are `system-online.app` and `system-online.code`, `requires` names the `system-online-sdk` range, and `api` is required. A format 1 file is refused, with a reason that says to build it again.
- `appRuns(manifest)` reads `api` alone.

### meteors-app

On vintage-frames `^0.17.0`. Its code needs nothing but the renames: on the SDK it typechecks, passes `npm test`, builds and runs on its dev desktop as before.

1. **The packages**: in `devDependencies`, `vintage-frames` to `^0.20.0`, and `system-online-sdk` `^0.1.0` beside it. `npm install`.
2. **The renames** ([What changes in every repo](#what-changes-in-every-repo)). They touch `src/index.ts`, `src/screen.ts`, `dev/main.ts` and `vite.config.ts`.
3. **`src/app.ts`**: `version` to `0.2.0`. CLAUDE.md's rule takes a minor when the range moves, and `requires` now comes from the `system-online-sdk` range. Add a `description`, the README's first line: `'An Asteroids-style game on a 320 × 240 1-bit screen.'`
4. **The gates**: `npm run typecheck`, `npm test` and `npm run build`. Then read `dist/Meteors.png` back ([The release](#the-release)): format 2, version 0.2.0, `requires` `^0.1.0`, `api` 3.
5. **Leave SystemOnline's `apps/` alone.** Its build, still on vintage-frames, can't read a format 2 file, so the copy waits for its own move ([SystemOnline](#systemonline), step 3).
6. **Docs and comments**: `rg -n 'kit|vintage-frames' CLAUDE.md README.md index.html dev vite.config.ts` finds each mention of the kit's shell, its build and its docs.
   - `CLAUDE.md`: the shell and `appFile()`, with the frame and the packer, are system-online-sdk's, and its `docs/APP-FILES.md` is the format's guide. An app file imports `vintage-frames`, `system-online-sdk` and `system-online-sdk/pure`; a module under test imports nothing of either package but `system-online-sdk/pure`. `requires` comes from the `system-online-sdk` dev dependency's range, and the rule for each kit minor becomes the rule for each SDK minor, which also moves vintage-frames to the range the SDK's peer names. An ask about the shell or app files goes to system-online-sdk's `feature-requests/`, and one about an element to vintage-frames'.
   - `README.md`: Meteors is built on system-online-sdk and vintage-frames. The dev desktop's Finder, `appFile()` and the packer are the SDK's, and its `docs/APP-FILES.md` is the format's guide.
   - The comments in `index.html`, `dev/main.ts` and `vite.config.ts` that give the shell, the Finder or the build to the kit: they are the SDK's.
   - `docs/meteors-plan.md` is the plan the game was built from. Leave it as written.
7. **Check in a browser**, on the dev desktop (`npm run dev`): Meteors opens from its icon, a game plays, ⌃W closes the window into the icon, and with `?save=1` a reload reopens it.

### SystemOnline

On vintage-frames `^0.17.0`. Beside the SDK, it takes everything vintage-frames added in 0.17.1 to 0.19.1:

- **0.17.1 to 0.18.1** added the store helpers (`compareVersions`, `inspectAppFile`, `description`, `BOX_SCALE`), stricter version checks in app files, and the app API level.
- **0.19.0** added the System Folder, aliases and Make Alias. It removed `ctx.systemItem` and `ctx.systemMenu`.
- **0.19.1** added folder aliases, and submenus in every `vf-menu` and in the Apple menu.

From 0.2.0 the shell owns the `font` kind ([SHELL.md § Fonts](./SHELL.md#fonts)), which SystemOnline's built-in Font Viewer registers. The shell leaves the viewer's kind out and says so in the console, and a suitcase opens nothing until an application says it opens suitcases. SystemOnline's own request, `feature-requests/font-viewer-app-file.md`, gives its system its fonts and takes the Font Viewer's app file in the same change as these steps.

Steps, in order:

1. **The packages**: in `dependencies`, `vintage-frames` to `^0.20.0`, and `system-online-sdk` `^0.2.0` beside it. `npm install`.
2. **The renames**, over `src/`, `vite.config.ts` (`appFiles`), `tsconfig.json` (`system-online-sdk/build/client`) and the comment in `index.html`.
3. **Meteors**: copy meteors-app's new `dist/Meteors.png`, Meteors 0.2.0, to `apps/`. The old file is format 1, and the build refuses it.
4. **Desktop Patterns**, in `src/apps/desktop-patterns/index.ts`:
   - Remove the `ctx.systemItem(...)` call.
   - Return `{ open: () => open() }` from `init`, so its icon and its alias open the panel.
   - Give it a 32×32 `icon`. The site has to draw this art.
   - Its header comment, and the comment over the Apple menu in `index.html`, say applications install their own items. Update both: the items now come from Apple Menu Items.
5. **The Finder**, in `src/apps/finder/index.ts`:
   - Add `system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items' }`.
   - Add `art.systemFolder` (a folder marked with a small Macintosh), `art.appleMenuItems` and `art.startupItems`. Any of them left out shows the folder art.
6. **The defaults**, in `src/state/defaults.ts`:
   - Add a Control Panels folder in the System Folder, with Desktop Patterns' icon inside.
   - Add an alias in Apple Menu Items. Alias the Control Panels folder for Apple ▸ Control Panels ▸ Desktop Patterns, or alias Desktop Patterns itself for Apple ▸ Desktop Patterns. The first is how System 7.5 did it, and it has room for more control panels.
   - Leave Startup Items empty.
   - Cover all of these in `missingDefaults` and Restore Default Files, with a trashed one counting as present.
7. **Existing desktops.** The seed doesn't run again, so a returning visitor gets an empty System Folder and an Apple menu with only About in it. At the first boot after the move, store the System Folder defaults once: after `shell.ready`, behind a key in the session's `extra`, storing only what `missingDefaults` reports missing.
8. **Backups**, in `src/apps/finder/backup.ts` and `src/state/backup.ts`:
   - `libraryCount` leaves out the volumes with `isVolume`. The System Folder and its folders are now listed items too, so switch to `isKept`, which also leaves them out.
   - The backup walks every folder on Macintosh HD, so it now reaches the System Folder, a folder the catalog keeps (`isKept`). Check what the backup writes for it and what Restore does with that.
   - The backup carries folders, texts and fonts, not aliases. Replace puts back the application icons (`initBackup`'s `apps`) but not the System Folder defaults. Decide whether it should handle both.
9. **Docs**:
   - `CLAUDE.md` and `README.md`: the desktop runs on `system-online-sdk`, whose guide is its docs/SHELL.md; the pure modules import `system-online-sdk/pure`; `vite.config.ts` imports `system-online-sdk/build`.
   - `docs/SPEC.md` §2, the Apple menu: About SystemOnline…, a rule, then what Apple Menu Items holds by name, with a folder shown as a submenu. Also fix the clause that puts a control panel in Apple Menu Items: control panels lived in the Control Panels folder.
   - `docs/kit-asks.md`: store-helpers, system-folder and folder-aliases-and-submenus have shipped. Do what each entry lists, including the app index's changes, then strike it. Their request docs were deleted from vintage-frames; this section holds what was left of them. New asks about the shell go to this repo's `feature-requests/`.
   - `docs/app-store-plan.md`: the store's kit asks are this SDK's now (runtime installs, signatures). App files are format 2 at level 3, and `requires` names the SDK range. App Store… becomes an alias in Apple Menu Items, so the `ctx.systemItem` stopgap goes. The store chooses a build with `appRuns(manifest)` (§3.2), and the boot skips an application by the same test (§3.5). The kit-bump drill is needed only for an SDK release that raises `APP_API_OLDEST`.
   - `docs/app-packages-plan.md`: its record names `vintage-frames/build` and `vintage-frames/shell/pure`. Leave the history as written, with a line at the top that both moved to system-online-sdk.
10. **Check in a browser**:
    - The Apple menu and its submenu, both holding the button down and clicking.
    - Desktop Patterns opening from its alias and from its icon.
    - An alias's name in italics, and File → Make Alias (⌘M).
    - Meteors opening from its icon.
    - A desktop saved before the move, booted after it, gets its Apple menu entry back once.

### sprite-machine

On vintage-frames `^0.16.2`. Beside the SDK, it takes:

- **0.17.0** added app files, and made Vite an optional peer. Nothing to change.
- **0.17.2 and 0.18.0**: a dialog shown again right after it closes now stays open, and `ctx.ask()` gets its answer. Nothing to change.
- **0.19.0** removed `ctx.systemItem`, which Desktop Patterns calls. The Finder's File menu gains Make Alias (⌘M).
- **0.19.1**: a menu now tracks the pointer while it's open, whether or not the button is down, and menus can nest.
- **system-online-sdk 0.2.0** added the system's fonts. Nothing to change: a site that gives no fonts and names no Fonts folder sees none, and its kinds, `sprite` and `text`, aren't the shell's.
- **system-online-sdk 0.3.1** added `ctx.beforeQuit` ([SHELL.md § Asking before it quits](./SHELL.md#asking-before-it-quits)). The Sprite Editor registers it in place of the `beforeunload` in `src/main.js`, `unsaved` its `workspace.anyDirty()` and `save` its Quit, `windows.closeAll(SPRITE_EDITOR)`, whose close handlers offer to save each edited document. Leaving the page asks as before, and once the editor ships in an app file, a restart offers to save first. It takes `^0.3.1` in step 1.

Steps, in order:

1. **The packages**: in `dependencies`, `vintage-frames` to `^0.20.0`, and `system-online-sdk` `^0.2.0` beside it. `npm install`.
2. **The renames**, over `src/`, `test/` and the comment in `index.html`. The JSDoc types (`import('vintage-frames/shell').AppContext`) rename with them.
3. **Desktop Patterns**, in `src/apps/desktop-patterns/index.js`: remove the `ctx.systemItem(...)` call and return `{ open: () => open() }` from `init`. Then choose one of these:
   - **An item of the site's own** (recommended, since it adds no System Folder to the desktop). In `index.html`, add `<vf-menu-item value="desktop-patterns">Desktop Patterns</vf-menu-item>` after the separator in `#menu-app`. In `main.js`, when that menu fires `vf-menu-select` with that value, call `shell.apps['desktop-patterns']?.open({})`. Ignore the pick while a modal dialog is open (`document.querySelector('vf-dialog[open]')`), as `ctx.systemItem` did.
   - **The System Folder**: add `system` on the Finder, then Desktop Patterns' icon and an alias in Apple Menu Items, as SystemOnline does. Sprite Machine has no startup disk, so the System Folder sits on the desktop. Existing profiles need the defaults stored once.
4. **Comments**: the header of `src/apps/desktop-patterns/index.js` and the comment over `#menu-app` in `index.html` say Desktop Patterns adds its own item. Update both.
5. **Make Alias**: the File menu now ends with Make Alias. If Sprite Machine doesn't want aliases, pass `commands: { 'make-alias': false }` to the Finder. If it keeps them, note that its backup (`src/state/backup.js`) carries folders, sprites and texts, not aliases, and decide whether it should carry them.
6. **Docs**: `CLAUDE.md` and `docs/SPEC.md` name `vintage-frames/shell` and `vintage-frames/shell/pure` as the shell's entries; they are `system-online-sdk` and `system-online-sdk/pure`, and the shell's guide is this repo's docs/SHELL.md. `docs/shell-plan.md` is history; leave it as written.
7. **Check in a browser**:
   - The Sprite Machine menu opens Desktop Patterns.
   - Each application's menus work both holding the button down and clicking.
   - New Sprite still comes right after Open.

### system-online-app-index

On vintage-frames `^0.17.0`, for the reader and, in its tests, the writer.

1. **The packages**: in `devDependencies`, `system-online-sdk` `^0.2.0` in place of `vintage-frames`. npm installs vintage-frames with it, as the SDK's peer. `npm install`.
2. **The renames**: `scripts/listing.ts`, `scripts/add.ts`, `scripts/versions.ts` and `test/listing.test.mjs`.
3. **The store helpers** (kit-asks.md's store-helpers entry): drop `scripts/versions.ts`'s copy of the comparison for `compareVersions`, say why a file is refused with `inspectAppFile`, and list each version's description.
4. **Levels**: list each build's `api` beside `requires`, and keep a build for each level, not each kit minor. The check that the index holds one, `npm run check-index`, is SystemOnline's, in the App Store plan's step 6.
5. **Format 1 files no longer read**: the build refuses Meteors 0.1.0's file, saying to build it again. Take it out, and add Meteors 0.2.0 from meteors-app.
6. `CLAUDE.md` and `README.md`: the format's guide is this repo's docs/APP-FILES.md.
