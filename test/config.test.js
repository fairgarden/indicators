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
  assert.deepEqual(config.prefs[0].prerender, ['light', 'dark'])
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
  assert.deepEqual(config.flags[0].prerender, [])
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
test('prerenders only the values it is told to', () => {
  const config = normalizeConfig({
    ...base,
    flags: {
      tz: {
        header: 'x-vercel-ip-timezone',
        values: { EST: 'America/New_York', PST: 'America/Los_Angeles', CET: 'Europe/.*' },
        prerender: ['EST'],
      },
    },
  })
  assert.deepEqual(config.flags[0].prerender, ['EST'])
  assert.equal(config.flags[0].values.length, 3)
})

refuses('a prerender list naming a value it does not have', { ...base, flags: { tz: { values: ['EST'], prerender: ['PST'] } } }, /not a value/)
refuses('a prerender that is neither a boolean nor a list', { ...base, flags: { tz: { values: ['EST'], prerender: 'EST' } } }, /true, false or a list/)
refuses('no values', { ...base, prefs: { a: { values: [] } } }, /at least one/)
refuses('two sources', { ...base, prefs: { a: { cookie: 'a', header: 'a', values: ['x'] } } }, /more than one source/)
refuses('an invalid pattern', { ...base, flags: { a: { values: { x: '(' } } } }, /not a valid regular expression/)
refuses('an excluded path with a slash', { ...base, exclude: ['a/b'] }, /single path segment/)
refuses('excluding a locale', { ...base, exclude: ['fr'] }, /both a locale and excluded/)

// ---- hard flags -----------------------------------------------------------

import { normalizeHardFlags } from '../dist/config.js'

const normalized = normalizeConfig({ locales: ['en', 'fr'], defaultLocale: 'en' })

test('reads a hard flag from a cookie of the same name, sorted by key', () => {
  const flags = normalizeHardFlags(
    { labs: { values: ['on'] }, beta: { header: 'X-Beta', values: { any: 'secret-.*' } } },
    normalized
  )
  assert.deepEqual(flags, [
    { key: 'beta', source: { type: 'header', key: 'x-beta' }, patterns: ['secret-.*'] },
    { key: 'labs', source: { type: 'cookie', key: 'labs' }, patterns: ['on'] },
  ])
  assert.deepEqual(normalizeHardFlags(undefined, normalized), [])
})

const refusesHard = (name, definitions, pattern) =>
  test(`refuses a hard flag with ${name}`, () => {
    assert.throws(() => normalizeHardFlags(definitions, normalized), pattern)
  })

refusesHard('a name that is not a segment', { 'a.b': { values: ['x'] } }, /route segment/)
refusesHard('a locale for a name', { fr: { values: ['x'] } }, /also a locale/)
refusesHard('two sources', { beta: { cookie: 'a', query: 'b', values: ['x'] } }, /more than one source/)
refusesHard('no values', { beta: { values: [] } }, /at least one/)
refusesHard('a bad pattern', { beta: { values: { x: '(' } } }, /not a valid regular expression/)

// ---- segments and stylesheets ---------------------------------------------

import { DEFAULT_STYLESHEET, stylesheetFile } from '../dist/config.js'

test('has the three segments by default, and only the ones asked for otherwise', () => {
  assert.deepEqual(normalizeConfig(base).segments, ['locale', 'prefs', 'flags'])
  assert.deepEqual(normalizeConfig({ ...base, segments: ['locale'] }).segments, ['locale'])
  // In path order whatever the order given.
  assert.deepEqual(normalizeConfig({ ...base, segments: ['flags', 'locale'] }).segments, ['locale', 'flags'])
  assert.deepEqual(
    normalizeConfig({ ...base, segments: ['flags', 'prefs', 'locale'] }).segments,
    ['locale', 'prefs', 'flags']
  )
})

