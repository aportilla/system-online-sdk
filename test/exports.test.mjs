// The shell's ground rules, read from its sources (src/): it reaches
// vintage-frames only through the package's root exports, so whatever it
// needs is exported for every page, and never reaches the build entry; its
// pure modules, and the entry that exports them, reach nothing of the kit; it
// registers no elements, imports none for side effects, writes no styles and
// ships no art. That each name it imports from the kit is exported there,
// TypeScript checks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../src/', import.meta.url)
const entries = readdirSync(dir, { withFileTypes: true })
const sources = entries
  .filter((e) => e.isFile() && e.name.endsWith('.ts'))
  .map((e) => [e.name, readFileSync(new URL(e.name, dir), 'utf8')])
const modules = new Set(sources.map(([f]) => f.replace(/\.ts$/, '.js')))

/** Every module specifier a source imports or re-exports. */
const specifiers = (src) => [...src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

test('the shell reaches vintage-frames only through its root exports', () => {
  for (const [file, src] of sources) {
    for (const spec of specifiers(src)) {
      const ok = spec === 'vintage-frames' || (spec.startsWith('./') && modules.has(spec.slice(2)))
      assert.ok(ok, `${file} imports ${spec}`)
    }
  }
})

test('nothing in the shell imports the build entry', () => {
  for (const [file, src] of sources) {
    for (const spec of specifiers(src)) assert.ok(!spec.includes('build/'), `${file} imports ${spec}`)
  }
})

const PURE = ['./app-file.js', './catalog.js', './fonts.js', './geometry.js', './state.js', './version.js']

test('the pure modules import nothing from the kit, so they run under Node', () => {
  for (const [file, src] of sources) {
    if (![...PURE, './pure.js'].includes(`./${file.replace(/\.ts$/, '.js')}`)) continue
    for (const spec of specifiers(src)) {
      assert.ok(PURE.includes(spec), `${file} imports ${spec}`)
    }
  }
})

test('system-online-sdk/pure re-exports the pure modules, and only them', () => {
  const src = sources.find(([file]) => file === 'pure.ts')[1]
  assert.deepEqual([...new Set(specifiers(src))].sort(), PURE)
})

test('the shell registers no elements and imports none for side effects', () => {
  for (const [file, src] of sources) {
    assert.ok(!/customElements\.define\b/.test(src), `${file} defines an element`)
    assert.ok(!/(?:^|\n)\s*import\s+['"]/.test(src), `${file} imports for side effects`)
  }
})

test('the shell writes no styles and ships no art', () => {
  for (const [file, src] of sources) {
    for (const pattern of [/\.style\b/, /adoptedStyleSheets/, /\bcss`/, /<style\b/, /data:image\//]) {
      assert.ok(!pattern.test(src), `${file} matches ${pattern}`)
    }
  }
  assert.deepEqual(
    entries.filter((e) => !(e.isFile() && e.name.endsWith('.ts')) && !(e.isDirectory() && e.name === 'build')).map((e) => e.name),
    [],
    'src/ holds modules and the build entry alone'
  )
})

test('the package exports the shell at system-online-sdk, and its pure modules at system-online-sdk/pure', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, 'system-online-sdk')
  assert.deepEqual(pkg.exports['.'], { types: './dist/index.d.ts', import: './dist/index.js' })
  assert.deepEqual(pkg.exports['./pure'], { types: './dist/pure.d.ts', import: './dist/pure.js' })
  assert.ok(pkg.peerDependencies['vintage-frames'], 'vintage-frames is a peer: a page loads one copy of the elements')
  assert.ok(!pkg.dependencies?.['vintage-frames'], 'never a dependency of its own')
})
