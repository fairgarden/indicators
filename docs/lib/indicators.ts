import { createIndicators } from '@fairgarden/indicators'

/**
 * What this site puts into the path — and, for one preference, into a
 * stylesheet instead. The docs exist in one language; `en-GB` serves the
 * same pages so the locale mechanics can be shown working.
 *
 * Imported by next.config.ts and proxy.ts as well as the routes, so nothing
 * here may need a request.
 */
export const indicators = createIndicators({
  locales: ['en', 'en-GB'],
  defaultLocale: 'en',
  prefs: {
    // In the path: every page has a prerendered copy per theme, and the
    // theme is on <html> in the HTML itself.
    theme: { values: ['light', 'dark'] },
    // Through a stylesheet: one line of CSS the browser asks for on every
    // page, and no copies of anything.
    accent: { values: ['blue', 'green', 'orange'], stylesheet: '/theme/accent.css' },
  },
  flags: {
    // What the browser asks for first. Not prerendered: a variant renders on
    // its first request and is cached from then on.
    lang: {
      header: 'accept-language',
      values: { fr: 'fr.*', de: 'de.*', es: 'es.*', ja: 'ja.*', zh: 'zh.*' },
      prerender: false,
    },
  },
})
