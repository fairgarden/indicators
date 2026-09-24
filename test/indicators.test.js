import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createIndicators } from '../dist/index.js'

const indicators = createIndicators({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  prefs: { theme: { values: ['light', 'dark'] } },
  flags: {
    tz: { header: 'x-vercel-ip-timezone', values: { EST: 'America/New_York' } },
    lang: { header: 'accept-language', values: { fr: 'fr.*' }, prerender: false },
  },
})

const isNotFound = (error) =>
  error instanceof Error && /NOT_FOUND|404/.test(String(error.digest ?? error.message))

test('exposes the normalized config and the locales', () => {
  assert.deepEqual(indicators.locales, ['en', 'fr'])
  assert.equal(indicators.defaultLocale, 'en')
  assert.equal(indicators.isLocale('fr'), true)
  assert.equal(indicators.isLocale('de'), false)
  assert.equal(indicators.isLocale(undefined), false)
  assert.deepEqual(
    indicators.config.flags.map((flag) => flag.key),
    ['lang', 'tz']
  )
})

test('generates static params per level', () => {
  assert.deepEqual(indicators.locale.generateStaticParams(), [{ locale: 'en' }, { locale: 'fr' }])
  assert.deepEqual(indicators.prefs.generateStaticParams(), [
    { prefs: '-' },
    { prefs: 'theme~light' },
    { prefs: 'theme~dark' },
  ])
  // `lang` is not prerendered, so it does not multiply the variants.
  assert.deepEqual(indicators.flags.generateStaticParams(), [{ flags: '-' }, { flags: 'tz~EST' }])
})

test('generates every combination at once for a layout below all three segments', () => {
  const all = indicators.generateStaticParams()
  assert.equal(all.length, 2 * 3 * 2)
  assert.deepEqual(all[0], { locale: 'en', prefs: '-', flags: '-' })
  assert.deepEqual(all.at(-1), { locale: 'fr', prefs: 'theme~dark', flags: 'tz~EST' })
})

test('reads params, from a promise or an object', async () => {
  assert.equal(await indicators.locale.read(Promise.resolve({ locale: 'fr' })), 'fr')
  assert.equal(await indicators.locale.read({ locale: 'en' }), 'en')
  assert.deepEqual(await indicators.prefs.read({ prefs: 'theme~dark' }), { theme: 'dark' })
  assert.deepEqual(await indicators.flags.read({ flags: 'lang~fr.tz~EST' }), { lang: 'fr', tz: 'EST' })
  assert.deepEqual(
    await indicators.read(Promise.resolve({ locale: 'fr', prefs: '-', flags: 'tz~EST', slug: 'x' })),
    { locale: 'fr', prefs: {}, flags: { tz: 'EST' } }
  )
})

test('calls notFound for params that name no variant', async () => {
  await assert.rejects(indicators.locale.read({ locale: 'de' }), isNotFound)
  await assert.rejects(indicators.locale.read({}), isNotFound)
  await assert.rejects(indicators.prefs.read({ prefs: 'theme~blue' }), isNotFound)
  await assert.rejects(indicators.prefs.read({ prefs: 'tz~EST.theme~dark' }), isNotFound)
  // What Next hands a page for `theme=dark` in the path: never canonical.
  await assert.rejects(indicators.prefs.read({ prefs: 'theme%3Ddark' }), isNotFound)
  await assert.rejects(indicators.flags.read({}), isNotFound)
  await assert.rejects(indicators.read({ locale: 'en', prefs: '-', flags: 'nope' }), isNotFound)
})

test('encodes and decodes segments', () => {
  assert.equal(indicators.prefs.encode({ theme: 'dark' }), 'theme~dark')
  assert.equal(indicators.flags.encode({ tz: 'EST', lang: 'fr' }), 'lang~fr.tz~EST')
  assert.deepEqual(indicators.prefs.decode('theme~dark'), { theme: 'dark' })
  assert.equal(indicators.prefs.decode('theme~blue'), undefined)
})

test('wraps a layout at each level', async () => {
  const seen = []
  const render = (props) => {
    seen.push(props)
    return 'rendered'
  }

  const locale = indicators.locale.layout(render)
  assert.equal(await locale({ children: 'kids', params: Promise.resolve({ locale: 'fr' }) }), 'rendered')
  assert.deepEqual(seen.at(-1), { children: 'kids', params: { locale: 'fr' }, locale: 'fr' })

  const prefs = indicators.prefs.layout(render)
  await prefs({ children: null, params: { locale: 'fr', prefs: 'theme~dark' } })
  assert.deepEqual(seen.at(-1), {
    children: null,
    params: { locale: 'fr', prefs: 'theme~dark' },
    prefs: { theme: 'dark' },
  })

  const flags = indicators.flags.layout(render)
  await flags({ children: null, params: { flags: '-' } })
  assert.deepEqual(seen.at(-1).flags, {})

  const all = indicators.layout(render)
  await all({ children: 'kids', params: { locale: 'en', prefs: '-', flags: 'tz~EST' } })
  assert.deepEqual(seen.at(-1), {
    children: 'kids',
    params: { locale: 'en', prefs: '-', flags: 'tz~EST' },
    locale: 'en',
    prefs: {},
    flags: { tz: 'EST' },
  })

  await assert.rejects(locale({ children: null, params: { locale: 'de' } }), isNotFound)
})

