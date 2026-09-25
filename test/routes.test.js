import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { normalizeConfig } from '../dist/config.js'
import { indicatorsRedirects, indicatorsRewrites } from '../dist/routes.js'

// Next's own matcher, `has` evaluation and destination builder, so the chain
// is checked against what will actually run rather than a reimplementation.
const require = createRequire(import.meta.url)
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match')
const { matchHas, prepareDestination } = require('next/dist/shared/lib/router/utils/prepare-destination')
const { checkCustomRoutes } = require('next/dist/lib/load-custom-routes')

const config = normalizeConfig({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  exclude: ['oidc'],
  prefs: { theme: { values: ['light', 'dark'] } },
  flags: {
    tz: {
      header: 'X-Vercel-IP-Timezone',
      values: { EST: 'America/(New_York|Toronto)', PST: 'America/Los_Angeles' },
    },
    'feature-a': { cookie: 'feature-a', values: ['true'] },
  },
})

const options = { exclude: ['next.svg'], excludeStems: ['sitemap'] }

/** What Next does with `beforeFiles`: every rewrite is tried, each against the path the last one produced. */
const resolve = (rewrites, pathname, headers = {}) => {
  const req = { headers }
  let current = pathname
  for (const rewrite of rewrites) {
    const params = getPathMatch(rewrite.source, { strict: true, removeUnnamedParams: true })(current)
    if (!params) continue
    const hasParams = matchHas(req, {}, rewrite.has, rewrite.missing)
    if (!hasParams) continue
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: true,
      destination: rewrite.destination,
      params: { ...params, ...hasParams },
      query: {},
    })
    assert.deepEqual(parsedDestination.query, {}, 'no param leaks into the query')
    current = parsedDestination.pathname
  }
  return current
}

const rewrites = indicatorsRewrites(config, options)

test('produces routes Next accepts', () => {
  // Prints and throws on anything invalid.
  checkCustomRoutes(rewrites, 'rewrite')
  checkCustomRoutes(indicatorsRedirects(config, options), 'redirect')
  checkCustomRoutes(indicatorsRedirects({ ...config, localePrefix: 'always' }, options), 'redirect')
})

test('grows with the number of values, not combinations', () => {
  // 3 locale steps, 2 theme values + cleanup, 3 flag values + cleanup
  assert.equal(rewrites.length, 3 + 3 + 4)
})

test('gives every path a locale and the two empty segments', () => {
  assert.equal(resolve(rewrites, '/'), '/en/-/-')
  assert.equal(resolve(rewrites, '/login'), '/en/-/-/login')
  assert.equal(resolve(rewrites, '/a/b/c'), '/en/-/-/a/b/c')
  assert.equal(resolve(rewrites, '/fr'), '/fr/-/-')
  assert.equal(resolve(rewrites, '/fr/login'), '/fr/-/-/login')
})

test('does not mistake a lookalike for a locale', () => {
  assert.equal(resolve(rewrites, '/entries'), '/en/-/-/entries')
  assert.equal(resolve(rewrites, '/french'), '/en/-/-/french')
})

test('leaves excluded and Next-owned paths alone', () => {
  for (const path of [
    '/_next/static/chunks/a.js',
    '/api/oidc/auth',
    '/.well-known/openid-configuration',
    '/oidc/auth',
    '/next.svg',
    '/sitemap.xml',
    '/sitemap/1.xml',
  ]) {
    assert.equal(resolve(rewrites, path, { cookie: 'theme=dark' }), path)
  }
  assert.equal(resolve(rewrites, '/apiary'), '/en/-/-/apiary')
})

test('puts a preference in the path when its cookie matches', () => {
  assert.equal(resolve(rewrites, '/login', { cookie: 'theme=dark' }), '/en/theme~dark/-/login')
  assert.equal(resolve(rewrites, '/fr/login', { cookie: 'theme=light' }), '/fr/theme~light/-/login')
  assert.equal(resolve(rewrites, '/', { cookie: 'theme=dark' }), '/en/theme~dark/-')
})

