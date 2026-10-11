# Publishing

The SDK's releases on npm, as `system-online-sdk`. The npm account and the habits are vintage-frames' ([its PUBLISHING.md](https://github.com/aportilla/vintage-frames/blob/main/docs/PUBLISHING.md)): 2FA on, so `npm publish` is always done by hand.

## Versioning

npm versions are [semver](https://semver.org). Pre-1.0, a caret range takes patches alone:

| Change | Bump |
| --- | --- |
| Bug fix, docs, internal refactor | patch |
| An addition | patch |
| Breaking: a renamed or removed export, a changed default | **minor** |

**The app API has a level of its own** ([APP-FILES.md § The app API](./APP-FILES.md#the-app-api)), whatever the version bump. A release that changes or removes something a built application can use raises `APP_API` in `src/app-file.ts`; one that only adds leaves it alone. Raise `APP_API_OLDEST` too when applications built before can't run on the release.

**vintage-frames is a peer dependency.** Moving to a new vintage-frames minor is a release of the SDK: install it as the dev dependency, set the peer range to match, run `npm run analyze`, and let the release check judge what the kit changed. A site moves both packages together.

## The release routine

```sh
npm version patch        # or minor — the table above
git push --follow-tags
npm publish
```

`npm version` commits the bump and tags it (`v0.1.1`). Its `version` script regenerates `app-api.json` and writes the new version into `src/version.ts`, the SDK's `VERSION`, so the bump's commit carries both. `npm publish` runs `prepack`, which builds `dist/` and the list.

**The app API check.** Before it bumps, `npm version` runs `npm run check:app-api`, which regenerates `app-api.json` and compares it with the last release's tag. When something was removed or changed and `APP_API` didn't go up, it stops and lists each one with its old and new type. Raise the level, commit and bump again. Or, when every change keeps applications built at the level running (a parameter that gained a default, a type TypeScript now prints another way, something only a page uses), let it through:

```sh
APP_API_COMPATIBLE=1 npm version patch
```

Run `npm run check:app-api` any time to see what changed since the last release.

## The first publish, 0.1.0

package.json already says 0.1.0, so the first release has no `npm version`. vintage-frames 0.20.0 has to be on npm first: the SDK's peer and dev ranges ask for it.

```sh
npm install              # writes package-lock.json against vintage-frames 0.20.0
npm test
npm run build            # app-api.json comes out unchanged
git add -A && git commit -m "system-online-sdk 0.1.0"
git tag -a v0.1.0 -m "system-online-sdk 0.1.0"
git push -u origin main --follow-tags
npm publish --dry-run    # dist/, README.md, LICENSE, package.json
npm publish
```

The tag matters: the next release's app API check compares against the newest `v*` tag's `app-api.json`.
