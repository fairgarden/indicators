import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { createIndicators } from '../dist/index.js'
import { createLocaleProxy } from '../dist/locale-proxy.js'

const indicators = createIndicators({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  localeCookie: 'locale',
})

const request = (url, headers = {}) => new NextRequest(`http://localhost${url}`, { headers })

const passes = (response) => response.headers.get('x-middleware-next') === '1'

test('matches the site root only', () => {
  assert.deepEqual(createLocaleProxy(indicators).matcher, ['/'])
})

test('lets a visitor the default locale suits go on to the rewrites', () => {
  const proxy = createLocaleProxy(indicators)
  assert.ok(passes(proxy(request('/', { 'accept-language': 'en-GB,en;q=0.9' }))))
  assert.ok(passes(proxy(request('/'))))
})

test('redirects a visitor another locale suits, without caching the answer', () => {
  const proxy = createLocaleProxy(indicators)
  const response = proxy(request('/?next=%2Flogin', { 'accept-language': 'fr-CA,fr;q=0.9,en;q=0.5' }))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'http://localhost/fr?next=%2Flogin')
  assert.equal(response.headers.get('vary'), 'Accept-Language, Cookie')
})

test('lets a locale cookie override the header', () => {
  const proxy = createLocaleProxy(indicators)
  const chosen = proxy(request('/', { 'accept-language': 'en', cookie: 'locale=fr' }))
  assert.equal(chosen.headers.get('location'), 'http://localhost/fr')
  // An unknown value in the cookie is ignored.
  assert.ok(passes(proxy(request('/', { 'accept-language': 'en', cookie: 'locale=de' }))))
})

test('reads the locale cookie by default, and not when there is none', () => {
  const byDefault = createLocaleProxy(createIndicators({ locales: ['en', 'fr'], defaultLocale: 'en' }))
  assert.equal(
    byDefault(request('/', { 'accept-language': 'en', cookie: 'locale=fr' })).headers.get('location'),
    'http://localhost/fr'
  )
  const without = createLocaleProxy(
    createIndicators({ locales: ['en', 'fr'], defaultLocale: 'en', localeCookie: false })
  )
  assert.ok(passes(without(request('/', { 'accept-language': 'en', cookie: 'locale=fr' }))))
})

test('does nothing for any other path', () => {
  const proxy = createLocaleProxy(indicators)
  assert.ok(passes(proxy(request('/login', { 'accept-language': 'fr' }))))
  assert.ok(passes(proxy(request('/fr', { 'accept-language': 'en' }))))
})

test('always redirects when every locale is prefixed', () => {
  const always = createIndicators({ locales: ['en', 'fr'], defaultLocale: 'en', localePrefix: 'always' })
  const proxy = createLocaleProxy(always)
  assert.equal(proxy(request('/', { 'accept-language': 'en' })).headers.get('location'), 'http://localhost/en')
})

test('serves an app under its mount', () => {
  const proxy = createLocaleProxy(indicators, { mount: '/id' })
  assert.deepEqual(proxy.matcher, ['/id'])
  assert.equal(
    proxy(request('/id', { 'accept-language': 'fr' })).headers.get('location'),
    'http://localhost/id/fr'
  )
  assert.ok(passes(proxy(request('/', { 'accept-language': 'fr' }))))
})

test('serves several apps from one proxy, keyed by mount', () => {
  const members = createIndicators({ locales: ['en', 'de'], defaultLocale: 'en' })
  const proxy = createLocaleProxy({ '/': indicators, '/members/': members })
  assert.deepEqual(proxy.matcher, ['/', '/members'])
  assert.equal(proxy(request('/', { 'accept-language': 'fr' })).headers.get('location'), 'http://localhost/fr')
  assert.equal(
    proxy(request('/members', { 'accept-language': 'de' })).headers.get('location'),
    'http://localhost/members/de'
  )
  // Each app knows only its own locales.
  assert.ok(passes(proxy(request('/members', { 'accept-language': 'fr' }))))
})

test('needs at least one app', () => {
  assert.throws(() => createLocaleProxy({}), /at least one app/)
})