test('ignores a cookie whose value is not one of the listed ones', () => {
  assert.equal(resolve(rewrites, '/login', { cookie: 'theme=blue' }), '/en/-/-/login')
  assert.equal(resolve(rewrites, '/login', { cookie: 'theme=' }), '/en/-/-/login')
})

test('puts a flag in the path when its header matches in full', () => {
  assert.equal(
    resolve(rewrites, '/login', { 'x-vercel-ip-timezone': 'America/New_York' }),
    '/en/-/tz~EST/login'
  )
  assert.equal(
    resolve(rewrites, '/login', { 'x-vercel-ip-timezone': 'America/Toronto' }),
    '/en/-/tz~EST/login'
  )
  assert.equal(
    resolve(rewrites, '/login', { 'x-vercel-ip-timezone': 'Europe/London' }),
    '/en/-/-/login'
  )
  // Full match: a prefix is not enough.
  assert.equal(
    resolve(rewrites, '/login', { 'x-vercel-ip-timezone': 'America/New_York_Extra' }),
    '/en/-/-/login'
  )
})

test('matches a pattern with alternatives in full, not just its outer ones', () => {
  const regional = normalizeConfig({
    locales: ['en'],
    defaultLocale: 'en',
    flags: {
      region: { header: 'x-country', values: { eu: 'AT|BE|DE' } },
      zone: { header: 'x-country', values: { eu: 'AT|BE|DE' }, stylesheet: '/zone.css' },
    },
  })
  const chain = indicatorsRewrites(regional)
  assert.equal(resolve(chain, '/login', { 'x-country': 'BE' }), '/en/-/region~eu/login')
  assert.equal(resolve(chain, '/zone.css', { 'x-country': 'BE' }), '/zone.eu.css')
  for (const country of ['BEL', 'DEU', 'ATX', 'XAT']) {
    assert.equal(resolve(chain, '/login', { 'x-country': country }), '/en/-/-/login', country)
    assert.equal(resolve(chain, '/zone.css', { 'x-country': country }), '/zone.default.css', country)
  }
})

test('combines everything in canonical order', () => {
  assert.equal(
    resolve(rewrites, '/login', {
      cookie: 'feature-a=true; theme=dark',
      'x-vercel-ip-timezone': 'America/Los_Angeles',
    }),
    '/en/theme~dark/feature-a~true.tz~PST/login'
  )
  assert.equal(resolve(rewrites, '/fr', { cookie: 'feature-a=true' }), '/fr/-/feature-a~true')
})

test('lets a flag come from a cookie, so a feature flag can pick a route', () => {
  assert.equal(resolve(rewrites, '/login', { cookie: 'feature-a=true' }), '/en/-/feature-a~true/login')
})

test('takes the first value whose pattern matches when several would', () => {
  const overlapping = normalizeConfig({
    locales: ['en'],
    defaultLocale: 'en',
    flags: { ua: { header: 'user-agent', values: { mobile: '.*Mobile.*', any: '.*' } } },
  })
  const chain = indicatorsRewrites(overlapping)
  assert.equal(resolve(chain, '/x', { 'user-agent': 'Mobile Safari' }), '/en/-/ua~mobile/x')
  assert.equal(resolve(chain, '/x', { 'user-agent': 'Desktop' }), '/en/-/ua~any/x')
})

test('does not let a separator further along the path block a key', () => {
  assert.equal(
    resolve(rewrites, '/a.tz~1', { 'x-vercel-ip-timezone': 'America/New_York' }),
    '/en/-/tz~EST/a.tz~1'
  )
})

test('does not serve an internal path that is requested directly', () => {
  // The chain inserts the empty segments regardless, so the result matches no route.
  assert.equal(resolve(rewrites, '/en/-/-/login', { cookie: 'theme=dark' }), '/en/theme~dark/-/-/-/login')
  assert.equal(resolve(rewrites, '/en/theme~dark/-/login'), '/en/-/-/theme~dark/-/login')
})

