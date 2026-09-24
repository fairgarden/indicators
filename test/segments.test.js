import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeConfig } from '../dist/config.js'
import { decodeSegment, encodeSegment, staticSegments, EMPTY_SEGMENT } from '../dist/segments.js'

const { prefs } = normalizeConfig({
  locales: ['en'],
  defaultLocale: 'en',
  prefs: {
    tz: { values: ['EST', 'PST'] },
    theme: { values: ['light', 'dark'] },
    cur: { values: ['USD'], prerender: false },
  },
})

test('encodes nothing as the empty marker', () => {
  assert.equal(EMPTY_SEGMENT, '-')
  assert.equal(encodeSegment(prefs, {}), '-')
  assert.equal(encodeSegment(prefs, { theme: undefined }), '-')
})

test('encodes pairs sorted by key whatever order they were given in', () => {
  assert.equal(encodeSegment(prefs, { tz: 'EST', theme: 'dark' }), 'theme~dark.tz~EST')
  assert.equal(encodeSegment(prefs, { theme: 'dark', cur: 'USD', tz: 'PST' }), 'cur~USD.theme~dark.tz~PST')
})

test('refuses to encode what the config does not know', () => {
  assert.throws(() => encodeSegment(prefs, { theme: 'blue' }), /no value "blue"/)
  assert.throws(() => encodeSegment(prefs, { font: 'mono' }), /not a known indicator/)
})

test('decodes canonical segments', () => {
  assert.deepEqual(decodeSegment(prefs, '-'), {})
  assert.deepEqual(decodeSegment(prefs, 'theme~dark'), { theme: 'dark' })
  assert.deepEqual(decodeSegment(prefs, 'theme~dark.tz~EST'), { theme: 'dark', tz: 'EST' })
  assert.deepEqual(decodeSegment(prefs, 'cur~USD.theme~light.tz~PST'), {
    cur: 'USD',
    theme: 'light',
    tz: 'PST',
  })
})

test('rejects anything that is not the canonical form', () => {
  // The segment is the cache key, so a second spelling would be a second copy.
  for (const segment of [
    'tz~EST.theme~dark', // out of order
    'theme~dark.theme~light', // twice
    'theme~dark.theme~dark',
    'theme~blue', // unknown value
    'font~mono', // unknown key
    '', // empty
    'theme', // no value
    '~dark', // no key
    'theme~dark.', // trailing separator
    '.theme~dark',
    '-.theme~dark', // the marker only stands alone
    'theme~DARK',
    'theme=dark', // the separators Next would percent-encode
    'theme=dark;tz=EST',
    'theme%7Edark',
    undefined,
    null,
  ]) {
    assert.equal(decodeSegment(prefs, segment), undefined, JSON.stringify(segment))
  }
})

test('round-trips every static segment', () => {
  for (const segment of staticSegments(prefs)) {
    assert.equal(encodeSegment(prefs, decodeSegment(prefs, segment)), segment)
  }
})

test('lists every combination of the prerendered values, the empty one first', () => {
  assert.deepEqual(staticSegments(prefs), [
    '-',
    'tz~EST',
    'tz~PST',
    'theme~light',
    'theme~light.tz~EST',
    'theme~light.tz~PST',
    'theme~dark',
    'theme~dark.tz~EST',
    'theme~dark.tz~PST',
  ])
})

test('has one segment when nothing is declared', () => {
  assert.deepEqual(staticSegments([]), ['-'])
})

test('prerenders the common values and leaves the rest to the first request', () => {
  const { flags } = normalizeConfig({
    locales: ['en'],
    defaultLocale: 'en',
    flags: {
      tz: { header: 'x', values: ['EST', 'PST', 'CET'], prerender: ['EST'] },
      lang: { header: 'y', values: ['fr', 'de'], prerender: false },
    },
  })
  assert.deepEqual(staticSegments(flags), ['-', 'tz~EST'])
  // Not prerendered, but still canonical, so still served.
  assert.deepEqual(decodeSegment(flags, 'lang~de.tz~CET'), { lang: 'de', tz: 'CET' })
})
