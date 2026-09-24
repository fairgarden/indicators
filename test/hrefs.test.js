import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeConfig } from '../dist/config.js'
import { localizeHref, localizePath, mountHref, splitLocale } from '../dist/hrefs.js'

const config = normalizeConfig({ locales: ['en', 'fr'], defaultLocale: 'en', exclude: ['oidc'] })
const always = normalizeConfig({ ...config, locales: ['en', 'fr'], localePrefix: 'always' })

test('leaves the default locale out of the path', () => {
  assert.equal(localizePath(config, '/login', 'en'), '/login')
  assert.equal(localizePath(config, '/', 'en'), '/')
})

test('prefixes other locales', () => {
  assert.equal(localizePath(config, '/login', 'fr'), '/fr/login')
  assert.equal(localizePath(config, '/', 'fr'), '/fr')
  assert.equal(localizePath(config, '/a/b', 'fr'), '/fr/a/b')
})

test('prefixes the default locale too when localePrefix is always', () => {
  assert.equal(localizePath(always, '/login', 'en'), '/en/login')
  assert.equal(localizePath(always, '/', 'en'), '/en')
})

test('keeps the query and fragment after the path', () => {
  assert.equal(localizePath(config, '/login?next=%2F#form', 'fr'), '/fr/login?next=%2F#form')
  assert.equal(localizePath(config, '/?x=1', 'fr'), '/fr?x=1')
  assert.equal(localizePath(config, '/#top', 'fr'), '/fr#top')
})

test('leaves a path that already names a locale alone', () => {
  assert.equal(localizePath(config, '/en/login', 'fr'), '/en/login')
  assert.equal(localizePath(config, '/fr', 'en'), '/fr')
})

test('leaves excluded paths alone', () => {
  assert.equal(localizePath(config, '/api/health', 'fr'), '/api/health')
  assert.equal(localizePath(config, '/_next/static/a.js', 'fr'), '/_next/static/a.js')
  assert.equal(localizePath(config, '/oidc/auth', 'fr'), '/oidc/auth')
  assert.equal(localizePath(config, '/.well-known/x', 'fr'), '/.well-known/x')
})

test('does not mistake a lookalike for a locale or an exclusion', () => {
  assert.equal(localizePath(config, '/entries', 'fr'), '/fr/entries')
  assert.equal(localizePath(config, '/apiary', 'fr'), '/fr/apiary')
})

test('leaves absolute, protocol-relative, fragment and relative hrefs alone', () => {
  for (const href of ['https://example.com/a', '//example.com/a', '#section', 'login', '']) {
    assert.equal(localizePath(config, href, 'fr'), href)
  }
})

test('localizes the pathname of an object href and keeps the rest', () => {
  assert.deepEqual(localizeHref(config, { pathname: '/a', query: { x: '1' } }, 'fr'), {
    pathname: '/fr/a',
    query: { x: '1' },
  })
  assert.deepEqual(localizeHref(config, { query: { x: '1' } }, 'fr'), { query: { x: '1' } })
})

test('splits a locale off a public path', () => {
  assert.deepEqual(splitLocale(config, '/fr/login'), { locale: 'fr', pathname: '/login' })
  assert.deepEqual(splitLocale(config, '/fr'), { locale: 'fr', pathname: '/' })
  assert.deepEqual(splitLocale(config, '/login'), { locale: undefined, pathname: '/login' })
  assert.deepEqual(splitLocale(config, '/french'), { locale: undefined, pathname: '/french' })
})

test('mounts hrefs the way the monolith does', () => {
  assert.equal(mountHref('/a/b', ''), '/a/b')
  assert.equal(mountHref('/a/b', '/id'), '/id/a/b')
  assert.equal(mountHref('/', '/id'), '/id/')
  assert.equal(mountHref('https://example.com/a', '/id'), 'https://example.com/a')
  assert.equal(mountHref('//example.com/a', '/id'), '//example.com/a')
  assert.equal(mountHref('#section', '/id'), '#section')
  assert.equal(mountHref('login', '/id'), 'login')
  assert.equal(mountHref('/id/a/b', '/id'), '/id/a/b')
  assert.equal(mountHref('/id', '/id'), '/id')
  assert.equal(mountHref('/id?x=1', '/id'), '/id?x=1')
  assert.equal(mountHref('/identity', '/id'), '/id/identity')
  assert.deepEqual(mountHref({ pathname: '/a', query: { x: '1' } }, '/id'), {
    pathname: '/id/a',
    query: { x: '1' },
  })
})

test('applies the locale before the mount', () => {
  assert.equal(mountHref(localizePath(config, '/login', 'fr'), '/id'), '/id/fr/login')
  assert.equal(mountHref(localizePath(config, '/login', 'en'), '/id'), '/id/login')
})
