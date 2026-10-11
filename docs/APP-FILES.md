# App files

An application on the shell ships as one PNG, its app file. The picture is the application's box, for people to see, in a file browser or in a store. Two `iTXt` chunks carry its manifest and its code. A desktop runs the application from the chunks alone.

`system-online-sdk/build` writes app files and builds them into a site, as two Vite plugins. It runs under Node in a build, and no page imports it. Reading an app file is in `system-online-sdk/pure`.

## The file

| `iTXt` keyword | Compressed | Holds |
| --- | --- | --- |
| `system-online.app` | no | the manifest, as JSON |
| `system-online.code` | yes, zlib | the application's code, one ES module |

```json
{
  "format": 2,
  "id": "meteors",
  "name": "Meteors",
  "version": "0.1.1",
  "requires": "^0.1.0",
  "api": 3,
  "author": "Adam Portilla",
  "description": "An Asteroids-style game on a 320 × 240 1-bit screen.",
  "icon": "data:image/png;base64,iVBORw0KGgo…"
}
```

- `format` is the app file's own version. A reader refuses a format it doesn't know.
- `version` is the application's version, exactly as semver writes one: `0.1.0`, `1.0.0-rc.1`. No `v`, and no leading zeros.
- `requires` is the `system-online-sdk` range the code was built against, a caret range.
- `api` is the app API the code was built against (§ The app API).
- A reader refuses a manifest whose `version` isn't a version, whose `requires` isn't a version or a caret range, or whose `api` is missing or isn't a whole number from 1, so every manifest it hands on can be put in order and checked against an SDK.
- `description` is optional: what the application is, in a sentence or two of plain text. The format sets no limit on its length, and the box doesn't show it.
- `icon` is the 32 × 32 icon, its PNG as a `data:` URL, so a desktop can show the icon without running the code.
- The code's default export is the application's factory. It imports `vintage-frames`, `system-online-sdk` and `system-online-sdk/pure` by name, and the page's own copies serve them.

Format 1 is what vintage-frames 0.17 to 0.19 wrote, under the keywords `vintage-frames.app` and `vintage-frames.code`, before the shell moved to this SDK. Its code imports `vintage-frames/shell`, which no longer exists, so this SDK reads no format 1 file and says to build it again here.

Anything that re-encodes the picture or strips its metadata drops the chunks: an image optimizer, a chat app that recompresses uploads. Send an app file as a file.

## An application's build

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { appFile } from 'system-online-sdk/build'
import { APP } from './src/app.ts'

export default defineConfig({
  plugins: [appFile({ app: APP, entry: 'src/index.ts', icon: 'src/art/meteors.png', artwork: 'art/box.png' })],
})
```

`npm run build` writes `dist/Meteors.png`, named for the application. `npm run dev` is untouched.

| Option | |
| --- | --- |
| `app` | `{ id, name, version, author, description }`, for the manifest and the box. `version` is a version, such as `0.1.0`: the build refuses any other when it starts. `description` is optional. |
| `entry` | The module whose default export is the application's factory. |
| `icon` | The 32 × 32 icon, a PNG. |
| `artwork` | The box's artwork, a PNG (§ The box). Optional. |
| `copyTo` | A directory to write the app file to as well, such as a site's `apps/`. Optional. |

- The application's repo has `system-online-sdk` and `vintage-frames` as dev dependencies, and Vite.
- `requires` is the repo's `system-online-sdk` range from package.json. It must be a caret range, and the SDK in the build must meet it.
- `api` is the build's SDK's `APP_API`.
- The entry is built as a library: ES, one module, the three entries left as imports, art and `?raw` markup inlined.
- The build fails when the bundle breaks a rule, and says which: CSS or any other file emitted beside the code, more than one module, Lit or a copy of vintage-frames or the SDK bundled in, or an import of anything but the three entries.
- `vite build --watch` writes the file, and the `copyTo` copy, on every rebuild. `app` is read when the build starts, so restart a watch after changing it.

## A site's build

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { appFiles } from 'system-online-sdk/build'

export default defineConfig({
  plugins: [appFiles()],
})
```

```ts
import meteors, { manifest } from '../apps/Meteors.png?app'

createShell(desktop, { apps: [finder({ storage }), meteors()] })
```

- The default export is the application's factory. The definition it returns takes the manifest's icon. `manifest` is the manifest.
- The build fails on a file that isn't an app file, and on one the site's SDK doesn't run (`appRuns`): one built at an app API outside the SDK's. It names the application and what it needs.
- The code's imports resolve to the site's own vintage-frames and SDK, so the page keeps one copy of each.
- A new app file reloads the dev server's page.

For the import's types, add `system-online-sdk/build/client` to tsconfig.json beside `vite/client`:

```json
{ "compilerOptions": { "types": ["vite/client", "system-online-sdk/build/client"] } }
```

## The app API

The app API is what a built application can use while it runs: of the SDK, and of vintage-frames. It has a level of its own, apart from either package's version: the SDK provides `APP_API`, and runs every application built from `APP_API_OLDEST` to `APP_API`.

