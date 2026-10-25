# Developing

Working on the SDK itself: the reference page, the tests, the box's frame and the app API's list.

## The reference page

```sh
nvm use            # Node 24, from .nvmrc
npm install
npm run dev        # http://localhost:5174
npm run build      # the package to dist/, and app-api.json
npm run typecheck
npm test           # the whole suite (starts its own dev server)
```

[`/`](http://localhost:5174/) is a desktop filling the viewport, with the Finder over a catalog seeded from the page's markup, and Note Pad, a small application with documents, a palette, a close that asks about unsaved changes, a page whose leaving asks first while a note is unsaved, and a Font menu of the installed families (`demo/main.ts`). The page gives its system two families, vintage-frames' own faces, with a suitcase of each in the System Folder's Fonts (`demo/fonts.ts`). `?save=1` keeps the catalog and the session across reloads; `?cleanup=1` turns on Clean Up after a resize; `?open=Projects&open=Archive` opens those items at load. The art in `demo/icons/` and the fonts in `demo/fonts/` are the page's own and don't ship.

The dev server runs on 5174, apart from vintage-frames' on 5173, and serves vintage-frames from `node_modules`, as a site would. To try a vintage-frames change here before it's published, build it there, `npm pack` it, and install the tarball here with `npm install --no-save <tarball>`.

## Tests

```sh
npm test                  # every verify script, in parallel
npm test -- finder unit   # only the ones whose name matches
npm run verify:finder     # one script, against a dev server you started
```

- `verify:unit` compiles the two Node entries, `src/pure.ts` and `src/build/index.ts`, with `tsconfig.unit.json` into `scripts/.tmp/unit`, and runs `test/*.test.mjs` with Node's own runner: the catalog, the system's fonts, the geometry, the saved session, the app file's reader and writer, its signatures and the trust's answers, PNG pixels, the box, the faces as data, and the app API's list and its release check. It also checks the ground rules from the sources: the shell imports vintage-frames only through its root and never the build entry, the pure modules import nothing of the kit, the shell registers no elements and writes no styles, and the build entry reaches no element.
- `verify:front`, `verify:windows`, `verify:finder`, `verify:fonts` and `verify:installs` are Playwright drivers over the reference page: the bar and the front application, the window manager and the saved session, the Finder, the system's fonts, and installing and restarting app files at runtime. The last two boot fixtures of their own too. Their shared code is `scripts/harness.mjs`.
- `verify:installs` makes its app files with the SDK's own packer and signer, compiled for Node into `scripts/.tmp/installs` first, and builds a small site with Vite to install into a production bundle as well as under the dev server.
- The two Vite plugins have no unit tests. Building an application and a site with them checks them.

## The box's frame

Every app file's box is drawn on the SDK's frame: the picture `box/frame.png`, and its slots in `src/build/frame.ts`. After redrawing the picture, `npm run embed:frame` regenerates `src/build/frame-picture.ts`; move the slots with it. `verify:unit` checks that the picture reads and the slots lie inside it.

The lettering is set from vintage-frames' two faces as data, `src/build/*-strike.ts`: copies of the modules vintage-frames 0.19.1 generated from its glyph manifests. They change only when someone copies them again.

## The app API's list

`npm run analyze`, which `npm run build` runs, writes `app-api.json`: the app API by name and type ([APP-FILES.md § The app API](./APP-FILES.md#the-app-api)). `scripts/app-api.mjs` reads the SDK's two runtime entries from source, and vintage-frames as installed: its root's declarations, its `custom-elements.json` for each element's HTML side, and its SPEC's token table. Moving the SDK to a new vintage-frames shows the elements' changes in the list. It stays in the repo and doesn't ship.
