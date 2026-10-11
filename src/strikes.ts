/**
 * Loading a strike of a family the site serves: each registered once per
 * page through the FontFace API, under a name of its own, its family's and
 * its size ("Geneva 9"), since CSS can't pick a bitmap strike by size. Its
 * file is fetched the first time an application asks for it, and not before.
 *
 * - A face registers at weight 100 to 900: window content inherits the
 *   kit's weight 700, and a face registered at the default 400 gets a
 *   synthesized bold over every stem.
 * - Once per page, so a shell made again after a hot reload finds the faces
 *   it registered. A strike that doesn't load is forgotten, so a later call
 *   tries again.
 */

import type { FontFamily } from './fonts.js'

/** Each strike's registration, under the name it's registered by, until it fails. */
const faces = new Map<string, Promise<string | null>>()

/** `text` as a quoted CSS string. */
const cssString = (text: string): string =>
  `"${text.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`

/** Register a face and resolve its `font-family`, or null when it doesn't load. */
async function register(name: string, url: string): Promise<string | null> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return null
  try {
    const face = new FontFace(name, `url(${cssString(url)})`, { style: 'normal', weight: '100 900' })
    await face.load()
    document.fonts.add(face)
  } catch {
    return null
  }
  return cssString(name)
}

/**
 * Register `family`'s strike of `size` once, and resolve its `font-family`:
 * the strike's own name, quoted, ready to set as `--vf-font-family`. Null
 * for a strike the family doesn't have, and when its file doesn't load.
 */
export function loadStrike(family: FontFamily | null, size: number): Promise<string | null> {
  const strike = family?.strikes.find((s) => s.size === size)
  if (!family || !strike) return Promise.resolve(null)
  const name = `${family.name} ${strike.size}`
  let pending = faces.get(name)
  if (!pending) {
    const registering = register(name, strike.url)
    // Forgotten as it fails, before any caller hears, so the next call tries again.
    void registering.then((loaded) => {
      if (loaded == null && faces.get(name) === registering) faces.delete(name)
    })
    faces.set(name, registering)
    pending = registering
  }
  return pending
}