- It covers the values `vintage-frames`, `system-online-sdk` and `system-online-sdk/pure` export; the shapes they hand an application and take from it, such as `AppDefinition`, `AppContext`, the window manager, the catalog, a kind and an event's detail; and each element's tag, attributes, properties, methods, events, slots, parts, states and `--vf-*` tokens. It also covers behavior these docs and vintage-frames' say an application can rely on.
- It doesn't cover `system-online-sdk/build`, the box, a type's name, or how anything looks. A visual fix reaches every application, since the page's kit draws it.
- `APP_API` goes up when something in the app API changes or goes away. An addition leaves it alone, so an application built on a newer SDK runs on an older page at the same level, and fails only when it reaches something that page lacks. An application that wants older pages checks for something new before it uses it.
- `APP_API_OLDEST` goes up when a change breaks applications built before it and the SDK keeps no old behavior for them.
- The SDK names the vintage-frames range it supports as a peer dependency. Moving to a new vintage-frames is a release of the SDK, and its release check sees what the kit removed or changed.

The levels so far:

| Level | |
| --- | --- |
| 1 | vintage-frames 0.18.1, where levels began. |
| 2 | vintage-frames 0.19.0 took away `ctx.systemItem` and `ctx.systemMenu`: an application in the Apple menu is one Apple Menu Items holds ([SHELL.md](./SHELL.md#the-system-folder)). |
| 3 | system-online-sdk 0.1.0 moved the shell out of vintage-frames: `vintage-frames/shell` became `system-online-sdk`, and `vintage-frames/shell/pure` became `system-online-sdk/pure`. Format 2 came with it. |

`app-api.json`, at the repo's root, lists the app API by name and type, with both levels. `npm run analyze` writes it, reading this repo's sources and the installed vintage-frames: its declarations, its `custom-elements.json` and its SPEC's token table. CI fails when it's stale, so a change to the app API shows in the commit that makes it. `npm version` compares it with the last release's before it bumps ([PUBLISHING.md](./PUBLISHING.md#the-release-routine)).

## The box

The box is the SDK's frame with the application's artwork and text set into it. The frame is a placeholder for now: a white card of 160 × 205 system px, drawn at 3× (480 × 615 px), with a 128 × 128 artwork area, then the application's name in the display face and its version and author in the body face.

- Artwork is a PNG at the artwork area's size, 128 × 128, or that divided by a whole number (64 × 64, 32 × 32 …). It is magnified to fill the area, each of its px a whole number of system px, so it stays on the grid. Any other size fails the build. Transparent pixels show the frame.
- Without artwork, the icon is stamped 9× in the middle, each of its px 3 × 3 system px.
- Text is set in vintage-frames' faces, VF Display and VF Body, a glyph at a time, from a copy of their glyphs as data in this repo. A line too long for its space ends in an ellipsis. A character the face lacks fails the build, naming it.
- Art can be 8-bit gray, RGB, gray with alpha or RGBA, or indexed or gray at 1, 2, 4 or 8 bits, non-interlaced. 16-bit and interlaced files fail the build, naming what to save them as.
- The box can be in color.
- Every box is drawn at 3×, `BOX_SCALE`: a system px is a 3 × 3 block of the picture's px. The frame is drawn that way in every file, and the SDK sets the artwork, the stamped icon and the text on whole blocks. A desktop that shows a box on its grid draws each block as one system px: at a scale that's a multiple of 3 that's the file's own pixels, and at any other each block averages to one.

## The rules an application keeps

- **Imports**: `vintage-frames`, `system-online-sdk`, `system-online-sdk/pure` and its own files. No Lit of its own.
- **Art** is imported, so the build inlines it. No page paths.
- **Layout** is set on its own elements. No CSS import.
- **Session keys** start with its id, read back defensively, and nothing breaks when `ctx.state` is null.
- **Nothing site-specific** through the context: no `ctx.services`, no `ctx.apps`.
- **Its kinds** are named after its id, and **its id never changes**: saved icons, windows and sessions name it.

The build checks the first three.

## Pieces on their own

| `system-online-sdk/build` | |
| --- | --- |
| `packApp({ manifest, icon, code, artwork })` | The whole app file. `manifest` has no `format`, `api` or `icon`; they are filled in. |
| `composeBox({ manifest, icon, artwork })` | The box alone, as a PNG. |
| `writeAppFile(box, manifest, code)` | `box` with the manifest and code in its chunks. App chunks already there are replaced, and the picture is copied as it is. |

| `system-online-sdk/pure` | |
| --- | --- |
| `readAppFile(bytes)` | The manifest and code, or `null` for any other PNG: a broken signature or CRC, a chunk missing or doubled, a format this SDK doesn't read, a field missing or unreadable. |
| `inspectAppFile(bytes)` | The manifest and code, or why the bytes aren't an app file, as the end of a sentence: "Meteors.png is not an app file: its code is missing". The wording is for people and can change in any release. |
| `satisfies(version, range)` | Whether a version meets an exact version or a caret range. |
| `compareVersions(a, b)` | Below zero, zero or above as `a` comes before, with or after `b`, in semver's order, so `versions.sort(compareVersions)` puts them oldest first. Anything that isn't a version comes first, so a sort never throws. |
| `appRuns(manifest)` | Whether this SDK runs the application: its `api` from `APP_API_OLDEST` to `APP_API`. |
| `APP_API` | The app API this SDK provides: `3`. |
| `APP_API_OLDEST` | The oldest app API this SDK runs: `3`. |
| `VERSION` | The SDK's version. |
| `APP_FILE_FORMAT` | The format this SDK reads and writes: `2`. |
| `BOX_SCALE` | The scale every box is drawn at: `3`, each system px a 3 × 3 block of the picture's px. |