test('emits no cleanup step for a kind with nothing declared', () => {
  const none = normalizeConfig({ locales: ['en'], defaultLocale: 'en' })
  assert.equal(indicatorsRewrites(none).length, 3)
  assert.equal(resolve(indicatorsRewrites(none), '/login', { cookie: 'theme=dark' }), '/en/-/-/login')
})

test('redirects the default locale prefix away when it is as-needed', () => {
  assert.deepEqual(indicatorsRedirects(config), [
    { source: '/en', destination: '/', permanent: true },
    { source: '/en/:path*', destination: '/:path*', permanent: true },
  ])
})

test('redirects unprefixed paths to the default locale when it is always', () => {
  const redirects = indicatorsRedirects({ ...config, localePrefix: 'always' }, options)
  assert.equal(redirects.length, 1)
  assert.equal(redirects[0].permanent, false)
  assert.equal(redirects[0].destination, '/en/:path')
  const match = getPathMatch(redirects[0].source, { strict: true, removeUnnamedParams: true })
  assert.ok(match('/login'))
  assert.ok(!match('/fr/login'))
  assert.ok(!match('/api/x'))
  assert.ok(!match('/next.svg'))
  assert.ok(!match('/'))
})

// ---- hard flags -----------------------------------------------------------

import { normalizeHardFlags } from '../dist/config.js'
import { hardFlagRewrites } from '../dist/routes.js'

const hard = hardFlagRewrites(
  config,
  normalizeHardFlags(
    {
      labs: { values: { on: 'on|yes' } },
      beta: { values: ['secret-value'] },
    },
    config
  )
)
const withHard = [...rewrites, ...hard.beforeFiles]

/** The app's routes: home and login for everyone, a beta login. */
const exists = (pathname) =>
  [
    /^\/(en|fr)\/[^/]+\/[^/]+$/,
    /^\/(en|fr)\/[^/]+\/[^/]+\/login$/,
    /^\/(en|fr)\/[^/]+\/[^/]+\/beta\/login$/,
  ].some((route) => route.test(pathname))

/** The chain, then — only when nothing matched — each fallback strip, checking after each. */
const serve = (pathname, headers = {}) => {
  let current = resolve(withHard, pathname, headers)
  if (exists(current)) return current
  for (const rewrite of hard.fallback) {
    const params = getPathMatch(rewrite.source, { strict: true, removeUnnamedParams: true })(current)
    if (!params) continue
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: true,
      destination: rewrite.destination,
      params,
      query: {},
    })
    assert.deepEqual(parsedDestination.query, {})
    current = parsedDestination.pathname
    if (exists(current)) return current
  }
  return `404 ${current}`
}

test('hard flag routes are ones Next accepts', () => {
  checkCustomRoutes(hard.beforeFiles, 'rewrite')
  checkCustomRoutes(hard.fallback, 'rewrite')
  assert.equal(hard.beforeFiles.length, 1 + 2)
  assert.equal(hard.fallback.length, 2)
  assert.deepEqual(hardFlagRewrites(config, []), { beforeFiles: [], fallback: [] })
})

test('injects a hard segment after the flags when the cookie matches in full', () => {
  assert.equal(serve('/login'), '/en/-/-/login')
  assert.equal(serve('/login', { cookie: 'beta=secret-value' }), '/en/-/-/beta/login')
  assert.equal(serve('/login', { cookie: 'beta=wrong' }), '/en/-/-/login')
  assert.equal(serve('/login', { cookie: 'beta=secret-value-2' }), '/en/-/-/login')
  assert.equal(serve('/fr/login', { cookie: 'beta=secret-value' }), '/fr/-/-/beta/login')
})

test('keeps preferences and flags alongside a hard flag', () => {
  assert.equal(
    serve('/login', { cookie: 'beta=secret-value; theme=dark', 'x-vercel-ip-timezone': 'America/Toronto' }),
    '/en/theme~dark/tz~EST/beta/login'
  )
})

test('strips a hard segment again for a page that has no version under it', () => {
  assert.equal(serve('/', { cookie: 'beta=secret-value' }), '/en/-/-')
  assert.equal(serve('/login', { cookie: 'labs=yes' }), '/en/-/-/login')
})

