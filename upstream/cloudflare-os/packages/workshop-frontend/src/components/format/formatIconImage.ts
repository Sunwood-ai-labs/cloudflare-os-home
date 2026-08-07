// A format's icon as an SVG data URL, so a format token in the composer can carry its icon the way
// a capsule carries its vendor logo.
//
// The composer mirror paints token icons with `background-image`, the only way to get a picture
// into a run of text without disturbing its layout. That rules out an element, and
// `background-image` can't inherit `currentColor`, so the brand color is baked into the SVG when
// the format is picked -- a theme switch mid-draft leaves the old color until it is picked again.
//
// `react-dom/server` is imported dynamically; it has no business in the main bundle.

import { createElement } from 'react'
import type { OutputIcon } from '@gadgets/workshop-shared/api'
import { FORMAT_ICONS } from './formats'

// Keyed by icon *and* color, so a theme change produces a new entry instead of a stale hit.
const cache = new Map<string, string>()

function brandColor(): string {
  let value = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-kumo-brand')
    .trim()
  // A CSS variable can resolve to something a data URL can't carry (a `color-mix()`, or nothing at
  // all before styles load), so anything but plain hex falls back to a theme-neutral color.
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#888888'
}

export async function formatIconDataUrl(icon: OutputIcon): Promise<string | undefined> {
  let color = brandColor()
  let key = `${icon}:${color}`
  let cached = cache.get(key)
  if (cached) return cached

  try {
    let { renderToStaticMarkup } = await import('react-dom/server')
    let markup = renderToStaticMarkup(
      createElement(FORMAT_ICONS[icon], { size: 24, color, weight: 'regular' }),
    )
    // encodeURIComponent leaves no raw whitespace or quotes, which is what the mirror's `url()`
    // escaping requires.
    let url = `data:image/svg+xml,${encodeURIComponent(markup)}`
    cache.set(key, url)
    return url
  } catch (err) {
    // The token stays a colored word without its icon.
    console.error('Failed to render format icon:', err)
    return undefined
  }
}
