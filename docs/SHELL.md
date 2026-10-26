# The shell

`system-online-sdk` runs applications over one desktop: a window manager, a menu bar that shows the front application's menus, a catalog of what is where, a stock Finder that shows the catalog as icons, the fonts the site gives its system, and app files installed while it runs. It is plain modules over [vintage-frames](https://github.com/aportilla/vintage-frames)' elements. It registers no elements, writes no styles, ships no art or fonts and composes no UI: every window and dialog on screen is an application's or the page's. It reaches the kit only through `vintage-frames`' root exports, so the page imports `vintage-frames` first.

The shell is experimental. Its API may change in any minor release until sprite-machine runs on all of it.

[GUIDE.md](./GUIDE.md) gives the order to do things in: for a site, an application and a tool that reads app files, and for moving to a new release.

## Setup

```html
<vf-desktop bezel="10">
  <vf-menu-bar label="Finder">
    <vf-menu label="Apple">
      <vf-img slot="label" width="16" height="16"><img src="/art/apple.png" alt="" /></vf-img>
    </vf-menu>
  </vf-menu-bar>
  <vf-icon-field label="Desktop" fill-width fill-height>
    <vf-icon data-app="note-pad"></vf-icon>
    <template data-folder="Projects">
      <template data-folder="Archive"></template>
    </template>
  </vf-icon-field>
</vf-desktop>
```

```ts
import 'vintage-frames'
import { createShell, finder, memoryStorage } from 'system-online-sdk'

const shell = createShell(document.querySelector('vf-desktop')!, {
  apps: [
    finder({
      storage: memoryStorage(),
      seed: 'markup',
      art: {
        folder: '/art/folder.png',
        trash: '/art/trash.png',
        trashFull: '/art/trash-full.png',
        document: '/art/document.png',
        caution: '/art/caution.png',
      },
    }),
    notePad,
  ],
  fit: 'viewport',
})
await shell.ready
```

