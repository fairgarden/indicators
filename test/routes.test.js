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

test('does not quarantine a lookalike', () => {
  assert.equal(serve('/betamax/login'.replace('/login', '')), '404 /en/-/-/betamax')
  assert.equal(resolve(withHard, '/betamax'), '/en/-/-/betamax')
})
