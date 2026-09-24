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
