# system-online-sdk

Applications over a System 7 desktop, on the [vintage-frames](https://github.com/aportilla/vintage-frames) elements. The shell runs them: a window manager, a menu bar that shows the front application's menus, a catalog of what is where, and a stock Finder with folders, aliases, filing, Clean Up and the Trash. A System Folder's contents set the Apple menu and what opens at startup. An application can ship as one PNG, its app file, which the SDK's Vite plugins write and build into a site.

```sh
npm install system-online-sdk vintage-frames
```

```ts
import 'vintage-frames'
import { createShell, finder, memoryStorage } from 'system-online-sdk'

createShell(document.querySelector('vf-desktop'), {
  apps: [finder({ storage: memoryStorage(), seed: 'markup', art })],
  fit: 'viewport',
})
```

| Entry | |
| --- | --- |
| `system-online-sdk` | The shell: `createShell`, `defineApp`, the window manager, the stock Finder, the catalog and its storage, the saved session. |
| `system-online-sdk/pure` | The catalog, the geometry, the saved session and the app file reader. No DOM and no elements, so they run under Node. |
| `system-online-sdk/build` | `appFile()` and `appFiles()`, the Vite plugins that write app files and build them into a site, and the packer. Build only. |
| `system-online-sdk/build/client` | The types of a `*.png?app` import. |

vintage-frames is a peer dependency: the page loads one copy of the elements, and the SDK names the range it takes. The shell is experimental, and its API may change in any minor release.

## Where to start

| Building | Start at |
| --- | --- |
| A site: the page that hosts the desktop and chooses its applications | [GUIDE § A site in five steps](https://github.com/aportilla/system-online-sdk/blob/main/docs/GUIDE.md#a-site-in-five-steps) |
| An application: a site's own, or one that ships as an app file from a repo of its own | [GUIDE § Writing an application](https://github.com/aportilla/system-online-sdk/blob/main/docs/GUIDE.md#writing-an-application), then [§ An application in its own repo](https://github.com/aportilla/system-online-sdk/blob/main/docs/GUIDE.md#an-application-in-its-own-repo) |
| A tool that reads or writes app files: an index, a store | [GUIDE § A tool that reads app files](https://github.com/aportilla/system-online-sdk/blob/main/docs/GUIDE.md#a-tool-that-reads-app-files) |

The references are [docs/SHELL.md](https://github.com/aportilla/system-online-sdk/blob/main/docs/SHELL.md), the shell's, and [docs/APP-FILES.md](https://github.com/aportilla/system-online-sdk/blob/main/docs/APP-FILES.md), for app files, the box, the plugins and the app API.

## License

[MIT](https://github.com/aportilla/system-online-sdk/blob/main/LICENSE) © Adam Portilla. An app file's box is lettered in vintage-frames' faces, the kit's own re-drawn strikes based on Chicago and Geneva, originally created by Susan Kare for Apple.
