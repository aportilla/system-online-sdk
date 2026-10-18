# App files

An application on the shell ships as one PNG, its app file. The picture is the application's box, for people to see, in a file browser or in a store. Two `iTXt` chunks carry its manifest and its code, and a third, once it's signed, its signature. A desktop runs the application from the chunks alone: built into a site, or installed while it runs ([SHELL.md § Installing applications](./SHELL.md#installing-applications)).

`system-online-sdk/build` writes app files, signs them, and builds them into a site or serves them to it, as two Vite plugins. It runs under Node in a build, and no page imports it. Reading an app file, and checking its signature, are in `system-online-sdk/pure`.

## The file

| `iTXt` keyword | Compressed | Holds |
| --- | --- | --- |
| `system-online.app` | no | the manifest, as JSON |
| `system-online.code` | yes, zlib | the application's code, one ES module |
| `system-online.signature` | no | once signed, the signature, as JSON (§ Signing) |

```json
{
  "format": 2,
  "id": "meteors",
  "name": "Meteors",
  "version": "0.2.0",
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
- The code's default export is the application's factory. It imports `vintage-frames`, `system-online-sdk` and `system-online-sdk/pure` by name, in the declarations it opens with, and the page's own copies serve them. A desktop that installs the file calls the factory with no arguments.
- A reader before signatures skips the signature's chunk, as any reader skips a chunk it doesn't know, so a signed file is format 2 too.

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
- The build fails when the bundle breaks a rule, and says which: CSS or any other file emitted beside the code, more than one module, Lit or a copy of vintage-frames or the SDK bundled in, an import of anything but the three entries, or one a desktop can't point at its own copies when it installs the file: an `import()` of them, or an import past the declarations the module opens with.
- `vite build --watch` writes the file, and the `copyTo` copy, on every rebuild. `app` is read when the build starts, so restart a watch after changing it.
- The build doesn't sign. Signing is a step after it (§ Signing).

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

- `?app` builds the application in. The default export is the application's factory. The definition it returns takes the manifest's icon, and the manifest as `manifest`, so what's installed lists it with its file's manifest. `manifest` is the manifest.
- `?app-file` builds nothing in. The default export is the file's URL: the file served as an asset, byte for byte, so its signature holds, for the shell's install. `manifest` is the manifest, read at build. A file whose signature doesn't hold fails the build, as an install would refuse it.

  ```ts
  import meteors, { manifest } from '../apps/Meteors.png?app-file'

  finder({
    storage,
    art,
    seed: async (catalog, install) => {
      await install(await (await fetch(meteors)).arrayBuffer())
    },
  })
  ```
- The build fails on a file that isn't an app file, and on one the site's SDK doesn't run (`appRuns`): one built at an app API outside the SDK's. It names the application and what it needs.
- The code's imports resolve to the site's own vintage-frames and SDK, so the page keeps one copy of each.
- A new app file reloads the dev server's page.

For the imports' types, add `system-online-sdk/build/client` to tsconfig.json beside `vite/client`:

```json
{ "compilerOptions": { "types": ["vite/client", "system-online-sdk/build/client"] } }
```

## Signing

A signature says who made a file, so a site can take code that runs with the page's whole reach from the people it trusts ([SHELL.md § Trust](./SHELL.md#trust)). It is Ed25519, through WebCrypto, so neither a browser nor Node needs a dependency to sign or check one.

- **It covers every byte of the file but its own chunk.** A changed byte of the manifest, the code or the box breaks it, so the box a store shows is the author's too.
- **The chunk** is `system-online.signature`, before IEND, uncompressed: `{ "algorithm": "Ed25519", "key": "…", "signature": "…" }`, the public key's 32 bytes and the signature's 64, each base64. It carries its key, so a desktop tells a file signed by a key it doesn't hold from one changed since it was signed.
- **Signing is a step after the build**, with a key that never leaves the machine that signs. `generateSigningKeys()` makes a pair: the public key, base64, which a site lists in its trust, and the private key, its PKCS #8 bytes as base64. `signAppFile(file, privateKey)` takes the private key that way or as PEM, replaces a signature already there, and refuses a file that isn't an app file.
- **`writeAppFile` drops a signature** with the app chunks, so a rewritten file never carries one that doesn't match it. Sign last.
- **Checking is pure**, in `system-online-sdk/pure`, so an index's CI and a store run it alike. `checkSignature(file)` resolves `{ status: 'unsigned' }`, `{ status: 'signed', key }`, or `{ status: 'broken', key, reason }` for a signature that doesn't hold: the file changed, two signatures, a chunk that doesn't read, another algorithm, or a platform that can't check one. `judgeSignature(check, trust)` is what a site's trust says of it: the standing, `trusted`, `untrusted`, `unsigned` or `broken`, and the answer, `install`, `ask` or `refuse`.

```sh
# Once: a key pair. Keep the private key out of every repo.
node --input-type=module -e "import { generateSigningKeys } from 'system-online-sdk/build'; console.log(await generateSigningKeys())"
```

```ts
// A publish step: sign, then file the signed copy.
import { readFile, writeFile } from 'node:fs/promises'
import { signAppFile } from 'system-online-sdk/build'
import { checkSignature } from 'system-online-sdk/pure'

const signed = await signAppFile(new Uint8Array(await readFile('dist/Meteors.png')), process.env.SIGNING_KEY!)
console.log(await checkSignature(signed)) // { status: 'signed', key: '…' }
await writeFile('apps/meteors/0.3.1/Meteors.png', signed)
```

An index's CI checks every file with `checkSignature` and never signs.

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

- **Imports**: `vintage-frames`, `system-online-sdk`, `system-online-sdk/pure` and its own files, statically: a desktop that installs the file points the imports its module opens with at its own copies, and no others. No Lit of its own.
- **Art** is imported, so the build inlines it. No page paths.
- **Layout** is set on its own elements. No CSS import.
- **Session keys** start with its id, read back defensively, and nothing breaks when `ctx.state` is null.
- **Nothing site-specific** through the context: no `ctx.services`, no `ctx.apps`. The site's index is `ctx.index`, and a desktop that installs the file hands its factory nothing.
- **Fonts are the system's**: it sets type in the families the site serves, reached through `ctx.fonts`, and carries no strikes. One that opens font suitcases says `opens: ['font']`, since the kind is the shell's ([SHELL.md § Fonts](./SHELL.md#fonts)).
- **Its kinds** are named after its id, and **its id never changes**: saved icons, windows and sessions name it.

The build checks the first three.

## Pieces on their own

| `system-online-sdk/build` | |
| --- | --- |
| `packApp({ manifest, icon, code, artwork })` | The whole app file. `manifest` has no `format`, `api` or `icon`; they are filled in. |
| `composeBox({ manifest, icon, artwork })` | The box alone, as a PNG. |
| `writeAppFile(box, manifest, code)` | `box` with the manifest and code in its chunks. App chunks already there are replaced, a signature is dropped, and the picture is copied as it is. |
| `signAppFile(file, privateKey)` | The file signed (§ Signing). |
| `generateSigningKeys()` | A new Ed25519 key pair, `{ publicKey, privateKey }`, each base64. |

| `system-online-sdk/pure` | |
| --- | --- |
| `readAppFile(bytes)` | The manifest and code, or `null` for any other PNG: a broken signature or CRC, a chunk missing or doubled, a format this SDK doesn't read, a field missing or unreadable. |
| `inspectAppFile(bytes)` | The manifest and code, or why the bytes aren't an app file, as the end of a sentence: "Meteors.png is not an app file: its code is missing". The wording is for people and can change in any release. A signed file reads as any other. |
| `checkSignature(bytes)` | Whether the file is signed, by which key, and whether the signature holds (§ Signing). |
| `judgeSignature(check, trust)` | What a site's trust says of a checked file: its standing and the answer. |
| `satisfies(version, range)` | Whether a version meets an exact version or a caret range. |
| `compareVersions(a, b)` | Below zero, zero or above as `a` comes before, with or after `b`, in semver's order, so `versions.sort(compareVersions)` puts them oldest first. Anything that isn't a version comes first, so a sort never throws. |
| `appRuns(manifest)` | Whether this SDK runs the application: its `api` from `APP_API_OLDEST` to `APP_API`. |
| `APP_API` | The app API this SDK provides: `3`. |
| `APP_API_OLDEST` | The oldest app API this SDK runs: `3`. |
| `VERSION` | The SDK's version. |
| `APP_FILE_FORMAT` | The format this SDK reads and writes: `2`. |
| `BOX_SCALE` | The scale every box is drawn at: `3`, each system px a 3 × 3 block of the picture's px. |
