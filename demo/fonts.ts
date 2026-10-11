/**
 * The reference page's system fonts: vintage-frames' own two faces, served
 * from demo/fonts/ as a site serves its strikes. They are the kit's re-drawn
 * strikes in the style of Geneva 9 and Chicago 12, designs Susan Kare
 * created for Apple's original Macintosh, copied from vintage-frames
 * 0.20.0's build. Like demo/icons/, they are the page's and don't ship.
 *
 * Each draws one design px per system px at 16px, so its line is 16; the
 * pitches are the ones the kit measured.
 */

import type { FontFamily } from '../src/index.js'

export const DEMO_FONTS: FontFamily[] = [
  {
    name: 'VF Body',
    strikes: [
      {
        size: 9,
        line: 16,
        pitch: 12,
        url: '/demo/fonts/VF-Body.woff2',
        bytes: 4432,
        chars:
          '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¢£¥§¨©ª«¬®°±²³´µ¶·¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖ×ØÙÚÛÜßàáâãäåæçèéêëìíîïñòóôõö÷øùúûüÿŒœŸƒπ‑–—‘’‚“”„†‡•…‰′″‹›⁄€™Ω←↑→↓↩⇤⇥⇧∂∆∏∑−√∞∫≈≠≤≥⌃⌘⌥⌫⎋⏎■□▴▶▸▾◀◂◆◊○●◦★☆✓✕✗ﬁﬂ',
      },
    ],
  },
  {
    name: 'VF Display',
    strikes: [
      {
        size: 12,
        line: 16,
        pitch: 16,
        url: '/demo/fonts/VF-Display.woff2',
        bytes: 4608,
        chars:
          '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¢£¥§¨©ª«¬®°±²³´µ¶·¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖ×ØÙÚÛÜßàáâãäåæçèéêëìíîïñòóôõö÷øùúûüÿŒœŸƒΩπ‑–—‘’‚“”„†‡•…‰′″‹›⁄€™←↑→↓↩⇤⇥⇧∂∆∏∑−√∞∫≈≠≤≥⌃⌘⌥⌫⎋⏎■□▴▶▸▾◀◂◆◊○●◦★☆✓✕✗ﬁﬂ',
      },
    ],
  },
]