test('expresses an indicator through a stylesheet instead of the path', () => {
  const config = normalizeConfig({
    ...base,
    segments: ['locale'],
    prefs: { theme: { values: ['light', 'dark'], stylesheet: '/theme.css' } },
    flags: {
      motion: { header: 'Sec-CH-Prefers-Reduced-Motion', values: ['reduce'], stylesheet: '/css/motion.css' },
    },
  })
  assert.deepEqual(config.prefs, [])
  assert.deepEqual(config.flags, [])
  assert.deepEqual(
    config.stylesheets.map((sheet) => [sheet.key, sheet.kind, sheet.source.key, sheet.href, sheet.base]),
    [
      ['motion', 'flags', 'sec-ch-prefers-reduced-motion', '/css/motion.css', '/css/motion'],
      ['theme', 'prefs', 'theme', '/theme.css', '/theme'],
    ]
  )
  assert.equal(stylesheetFile(config.stylesheets[1], 'dark'), '/theme.dark.css')
  assert.equal(stylesheetFile(config.stylesheets[1], DEFAULT_STYLESHEET), '/theme.default.css')
  assert.equal(stylesheetFile(config.stylesheets[0], 'reduce'), '/css/motion.reduce.css')
})

refuses('a segment it does not know', { ...base, segments: ['locale', 'theme'] }, /segments may hold/)
refuses('a preference in the path without its segment', { ...base, segments: ['locale'], prefs: { theme: { values: ['dark'] } } }, /leaves out/)
refuses('a flag in the path without its segment', { ...base, segments: ['locale', 'prefs'], flags: { tz: { values: ['a'] } } }, /leaves out/)
refuses('a stylesheet that is not a path', { ...base, prefs: { theme: { values: ['dark'], stylesheet: 'theme.css' } } }, /ending in \.css/)
refuses('a stylesheet that is not a css file', { ...base, prefs: { theme: { values: ['dark'], stylesheet: '/theme' } } }, /ending in \.css/)
refuses('a stylesheet with a query', { ...base, prefs: { theme: { values: ['dark'], stylesheet: '/theme.css?x' } } }, /ending in \.css/)
refuses('a stylesheet under a locale directory', { ...base, prefs: { theme: { values: ['dark'], stylesheet: '/en/theme.css' } } }, /which is a locale/)
refuses('two indicators on one stylesheet', { ...base, prefs: { a: { values: ['x'], stylesheet: '/t.css' }, b: { values: ['y'], stylesheet: '/t.css' } } }, /share the stylesheet/)
refuses('a pref and a flag with stylesheets under one key', { ...base, prefs: { mode: { values: ['x'], stylesheet: '/a.css' } }, flags: { mode: { header: 'x', values: ['y'], stylesheet: '/b.css' } } }, /prefs\.mode and flags\.mode both have a stylesheet/)
refuses('global without a stylesheet', { ...base, prefs: { theme: { values: ['dark'], global: false } } }, /has none/)
refuses('a global that is not a boolean', { ...base, prefs: { theme: { values: ['dark'], stylesheet: '/t.css', global: 'no' } } }, /true or false/)

test('links a stylesheet on every page unless it says otherwise', () => {
  const config = normalizeConfig({
    ...base,
    prefs: { theme: { values: ['dark'], stylesheet: '/theme.css' } },
    flags: { os: { header: 'user-agent', values: { mac: '.*Mac.*' }, stylesheet: '/os.css', global: false } },
  })
  assert.deepEqual(
    config.stylesheets.map((sheet) => [sheet.key, sheet.global]),
    [['os', false], ['theme', true]]
  )
})

// ---- a site in one language --------------------------------------------------

test('has no locale segment when there are no locales', () => {
  const config = normalizeConfig({ prefs: { theme: { values: ['dark'], stylesheet: '/theme.css' } } })
  assert.deepEqual(config.locales, [])
  assert.equal(config.defaultLocale, undefined)
  assert.equal(config.localeCookie, undefined)
  assert.deepEqual(config.segments, ['prefs', 'flags'])
  assert.deepEqual(normalizeConfig({ segments: [] }).segments, [])
  assert.deepEqual(normalizeConfig({ segments: ['flags'] }).segments, ['flags'])
})

refuses('a default locale without locales', { defaultLocale: 'en' }, /no locales/)
refuses('locales without their segment', { ...base, segments: ['prefs'] }, /leaves the locale segment out/)
refuses('a locale segment without locales', { segments: ['locale'] }, /no locales are given/)