test('injects several hard flags in sorted order and strips the last first', () => {
  assert.equal(
    resolve(withHard, '/login', { cookie: 'labs=on; beta=secret-value' }),
    '/en/-/-/beta/labs/login'
  )
  assert.equal(serve('/login', { cookie: 'labs=on; beta=secret-value' }), '/en/-/-/beta/login')
})

test('never serves a hard segment named in the public path', () => {
  assert.equal(serve('/beta/login'), '404 /en/-/-/-/beta/login')
  assert.equal(serve('/beta'), '404 /en/-/-/-/beta')
  // With the cookie the segment is injected in front of the quarantined
  // one, matches nothing, and the fallback takes it off again: still a 404.
  assert.equal(resolve(withHard, '/beta/login', { cookie: 'beta=secret-value' }), '/en/-/-/beta/-/beta/login')
  assert.equal(serve('/beta/login', { cookie: 'beta=secret-value' }), '404 /en/-/-/-/beta/login')
  assert.equal(serve('/fr/beta/login', { cookie: 'beta=secret-value' }), '404 /fr/-/-/-/beta/login')
  assert.equal(serve('/labs/beta/login', { cookie: 'beta=secret-value' }), '404 /en/-/-/-/labs/beta/login')
})

test('refuses a hard flag named like a path that is never rewritten', () => {
  const bare = normalizeConfig({ segments: [], exclude: ['docs'] })
  const flags = normalizeHardFlags({ docs: { values: ['x'] } }, bare)
  assert.throws(() => hardFlagRewrites(bare, flags), /never rewritten/)
  const images = normalizeHardFlags({ images: { values: ['x'] } }, bare)
  assert.throws(() => hardFlagRewrites(bare, images, { exclude: ['images'] }), /never rewritten/)
  assert.doesNotThrow(() => hardFlagRewrites(bare, images))
})

test('does not quarantine a lookalike', () => {
  assert.equal(serve('/betamax/login'.replace('/login', '')), '404 /en/-/-/betamax')
  assert.equal(resolve(withHard, '/betamax'), '/en/-/-/betamax')
})

// ---- segments ----------------------------------------------------------------

import { clientHintHeaders, stylesheetHeaders, stylesheetPreloadHeaders } from '../dist/routes.js'

