import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createIndicators } from '../dist/index.js'
import { detectExclusions, withFairGardenIndicators } from '../dist/withFairGardenIndicators.js'

const indicators = createIndicators({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  prefs: { theme: { values: ['light', 'dark'] } },
})

const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'indicators-'))
  const touch = (file) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), '')
  }
  touch('public/next.svg')
  touch('public/fonts/a.woff2')
  touch('app/[locale]/[prefs]/[flags]/login/page.tsx')
  touch('app/(marketing)/about/page.tsx')
  touch('app/@modal/default.tsx')
  touch('app/_lib/x.ts')
  touch('app/api/health/route.ts')
  touch('app/status/page.tsx')
  touch('app/layout.tsx')
  touch('app/not-found.tsx')
  touch('app/globals.css')
  touch('app/sitemap.ts')
  touch('app/favicon.ico')
  touch('app/opengraph-image.png')
  return root
}

test('finds the paths an app serves outside the locale tree', () => {
  const found = detectExclusions(fixture())
  assert.deepEqual(found.exclude.sort(), ['api', 'fonts', 'next.svg', 'status'])
  assert.deepEqual(found.excludeStems.sort(), ['favicon', 'opengraph-image', 'sitemap'])
})

test('looks under src/app when app/ is not there', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'indicators-'))
  mkdirSync(path.join(root, 'src', 'app', 'health'), { recursive: true })
  assert.deepEqual(detectExclusions(root).exclude, ['health'])
})

test('finds nothing in an empty directory', () => {
  assert.deepEqual(detectExclusions(mkdtempSync(path.join(tmpdir(), 'indicators-'))), {
    exclude: [],
    excludeStems: [],
  })
})

test('appends its rewrites after the app\'s own beforeFiles, and keeps the other phases', async () => {
  const config = withFairGardenIndicators(
    {
      reactStrictMode: true,
      rewrites: async () => ({
        beforeFiles: [{ source: '/oidc/:path*', destination: '/api/oidc/:path*' }],
        afterFiles: [{ source: '/a', destination: '/b' }],
        fallback: [{ source: '/c', destination: '/d' }],
      }),
    },
    indicators,
    { root: fixture() }
  )

  assert.equal(config.reactStrictMode, true)
  const rewrites = await config.rewrites()
  assert.deepEqual(rewrites.beforeFiles[0], { source: '/oidc/:path*', destination: '/api/oidc/:path*' })
  assert.deepEqual(rewrites.beforeFiles[1], { source: '/', destination: '/en' })
  assert.equal(rewrites.beforeFiles.length, 1 + 3 + 3)
  assert.deepEqual(rewrites.afterFiles, [{ source: '/a', destination: '/b' }])
  assert.deepEqual(rewrites.fallback, [{ source: '/c', destination: '/d' }])
})

test('treats a bare rewrites array as afterFiles', async () => {
  const config = withFairGardenIndicators(
    { rewrites: async () => [{ source: '/a', destination: '/b' }] },
    indicators,
    { root: fixture() }
  )
  const rewrites = await config.rewrites()
  assert.deepEqual(rewrites.afterFiles, [{ source: '/a', destination: '/b' }])
  assert.equal(rewrites.beforeFiles.length, 6)
})

test('works on a config with no routing at all', async () => {
  const config = withFairGardenIndicators({}, indicators, { root: fixture() })
  const rewrites = await config.rewrites()
  assert.equal(rewrites.beforeFiles.length, 6)
  assert.deepEqual(rewrites.afterFiles, [])
  assert.deepEqual(await config.redirects(), [
    { source: '/en', destination: '/', permanent: true },
    { source: '/en/:path*', destination: '/:path*', permanent: true },
  ])
})

test('keeps the app\'s redirects first', async () => {
  const config = withFairGardenIndicators(
    { redirects: async () => [{ source: '/old', destination: '/new', permanent: true }] },
    indicators,
    { root: fixture() }
  )
  const redirects = await config.redirects()
  assert.deepEqual(redirects[0], { source: '/old', destination: '/new', permanent: true })
  assert.equal(redirects.length, 3)
})

test('uses what it found in the app to leave those paths alone', async () => {
  const config = withFairGardenIndicators({}, indicators, { root: fixture() })
  const [, localize] = (await config.rewrites()).beforeFiles
  assert.match(localize.source, /next\\\.svg\(\?:\/\|\$\)/)
  assert.match(localize.source, /status\(\?:\/\|\$\)/)
  assert.match(localize.source, /sitemap\(\?:\\\.\[\^\/\]\*\)\?\(\?:\/\|\$\)/)
})

test('can be told not to look', async () => {
  const config = withFairGardenIndicators({}, indicators, {
    root: fixture(),
    detectExclusions: false,
  })
  const [, localize] = (await config.rewrites()).beforeFiles
  assert.doesNotMatch(localize.source, /next\\\.svg/)
})

test('puts nothing in env', () => {
  const config = withFairGardenIndicators({}, indicators, { root: fixture() })
  assert.equal(config.env, undefined)
})

test('adds hard flag rewrites after the chain, and their strips to fallback', async () => {
  const config = withFairGardenIndicators(
    { rewrites: async () => ({ fallback: [{ source: '/x', destination: '/y' }] }) },
    indicators,
    { root: fixture(), hardFlags: { beta: { values: ['secret'] } } }
  )
  const rewrites = await config.rewrites()
  assert.equal(rewrites.beforeFiles.length, 6 + 2)
  assert.match(rewrites.beforeFiles.at(-2).source, /:hard\(beta\)/)
  assert.deepEqual(rewrites.beforeFiles.at(-1).has, [{ type: 'cookie', key: 'beta', value: '(?:secret)' }])
  assert.deepEqual(rewrites.fallback[0], { source: '/x', destination: '/y' })
  assert.equal(rewrites.fallback.length, 2)
  assert.match(rewrites.fallback[1].source, /\/beta\/:path\*$/)
})
