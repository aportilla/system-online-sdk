// The system's fonts (src/fonts.ts): which of the families a site serves are
// installed, by the suitcases in the System Folder's Fonts.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALIAS_KIND,
  DISK,
  FONTS,
  FONT_KIND,
  TRASH,
  createCatalog,
  installedFamiliesOf,
  memoryStorage,
} from '../scripts/.tmp/unit/pure.js'

const strike = (size) => ({ size, line: size + 3, pitch: size + 3, url: `/fonts/${size}.woff2`, bytes: 1000 + size, chars: 'Aa' })
const family = (name, ...sizes) => ({ name, strikes: sizes.map(strike) })
const FAMILIES = [family('Geneva', 9, 12), family('athens', 18), family('Chicago', 12), family('Symbol', 12)]
const names = (families) => families.map((f) => f.name)

const SYSTEM = { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items', fonts: 'Fonts' }

/** A catalog with suitcases and aliases listed, as the shell lists them, over `storage`. */
async function library({ system = SYSTEM, storage = memoryStorage() } = {}) {
  let n = 0
  let t = 1000
  const catalog = createCatalog({
    storage,
    volumes: { trash: 'Trash', disk: 'Macintosh HD' },
    system,
    listed: (kind) => kind === FONT_KIND || kind === ALIAS_KIND || kind === 'text',
    now: () => t++,
    newId: () => `id${++n}`,
  })
  await catalog.refresh()
  const suitcase = (name, parent, fields = {}) =>
    catalog.create({ name, kind: FONT_KIND, parent, data: { family: name }, ...fields })
  return { catalog, suitcase }
}

test('installed: the families of the suitcases directly in Fonts that the site serves, by name, each once', async () => {
  const { catalog, suitcase } = await library()
  await suitcase('Symbol', FONTS)
  await suitcase('Geneva', FONTS)
  await suitcase('athens', FONTS)
  await suitcase('Geneva', FONTS, { name: 'Geneva copy' })
  await suitcase('Zapf Dingbats', FONTS)
  const chicago = await suitcase('Chicago', DISK)
  assert.deepEqual(names(installedFamiliesOf(catalog.get(), FAMILIES)), ['athens', 'Geneva', 'Symbol'])
  const [first] = installedFamiliesOf(catalog.get(), FAMILIES)
  assert.equal(first, FAMILIES[1], 'the site’s own family, strikes and all')

  // Moved in, it's installed; trashed, it isn't.
  await catalog.move([chicago.id], FONTS)
  assert.deepEqual(names(installedFamiliesOf(catalog.get(), FAMILIES)), ['athens', 'Chicago', 'Geneva', 'Symbol'])
  const symbol = catalog.get().items.find((i) => i.name === 'Symbol')
  await catalog.move([symbol.id], TRASH)
  assert.deepEqual(names(installedFamiliesOf(catalog.get(), FAMILIES)), ['athens', 'Chicago', 'Geneva'])
})

test('installed: only a suitcase directly in Fonts: not one in a folder there, an alias of one, or another kind naming a family', async () => {
  const { catalog, suitcase } = await library()
  const folder = await catalog.create({ name: 'More', parent: FONTS })
  await suitcase('Geneva', folder.id)
  const chicago = await suitcase('Chicago', DISK)
  await catalog.create({ name: 'Chicago alias', kind: ALIAS_KIND, parent: FONTS, data: { original: chicago.id, kind: FONT_KIND } })
  await catalog.create({ name: 'Symbol', kind: 'text', parent: FONTS, data: { family: 'Symbol' } })
  assert.deepEqual(installedFamiliesOf(catalog.get(), FAMILIES), [])
})

test('installed: every family the site serves without a Fonts folder, without a catalog, or while it isn’t available', async () => {
  const all = ['athens', 'Chicago', 'Geneva', 'Symbol']
  const { fonts: _, ...withoutFonts } = SYSTEM
  const { catalog: unnamed, suitcase } = await library({ system: withoutFonts })
  await suitcase('Geneva', DISK)
  assert.deepEqual(names(installedFamiliesOf(unnamed.get(), FAMILIES)), all, 'no Fonts folder named')
  const { catalog: none } = await library({ system: null })
  assert.deepEqual(names(installedFamiliesOf(none.get(), FAMILIES)), all, 'no System Folder at all')
  assert.deepEqual(names(installedFamiliesOf(null, FAMILIES)), all, 'no catalog')

  // Before the boot reads it, and when storage fails, Fonts lists empty: every family all the same.
  const storage = memoryStorage()
  const { suitcase: store } = await library({ storage })
  await store('Geneva', FONTS)
  const unread = createCatalog({ storage, system: SYSTEM, listed: () => true })
  assert.equal(unread.get().available, false)
  assert.deepEqual(names(installedFamiliesOf(unread.get(), FAMILIES)), all, 'not yet read')
  await unread.refresh()
  assert.deepEqual(names(installedFamiliesOf(unread.get(), FAMILIES)), ['Geneva'], 'read')
  const broken = createCatalog({
    storage: { list: () => Promise.reject(new Error('private window')), put: async () => {}, remove: async () => {} },
    system: SYSTEM,
  })
  const warn = console.warn
  console.warn = () => {}
  await broken.refresh()
  console.warn = warn
  assert.deepEqual(names(installedFamiliesOf(broken.get(), FAMILIES)), all, 'storage failed')
})

test('installed: an empty Fonts installs nothing; a family the site lists twice is its first; no families, none', async () => {
  const { catalog, suitcase } = await library()
  assert.deepEqual(installedFamiliesOf(catalog.get(), FAMILIES), [], 'available, and empty')
  await suitcase('Geneva', FONTS)
  const twice = [...FAMILIES, family('Geneva', 10)]
  const [geneva] = installedFamiliesOf(catalog.get(), twice)
  assert.deepEqual(geneva.strikes.map((s) => s.size), [9, 12])
  assert.deepEqual(installedFamiliesOf(null, twice).filter((f) => f.name === 'Geneva').length, 1)
  assert.deepEqual(installedFamiliesOf(catalog.get(), []), [])
  assert.deepEqual(installedFamiliesOf(null, []), [])
})
