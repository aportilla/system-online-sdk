# Using the SDK

This guide covers building a site on `system-online-sdk`, building an application in a repo of its own, and moving either to a new release. [SHELL.md](./SHELL.md) documents every option and call, and [APP-FILES.md](./APP-FILES.md) the app file; this guide gives the order to do things in. The last section is the steps the existing repos take to move onto the SDK.

## A site in five steps

### 1. The page

```sh
npm install vintage-frames system-online-sdk
```

vintage-frames draws the elements; the SDK runs applications over them. The SDK names the vintage-frames range it takes as a peer dependency, so a site moves the two together.

The page holds a `vf-desktop` with a `vf-menu-bar` and a `vf-icon-field`. The bar's first `vf-menu` is the system menu. The site supplies its items above the rule, About… for example.

```html
<vf-desktop id="desktop" bezel="10">
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

const shell = createShell(document.getElementById('desktop')!, {
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

Both sites give each application its own directory:

| File | |
| --- | --- |
| `index.ts` | `defineApp({ id, name, icon, menus, dialogs, windows, kinds, init })` |
| `menus.html` | Its `vf-menu`s, each with a `data-menu` name. |
| `dialogs.html` | Its dialogs, each with a `data-dialog` name, shown with `ctx.ask()`. |
| `windows.html` | Its windows, each with a `data-window` name, copied with `ctx.window()`. |
| `windows.ts` | What its windows hold and what their close boxes do. |
| `layout.ts` | Where its windows go and their zoomed boxes. Pure. |

- `init(ctx)` returns the application's actions. Return `open({ item, from })` so that the application can be opened from outside: from its icon, an alias, the Apple menu or Startup Items, and to reopen its windows after a reload. Without `open`, none of these do anything.
- Give it a 32×32 `icon`, which its icon and its aliases show. Without one they show no art.
- Browsers keep ⌘N, ⌘W and ⌘Q, so use ⌃N, ⌃W and ⌃Q.
- An application doesn't add items to the system menu. To put one in the Apple menu, file an alias of it in Apple Menu Items (step 4).
- The shell draws no windows or dialogs of its own: every window and alert on screen belongs to an application. When an application needs something the shell doesn't do, change the SDK rather than working around it in the site: ask for it as `feature-requests/<name>.md` in this repo. An ask about an element goes to vintage-frames.

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
- The seed runs once per storage. Defaults added in a later release never reach an existing visitor through it. Store the missing defaults once at boot, and offer Special → Restore Default Files for anything the visitor removes later. Both sites keep a pure `missingDefaults(state, defaults)` that counts a trashed or renamed default as present, and a `restoreDefaults(catalog, defaults)` that stores whatever it finds missing.
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

### 5. Applications from app files

An application built in its own repo (next section) ships as an app file, one PNG. A site builds it in:

```ts
// vite.config.ts
import { appFiles } from 'system-online-sdk/build'

plugins: [appFiles()]

// main.ts
import meteors from '../apps/Meteors.png?app'

createShell(desktop, { apps: [finder({ storage, art }), meteors()] })
```

- Add `system-online-sdk/build/client` to tsconfig's `types` for the import's types.
- The site's build fails on an app file its SDK doesn't run, and names it.
- Changes to the application are made in its repo, and the new file is copied into the site.

## An application in its own repo

```sh
npm install -D system-online-sdk vintage-frames vite
```

```ts
// src/app.ts: the manifest's fields, one source for each
export const APP = { id: 'meteors', name: 'Meteors', version: '0.1.1', author: 'Adam Portilla', description: '…' } as const

// vite.config.ts
import { defineConfig } from 'vite'
import { appFile } from 'system-online-sdk/build'
import { APP } from './src/app.ts'

