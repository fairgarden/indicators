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
