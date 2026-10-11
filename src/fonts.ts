/**
 * The system's fonts: the families a site serves, and which of them are
 * installed. Pure and DOM-free — it runs under Node — like the catalog,
 * whose Fonts folder says what is installed.
 *
 * - A site serves its families, each strike a woff2 at a URL of its own.
 *   Nothing is fetched until an application loads a strike (strikes.ts), and
 *   the SDK ships no fonts, as it ships no art.
 * - A suitcase, an item of the shell's `font` kind, names a family. One
 *   directly in Fonts installs its family, when the site serves it.
 * - Without a Fonts folder, without a catalog, or while the catalog isn't
 *   available (before the boot reads it, or when storage fails), every
 *   family the site serves is installed.
 */

import { FONTS, childrenOf, fontFamilyOf, itemOf } from './catalog.js'
import type { CatalogState } from './catalog.js'

/** One strike of a family the site serves: a bitmap font at one size, as a woff2. */
export interface FontStrike {
  /** The size its family names it by: points, or pixels (`FontFamily.sizes`). */
  size: number
  /** The font-size, px, that draws one design px per system px: its font rect's height. */
  line: number
  /** Its line pitch, px. */
  pitch: number
  /** Its woff2: a URL the page fetches it from. */
  url: string
  /** The file's size in bytes, which a suitcase's size adds up. */
  bytes: number
  /** Every character it carries. */
  chars: string
}

/** A family the site serves: what a suitcase names, and its strikes. */
export interface FontFamily {
  /** Its name, which a suitcase's `data.family` names. */
  name: string
  /** What its strikes' sizes count: points, the default, or pixels where a point size is unknown. */
  sizes?: 'points' | 'pixels'
  strikes: readonly FontStrike[]
}

/** Names in order, case and accents aside. */
const nameOrder = new Intl.Collator('en')

/**
 * The installed families, by name: those of the suitcases directly in Fonts
 * that the site serves, each once. Without a Fonts folder, without a catalog
 * (null) or while it isn't available, every family the site serves. A family
 * the site lists twice is its first.
 */
export function installedFamiliesOf(state: CatalogState | null, families: readonly FontFamily[]): FontFamily[] {
  const served = new Map<string, FontFamily>()
  for (const family of families) if (!served.has(family.name)) served.set(family.name, family)
  let installed = [...served.values()]
  if (state?.available && itemOf(state, FONTS)) {
    const named = new Set(childrenOf(state, FONTS).map(fontFamilyOf))
    installed = installed.filter((family) => named.has(family.name))
  }
  return installed.sort((a, b) => nameOrder.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