export default defineConfig({
  plugins: [appFile({ app: APP, entry: 'src/index.ts', icon: 'src/art/meteors.png' })],
})
```

- `npm run build` writes `dist/<Name>.png`. Its `requires` is the repo's `system-online-sdk` range, and its `api` the SDK's level.
- The code imports `vintage-frames`, `system-online-sdk`, `system-online-sdk/pure` and its own files, and nothing else. The build checks that and the other rules in [APP-FILES.md § The rules an application keeps](./APP-FILES.md#the-rules-an-application-keeps).
- `npm run dev` can serve a desktop of the repo's own for trying the application, with the site's art if it borrows any. It never goes into the app file.
- The release is the file. Copy it into each site's `apps/`, or set `copyTo`.

## Moving to a new release

1. **Read what changed.** Read the SDK's log since your version, and vintage-frames' if the SDK moved its range. The diff of the SDK's `app-api.json` between two tags lists everything an application could use that changed or went away, the elements included: `git -C ../system-online-sdk diff v0.1.0 v0.2.0 -- app-api.json`. A `-` line is one of them.
2. **Update app files first.** When the new SDK raises `APP_API_OLDEST`, the site's build refuses every app file built below it. Move each application's repo to the new SDK, build it, and copy its file in before moving the site.
3. **Then the site.** Move `system-online-sdk` and `vintage-frames` together, to the vintage-frames range the SDK's peer dependency names. Fix what the logs name, run the gates, and check the result in a browser.

Before 1.0, any minor release can break the shell. The shell stays experimental until sprite-machine runs on all of it.

## Moving onto the SDK

The shell and app files left vintage-frames for this repo on 2026-10-10. This section, and every repo's entry in it, is removed once each repo is on the SDK.

### In order

1. **vintage-frames 0.20.0** is published: the elements alone, without `vintage-frames/shell` and `vintage-frames/build`.
2. **system-online-sdk 0.1.0** is published.
3. **meteors-app** moves to the SDK and builds Meteors 0.1.1.
4. **SystemOnline** moves, with that Meteors.png.
5. **sprite-machine** moves, any time after step 2.
6. **system-online-app-index** moves, any time after step 3.

### What changes in every repo

| Before | After |
| --- | --- |
| `vintage-frames/shell` | `system-online-sdk` |
| `vintage-frames/shell/pure` | `system-online-sdk/pure` |
| `vintage-frames/build` | `system-online-sdk/build` |
| `vintage-frames/build/client` | `system-online-sdk/build/client` |

- `package.json`: `vintage-frames` to `^0.20.0`, and `system-online-sdk` at `^0.1.0` beside it, in the same block. Then `npm install`.
- Every import and JSDoc type of the old entries. From the repo's root, run this over the folders that hold code, `src` and `test` here, and the config files that name an entry:

  ```sh
  rg -l 'vintage-frames/(shell|build)' src test vite.config.ts tsconfig.json index.html \
    | xargs sed -i '' -e 's#vintage-frames/shell/pure#system-online-sdk/pure#g' \
                      -e 's#vintage-frames/shell#system-online-sdk#g' \
                      -e 's#vintage-frames/build#system-online-sdk/build#g'
  ```

  It renames the entries in comments too. Read the diff before committing.
- The repo's CLAUDE.md, README and docs: the shell is `system-online-sdk` now, and its guide is this repo's docs/SHELL.md. An ask about the shell or app files goes to this repo's `feature-requests/`; an ask about an element still goes to vintage-frames.

What changes for applications:

- **The app API is at level 3, and the oldest level the SDK runs is 3.** Every app file built before the SDK imports `vintage-frames/shell`, which no longer exists, so every one is built again.
- **App files are format 2.** Their chunks are `system-online.app` and `system-online.code`, `requires` names the `system-online-sdk` range, and `api` is required. A format 1 file is refused, with a reason that says to build it again.
- `appRuns(manifest)` reads `api` alone.

### meteors-app

On vintage-frames `^0.17.0`.

1. `package.json`: `vintage-frames` to `^0.20.0`, and `system-online-sdk` `^0.1.0` beside it in `devDependencies`. `npm install`.
2. The renames: `src/index.ts`, `src/screen.ts`, `dev/main.ts` and `vite.config.ts`.
3. `src/app.ts`: `version` to `0.1.1`, and a `description`.
4. Run `npm run typecheck`, `npm test` and `npm run build`. `dist/Meteors.png` is format 2, with `requires: ^0.1.0` and `api: 3`. Copy it to SystemOnline's `apps/`.
5. `CLAUDE.md` and `README.md`: the shell and `appFile()` are system-online-sdk's, and `requires` comes from the `system-online-sdk` dev dependency's range. Asks about the shell or app files go to this repo's `feature-requests/`.
6. Check by eye on the dev desktop: the game runs, and its window opens and closes.

### SystemOnline

On vintage-frames `^0.17.0`. Beside the SDK, it takes everything vintage-frames added in 0.17.1 to 0.19.1:

- **0.17.1 to 0.18.1** added the store helpers (`compareVersions`, `inspectAppFile`, `description`, `BOX_SCALE`), stricter version checks in app files, and the app API level.
- **0.19.0** added the System Folder, aliases and Make Alias. It removed `ctx.systemItem` and `ctx.systemMenu`.
- **0.19.1** added folder aliases, and submenus in every `vf-menu` and in the Apple menu.

Steps, in order:

1. **The packages**: in `dependencies`, `vintage-frames` to `^0.20.0`, and `system-online-sdk` `^0.1.0` beside it. `npm install`.
2. **The renames**, over `src/`, `vite.config.ts` (`appFiles`), `tsconfig.json` (`system-online-sdk/build/client`) and the comment in `index.html`.
3. **Meteors**: copy meteors-app's new `dist/Meteors.png` to `apps/`. The old file is format 1, and the build refuses it.
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

Steps, in order:

1. **The packages**: in `dependencies`, `vintage-frames` to `^0.20.0`, and `system-online-sdk` `^0.1.0` beside it. `npm install`.
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

1. **The packages**: in `devDependencies`, `system-online-sdk` `^0.1.0` in place of `vintage-frames`. npm installs vintage-frames with it, as the SDK's peer. `npm install`.
2. **The renames**: `scripts/listing.ts`, `scripts/add.ts`, `scripts/versions.ts` and `test/listing.test.mjs`.
3. **The store helpers** (kit-asks.md's store-helpers entry): drop `scripts/versions.ts`'s copy of the comparison for `compareVersions`, say why a file is refused with `inspectAppFile`, and list each version's description.
4. **Levels**: list each build's `api` beside `requires`, and have `npm run check-index` ask for a build per level, not per kit minor.
5. **Format 1 files no longer read**: the build refuses Meteors 0.1.0's file, saying to build it again. Take it out, and add Meteors 0.1.1 from meteors-app.
6. `CLAUDE.md` and `README.md`: the format's guide is this repo's docs/APP-FILES.md.
