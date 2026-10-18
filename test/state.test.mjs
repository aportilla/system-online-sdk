// The shell's saved session (src/state.ts): parsing a stored blob, the
// order a boot reopens windows in, and what a write keeps.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { frameOf, mergeSession, openWindowsOf, pinOf, readSession } from '../scripts/.tmp/unit/pure.js'

const pin = pinOf({ left: 40, top: 40, width: 300, height: 200 }, { width: 1000, height: 800 }, frameOf(20))

test('read: a foreign or garbled blob reads as none; bad entries drop; the extras come through', () => {
  assert.equal(readSession(null), null)
  assert.equal(readSession('x'), null)
  assert.equal(readSession({ v: 99 }), null)
  const st = readSession({
    v: 1,
    windows: {
      'f1': { app: 'finder', pin, z: 1 },
      'f2': { app: 'finder', pin: { x: [] } },
      'f3': { pin, z: 0 },
      'f4': { app: 'viewer', pin, z: 1.5 },
    },
    active: '',
    pattern: '  ',
    extra: { greet: false },
  })
  assert.deepEqual(Object.keys(st.windows), ['f1', 'f4'])
  assert.equal(st.windows.f4.z, undefined, 'a depth that is not a whole number is a box alone')
  assert.equal(st.active, null)
  assert.equal(st.pattern, null)
  assert.deepEqual(st.extra, { greet: false })
  assert.deepEqual(readSession({ v: 1, extra: [1] }).extra, {})
})

test('open windows: deepest first; a box alone never reopens', () => {
  const st = readSession({
    v: 1,
    windows: {
      top: { app: 'viewer', pin, z: 2 },
      palette: { app: 'editor', pin },
      bottom: { app: 'finder', pin, z: 0 },
    },
  })
  assert.deepEqual(
    openWindowsOf(st).map((w) => `${w.app}:${w.item}`),
    ['finder:bottom', 'viewer:top']
  )
  assert.deepEqual(openWindowsOf(null), [])
})

test('merge: a known window keeps its box and loses its depth; the snapshot’s go over them', () => {
  const known = { a: { app: 'finder', pin, z: 3 }, b: { app: 'viewer', pin, z: 1 } }
  const session = mergeSession(
    known,
    { windows: { b: { app: 'viewer', pin, z: 0 }, c: { app: 'editor', pin } }, active: 'b', pattern: 'bricks' },
    { greet: true }
  )
  assert.deepEqual(session.windows.a, { app: 'finder', pin })
  assert.equal(session.windows.b.z, 0)
  assert.deepEqual(session.windows.c, { app: 'editor', pin })
  assert.equal(session.active, 'b')
  assert.equal(session.pattern, 'bricks')
  assert.deepEqual(session.extra, { greet: true })
  assert.deepEqual(readSession(JSON.parse(JSON.stringify(session))), session, 'what it writes reads back')
})

test('merge: a window of an application that waits to load keeps its depth, and stays open through write after write', () => {
  const known = { game: { app: 'meteors', pin, z: 2 }, note: { app: 'note-pad', pin, z: 1 }, shut: { app: 'meteors', pin } }
  const snapshot = { windows: { folder: { app: 'finder', pin, z: 0 } }, active: 'folder', pattern: null, waiting: ['meteors'] }
  const once = mergeSession(known, snapshot, {})
  assert.deepEqual(once.windows.game, { app: 'meteors', pin, z: 2 })
  assert.deepEqual(once.windows.note, { app: 'note-pad', pin }, 'a running application’s window that isn’t open loses it')
  assert.deepEqual(once.windows.shut, { app: 'meteors', pin }, 'a box alone stays a box alone')
  const twice = mergeSession(once.windows, snapshot, {})
  assert.deepEqual(openWindowsOf(twice).map((w) => w.item), ['folder', 'game'])
  // Once it runs, its windows are the snapshot's to say.
  const loaded = mergeSession(twice.windows, { ...snapshot, waiting: [] }, {})
  assert.deepEqual(loaded.windows.game, { app: 'meteors', pin })
})
