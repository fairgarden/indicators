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
    // Through stylesheets: which download button the download demo shows.
    // Not global: only that page links them, so no other page asks.
    // Every browser names its OS in User-Agent; the first match wins, so
    // Android, whose User-Agent says Linux too, comes before Linux.
    os: {
      header: 'user-agent',
      values: {
        android: '.*Android.*',
        ios: '.*(?:iPhone|iPad).*',
        mac: '.*Macintosh.*',
        windows: '.*Windows.*',
        linux: '.*Linux.*',
      },
      stylesheet: '/platform/os.css',
      global: false,
    },
    // Only Chromium sends this, and only once asked, which the plugin does.
    arch: {
      header: 'sec-ch-ua-arch',
      values: { arm: '"arm"', x86: '"x86"' },
      stylesheet: '/platform/arch.css',
      global: false,
    },
  },
})
