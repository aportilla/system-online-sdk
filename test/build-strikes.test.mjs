// The faces as data (src/build/*-strike.ts), which the box's text is set
// from: copies of vintage-frames' two faces, on their 16 px em, each glyph's
// ink agreeing with its size, and every character a box's lines need.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { VF_BODY_STRIKE } from '../scripts/.tmp/unit/build/body-strike.js'
import { VF_DISPLAY_STRIKE } from '../scripts/.tmp/unit/build/display-strike.js'

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))

for (const [family, strike] of [
  ['VF Display', VF_DISPLAY_STRIKE],
  ['VF Body', VF_BODY_STRIKE],
]) {
  test(`${family}: the face's family and em, and every printable ASCII character`, () => {
    assert.equal(strike.family, family)
    assert.equal(strike.ascent + strike.descent, 16)
    for (const char of PRINTABLE_ASCII) assert.ok(strike.glyphs[char], `${JSON.stringify(char)} is missing`)
  })

  test(`${strike.family}: rows agree with each glyph's size, in # and . alone; the spaces have an advance and no ink`, () => {
    for (const [char, glyph] of Object.entries(strike.glyphs)) {
      assert.equal(glyph.rows.length, glyph.height, char)
      for (const row of glyph.rows) {
        assert.equal(row.length, glyph.width, char)
        assert.match(row, /^[#.]+$/)
      }
    }
    for (const space of [' ', ' ', ' ']) {
      assert.ok(strike.glyphs[space].advance > 0)
      assert.deepEqual(strike.glyphs[space].rows, [])
    }
  })
}