The desktop needs a `vf-menu-bar`, and the bar's first `vf-menu` is the system menu: the page's own, with its own label and art. Its title is a `label`, or 16×16 art in the `label` slot, which the menu places as an icon title with no page CSS (vintage-frames' SPEC § vf-menu). Its items are the page's own, About… and a rule say, and below them the shell lists what the System Folder's Apple Menu Items holds (§ The System Folder). The Finder uses the desktop's `vf-icon-field`, or adds one. A `bezel` gives the screen its rounded corners, the menu bar's included; without one, `rounded` on the bar rounds its top corners alone.

| Option | |
| --- | --- |
| `apps` | The applications built in. The first with a `catalog` is the Finder. Two with one id, or a kind two of them register, stop `createShell`. |
| `defaultApp` | The application in front while no window is active. Default: the Finder. |
| `fit` | `'viewport'` sizes the desktop to the viewport, on every resize and scale change. |
| `state` | Where the session is saved (§ Saved state). Default `null`: a reload resets. |
| `services` | The site's own objects, passed to every application. |
| `fonts` | The families the site serves its system (§ Fonts). Default none. |
| `clock` | The time in the bar's `end` slot. Default `true`. |
| `startup` | Open what Startup Items holds once the session is back. Default `true`; `false` skips it for this boot. |
| `trust` | The public keys the site trusts, and what a file none of them signed gets (§ Trust). Default none: any app file installs. |
| `index` | The URL of the site's index of app files, handed to every application as `ctx.index` (§ The index). Default none. |

The page around a `fit: 'viewport'` desktop is the page's own CSS; the shell writes none:

```css
html,
body {
  margin: 0;
  overflow: hidden;
}
```

`overflow: hidden` keeps a resize's passing overflow from showing a scrollbar, which would change the size the shell measures next.

Turning off pinch-zoom is the page's call too. It keeps the screen crisp, at the cost of the reader's own zoom:

```css
html {
  touch-action: pan-x pan-y;
}
```

```ts
// Safari's pinch, which can get past touch-action.
document.addEventListener('gesturestart', (e) => e.preventDefault())
```

Panning stays, so a finger still scrolls a window.

`createShell()` returns `{ desktop, windows, catalog, apps, ready, install, uninstall, restart, installed, onInstalled, appFile, dispose() }`. `ready` settles once the desktop and its menu bar have rendered, the catalog is read, the seed stored, the installed applications loaded, the last session's windows reopened and Startup Items opened. `install()` and the rest are the installs (§ Installing applications). `dispose()` takes everything down, the applications' own setup and every window included, so a hot reload starts clean. The saved session stops before the windows go, so with `state` set the reload reopens them.

## Applications

```ts
import { defineApp } from 'system-online-sdk'

export const notePad = defineApp({
  id: 'note-pad',
  name: 'Note Pad',
  icon: '/art/note-pad.png',
  menus: `
    <vf-menu data-menu="file" label="File">
      <vf-menu-item value="new" shortcut="⌃N">New</vf-menu-item>
      <vf-menu-item value="close" shortcut="⌃W">Close</vf-menu-item>
    </vf-menu>`,
  kinds: { note: { art: '/art/note.png', open: (item, from) => openNote(item, from) } },
  init(ctx) {
    ctx.onMenu((value) => {
      if (value === 'new') newNote()
    })
    return { open: ({ item, from }) => openNote(item, from) }
  },
})
```

| Field | |
| --- | --- |
| `id`, `name` | `name` is the bar's accessible name while the application is in front. |
| `icon` | Its 32×32 art, for its icon in the Finder. |
| `manifest` | The manifest of the app file it came from. `?app` and an install set it. |
| `menus` | `vf-menu` elements, each with a `data-menu` name. |
| `dialogs` | Its dialogs, each with a `data-dialog` name (§ Dialogs). |
| `windows` | Its windows, each with a `data-window` name, kept inert until `ctx.window()` copies one. |
| `kinds` | The catalog kinds it registers and opens (§ The catalog). One under a name of the shell's own kinds is left out. |
| `opens` | The shell's kinds it opens: `['font']`, for an application that opens font suitcases (§ Fonts). |
| `init(ctx)` | Sets the application up and returns its actions, which other applications call. An application whose windows reopen after a reload, or that opens from an icon, returns `open({ item, from })`. |

An application can live in a repo of its own and ship as one PNG, its app file, which a site builds in or installs while it runs ([APP-FILES.md](./APP-FILES.md), § Installing applications).

An `init` that throws takes that application down alone: the console names it and its error, and what's installed says it didn't load. The rest of the desktop starts.

The bar holds the system menu, then the front application's menus, then the clock. The front application is the active window's, or the default application while no window is active. Each application's menus are parsed once and the same elements come back each time it is in front, so their state holds. Only the front application's key equivalents work, since the others' menus are off the bar. Browsers keep ⌘W, ⌘N and ⌘Q, so use ⌃W, ⌃N and ⌃Q.

No application adds to the system menu. An application in the Apple menu is one the visitor, or the site's seed, put in Apple Menu Items, usually as an alias (§ The System Folder).

What `init` gets:

| `ctx` | |
| --- | --- |
| `desktop`, `windows` | The `vf-desktop` and the window manager. |
| `menus`, `menu(name)`, `item(value)` | Its own menus and items. `menu()` and `item()` throw when the markup doesn't have them. |
| `onMenu(fn)` | Every pick from its menus. Picks are dropped while a modal dialog is open. |
| `gate(item, test)` | Keeps an item disabled while `test()` is false. Tests run again on every press, key, selection change and activation. |
| `typing()`, `modalOpen()` | Whether a text field has focus, read through shadow roots, and whether a modal dialog is open. |
| `dialog(name)` | One of its dialogs. Throws when the markup doesn't have it. |
| `window(name)` | A fresh copy of one of its windows on each call, upgraded and not yet appended, for `open({ create: () => ctx.window('viewer') })` or `adopt()`. Throws when the markup doesn't have it. |
| `hold(dialog)`, `release(dialog)` | Hold a dialog it made in code, and let one go. `hold()` appends it to the desktop and returns it; `release()` removes it. |
| `ask(dialog)` | Shows one of its held dialogs and resolves its `returnValue`, or `null` when it closed without one. Throws for a dialog it doesn't hold. |
| `onFront(fn)` | Whether the application is in front, now and on every change. For keys and page furniture that belong to one application. |
| `apps`, `app(id)`, `opener(kind)` | Every application's actions, read at the call, and the definitions. `opener('font')` is the application that opens font suitcases, or undefined (§ Fonts). |
| `catalog`, `kinds`, `kind(name)` | The catalog, when a Finder runs, and the registered kinds, the shell's `app`, `alias` and `font` first. |
| `fonts` | The system's fonts: the installed families, any family the site serves, a strike loaded on request, and a notice when the installed families change (§ Fonts). |
| `install(file, options)`, `uninstall(id)`, `restart(id)` | Install an app file through the site's trust, uninstall an installed application, and restart one on its kept file (§ Installing applications). |
| `installed()`, `onInstalled(fn)`, `appFile(id)` | What's installed, every application built in or installed; a notice each time any of it changes, torn down with the application; and an installed application's file. |
| `ready` | Settles once the boot is done: every application loaded or skipped, the session reopened. |
| `index` | The URL of the site's index of app files, or `null` (§ The index). |
| `services`, `state` | The site's objects and the saved session. |
| `on(target, type, fn)`, `onDispose(fn)` | A listener and a teardown, both undone by `dispose()`, and by an uninstall or a restart. |
| `beforeQuit(hooks)` | Whether it holds user data not yet saved, and its offer to save it, asked before the shell takes it down and when the page goes (§ Asking before it quits). |

### Asking before it quits

An application that holds user data it hasn't saved, an edited document say, says so whenever it's asked, and offers to save it:

```ts
init(ctx) {
  /** Note windows with changes not yet saved. */
  const edited = new WeakSet<VfWindow>()
  // …
  ctx.beforeQuit({
    // Whether it holds user data not yet saved, at the moment it's asked.
    unsaved: () => ctx.windows.windowsOf('note-pad').some((win) => edited.has(win)),
    // Its own offer to save, asked only while there's something to save:
    // its Quit, each edited note's close asking Save, Don't Save or Cancel.
    save: () => ctx.windows.closeAll('note-pad'),
  })
}
```

- The shell reads `unsaved()` before it takes the application down, a restart say (§ Restarting), and asks `save()` if, and only if, it holds. With nothing unsaved, nothing asks.
- `save()` is an offer to save, not a confirm: the application's own alert and its own save, a name asked for an untitled document say. It resolves `true` to go on, saved or let go at the visitor's word, and `false` to stay, a Cancel. Its answer stands: once it goes on, the shell closes the application's windows without asking them again.
- While `unsaved()` holds, leaving the page asks first. The browser allows only its own question there, so that's the one; the offer to save is for what the shell takes down while the page stays. `unsaved()` is synchronous, so that the page's leaving can ask it.
- A hook that throws errs on the data's side: a restart is refused, and leaving the page asks.
- One hook per application, a second call replacing the first, torn down with it. A built-in application can register one too, which only the page's leaving asks, since a built-in doesn't restart.
- Without a hook, a restart asks each of the application's windows to close as its Quit does (`windows.closeAll`), so a close handler that offers to save keeps working unregistered.

## Dialogs

An application's dialogs are its own, like its windows. It authors them, the window manager holds them under it, and they are removed with it.

```ts
export const notePad = defineApp({
  id: 'note-pad',
  name: 'Note Pad',
  dialogs: `
    <vf-dialog data-dialog="save-changes" frame="plain" label="Save Changes" width="360" height="118">
      <form method="dialog" novalidate>
        <vf-img width="32" height="32" left="16" top="16"><img src="/art/caution.png" alt="" /></vf-img>
        <vf-paragraph face="display" width="270" left="64" top="16" data-message></vf-paragraph>
        <vf-button-group origin="bottom right" left="334" top="92">
          <vf-button type="submit" value="discard">Don’t Save</vf-button>
          <vf-button type="submit" value="cancel">Cancel</vf-button>
          <vf-button type="submit" value="save" variant="default">Save</vf-button>
        </vf-button-group>
      </form>
    </vf-dialog>`,
  init(ctx) {
    const saveChanges = ctx.dialog('save-changes')
    async function askToClose(win) {
      saveChanges.querySelector('[data-message]').textContent = `Save changes to “${win.heading}” before closing?`
      const answer = await ctx.ask(saveChanges) // 'save', 'discard', 'cancel', or null for Escape
      // …
    }
  },
})
```

- `dialogs` are parsed once, appended to the desktop and held under the application. Hold a dialog made in code with `ctx.hold()`, and let it go with `ctx.release()`.
- A `<form method="dialog">` closes the dialog with the pressed submit button's `value`, its `returnValue`, and `ask()` resolves it. A dialog with fields answers the same way, and the application reads its fields after. Keep OK disabled until the dialog can answer. `novalidate` keeps the browser's own validation message from showing.
- A dialog declares its whole box. Size copy that varies for its longest, or measure it on `vf-show` and set `height` then: a closed dialog lays out nothing. [vintage-frames' LAYOUT.md](https://github.com/aportilla/vintage-frames/blob/main/docs/LAYOUT.md#window-archetypes)'s alert recipe has the arithmetic. A message of unknown length goes in flow, and the dialog's body scrolls it.
- `vf-show` fires once a dialog `ask()` showed is open, placed and focused, with the focused element as `detail.focus`. It is where the application finishes composing the dialog. The kit selects no text itself; a dialog whose name field should open with its default name selected selects it there:

  ```ts
  const newFolder = ctx.dialog('new-folder')
  const name = newFolder.querySelector('vf-text-field')!
  ctx.on(newFolder, 'vf-show', () => name.select())
  name.value = 'untitled folder'
  const answer = await ctx.ask(newFolder)
  ```
- A held dialog can be an element that renders a `vf-dialog` inside itself. `ask()` takes the `vf-dialog`; show a wrapper through its own API.
- While a held dialog is open, the bar shows its application's name and menus, even when another application is in front. With several open, it shows the one opened last. Nothing else changes: the front application, the active window and the palettes stay as they were. An application that wants to come forward raises a window before it asks.
- `dispose()` removes every application's dialogs. An open one closes, and its `ask()` resolves `null`.
- A dialog of the page's own, an About box say, stays the page's.

## Windows

Every window has an application and, optionally, an item: a catalog id, or a key of the application's own. A window's item can change: `setItem()` gives an untitled document its item at its first save.

```ts
windows.open({
  app: 'note-pad',
  item: note.id,
  from, // the icon's cellRect()
  create: () => makeNoteWindow(note),
  close: (win) => askToSave(win), // the close box asks; call windows.close(win) to close
})
```

- `open()` brings the item's window forward if one is open. Otherwise it makes the window, appends it to the desktop, places it, and opens it out of `from`.
- Placement, in order: this session's place for the item, the saved one, then `place`. The default `place` is the first cascade step no open window holds, 40 right and 20 down from the top left of the area below the menu bar. Every placement is held inside that area; only a window that has the screen leaves it (§ Full screen).
- `close(win)` closes the window into its home box and removes it. The home box is the item's icon, else the nearest open folder around it. A window of an application's own closes into the application's icon. The window's box is kept for the session.
- With `close` set, the close box and File → Close call it instead, and the application calls `windows.close(win)` once it decides. It gets the window and the modifier keys held on the close box's click (`{ altKey, shiftKey, metaKey, ctrlKey }`); `requestClose(win, keys)` passes them on, and a close from a menu passes none. A handler that decides later, after a Save prompt, returns its promise; `requestClose()` resolves whether the window closed once it settles.
- `closeAll(app)` asks each of an application's windows to close, front to back, palettes aside: a Quit is one line. It resolves `false` at the first window still open after its handler, a Cancel, and `true` once all have closed. An Option-click on a window's close box does the same for its application, and each handler still decides for its own window.
- `adopt(win, options)` takes a window the application made and appended itself. It takes the same options as `open()`, plus `palette` and `pin`. A window adopted before the desktop's first render, such as a palette made in `init`, is placed again once the menu bar has rendered, so its `place` measures the area below the bar.
- Set a window's `width` and `height` before `open()` or `adopt()`. Both read the declared size to place the window, and a saved place is worked out against it. A window sized from its content is appended and measured first, then adopted.
- A palette is shown while its application is in front and hidden otherwise. It is never closed. `palette` can be a function, for a palette the application hides for its own reasons; call `palettesChanged()` when its answer changes.
- Focus: opening a window moves the keyboard focus into it: to the first control marked `autofocus` or `autoselect`, else the first that takes the focus. Anything whose `tabindex` is negative is passed over, such as a roving cell off the tab order. When `open()` makes the window, a text field marked `autoselect` also has its whole text selected, so typing replaces a name set in `create`. Focus returning to a window that is already open selects nothing and leaves the caret where it was. Closing the active window moves the focus into the next active window, else to the closed window's icon. A title-bar press activates a window without moving the focus, so focus left in the previous window follows the active one.
- `zoom` on `open()` or `adopt()` gives a window its zoom box: `(area, box) => box`, its zoomed box on the window area, given its current box so it can keep its top-left. The window manager runs the box: a press takes the window to its zoomed box, clamped like every placement, and the next back to the box it had, kept as a pin so it lands right after a screen resize. A zoomed window stays zoomed across a resize. `windows.zoom(win)` runs the same toggle, for a menu command. A window without `zoom` leaves its `vf-zoom` to its application.
- On a screen resize every window keeps its place relative to the screen's nearest edges, or its share of the middle. A resizable window keeps its size limits (`vf-window.sizeLimits`) and fits inside the area below the bar. Growing the screen back restores every window exactly. `policy` and `keep` change this for one window, and `setFrameBands()` for all of them, for windows that dock along the edges.
- View → Arrange Windows puts every window back at its `place`. It is disabled while every window is there. `arrangeWith(app, group)` lets an application arrange its own windows its own way.
- `window-top` on the `vf-desktop` moves the windows' area down, for a strip of the page's under the menu bar. Icons still stop at the bar.

| Read | |
| --- | --- |
| `front` | The front application's id. |
| `asking` | The application whose held dialog opened last and is still open, or `null`. The bar shows it while it is set. |
| `fullScreenWindow` | The window that has the screen, or `null` (§ Full screen). |
| `windowFor(item)`, `itemOf(win)`, `appOf(el)`, `windowsOf(app)`, `dialogsOf(app)` | Lookups. `appOf()` takes a window or a held dialog. `windowsOf()` lists back to front. |
| `isOpen(item)`, `hasWindows(app)` | Whether a window is open, or still closing into its icon. |
| `holdDialog(dialog, { app })`, `releaseDialog(dialog)` | What `ctx.hold()` and `ctx.release()` call. |
| `onWindows(fn)`, `onLayout(fn)`, `onRaster(fn)`, `onFront(fn)`, `beforeFront(fn)`, `onDialogs(fn)`, `onFullScreen(fn)` | A window opened or closed; any move, resize or arrangement; a screen resize; the front application changed, and just before it does; a held dialog opened or closed; the screen taken, given back, or resized while it's taken. Each returns its unsubscribe. |

### Full screen

A window can take the whole screen, a game's say: the menu bar, the icons and every other window give way, and the window covers the screen, the bar's band included.

```ts
init(ctx) {
  /** The game's window, while it's open. */
  let game: VfWindow | null = null
  // Its own item takes the screen and gives it back.
  ctx.onMenu((value) => {
    if (value === 'full-screen' && game) ctx.windows.fullScreen(game, ctx.windows.fullScreenWindow !== game)
  })
  // The window lays itself out from its own box: the screen's while it has it.
  ctx.onDispose(ctx.windows.onFullScreen((win) => game && fit(game, win === game)))
}
```

- `fullScreen(win, true)` takes the screen for an adopted window that's shown and not a palette, and returns whether `win` has it; anything else is refused, `false`. The window comes to the front if it isn't there, draws no chrome (vintage-frames' `frameless`), and goes to the whole screen's box, `0, 0` at the screen's `width` × `height`, on the desktop's tier above the menu bar (`vf-desktop`'s `fullScreenWindow`), under the screen's rounded corners. The focus stays where it was, inside it. One window has the screen at a time: one that has it gives it back first.
- **The rest of the desktop is out of reach.** The bar, the icons, every other window and whatever else the page keeps in the desktop go `inert`, so neither a press nor Tab reaches what can't be seen, and a press on the bezel changes nothing. Dialogs stay live: an application's, and any `vf-dialog`, a page's About box say, which show over the window in the top layer as over any other, the focus going back into it when one closes. Palettes are covered, the full-screen application's own included.
- **The bar is covered, not hidden.** Its band stays in the work area, so nothing else's geometry moves, and it still answers key equivalents: ⌃W closes the window, ⌃Q quits.
- **It follows the screen**: a resize writes the new screen's box.
- `fullScreen(win, false)` gives it back: the rest of the desktop is live again, and the window gets its chrome back and goes to the box it had, as a resize since would have carried it (held at its `keep` box, zoomed, or at its place by the screen's edges), clamped as every placement is. The focus stays where it was.
- **What else gives it back**: the window closing, by any route, from the whole screen into its icon; another window becoming active, or none, which only code can do with the rest inert, an application opening a window or a restart raising another's; and `dispose()`, which leaves nothing inert and the bar uncovered.
- `onFullScreen(fn)` calls `fn(win)` once the window's box is written, when it takes the screen and after each resize while it has it (after `onRaster`), and `fn(null)` whenever the screen is given back. An application subscribes in `init` and unsubscribes through `ctx.onDispose`.
- **Never saved.** The session, `pinOf(win)` and the box a closed window reopens at keep the box it will give back, never the screen's, and full screen itself isn't kept: a reload or a restart reopens the window as it was before. Taking the screen again at an open is the application's, from a preference of its own.
- Arrange Windows leaves it where it is and counts it as arranged, and `zoom()` and `write()` leave it alone.
- The shell adds no command for it: Full Screen is an application's own item, and while the bar is covered, its key equivalent or something in the window gives the screen back.
- An application on a page older than `fullScreen` finds none, and checks for it first: `typeof ctx.windows.fullScreen === 'function'`.

## The catalog

```ts
interface Item {
  id: string
  name: string
  kind: string // 'folder', one of the shell's ('app', 'alias', 'font'), or a kind an application registers
  parent: string | null // a folder's id; null is the desktop
  left?: number // its place in its container, whole system px
  top?: number // unset: the container's next free cell
  createdAt: number
  modifiedAt: number
  data?: unknown // the kind's own, small and serializable
}
```

The catalog is the source of truth for what is where. It is pure: it runs under Node, from `system-online-sdk/pure` (§ Pieces on their own), and the SDK's unit tests run it there.

- The Trash and a startup disk are volumes: containers with no record, listed first, each if the site wants one (`volumes: { trash: 'Trash', disk: 'Macintosh HD' }`). A volume can't be renamed, moved, copied or removed, and nothing is made in the Trash. Deleting is a move into the Trash. Only Empty Trash removes. The System Folder and its folders are kept the same way, listed after the volumes (§ The System Folder).
- A folder never goes into itself or a folder inside it. New folders are "untitled folder", then "untitled folder 2". Copies are "Name copy", then "Name copy 2". Aliases are "Name alias", then "Name alias 2".
- Every item is listed, whether or not an application registers its kind, so a document outlives the application that opens it (§ Documents nothing opens).
- Storage is three calls: `list()`, `put(item)`, `remove(id)`. `memoryStorage()` forgets on reload and `indexedDbStorage(name)` keeps. A site can write its own. Without working storage the catalog lists the volumes and the System Folder alone, and the Finder says so when asked to save.
- A record whose id starts with `#` is the shell's own, kept in the same storage beside the items: the seed's marker, and each installed application's file. The catalog never lists, dumps, imports or clears one.
- A seed is stored once per storage. `seed: 'markup'` reads the `vf-icon[data-app]`, `vf-icon[data-font]`, `template[data-folder]` and `template[data-system]` in the desktop's field (§ The Finder); a function stores the site's defaults through the catalog.
- Positions are on the items, so they persist wherever the catalog does. Position changes are written a moment after they settle.
- Selectors: `childrenOf`, `itemCount`, `isInside`, `enclosingFolders`, `isTrashed`, `isKept`, `descendantsOf`, `nextFolderName`, `copyName`, `aliasName`, `originalOf`, `resolve`, `canAlias`, `dropTargetOf`, `appleMenuItemsOf`, `appleMenuOf`, `startupItemsOf`, `fontFamilyOf`, `installedFamiliesOf`. Operations: `create`, `rename`, `update`, `move`, `place`, `copy`, `remove`, `emptyTrash`, `clear`, `import`, `dump`.
- `remove(ids)` removes items at once, wherever they are, the Trash included, a folder with everything in it, each kind dropping its payload. It never removes a kept container. An uninstall removes an application's icons this way; anything a visitor deletes goes through the Trash.
- `import(archive, { mode })` restores a `dump()`. `'replace'` clears the catalog first and keeps the archive's ids; `'merge'`, the default, adds the archive under fresh ids, nesting kept. It resolves a `Map` from each archive id to the item it stored, so a kind whose payload is keyed by item id can carry it over a merge. The listing is announced once, when the import is done, so a window whose item comes back stays open.

A kind tells the Finder how its items look and open:

| `KindDefinition` | |
| --- | --- |
| `art` | Its 32×32 art: one URL, or a function of the item. |
| `open(item, from)` | Opens the item, out of `from`. |
| `editable` | Renamed in place. Default `true`. |
| `size(item)` | Bytes, for Empty Trash's alert. |
| `copy(from, to)` | Copies the item's payload when the Finder copies it. |
| `onRemove(item)` | Drops the payload when Empty Trash removes the item. |
| `claim(file, parent, at)` | Makes an item of a pasted or dropped file in `parent`. `at` is where a dropped file was let go, the item's place there in whole system px; a paste gives none, for the next free cell. Resolves whether it did. |
| `export(item)` | The item as a file, for the system clipboard. |

Small data goes in `data`. A large payload stays in the application's own store, under the item's id, and `copy` and `onRemove` keep that store in step.

The shell registers three kinds itself, `app`, `alias` and `font`, and an application's `kinds` can't replace them: one under any of their names is left out, and the console names the application. `font` is a font suitcase (§ Fonts).

`app` is an application's icon, which opens the application. It takes its name and art from the application, keeps a name the markup gives it, and can't be renamed. Its `data` names the application, `{ app: id }`. A seed function stores one as `catalog.create({ kind: APP_KIND, name, parent, data: { app: id } })`, and `appIdOf(item)` reads the id back, or null. Both names come from either entry. The kind also carries installed applications (§ Installing applications): it claims an app file dropped or pasted, an installed one's icon is drawn from its manifest's icon, loaded or not, Copy puts its file on the system clipboard, and Empty Trash weighs its file once its every icon is in the Trash. Opening one that didn't load, or one whose application is neither built in nor installed, raises the Finder's `application-unavailable` alert.

`alias` is an item standing for another: an application, a document, a folder or the startup disk. Its `data` names the original and the original's kind, `{ original: id, kind }`, and `originalOf(item)` reads the id back, or null. An alias with no `kind` is read as an application's or a document's, the only aliases there were before aliases kept one. `resolve(state, id)` is the item an id names, or the original an alias stands for, wherever it was moved and whatever it was renamed, through an alias of an alias too; null once the original is removed. The Finder draws an alias with its original's art and its name in italics, and opening it opens the original: an alias of a folder or the disk opens the original's window. Copying an alias makes another alias of the same original, trashing one leaves its original alone, and `import()` keeps an alias pointing at its original when the import gives items new ids.

`canAlias(state, id)` is Make Alias's rule: anything outside the Trash whose original is there, never the Trash itself. `dropTargetOf(state, id)` is what a drop onto an item files into. A container and an alias of one give `{ folder }`, the container's id, so filing judges the original, and a folder never goes into itself or a folder inside it through an alias either. An alias of a container whose original is gone gives `{ missing }`, the alias: it takes the drop, files nothing and says so. Anything else gives null.

### The System Folder

A site that names the System Folder has one:

```ts
finder({
  // …
  system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items', fonts: 'Fonts' },
})
```

The catalog keeps it on the startup disk, or on the desktop without one, with Apple Menu Items and Startup Items inside, and Fonts after them when the site names it. Each has an id (`SYSTEM_FOLDER`, `APPLE_MENU_ITEMS`, `STARTUP_ITEMS`, `FONTS`) and the site's name for it. Like a volume, each is never renamed, moved, copied or trashed, and a storage seeded before the setting has them at once. What they hold is anyone's, and it drives the desktop:

- **Apple Menu Items** is the Apple menu. Below the page's own items, the shell lists what the folder holds, by name, case aside and a leading space first, and follows the folder as it changes. A folder in it, or an alias of a folder or the disk, is a submenu of what that folder holds, in the same order, and a folder in that is a submenu in turn, five levels down (`appleMenuOf`). A folder already on the way down, an empty folder and one past the fifth level are entries. Choosing an entry opens its item as a double-click would: an alias opens its original, and a folder opens its window. A submenu's own entry is never chosen: it opens the submenu. Each entry's `value` is its item's id. Entries are dropped while a modal dialog is open.
- **Startup Items** opens at startup. Once the boot has reopened the session's windows, the shell opens what the folder holds, by name, each as a double-click would. One already open comes to the front. One that won't open, an alias whose original is gone say, says why, as opening it by hand would, and the rest open. `startup: false` on `createShell` skips them for a boot.
- **Fonts** is what's installed: a suitcase directly in it installs its family, when the site serves it (§ Fonts). The name is optional. A site that leaves it out has no Fonts folder and every family it serves installed, and one that gives no fonts sees no change.

`appleMenuItemsOf(state)` and `startupItemsOf(state)` list each folder's contents in that order, and nothing without the System Folder. `installedFamiliesOf(state, families)` is Fonts' rule (§ Fonts). `appleMenuOf(state)` is Apple Menu Items as a tree of `{ item, entries? }`, the tree the shell builds the Apple menu from. A folder in it, or an alias of one, carries what the folder holds as `entries`, in the same order, and so on down to five levels. A folder already on the way down, an empty folder and one past the fifth level carry none, so the tree never loops. `item` is the entry's own: an alias stays the alias. A seed files into the folders as into any folder:

```ts
const notePad = await catalog.create({ kind: APP_KIND, name: 'Note Pad', data: { app: 'note-pad' } })
await catalog.create({ kind: ALIAS_KIND, name: 'Note Pad', parent: APPLE_MENU_ITEMS, data: { original: notePad!.id, kind: APP_KIND } })
```

## The Finder

```ts
finder({
  storage: indexedDbStorage('my-site'),
  art: { folder, trash, trashFull, document, trashMark },
  seed: async (catalog) => {
    const docs = await catalog.create({ name: 'Documents' })
    await catalog.create({ kind: 'note', name: 'Read Me', parent: docs!.id, data: { text: '…' } })
  },
})
```

| Option | |
| --- | --- |
| `storage` | Where the catalog is kept. `null` keeps nothing. |
| `art` | `folder`, `trash`, `trashFull` and `document` (32×32) are required; `disk`, `systemFolder`, `appleMenuItems`, `startupItems`, `fonts`, `suitcase` and `caution` (32×32) and `trashMark` (12×12) are optional. The disk and the System Folder and its folders take the folder's art without their own, and a font suitcase the document's; without `caution` the alerts have no art. |
| `volumes` | Default: the Trash alone. |
| `system` | The System Folder, named: `{ folder, appleMenu, startup, fonts }`, `fonts` optional (§ The System Folder). Default: none. |
| `seed` | `'markup'`, or a function. It runs once the desktop and its menu bar have rendered, so it can read `desktop.workArea`. |
| `lattice` | `{ desktop, folder }`: each a cell size, column and row pitch and insets. Default 64px cells, 80px columns, 72px rows, 16px insets. |
| `cleanUpAfterResize` | Clean Up the desktop once a resize settles with icons overlapping. Default `false`. |
| `commands` | Switch commands off: `{ 'empty-trash': false }`. |
| `dialogs` | The site's dialogs for the Finder, each with a `data-dialog` name, held by it (§ Dialogs). |
| `extend(finder, ctx)` | Add the site's own commands, and answer the Finder's alerts. |
| `window` | A folder window's size. Default 320 × 223: three columns and two rows of icons. |

- Icons are the catalog's: the desktop shows the desktop's items and each open folder window shows its folder's. An item without a position takes its container's next free cell. The desktop's cells run down from its top right, below the menu bar. A folder's run in rows from its top left. The Trash starts in the desktop's bottom-right corner.
- `seed: 'markup'` makes an application icon of each `vf-icon[data-app]`, a font suitcase of each `vf-icon[data-font="Geneva"]` holding that family, and a folder of each `template[data-folder="Name"]`, a folder's inside it, and files what a `template[data-system]` holds in that folder of the System Folder: `<template data-system="apple-menu-items"><vf-icon data-app="note-pad"></vf-icon></template>` puts Note Pad in the Apple menu, and `<template data-system="fonts"><vf-icon data-font="Geneva"></vf-icon></template>` installs Geneva. Its value is the folder's id, `system-folder`, `apple-menu-items`, `startup-items` or `fonts`, and without a `system` setting naming the folder it files nothing. An icon's `label` names its item; without one, an application's icon takes the application's name and a suitcase its family's.
- An alias is drawn with its original's art and its name in italics (`vf-icon`'s `alias`). Opening it opens its original, and a drop onto an alias of a folder or the disk files into the original. With the original removed, opening it says the original couldn't be found, and so does a drop onto an alias of a folder, which keeps the folder's art and files nothing.
- File → Make Alias makes an alias of each selected application, document, folder or disk, an alias's alias standing for the same original, named "Name alias", in the free cell nearest it. Never one of the Trash or anything in it. The new aliases are selected.
- A font suitcase is drawn with the `suitcase` art, whether or not an application opens it, and opens in the application that says it opens suitcases. With none, an alert says so (§ Fonts).
- Every move goes back onto the item: a drag, an arrow-key nudge, Clean Up, the resize rule.
- A press anywhere in the desktop's field, on an icon or not, brings the Finder forward. The selection survives a switch to another application and back.
- Folder windows are made on open and removed on close. Each shows its item count, with the trash mark when it is in the Trash, and its scrolled content grows to hold its icons.
- An icon is drawn open while its window is, until the window has closed into it. An application's icon is drawn open while the application has a window.
- Opening one of several selected icons opens them all.
- Filing: a drop onto a folder icon files into that folder at its next free cells, and a drop onto an alias of one into the original, judged there. A drop into a folder window lands where the icons were let go, and so does a drop out of a window onto the desktop. The folder under the pointer is highlighted. A drop over another application's window moves nothing.
- Renaming goes to the catalog. A name that is too long or empty gets an alert.
- A file dropped on the desktop or in a folder window brings the Finder forward, as a press does.
- Copy puts the selected items' names on the system clipboard, with a file from the first kind that exports one. Paste copies what the Finder copied, while the system clipboard still holds those names or can't be read. Otherwise it offers the clipboard's files to the kinds' `claim`. A file dropped on the desktop goes the same way, into the folder window under it, the first file with where it was let go: its icon's art centred on the pointer. An app file dropped or pasted installs (§ Installing applications).
- A document whose kind no application registers is drawn with the `document` art, and opening it raises the `no-application` alert (§ Documents nothing opens).
- Clean Up moves each icon of the active window, or the desktop, to the free cell nearest it, one at a time. Icons past the last cell share it. The desktop's icons follow the screen's edges on a resize. With `cleanUpAfterResize`, overlapping icons are cleaned up once the resize settles.

| Menu | Commands |
| --- | --- |
| File | Open ⌘O, New Folder, Close ⌃W, Make Alias ⌘M |
| Edit | Copy ⌘C, Paste ⌘V, Select All ⌘A |
| View | Arrange Windows ⌘J |
| Special | Clean Up Desktop or Clean Up Window, Empty Trash… |

A command is disabled while it has nothing to act on: Open and Copy with nothing selected, Close with no folder window active, Make Alias with nothing selected it takes (only the Trash, what is in it, or aliases whose originals are gone), New Folder and Paste in the Trash, Empty Trash with the Trash empty, Arrange Windows with every window in place. Open, Copy, Paste, Select All and Make Alias are also disabled while a text field has focus, so the field keeps its own keys.

`extend` gets the Finder's actions and the context:

```ts
finder({
  // …
  extend(finder, ctx) {
    finder.addCommand({
      menu: 'special',
      value: 'back-up',
      label: 'Back Up All Files…',
      separator: true,
      run: () => downloadBackup(finder.catalog.dump()),
      enabled: () => finder.catalog.get().items.length > 1,
    })
  },
})
```

| Finder action | |
| --- | --- |
| `catalog` | The catalog. |
| `selection()`, `select(ids)` | The selected items, and a new selection. |
| `activeFolder()` | The active folder window's folder, or `null` for the desktop. |
| `open({ item, from })` | Opens an item as a double-click would. |
| `rename(id)` | Selects the item's icon and opens its rename box. |
| `cleanUp(folder)` | Clean Up for a folder, or `null` for the desktop. |
| `iconFor(id)` | The item's icon, where one is shown. |
| `addCommand(spec)` | A command in one of the Finder's menus. Call it from `extend`. |
| `alertWith(id, handler)` | Answers one of the Finder's alerts in its place. Call it from `extend`. |
| `alert(id, details)` | Raises one of the Finder's alerts as the Finder does: the site's handler where `alertWith` gave one, else the Finder's own. Resolves the answer, or `null`. The shell asks its install's questions this way. |
| `storageReady()` | Whether storage answers. When it doesn't, it raises Storage Unavailable, answered by the site's `alertWith` handler where there is one, and returns `false`. A site's own command that saves calls it first, so every save says the same thing. |

### The Finder's alerts

The Finder's alerts are its own: a plain-framed dialog with the `caution` art, sized to its message and held by the Finder while it is up. A site answers any of them with its own dialog instead. The handler gets the alert's details and resolves its answer:

```ts
finder({
  // …
  dialogs: emptyTrashHtml, // a vf-dialog with data-dialog="empty-trash"
  extend(finder, ctx) {
    const dialog = ctx.dialog('empty-trash')
    finder.alertWith('empty-trash', ({ count, bytes }) => {
      dialog.querySelector('[data-message]')!.textContent = trashMessage(count, bytes)
      return ctx.ask(dialog)
    })
  },
})
```

| Alert | When | Details | Answer it acts on |
| --- | --- | --- | --- |
| `empty-trash` | Special → Empty Trash… | `{ count, bytes }` | `'ok'` empties the Trash |
| `storage-unavailable` | New Folder, Paste, a dropped file or `storageReady()`, without storage | none | none |
| `name-too-long` | A rename past the limit | `{ limit }` | none |
| `name-rejected` | A rename to nothing | none | none |
| `move-failed` | A filing storage refused | `{ error }` | none |
| `original-missing` | Opening an alias whose original is gone, or a drop onto an alias of a folder whose original is gone | `{ alias }`, the alias's item | none |
| `no-application` | Opening a document no application opens, through an alias too: one whose kind no application registers, or a font suitcase while no application says it opens suitcases | `{ item }`, the document, its kind on it | none |
| `application-unavailable` | Opening an application's icon, or an alias of one, when the application didn't load or is neither built in nor installed | `{ item, app, manifest, why, reason }`: the icon, the application's id, its manifest where its file reads (else `null`), why it didn't load (§ What's installed) or `'missing'`, and the words for people | none |
| `replace-application` | A dropped or pasted app file whose application is already on the desktop | `{ manifest, installed, standing }`: the file's manifest, the version installed (`null` for icons with no file) and the file's standing | `'replace'` replaces it |
| `untrusted-application` | An install the site's trust asks about: a file no key the site holds signed (§ Trust) | `{ manifest, standing, key }`: `'unsigned'`, or `'untrusted'` and the key that signed it | `'install'` installs it |
| `install-refused` | A dropped or pasted app file the shell refused, a Cancel aside | `{ name, manifest, why, reason }`: the file's name, its manifest where it read, and why (§ Installing applications) | none |
| `failed` | New Folder, Empty Trash, Paste, Make Alias or a dropped file failed | `{ action, error }`: `'new-folder'`, `'empty-trash'`, `'paste'`, `'make-alias'` or `'add-file'` | none |

An alert with no handler is the Finder's own. `untrusted-application`'s default button is Cancel, so installing what nobody vouched for takes a press of its own.

## Fonts

The system's fonts are the families the site serves, each strike a woff2 at a URL of the site's. A font suitcase in the System Folder's Fonts installs its family, and every application, an app file's included, sets type in the installed families through `ctx.fonts`. Nothing is fetched at boot: a strike loads when an application asks for it. The SDK ships no fonts, as it ships no art.

```ts
import geneva9 from './fonts/Geneva-9.woff2'
import geneva12 from './fonts/Geneva-12.woff2'

createShell(desktop, {
  apps: [
    finder({
      storage,
      art: { folder, trash, trashFull, document, fonts: fontsFolder, suitcase },
      system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items', fonts: 'Fonts' },
      seed: async (catalog) => {
        await catalog.create({ kind: FONT_KIND, name: 'Geneva', parent: FONTS, data: { family: 'Geneva' } })
      },
    }),
    textEditor,
  ],
  fonts: [
    {
      name: 'Geneva',
      strikes: [
        { size: 9, line: 12, pitch: 12, url: geneva9, bytes: 3412, chars: 'ABC…' },
        { size: 12, line: 15, pitch: 15, url: geneva12, bytes: 4108, chars: 'ABC…' },
      ],
    },
  ],
})
```

| `FontFamily` | |
| --- | --- |
| `name` | What a suitcase names. |
| `sizes` | What its strikes' sizes count: `'points'`, the default, or `'pixels'` where a point size is unknown. |
| `strikes` | Its strikes, each a `FontStrike`. |

| `FontStrike` | |
| --- | --- |
| `size` | The number its family names it by. |
| `line` | The font-size, px, that draws one design px per system px: its font rect's height. |
| `pitch` | Its line pitch, px. |
| `url` | Its woff2, a URL the page fetches. |
| `bytes` | The file's size, which a suitcase weighs in the Trash. |
| `chars` | Every character it carries. |

Both types come from either entry, so a site's pure modules can build the list.

### Suitcases

A font suitcase is an item of the shell's `font` kind. Its `data` names a family, `{ family }`, and `fontFamilyOf(item)` reads it back, or null for anything but a suitcase. A seed stores one as `catalog.create({ kind: FONT_KIND, name, parent: FONTS, data: { family } })`, or the markup declares one as `vf-icon[data-font]` (§ The Finder). Both names come from either entry.

- The Finder lists a suitcase whether or not an application opens it, and draws it with its `suitcase` art, or the document's without it. A suitcase is renamed in place: its name is its own, and its family is its data's.
- Empty Trash weighs a suitcase as its family's strikes, and one whose family the site doesn't serve as nothing.
- A suitcase directly in Fonts installs its family, when the site serves it. One anywhere else is a file an application can still open, and so is one in a folder inside Fonts. An alias in Fonts installs nothing.

### Opening a suitcase

No application owns the `font` kind. One that opens suitcases says so, `opens: ['font']`, and returns `open({ item, from })` from `init`. Opening a suitcase, by a double-click, File → Open, an alias, the Apple menu or Startup Items, goes to the first application that says so, with the suitcase's id, as an application's icon opens the application. With none, the Finder says so in its `no-application` alert, which a site answers with its own dialog through `alertWith` (§ The Finder's alerts). An application that says so and returns no `open` opens nothing. `ctx.opener('font')` is the application that opens suitcases, or undefined.

```ts
export const fontViewer = defineApp({
  id: 'font-viewer',
  name: 'Font Viewer',
  opens: [FONT_KIND],
  init(ctx) {
    return {
      open({ item, from }) {
        const suitcase = ctx.catalog?.item(item)
        const family = suitcase && ctx.fonts.family(fontFamilyOf(suitcase) ?? '')
        // … a window showing `family`, out of `from`; one the site doesn't serve says so.
      },
    }
  },
})
```

### `ctx.fonts`

| `ctx.fonts` | |
| --- | --- |
| `installed()` | The installed families, by name: those of the suitcases directly in Fonts that the site serves, each once. Without a Fonts folder or a catalog, every family the site serves, and the same while the catalog isn't available, before the boot reads it or when storage fails. |
| `family(name)` | A family the site serves, installed or not, or null. A suitcase opens wherever it is. |
| `load(family, size)` | Registers a strike once per page, by its family's name and its size, and resolves its `font-family`: the strike's own name, quoted, `"Geneva 9"`, ready to set as `--vf-font-family`. Null for a strike the site doesn't serve and when its file doesn't load, which a later call tries again. |
| `onChange(fn)` | `fn(installed)` each time the installed families change, and only then: never for a placement, a rename, or another suitcase of a family already installed. Torn down with the application. |

```ts
init(ctx) {
  // A Font menu of the installed families, kept up as Fonts changes.
  const fontMenu = ctx.menu('font')
  const list = (families: FontFamily[]) => fontMenu.replaceChildren(...families.map(menuItemFor))
  list(ctx.fonts.installed())
  ctx.fonts.onChange(list)

  // A paragraph set in one of them.
  async function setIn(p: VfParagraph, name: string, size: number) {
    const strike = ctx.fonts.family(name)?.strikes.find((s) => s.size === size)
    const family = strike && (await ctx.fonts.load(name, size))
    if (!strike || !family) return
    p.style.setProperty('--vf-font-family', family)
    p.style.setProperty('--vf-font-size', `${strike.line}px`)
    p.style.setProperty('--vf-paragraph-line-height', `${strike.pitch}px`)
    p.style.setProperty('--vf-font-smoothing', 'none')
  }
}
```

- A strike registers under its own name, its family's and its size, since CSS can't pick a bitmap strike by size. It registers at weight 100 to 900: window content inherits the kit's weight 700, and a face registered at 400 gets a synthesized bold. A shell made again after a hot reload finds it registered.
- The application sets a strike on its own elements through the kit's tokens: its family, its `line` as the size and its `pitch` as the line height, together, and `--vf-font-smoothing: none`, since the body face smooths by default ([vintage-frames' FONTS.md](https://github.com/aportilla/vintage-frames/blob/main/docs/FONTS.md)). Editable text is the display face, whose tokens end in `-display`. A Font menu is the application's to build: the shell composes no UI.
- `installedFamiliesOf(state, families)` is `installed()`'s rule, pure, for a site's tests: the families of `families` that `state`, a catalog's listing, installs, and every one for `null`.
- An application on a page older than `ctx.fonts` finds none, and that page lists no suitcase. One that wants such pages checks for `ctx.fonts` before it uses it.

## Installing applications

An application can join the desktop while it runs: an app file installed at runtime ([APP-FILES.md](./APP-FILES.md)). It registers as one in `apps` does, its kinds, menus, dialogs, windows and `init`, and comes down when it's uninstalled. Every way in is one install: a file dropped or pasted in the Finder, a seed, a site's own command, the site through the shell, and an application, a store say, through `ctx`.

```ts
const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
let answer = await ctx.install(bytes)
if (answer.status === 'present' && (await askToReplace(answer))) answer = await ctx.install(bytes, { replace: true })
if (answer.status === 'refused') say(`It can’t be installed, because ${answer.reason}.`)
```

`install(file, options)`, on the shell and on `ctx`, takes the file as a `Blob`, an `ArrayBuffer` or a `Uint8Array`. It reads it (`inspectAppFile`), checks that this SDK runs it (`appRuns`) and its signature against the site's trust, asking first when the trust says to (§ Trust), keeps the file, loads its code and registers the application, then makes its icon, named for it. Installs go one at a time: one waits for the question another asked.

| `options` | |
| --- | --- |
| `parent` | The container the icon goes in: a folder's id, or `null` for the desktop, the default. One in the Trash is the desktop. |
| `at` | The icon's place there, whole system px. Unset, the container's next free cell. |
| `replace` | Put the file in place of what's installed under its id, whatever its version, or give it to the icons that have none (§ Updating). |

It resolves what happened:

| `status` | |
| --- | --- |
| `installed` | A new icon, and the application runs. `app` is its entry in what's installed. |
| `updated` | Its file replaced the one kept, or went to icons that had none: `app`, and `previous`, the version it replaced, or `null`. |
| `present` | Nothing changed: the application is already on the desktop, as `app`, or as icons with no file (`app` is `null`). `manifest` and `standing` are the file's, for the question a caller asks before it says `replace`. |
| `refused` | `why`, a word to branch on, `reason`, words for people that end a sentence as `inspectAppFile`'s do, and the file's `manifest` where it read. |

| `why` | |
| --- | --- |
| `not-app-file` | It isn't an app file this SDK reads. |
| `api` | It's built for an app API this SDK doesn't run. |
| `signature` | Its signature doesn't hold: the file changed since it was signed. |
| `untrusted` | The site's trust refuses it, or there's no Finder to ask. |
| `built-in` | An application in `apps` has its id. |
| `storage` | Nothing keeps files: the Finder's storage is `null`, or doesn't answer. |
| `cancelled` | The visitor said no at the trust's question. |
| `kind` | It registers a kind another application registers, which `reason` names. |
| `code` | Its code didn't load, its factory gave no application, or its `init` threw. |

A fresh install that fails changes nothing: no file, no icon. The Finder's own door says why in its `install-refused` alert, a Cancel aside.

### Updating

A file whose application is already on the desktop, its file kept or icons alone, answers `present` and changes nothing until the caller says `replace`. A dropped or pasted one asks first in the Finder's `replace-application` alert, signed or not. Replacing keeps the icons, their places and the session's windows, and goes forward or back to whatever file it's given: choosing a version is the caller's.

- A loaded application keeps its code running, and the new file runs once it restarts (§ Restarting), or from the next load: until then its entry in what's installed says `pending`.
- One that didn't load loads at once, so its icon opens this session, and the windows it had open at the last visit reopen where they were.
- Icons with no file, an application's from before it was installed, take the file, and the application loads the same way.

### Uninstalling

An application is installed while an icon names it. `uninstall(id)`, on the shell and on `ctx`, removes every icon of it at once, wherever it is, the Trash included, and its file. It asks nothing, since the caller asks first, and resolves `{ status: 'uninstalled', app }`, or `{ status: 'refused', why, reason }` with `why` `'not-installed'` or `'built-in'`. Empty Trash uninstalls an application whose last icon it removes, and so does anything else that leaves the catalog with no icon of it, a restore that replaces the catalog say.

Either way, a running application comes down as `dispose()` takes it down: its windows close, its menus and kinds go, and what its `init` set up comes down through its own `onDispose`. Its documents stay (§ Documents nothing opens), and an alias of one of its icons stays, as an alias whose original is gone.

### Restarting

`restart(id)`, on the shell and on `ctx`, runs an installed application's kept file in place of the code running, without a reload: the pending file after an update, else the same file again, fresh. The desktop and every other application are untouched.

```ts
const answer = await ctx.install(bytes, { replace: true })
if (answer.status === 'updated' && answer.app.pending) await ctx.restart(answer.app.id)
```

It waits for the boot (`ready`), then takes its turn with the installs, so it never races an install, an uninstall or the session's reopening. It runs only what's kept, which the site's trust already took, so it adds no power: any application may restart another, as it may uninstall one.

1. **The new code loads before anything closes.** The kept file's code is loaded and checked as an install checks it: its factory, its id, its kinds against every other application's. Code that doesn't load refuses the restart, and the old code runs on, still `pending`.
2. **It's asked before it quits** (§ Asking before it quits): its offer to save, while it holds something unsaved, or without a hook, each of its windows as its Quit asks them. A Cancel refuses the restart: the old code runs on, and a window that closed before the Cancel stays closed, as at a Quit.
3. **The old stops and the new starts in one step.** The old code comes down as an uninstall takes it down, closing what's still open without asking, and the new starts, with nothing between: an icon, an alias or the Apple menu opening it at any moment finds the old code or the new running, and the Finder never draws its documents without their kind.
4. **Its windows reopen.** Each window that showed an item as it closed, a document saved at step 2 included, opens again through the new code's `open({ item })`, at the box it had. Each goes back to its depth among every window on the desktop, and the active window is the one it was, or none: the front application stays the one it was, this one with its menus if it was in front. A window with no item doesn't come back, as at a reload.
5. **It says so.** `pending` clears, and `onInstalled` fires, which also redraws the Finder's icons with the new code's kinds.

If the new code fails, its `init` throwing or an `open` rejecting as its windows reopen, it comes down and the old code starts again in its place, fresh, in the same one step, with its windows reopened the same way. The restart is refused, still `pending`. If the old code fails too, it's down, as a failed reopen leaves one, and what's installed says why. The console names each failure.

The saved session holds through a restart, as it holds through the boot: a write while the windows are closed would drop their depth. A page left mid-restart, at the offer to save say, reopens them at the next boot, on the kept file.

It resolves `{ status: 'restarted', app, previous }`, `app` its entry in what's installed and `previous` the version that ran before, or `{ status: 'refused', why, reason }`, the old code running on where any ran:

| `why` | |
| --- | --- |
| `not-installed` | No application has that id. |
| `built-in` | It's in `apps`: its code is the page's own. |
| `not-running` | The boot skipped it, or it failed. `install` with `replace` loads one of those at once already. |
| `cancelled` | It held something unsaved and the visitor cancelled at its offer to save, or a window of it stayed open at its own close's question. |
| `code` | Its code didn't load, its factory gave no application, its `init` threw, an `open` rejected as its windows reopened, or asking it before it quit threw. |
| `kind` | It registers a kind another application registers, which `reason` names. |

What carries over is what the application keeps outside its code: its catalog items, its documents, what it saved at its offer to save, its icons and their places, its windows' boxes, and what it keeps in storage of its own, a best score say. What it holds in memory doesn't, as at a reload: a game in progress ends. Another application's `ctx.apps` reads the new code's actions, since it reads them at the call. A palette is its `init`'s to adopt again, as at a reload; one with an item, adopted with `pin: ctx.windows.rememberedPin(item) ?? ctx.state?.pin(item)`, keeps the box it had.

An application that restarts itself does nothing after the call. The restart waits for the boot, its turn and the new code's load before anything closes, so the handler that called it has returned; the promise settles once the new code runs, into the old code, whose `ctx` is torn down, and anything that code sets up then is never torn down.

An application on a page older than `restart` and `beforeQuit` finds neither. One that wants such pages checks for them before it uses them, as for `ctx.install`.

### What's installed

`installed()`, on the shell and on `ctx`, lists every application on the desktop, built in first, in `apps` order, then the installed ones, in the order they were installed. `onInstalled(fn)` calls `fn(installed())` each time any of it changes; on `ctx` it is torn down with the application, and on the shell it returns its unsubscribe. `appFile(id)` resolves an installed application's file, byte for byte, as a `File` named `<Name>.png`, or `null` for one built in or not installed.

| `InstalledApp` | |
| --- | --- |
| `id`, `name` | Its id, and its manifest's or definition's name. |
| `source` | `'built-in'`, from `apps`, or `'installed'`. |
| `manifest` | Its app file's manifest: an installed one's, and a built-in's that came from `?app`. `null` for any other. |
| `standing`, `key` | An installed one's standing with the site's trust at its last check, and the public key that signed it (§ Trust). `null` for one built in. |
| `loaded` | Whether it loaded and runs. |
| `why`, `reason` | Why it didn't load: `'not-app-file'`, `'api'`, `'signature'`, `'untrusted'`, `'kind'` or `'code'`, and the words for people. `null` while it loaded, or hasn't yet. |
| `pending` | A newer file than the code running is kept, and runs once the application restarts (§ Restarting), or from the next load. |
| `bytes` | An installed one's file's size, or `null`. |

`ctx.ready`, as `shell.ready`, settles once the boot is done, so an application can act once every other has loaded or been skipped. An application installed after the boot finds it settled.

### The boot

The boot reads the catalog and runs the seed, which can install (§ Defaults that install), then loads every installed application, then reopens the session, so an installed application's windows come back as a built-in's do. `ready` settles after them.

- One that doesn't load is skipped, and the rest boot: a file that no longer reads, an `api` this SDK doesn't run, a signature that no longer holds, a trust that no longer takes it, a kind another application has, or code that throws as it loads or in `init`. Its icon stays, drawn from its manifest, opening it says why, and what's installed keeps why.
- Its windows stay in the saved session as they were, the open ones still marked open through every write, so they reopen when it loads.
- A kept file no icon names is dropped, not loaded: its icon's write never came, or a restore replaced the catalog.
- A kept file whose id an application in `apps` has is left alone, unlisted, and loads again once the site stops building that one in.

An `init` that throws, or a reopen whose `open` rejects, takes down that application alone, built in or installed. The console names it and its error.

### Trust

A loaded application runs with the page's whole reach, so a site says whose files it takes:

```ts
// The site's public key, as generateSigningKeys() gave it: 44 characters of base64.
const SITE_KEY = 'iPLmyPyGUzpnlN2fCzsmlgp+TYWKFPX8yEivJxKcsng='

createShell(desktop, {
  apps,
  trust: { keys: [SITE_KEY], otherwise: 'ask' },
})
```

| `trust` | |
| --- | --- |
| `keys` | The Ed25519 public keys the site holds, base64, as `generateSigningKeys()` gives them ([APP-FILES.md § Signing](./APP-FILES.md#signing)). Any number, or none. One that isn't a key stops `createShell`. |
| `otherwise` | What a file none of them signed gets, unsigned or signed by another key: `'install'`, `'refuse'`, or `'ask'`, the default. |

A file's standing is `trusted`, signed by a key the site holds; `untrusted`, signed by another; `unsigned`; or `broken`, a signature that doesn't hold. A trusted file installs without asking. A broken one is refused whatever the trust. Any other gets `otherwise`, and `'ask'` raises the Finder's `untrusted-application` alert, which a site answers with its own through `alertWith`; with no Finder to ask, it's refused. Without `trust`, any app file installs, so another desktop on the shell can run open.

A file is checked at every load, not only at install: one changed in storage loses its standing, and the boot skips it. The trust's question can't be asked at a boot, so a file the visitor said to install keeps that answer for its standing and key, and loads while the trust still asks; one the trust now refuses is skipped. The standing is in install's answer and in what's installed.

### The index

`index` on `createShell` is the URL of the site's index of app files, and every application reads it as `ctx.index`, `null` when the site gives none. A store in an app file then holds no URL of its own. Set it from a build constant, never from the address: a link that pointed it elsewhere would offer anyone's code as the site's.

### Documents nothing opens

A document stays whether or not an application opens it. One whose kind no application registers, its application uninstalled say, is listed where it was, drawn with the Finder's `document` art, and moves, renames and goes to the Trash as any item does. Opening it raises the Finder's `no-application` alert. Registering its kind, at the start or at an install, gives it its icon back.

Its kind's hooks went with its application, so meanwhile Copy copies its record and its `data`, and Empty Trash removes its record and weighs it as nothing. A payload its application kept in a store of its own is neither copied nor dropped.

### Defaults that install

A seed function gets the install door beside the catalog, so a new desktop's applications are installed files from the first. `appFiles()`' `?app-file` import gives a file's URL, the file served byte for byte, and its manifest ([APP-FILES.md § A site's build](./APP-FILES.md#a-sites-build)):

```ts
import meteors from '../apps/Meteors.png?app-file'

finder({
  storage,
  art,
  seed: async (catalog, install) => {
    await install(await (await fetch(meteors)).arrayBuffer())
  },
})
```

A site's own command installs through `ctx.install`, a Restore Default Files say, and the site through `shell.install` once `ready` has settled, to give the icons of a desktop from before their files with `replace: true`.

### Where installs are kept

An installed application's file is a record of the Finder's own storage, beside the catalog's items, one per application however many icons it has: `#app:<id>`, its file base64 in its `data`. Wherever the storage keeps items it keeps installs: `memoryStorage()` forgets them on reload, as it forgets everything else, `indexedDbStorage()` keeps them, and a site's own storage gets them through the same three calls. The file is written before the icon, so a crash between the two leaves a file no icon names, which the next boot drops.

### Loading the code

An installed application's code is one ES module that imports `vintage-frames`, `system-online-sdk` and `system-online-sdk/pure` by name, and reaches the page's own copies of them: one registry of elements, one shell, `instanceof VfWindow` true across both, in a site's production build and under its dev server alike. The shell makes a `blob:` module of each from the namespace it holds, and rewrites the code's imports, the declarations it opens with, to point at them. The code itself loads as a `blob:` module too.

A page asks nothing of its HTML for it. A page with a Content-Security-Policy allows `blob:` in `script-src`.

## Saved state

```ts
createShell(desktop, { apps, state: localStorageState('my-site', { extra: { greet: true } }) })
```

`localStorageState(key, { extra })` keeps one versioned key:

- each window's place and its depth,
- the active window's item,
- the desktop pattern,
- the site's own keys: `state.get('greet')`, `state.set('greet', false)`.

The boot reopens the windows that were open, deepest first, then activates the one that was active. A palette's box is kept but never reopened as a window. A window of an application that isn't running, one the boot skipped say, stays marked open through every write, and reopens once the application loads. Writes wait a moment after a change, and nothing is written until the boot has reopened the session. Hiding or leaving the page writes at once. `?fresh=1` in the address neither reads nor writes. With `state: null` nothing is saved.

The catalog's storage and the saved session are separate: a site can keep either, or both.

## Pieces on their own

Each module also works alone, on a page built from the elements ([vintage-frames' FINDER.md](https://github.com/aportilla/vintage-frames/blob/main/docs/FINDER.md)):

| Export | |
| --- | --- |
| `fileByDrag(desktop, options)` | Filing by drag over the page's own model. The options say what a container is, what may be filed where, and what filing does. Returns the teardown. |
| `createCatalog(options)` | The catalog over any storage. |
| `createWindowManager(desktop, options)` | The window manager without the menu bar. |
| `pinOf`, `pinTo`, `frameOf`, `cascadedBox`, `centeredBox`, `desktopLattice`, `folderLattice`, `trashCell`, `nextFreeCell`, `freeCellNear`, `cleanUp`, `fillOrder`, `fieldExtent`, `collisions` | The geometry, pure: boxes and positions in whole system px. |
| `localStorageState`, `readSession`, `mergeSession` | The saved session. |
| `installedFamiliesOf`, `FontFamily`, `FontStrike` | The system's fonts' rule and types, pure (§ Fonts). |
| `startClock` | The clock. |
| `readAppFile`, `inspectAppFile`, `checkSignature`, `judgeSignature`, `satisfies`, `compareVersions`, `appRuns`, `APP_FILE_FORMAT`, `APP_API`, `APP_API_OLDEST`, `BOX_SCALE` | An app file's manifest and code, or why it isn't one; its signature, and what a site's trust says of it; a version checked against a range, and versions put in order; whether this SDK runs an application, and the app API levels it runs; the scale every box is drawn at ([APP-FILES.md](./APP-FILES.md)). |
| `VERSION` | The SDK's version. |

`system-online-sdk/pure` exports the catalog, the system's fonts' rule and types, the geometry, the saved session, the app file reader with its signature check and `VERSION` alone. They import nothing of vintage-frames and touch no DOM when imported, so a site's own pure modules, and their tests under Node, import them from there:

```ts
import { createCatalog, memoryStorage, childrenOf, isPin, cascadedBox } from 'system-online-sdk/pure'
```

`system-online-sdk` exports the same names.

## The reference page

This repo's `index.html` runs the shell with the Finder and Note Pad, a small application with documents of its own kind, an Info palette, a close that asks about unsaved changes in an alert of its own, a `beforeQuit` that makes leaving the page ask first while a note is unsaved, a `claim` that makes a note of a dropped text file, Window → Full Screen (⌃F), which gives the front note the whole screen and reads Exit Full Screen while it has it, and a Font menu of the installed families (`demo/main.ts`). Its System Folder sits on the desktop. Its Apple Menu Items holds Note Pad, and its Fonts a suitcase of each of the two families the page serves its system, vintage-frames' own faces (`demo/fonts.ts`). No application there opens a suitcase, so opening one raises the Finder's alert. It sets no trust, so an app file dropped on it installs. `?save=1` keeps the catalog, the installs and the session across reloads, `?cleanup=1` turns on Clean Up after a resize, and `?open=Projects&open=Archive` opens those items at load. `verify:front`, `verify:windows`, `verify:finder`, `verify:fonts` and `verify:installs` drive it, the last two fixtures of their own too, and `verify:unit` tests the pure modules and the build entry under Node ([DEVELOPING.md](./DEVELOPING.md)).
