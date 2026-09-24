import assert from 'node:assert/strict'
import { test } from 'node:test'
import { negotiateLocale, parseAcceptLanguage } from '../dist/negotiate.js'

test('parses ranges best first, keeping the header order for equal weights', () => {
  assert.deepEqual(parseAcceptLanguage('en-GB,en;q=0.9,fr;q=0.8'), [
    { tag: 'en-GB', quality: 1 },
    { tag: 'en', quality: 0.9 },
    { tag: 'fr', quality: 0.8 },
  ])
  assert.deepEqual(parseAcceptLanguage('fr;q=0.5, de;q=0.9, en;q=0.9'), [
    { tag: 'de', quality: 0.9 },
    { tag: 'en', quality: 0.9 },
    { tag: 'fr', quality: 0.5 },
  ])
})

test('drops what it cannot use', () => {
  assert.deepEqual(parseAcceptLanguage('fr;q=0, en'), [{ tag: 'en', quality: 1 }])
  // A malformed tag is skipped, an unparsable weight counts as zero.
  assert.deepEqual(parseAcceptLanguage('not a tag!, en;q=abc, ,de'), [{ tag: 'de', quality: 1 }])
  assert.deepEqual(parseAcceptLanguage(''), [])
  assert.deepEqual(parseAcceptLanguage(null), [])
  assert.deepEqual(parseAcceptLanguage(undefined), [])
})

const locales = ['en', 'fr-CA', 'fr', 'pt-BR']

test('takes an exact match first, whatever the case', () => {
  assert.equal(negotiateLocale('fr-ca', locales, 'en'), 'fr-CA')
  assert.equal(negotiateLocale('FR', locales, 'en'), 'fr')
})

test('falls back to the language, preferring the bare one and then the first region', () => {
  assert.equal(negotiateLocale('fr-BE', locales, 'en'), 'fr')
  assert.equal(negotiateLocale('pt', locales, 'en'), 'pt-BR')
  assert.equal(negotiateLocale('pt-PT', locales, 'en'), 'pt-BR')
  assert.equal(negotiateLocale('en-GB', locales, 'fr'), 'en')
})

test('walks the ranges in order of weight', () => {
  assert.equal(negotiateLocale('de, fr;q=0.8, en;q=0.9', locales, 'en'), 'en')
  assert.equal(negotiateLocale('de;q=1, fr;q=0.9', locales, 'en'), 'fr')
})

test('returns the default for a wildcard, a header it cannot match, or none', () => {
  assert.equal(negotiateLocale('*', locales, 'en'), 'en')
  assert.equal(negotiateLocale('de, *;q=0.1, fr;q=0.05', locales, 'en'), 'en')
  assert.equal(negotiateLocale('de', locales, 'en'), 'en')
  assert.equal(negotiateLocale(null, locales, 'en'), 'en')
  assert.equal(negotiateLocale('', locales, 'en'), 'en')
})