test('wraps a page', async () => {
  const searchParams = Promise.resolve({ q: '1' })
  const page = indicators.page((props) => props)
  const props = await page({ params: { locale: 'fr', prefs: '-', flags: '-' }, searchParams })
  assert.equal(props.locale, 'fr')
  assert.equal(props.searchParams, searchParams)
  assert.deepEqual(props.params, { locale: 'fr', prefs: '-', flags: '-' })
})

test('builds hrefs, splits locales and negotiates', () => {
  assert.equal(indicators.href('/login', 'fr'), '/fr/login')
  assert.equal(indicators.href('/login', 'en'), '/login')
  assert.deepEqual(indicators.splitLocale('/fr/login'), { locale: 'fr', pathname: '/login' })
  assert.equal(indicators.negotiate('fr-CA,en;q=0.5'), 'fr')
  assert.equal(indicators.negotiate('de'), 'en')
})

test('checks the config when created', () => {
  assert.throws(() => createIndicators({ locales: ['en'], defaultLocale: 'fr' }), /not one of the locales/)
})

// ---- segments and stylesheets ---------------------------------------------

test('generates params only for the segments the tree has', () => {
  const only = createIndicators({ locales: ['en', 'fr'], defaultLocale: 'en', segments: ['locale'] })
  assert.deepEqual(only.segments, ['locale'])
  assert.deepEqual(only.generateStaticParams(), [{ locale: 'en' }, { locale: 'fr' }])
  assert.deepEqual(only.prefs.generateStaticParams(), [])
  assert.deepEqual(only.flags.generateStaticParams(), [])

  const flagsOnly = createIndicators({
    locales: ['en'],
    defaultLocale: 'en',
    segments: ['locale', 'flags'],
    flags: { tz: { header: 'x-vercel-ip-timezone', values: ['EST'] } },
  })
  assert.deepEqual(flagsOnly.generateStaticParams(), [
    { locale: 'en', flags: '-' },
    { locale: 'en', flags: 'tz~EST' },
  ])
})

test('reads nothing for a segment the tree does not have', async () => {
  const only = createIndicators({ locales: ['en'], defaultLocale: 'en', segments: ['locale'] })
  assert.deepEqual(await only.read({ locale: 'en' }), { locale: 'en', prefs: {}, flags: {} })
  assert.deepEqual(await only.prefs.read({}), {})
  const seen = []
  await only.layout((props) => seen.push(props))({ children: null, params: { locale: 'en' } })
  assert.deepEqual(seen[0], { children: null, params: { locale: 'en' }, locale: 'en', prefs: {}, flags: {} })
})

test('keeps a stylesheet indicator out of the segment and lists its link', () => {
  const styled = createIndicators({
    locales: ['en'],
    defaultLocale: 'en',
    prefs: {
      theme: { values: ['light', 'dark'] },
      contrast: { values: ['more'], stylesheet: '/theme/contrast.css' },
    },
  })
  assert.deepEqual(styled.prefs.generateStaticParams(), [
    { prefs: '-' },
    { prefs: 'theme~light' },
    { prefs: 'theme~dark' },
  ])
  assert.equal(styled.prefs.decode('contrast~more'), undefined)
  assert.deepEqual(styled.stylesheets(), [{ key: 'contrast', kind: 'prefs', href: '/theme/contrast.css' }])
  assert.deepEqual(indicators.stylesheets(), [])
})

test('serves a site in one language with no locale at all', async () => {
  const single = createIndicators({
    segments: [],
    prefs: { theme: { values: ['light', 'dark'], stylesheet: '/theme.css' } },
  })
  assert.deepEqual(single.segments, [])
  assert.deepEqual(single.locales, [])
  assert.equal(single.defaultLocale, undefined)
  assert.deepEqual(single.generateStaticParams(), [])
  assert.deepEqual(single.locale.generateStaticParams(), [])
  assert.deepEqual(await single.read({}), { locale: undefined, prefs: {}, flags: {} })
  assert.equal(await single.locale.read({}), undefined)
  assert.equal(single.href('/about', undefined), '/about')
  assert.equal(single.negotiate('fr'), undefined)
  assert.deepEqual(single.splitLocale('/fr/x'), { locale: undefined, pathname: '/fr/x' })
  assert.deepEqual(single.stylesheets(), [{ key: 'theme', kind: 'prefs', href: '/theme.css' }])

  const withSegments = createIndicators({ flags: { tz: { header: 'x', values: ['EST'] } } })
  assert.deepEqual(withSegments.generateStaticParams(), [
    { prefs: '-', flags: '-' },
    { prefs: '-', flags: 'tz~EST' },
  ])
})
