import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeConfig } from '../dist/config.js'

const base = { locales: ['en', 'fr'], defaultLocale: 'en' }

test('fills in the defaults', () => {
  const config = normalizeConfig(base)
  assert.equal(config.localePrefix, 'as-needed')
  assert.equal(config.localeCookie, 'locale')
  assert.deepEqual(config.prefs, [])
  assert.deepEqual(config.flags, [])
  assert.deepEqual(config.exclude, ['_next', 'api', '.well-known'])
})

test('reads a preference from a cookie of the same name, and a flag from a header', () => {
  const config = normalizeConfig({
    ...base,
    prefs: { theme: { values: ['light', 'dark'] } },
    flags: { 'Save-Data': { values: ['on'] } },
  })
  assert.deepEqual(config.prefs[0].source, { type: 'cookie', key: 'theme' })
  // Header names are case-insensitive, and Next reads them lowercased.
  assert.deepEqual(config.flags[0].source, { type: 'header', key: 'save-data' })
  assert.equal(config.prefs[0].prerender, true)
  assert.equal(config.prefs[0].maxAge, 60 * 60 * 24 * 365)
})

test('turns listed values into literal patterns and keeps regex values as given', () => {
  const config = normalizeConfig({
    ...base,
    prefs: { theme: { values: ['light', 'dark-1'] } },
    flags: { tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/(New_York|Toronto)' } } },
  })
  assert.deepEqual(config.prefs[0].values, [
    { name: 'light', pattern: 'light' },
    { name: 'dark-1', pattern: 'dark\\-1' },
  ])
  assert.deepEqual(config.flags[0].values, [{ name: 'EST', pattern: 'America/(New_York|Toronto)' }])
})

test('sorts indicators by key, in code unit order', () => {
  const config = normalizeConfig({
    ...base,
    prefs: { tz: { values: ['a'] }, theme: { values: ['a'] }, Currency: { values: ['a'] } },
  })
  assert.deepEqual(
    config.prefs.map((indicator) => indicator.key),
    ['Currency', 'theme', 'tz']
  )
})

test('takes an explicit source and other options', () => {
  const config = normalizeConfig({
    ...base,
    localePrefix: 'always',
    localeCookie: 'locale',
    exclude: ['oidc'],
    flags: {
      beta: { cookie: 'beta', values: ['on'], prerender: false, maxAge: 60 },
      q: { query: 'variant', values: ['a'] },
    },
  })
  assert.equal(config.localePrefix, 'always')
  assert.equal(config.localeCookie, 'locale')
  assert.deepEqual(config.exclude, ['_next', 'api', '.well-known', 'oidc'])
  assert.deepEqual(config.flags[0].source, { type: 'cookie', key: 'beta' })
  assert.equal(config.flags[0].prerender, false)
  assert.equal(config.flags[0].maxAge, 60)
  assert.deepEqual(config.flags[1].source, { type: 'query', key: 'variant' })
})

const refuses = (name, config, pattern) =>
  test(`refuses ${name}`, () => {
    assert.throws(() => normalizeConfig(config), pattern)
  })

test('can rename the locale cookie or do without it', () => {
  assert.equal(normalizeConfig({ ...base, localeCookie: 'lang' }).localeCookie, 'lang')
  assert.equal(normalizeConfig({ ...base, localeCookie: false }).localeCookie, undefined)
})

refuses('an empty locale cookie name', { ...base, localeCookie: '' }, /cookie name/)
refuses('no locales', { locales: [], defaultLocale: 'en' }, /at least one locale/)
refuses('a default that is not a locale', { locales: ['en'], defaultLocale: 'fr' }, /not one of the locales/)
refuses('the same locale twice', { locales: ['en', 'EN'], defaultLocale: 'en' }, /twice/)
refuses('a locale that is not a segment', { locales: ['en/us'], defaultLocale: 'en/us' }, /not usable/)
refuses('a bad localePrefix', { ...base, localePrefix: 'never' }, /as-needed/)
refuses('a key the path cannot hold', { ...base, prefs: { 'a;b': { values: ['x'] } } }, /cannot go in a path/)
refuses('a key starting with a dash', { ...base, prefs: { '-x': { values: ['x'] } } }, /cannot go in a path/)
refuses('a value the path cannot hold', { ...base, prefs: { a: { values: ['x/y'] } } }, /cannot go in a path/)
refuses('a value holding a separator', { ...base, prefs: { a: { values: ['x.y'] } } }, /cannot go in a path/)
refuses('a value Next would percent-encode', { ...base, prefs: { a: { values: ['New,York'] } } }, /cannot go in a path/)
refuses('a value listed twice', { ...base, prefs: { a: { values: ['x', 'x'] } } }, /twice/)
refuses('no values', { ...base, prefs: { a: { values: [] } } }, /at least one/)
refuses('two sources', { ...base, prefs: { a: { cookie: 'a', header: 'a', values: ['x'] } } }, /more than one source/)
refuses('an invalid pattern', { ...base, flags: { a: { values: { x: '(' } } } }, /not a valid regular expression/)
refuses('an excluded path with a slash', { ...base, exclude: ['a/b'] }, /single path segment/)
refuses('excluding a locale', { ...base, exclude: ['fr'] }, /both a locale and excluded/)