test('inserts only the segments the tree has', () => {
  const only = normalizeConfig({ locales: ['en', 'fr'], defaultLocale: 'en', segments: ['locale'] })
  const chain = indicatorsRewrites(only)
  checkCustomRoutes(chain, 'rewrite')
  assert.equal(chain.length, 2)
  assert.equal(resolve(chain, '/'), '/en')
  assert.equal(resolve(chain, '/login'), '/en/login')
  assert.equal(resolve(chain, '/fr/login'), '/fr/login')
  assert.equal(resolve(chain, '/login', { cookie: 'theme=dark' }), '/en/login')

  const flagsOnly = normalizeConfig({
    locales: ['en'],
    defaultLocale: 'en',
    segments: ['locale', 'flags'],
    flags: { tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/New_York' } } },
  })
  const flagsChain = indicatorsRewrites(flagsOnly)
  checkCustomRoutes(flagsChain, 'rewrite')
  assert.equal(resolve(flagsChain, '/login'), '/en/-/login')
  assert.equal(resolve(flagsChain, '/login', { 'x-vercel-ip-timezone': 'America/New_York' }), '/en/tz~EST/login')

  const prefsOnly = normalizeConfig({
    locales: ['en'],
    defaultLocale: 'en',
    segments: ['locale', 'prefs'],
    prefs: { theme: { values: ['dark'] }, tz: { values: ['EST'] } },
  })
  const prefsChain = indicatorsRewrites(prefsOnly)
  checkCustomRoutes(prefsChain, 'rewrite')
  assert.equal(resolve(prefsChain, '/login'), '/en/-/login')
  assert.equal(resolve(prefsChain, '/login', { cookie: 'tz=EST; theme=dark' }), '/en/theme~dark.tz~EST/login')
})

test('puts hard flags straight after the locale when there are no other segments', () => {
  const only = normalizeConfig({ locales: ['en', 'fr'], defaultLocale: 'en', segments: ['locale'] })
  const hardOnly = hardFlagRewrites(only, normalizeHardFlags({ beta: { values: ['secret'] } }, only))
  checkCustomRoutes(hardOnly.beforeFiles, 'rewrite')
  checkCustomRoutes(hardOnly.fallback, 'rewrite')
  const chain = [...indicatorsRewrites(only), ...hardOnly.beforeFiles]
  assert.equal(resolve(chain, '/login', { cookie: 'beta=secret' }), '/en/beta/login')
  assert.equal(resolve(chain, '/beta/login'), '/en/-/beta/login')
  assert.equal(resolve(chain, '/beta/login', { cookie: 'beta=secret' }), '/en/beta/-/beta/login')
})

// ---- stylesheets -------------------------------------------------------------

const styled = normalizeConfig({
  locales: ['en'],
  defaultLocale: 'en',
  segments: ['locale'],
  prefs: { theme: { values: ['light', 'dark'], stylesheet: '/theme.css' } },
  flags: {
    motion: { header: 'Sec-CH-Prefers-Reduced-Motion', values: ['reduce'], stylesheet: '/css/motion.css' },
  },
})

test('rewrites a stylesheet to the file for the matching value, else the default', () => {
  const chain = indicatorsRewrites(styled)
  checkCustomRoutes(chain, 'rewrite')
  assert.equal(resolve(chain, '/theme.css'), '/theme.default.css')
  assert.equal(resolve(chain, '/theme.css', { cookie: 'theme=dark' }), '/theme.dark.css')
  assert.equal(resolve(chain, '/theme.css', { cookie: 'theme=light' }), '/theme.light.css')
  assert.equal(resolve(chain, '/theme.css', { cookie: 'theme=blue' }), '/theme.default.css')
  assert.equal(resolve(chain, '/css/motion.css', { 'sec-ch-prefers-reduced-motion': 'reduce' }), '/css/motion.reduce.css')
  assert.equal(resolve(chain, '/css/motion.css'), '/css/motion.default.css')
})

test('never localizes a stylesheet or the files it is rewritten to', () => {
  const chain = indicatorsRewrites(styled)
  assert.equal(resolve(chain, '/theme.dark.css'), '/theme.dark.css')
  assert.equal(resolve(chain, '/css/motion.reduce.css'), '/css/motion.reduce.css')
  // and the indicator plays no part in the page's path
  assert.equal(resolve(chain, '/login', { cookie: 'theme=dark' }), '/en/login')
})

test('tells the browser to ask for a stylesheet again on every page', () => {
  assert.deepEqual(stylesheetHeaders(styled), [
    {
      source: '/css/motion.css',
      headers: [{ key: 'Cache-Control', value: 'private, no-cache, stale-if-error=86400' }],
    },
    {
      source: '/theme.css',
      headers: [{ key: 'Cache-Control', value: 'private, no-cache, stale-if-error=86400' }],
    },
  ])
  checkCustomRoutes(stylesheetHeaders(styled), 'header')
})

test('names every stylesheet in a preload header on every page', () => {
  const headers = stylesheetPreloadHeaders(styled, { exclude: ['next.svg', 'health'], excludeStems: ['icon'] })
  checkCustomRoutes(headers, 'header')
  assert.equal(headers.length, 1)
  assert.deepEqual(headers[0].headers, [
    { key: 'Link', value: '</css/motion.css>; rel=preload; as=style, </theme.css>; rel=preload; as=style' },
  ])
  const page = getPathMatch(headers[0].source, { strict: true, removeUnnamedParams: true })
  for (const path of ['/', '/login', '/login/', '/en', '/en/login', '/entries', '/blog/v1.2/intro']) {
    assert.ok(page(path), `${path} is a page`)
  }
  for (const path of [
    '/theme.css',
    '/theme.dark.css',
    '/css/motion.css',
    '/api',
    '/api/users',
    '/_next/static/chunks/a.js',
    '/_next/data/b/login.json',
    '/.well-known/openid-configuration',
    '/next.svg',
    '/health',
    '/icon',
    '/favicon.ico',
    '/docs/guide.pdf',
  ]) {
    assert.equal(page(path), false, `${path} is not a page`)
  }
  assert.deepEqual(stylesheetPreloadHeaders(config, options), [])
})

test('preloads only the stylesheets every page links, but asks for every hint', () => {
  const scoped = normalizeConfig({
    segments: [],
    prefs: { theme: { values: ['dark'], stylesheet: '/theme.css' } },
    flags: { arch: { header: 'sec-ch-ua-arch', values: { arm: '"arm"' }, stylesheet: '/arch.css', global: false } },
  })
  assert.deepEqual(stylesheetPreloadHeaders(scoped)[0].headers, [
    { key: 'Link', value: '</theme.css>; rel=preload; as=style' },
  ])
  // the browser remembers what it was asked for across the site
  assert.deepEqual(clientHintHeaders(scoped)[0].headers, [{ key: 'Accept-CH', value: 'sec-ch-ua-arch' }])
  // and a stylesheet that is not global is served and cached like any other
  assert.deepEqual(stylesheetHeaders(scoped).map((header) => header.source), ['/arch.css', '/theme.css'])
  const onlyScoped = normalizeConfig({ segments: [], flags: { arch: { header: 'x', values: ['a'], stylesheet: '/arch.css', global: false } } })
  assert.deepEqual(stylesheetPreloadHeaders(onlyScoped), [])
})

test('asks for every client hint an indicator or hard flag reads, on every page', () => {
  const hinted = normalizeConfig({
    locales: ['en'],
    defaultLocale: 'en',
    prefs: { theme: { values: ['dark'] } },
    flags: {
      data: { header: 'ECT', values: ['slow-2g', '2g'] },
      motion: { header: 'Sec-CH-Prefers-Reduced-Motion', values: ['reduce'], stylesheet: '/motion.css' },
      tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/New_York' } },
      width: { query: 'sec-ch-viewport-width', values: ['1'] },
    },
  })
  const hard = normalizeHardFlags(
    { mobile: { header: 'Sec-CH-UA-Mobile', values: { yes: '\\?1' } }, beta: { values: ['s'] } },
    hinted
  )
  const headers = clientHintHeaders(hinted, hard, options)
  checkCustomRoutes(headers, 'header')
  // not a cookie, a query, or a header that is no hint
  assert.deepEqual(headers[0].headers, [
    { key: 'Accept-CH', value: 'ect, sec-ch-prefers-reduced-motion, sec-ch-ua-mobile' },
  ])
  // on the same pages as the preload
  assert.equal(headers[0].source, stylesheetPreloadHeaders(hinted, options)[0].source)
  const page = getPathMatch(headers[0].source, { strict: true, removeUnnamedParams: true })
  assert.ok(page('/en/login'))
  assert.equal(page('/api/x'), false)

  // Critical only for what the path reads: the stylesheet has it from the first page.
  assert.deepEqual(clientHintHeaders(hinted, hard, { ...options, critical: true })[0].headers, [
    { key: 'Accept-CH', value: 'ect, sec-ch-prefers-reduced-motion, sec-ch-ua-mobile' },
    { key: 'Critical-CH', value: 'ect, sec-ch-ua-mobile' },
  ])
  assert.deepEqual(clientHintHeaders(styled, [], { critical: true })[0].headers, [
    { key: 'Accept-CH', value: 'sec-ch-prefers-reduced-motion' },
  ])
  assert.deepEqual(clientHintHeaders(config, [], options), [])
})

// ---- a site in one language --------------------------------------------------

/** One fallback pass: the first strip that matches, applied once. */
const stripOnce = (fallback, pathname) => {
  for (const rewrite of fallback) {
    const params = getPathMatch(rewrite.source, { strict: true, removeUnnamedParams: true })(pathname)
    if (!params) continue
    return prepareDestination({
      appendParamsToQuery: true,
      destination: rewrite.destination,
      params,
      query: {},
    }).parsedDestination.pathname
  }
  return pathname
}

test('needs no locale step for a site in one language', () => {
  const none = normalizeConfig({ prefs: { theme: { values: ['dark'] } } })
  const chain = indicatorsRewrites(none, { exclude: ['next.svg'] })
  checkCustomRoutes(chain, 'rewrite')
  assert.equal(resolve(chain, '/'), '/-/-')
  assert.equal(resolve(chain, '/login'), '/-/-/login')
  assert.equal(resolve(chain, '/login', { cookie: 'theme=dark' }), '/theme~dark/-/login')
  for (const path of ['/_next/static/chunks/a.js', '/api/x', '/next.svg', '/.well-known/x']) {
    assert.equal(resolve(chain, path, { cookie: 'theme=dark' }), path)
  }
  assert.deepEqual(indicatorsRedirects(none), [])
})

test('anchors the first segment without a locale, so Next-owned paths are untouched', () => {
  const flagsOnly = normalizeConfig({
    segments: ['flags'],
    flags: { tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/New_York' } } },
  })
  const chain = indicatorsRewrites(flagsOnly)
  checkCustomRoutes(chain, 'rewrite')
  const inNewYork = { 'x-vercel-ip-timezone': 'America/New_York', cookie: 'beta=s' }
  assert.equal(resolve(chain, '/login', inNewYork), '/tz~EST/login')
  assert.equal(resolve(chain, '/_next/static/x.js', inNewYork), '/_next/static/x.js')
  const hard = hardFlagRewrites(flagsOnly, normalizeHardFlags({ beta: { values: ['s'] } }, flagsOnly))
  const all = [...chain, ...hard.beforeFiles]
  assert.equal(resolve(all, '/_next/static/x.js', inNewYork), '/_next/static/x.js')
  assert.equal(resolve(all, '/login', inNewYork), '/tz~EST/beta/login')
})

test('has only its stylesheets to rewrite for a site with neither locales nor segments', () => {
  const bare = normalizeConfig({ segments: [], prefs: { theme: { values: ['dark'], stylesheet: '/theme.css' } } })
  const chain = indicatorsRewrites(bare)
  assert.equal(chain.length, 2)
  assert.equal(resolve(chain, '/login', { cookie: 'theme=dark' }), '/login')
  assert.equal(resolve(chain, '/theme.css', { cookie: 'theme=dark' }), '/theme.dark.css')
})

test('puts a hard segment at the front when there is no segment at all', () => {
  const bare = normalizeConfig({ segments: [] })
  const hard = hardFlagRewrites(bare, normalizeHardFlags({ beta: { values: ['secret'] } }, bare), {
    exclude: ['next.svg'],
  })
  checkCustomRoutes(hard.beforeFiles, 'rewrite')
  checkCustomRoutes(hard.fallback, 'rewrite')
  const chain = hard.beforeFiles
  assert.equal(resolve(chain, '/', { cookie: 'beta=secret' }), '/beta')
  assert.equal(resolve(chain, '/login', { cookie: 'beta=secret' }), '/beta/login')
  assert.equal(resolve(chain, '/login'), '/login')
  for (const path of ['/_next/static/a.js', '/next.svg', '/api/x']) {
    assert.equal(resolve(chain, path, { cookie: 'beta=secret' }), path)
  }
  assert.equal(resolve(chain, '/beta/login'), '/-/beta/login')
  assert.equal(resolve(chain, '/beta/login', { cookie: 'beta=secret' }), '/beta/-/beta/login')
  assert.equal(stripOnce(hard.fallback, '/beta'), '/')
  assert.equal(stripOnce(hard.fallback, '/beta/about'), '/about')
  assert.equal(stripOnce(hard.fallback, '/-/beta/login'), '/-/beta/login')
})
