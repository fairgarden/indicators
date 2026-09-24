import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createIndicators } from '../dist/index.js'
import { createLink, createNavigation } from '../dist/link.js'

const indicators = createIndicators({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  prefs: { theme: { values: ['light', 'dark'] } },
})

// Outside the App Router there are no route params, so the page is taken to
// be in the default locale. The locale-aware cases are covered by the href
// tests; this checks the pieces are wired together.
test('renders a next/link with the locale and mount applied', () => {
  const { Link } = createNavigation(indicators, { mount: '/id' })
  assert.equal(
    renderToStaticMarkup(createElement(Link, { href: '/login' }, 'Log in')),
    '<a href="/id/login">Log in</a>'
  )
  assert.equal(
    renderToStaticMarkup(createElement(Link, { href: '/login', locale: 'fr' }, 'Connexion')),
    '<a href="/id/fr/login">Connexion</a>'
  )
})

test('leaves the href alone when there is nothing to add', () => {
  const Link = createLink(indicators)
  assert.equal(
    renderToStaticMarkup(createElement(Link, { href: '/login' }, 'x')),
    '<a href="/login">x</a>'
  )
  assert.equal(
    renderToStaticMarkup(createElement(Link, { href: 'https://example.com' }, 'x')),
    '<a href="https://example.com">x</a>'
  )
})

test('offers a locale setter alongside the reader', () => {
  const navigation = createNavigation(indicators)
  assert.equal(typeof navigation.useSetLocale, 'function')
  assert.equal(typeof navigation.useLocale, 'function')
})

test('reports the default locale and no values outside the locale tree', () => {
  const { useIndicators, useLocale } = createNavigation(indicators)
  let seen
  const Probe = () => {
    seen = { ...useIndicators(), current: useLocale() }
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  assert.deepEqual(seen, { locale: 'en', prefs: {}, flags: {}, current: 'en' })
})

// `useParams` reads this context; on a page it holds the internal route's
// params, so a Link on /cn/login sees locale "cn".
const { PathParamsContext } = await import(
  'next/dist/shared/lib/hooks-client-context.shared-runtime.js'
)

const onPage = (params, element) =>
  renderToStaticMarkup(createElement(PathParamsContext.Provider, { value: params }, element))

const multi = createIndicators({
  locales: ['en', 'cn', 'es'],
  defaultLocale: 'en',
  exclude: ['oidc'],
})

test('prefixes hrefs with the locale of the page the link is on', () => {
  const { Link } = createNavigation(multi)
  const page = { locale: 'cn', prefs: '-', flags: '-' }
  assert.equal(
    onPage(page, createElement(Link, { href: '/about' }, 'About')),
    '<a href="/cn/about">About</a>'
  )
  assert.equal(onPage(page, createElement(Link, { href: '/' }, 'Home')), '<a href="/cn">Home</a>')
  assert.equal(
    onPage(page, createElement(Link, { href: '/about?x=1#team' }, 'x')),
    '<a href="/cn/about?x=1#team">x</a>'
  )
})

test('adds nothing on a default-locale page', () => {
  const { Link } = createNavigation(multi)
  const page = { locale: 'en', prefs: 'theme~dark', flags: '-' }
  assert.equal(onPage(page, createElement(Link, { href: '/about' }, 'x')), '<a href="/about">x</a>')
})

test('leaves hrefs that already say where they go, and excluded ones, alone', () => {
  const { Link } = createNavigation(multi)
  const page = { locale: 'cn', prefs: '-', flags: '-' }
  for (const [href, expected] of [
    ['/es/about', '/es/about'],
    ['/en/about', '/en/about'],
    ['/oidc/auth', '/oidc/auth'],
    ['/api/health', '/api/health'],
    ['https://example.com/about', 'https://example.com/about'],
    ['#team', '#team'],
    ['about', 'about'],
  ]) {
    assert.equal(onPage(page, createElement(Link, { href }, 'x')), `<a href="${expected}">x</a>`)
  }
})

test('puts the mount after the locale', () => {
  const { Link } = createNavigation(multi, { mount: '/id' })
  const page = { locale: 'cn', prefs: '-', flags: '-' }
  assert.equal(onPage(page, createElement(Link, { href: '/about' }, 'x')), '<a href="/id/cn/about">x</a>')
  assert.equal(
    onPage(page, createElement(Link, { href: '/about', locale: 'en' }, 'x')),
    '<a href="/id/about">x</a>'
  )
})
