import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'
import {
  DEFAULT_STYLESHEET,
  normalizeHardFlags,
  stylesheetFile,
  type HardFlags,
  type IndicatorsConfig,
  type NormalizedConfig,
} from './config.ts'
import type { Indicators } from './indicators.ts'
import {
  clientHintHeaders,
  hardFlagRewrites,
  indicatorsRedirects,
  indicatorsRewrites,
  stylesheetHeaders,
  stylesheetPreloadHeaders,
  type Rewrite,
  type RewriteOptions,
} from './routes.ts'

export interface PluginOptions {
  /**
   * The app directory. Defaults to the directory of the `next.config` that
   * called this — not the working directory, since a monolith loads an app's
   * config from its own directory.
   */
  root?: string
  /**
   * Whether to look at `public/` and the top of the route tree for paths to
   * leave alone. Defaults to true. Turn it off to name every excluded path in
   * the config instead.
   */
  detectExclusions?: boolean
  /**
   * Flags that become a route segment after `[flags]` when a cookie or
   * header matches, gating a whole route tree:
   *
   * ```ts
   * withFairGardenIndicators(nextConfig, indicators, {
   *   hardFlags: { beta: { values: [process.env.BETA_COOKIE ?? ''] } },
   * })
   * ```
   *
   * `app/[locale]/[prefs]/[flags]/beta/login/page.tsx` is then served for
   * `/login` when the `beta` cookie holds that value, and `/login` is
   * served for everyone else — as it is for a beta user on a page with no
   * beta version. A public path starting with `/beta` is never served.
   * Here rather than in the config so the value stays out of the browser.
   */
  hardFlags?: HardFlags
  /**
   * Whether every page names the app's global stylesheets in a `Link`
   * preload header, which a CDN can send ahead of the page as 103 Early
   * Hints. Defaults to true; nothing is added without one. A stylesheet
   * declared `global: false` is never preloaded.
   *
   * A page is any path outside `exclude` — `_next`, `api` and the rest,
   * and what `detectExclusions` finds — whose last segment has no
   * extension. Of the `headers` entries that match, Next keeps the last
   * value for each header, so a `Link` the app's own `headers` set on a
   * page replaces this one; list the stylesheets in it too, or turn this
   * off. The preload headers React adds while rendering are appended, and
   * are unaffected.
   */
  preloadStylesheets?: boolean
  /**
   * Whether pages ask the browser, with `Accept-CH`, for the client hints
   * the indicators and hard flags read — `Device-Memory`, `Sec-CH-UA-Arch`
   * and the like, which a browser sends only when asked. Defaults to true;
   * nothing is added when none is read.
   *
   * A stylesheet gets the hint from the first page on, but the path needs
   * it on the page's own request, which the first visit cannot carry.
   * `'critical'` also names the hints the path reads in `Critical-CH`, so
   * the browser retries that first request with them: one more round trip,
   * once per visitor.
   *
   * On the same pages as `preloadStylesheets`, and ahead of the app's own
   * headers, so an `Accept-CH` the app sets on a page replaces this one.
   */
  clientHints?: boolean | 'critical'
}

type Phases = { beforeFiles: Rewrite[]; afterFiles: Rewrite[]; fallback: Rewrite[] }
type Rewrites = Awaited<ReturnType<NonNullable<NextConfig['rewrites']>>>
type Redirects = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>
type Headers = Awaited<ReturnType<NonNullable<NextConfig['headers']>>>

const REPORTED_ENV = '__FG_INDICATORS_STYLESHEETS_REPORTED'

/**
 * Say so when the files a stylesheet indicator is rewritten to are not in
 * `public/`. A missing one is a 404 for the stylesheet and a theme that
 * quietly never applies, which is worth a line at build time. Next reads the
 * config in the main process and again in a build worker, which inherits
 * the environment, so the marker keeps it to one report.
 */
const reportMissingStylesheets = (root: string, config: NormalizedConfig): void => {
  const missing: string[] = []
  for (const sheet of config.stylesheets) {
    const names = [...sheet.values.map((value) => value.name), DEFAULT_STYLESHEET]
    for (const name of names) {
      const file = path.join(root, 'public', stylesheetFile(sheet, name))
      if (!existsSync(file)) missing.push(path.relative(root, file))
    }
  }
  if (missing.length === 0) return
  const seen = (process.env[REPORTED_ENV] ?? '').split(path.delimiter)
  if (seen.includes(root)) return
  process.env[REPORTED_ENV] = [...seen.filter(Boolean), root].join(path.delimiter)
  process.stderr.write(
    `These stylesheets are rewritten to files that are not in public/:\n${missing
      .map((file) => `  - ${file}`)
      .join('\n')}\n`
  )
}

const toPhases = (rewrites: Rewrites | undefined): Phases => {
  if (!rewrites) return { beforeFiles: [], afterFiles: [], fallback: [] }
  // A bare array is `afterFiles`, which is what Next does with one.
  if (Array.isArray(rewrites)) {
    return { beforeFiles: [], afterFiles: rewrites as Rewrite[], fallback: [] }
  }
  return {
    beforeFiles: (rewrites.beforeFiles ?? []) as Rewrite[],
    afterFiles: (rewrites.afterFiles ?? []) as Rewrite[],
    fallback: (rewrites.fallback ?? []) as Rewrite[],
  }
}

/**
 * Files at the top of `app/` that Next turns into a route of the same name
 * with some extension: `sitemap.ts` is served as `/sitemap.xml`. Matched by
 * stem so the extension does not matter.
 */
const METADATA_STEMS = [
  'favicon',
  'icon',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
  'robots',
  'sitemap',
  'manifest',
]

/** Names at the top of `app/` that are conventions rather than routes. */
const CONVENTION_FILES = new Set([
  'layout',
  'page',
  'template',
  'loading',
  'error',
  'global-error',
  'not-found',
  'global-not-found',
  'default',
  'route',
  'forbidden',
  'unauthorized',
])

const stem = (name: string): string => name.replace(/\.[^.]+$/, '')

const entriesOf = (dir: string): Array<{ name: string; directory: boolean }> => {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
    }))
  } catch {
    return []
  }
}

/**
 * Paths a look at the app says must never be rewritten.
 *
 * Everything in `public/` is served at its own name, and so is a metadata
 * file at the top of `app/`. When the routes live under a segment, so is
 * every directory at the top of `app/` that is not one: an `api/`
 * directory, a health check. Without a segment those directories are the
 * routes themselves, so they are left in. A route group or a parallel slot
 * could hold anything, so those are left to the config's `exclude`.
 */
export const detectExclusions = (
  root: string,
  /** Whether the routes sit under an indicator segment. */
  underSegment = true
): Required<RewriteOptions> => {
  const exclude: string[] = []
  const excludeStems: string[] = []

  for (const entry of entriesOf(path.join(root, 'public'))) {
    exclude.push(entry.name)
  }

  const appDir = [path.join(root, 'app'), path.join(root, 'src', 'app')].find(
    (candidate) => entriesOf(candidate).length > 0
  )
  for (const entry of entriesOf(appDir ?? '')) {
    if (entry.name.startsWith('[') || entry.name.startsWith('(') || entry.name.startsWith('@')) {
      continue
    }
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    if (entry.directory) {
      if (underSegment) exclude.push(entry.name)
      continue
    }

    const base = stem(entry.name)
    if (CONVENTION_FILES.has(base)) continue
    if (METADATA_STEMS.includes(base)) excludeStems.push(base)
  }

  return { exclude: [...new Set(exclude)], excludeStems: [...new Set(excludeStems)] }
}

/**
 * The directory of the config that called this, found the way
 * `@fairgarden/monolith` finds it: a monolith loads each app's config from
 * the monolith's own directory, so the working directory would be wrong.
 */
const callerDirectory = (): string | undefined => {
  const original = Error.prepareStackTrace
  try {
    Error.prepareStackTrace = (_, stack) => stack
    const stack = new Error().stack as unknown as NodeJS.CallSite[]
    for (const frame of stack ?? []) {
      const file = frame.getFileName?.()
      if (!file || file.includes('node_modules') || !file.includes('next.config')) continue
      return path.dirname(file.replace(/^file:\/\//, ''))
    }
  } catch {
    return undefined
  } finally {
    Error.prepareStackTrace = original
  }
  return undefined
}

const call = async <T>(value: (() => T | Promise<T>) | undefined): Promise<T | undefined> =>
  value ? await value() : undefined

/**
 * Add the rewrites and redirects that put the locale, preferences and flags
 * into the path, the headers that serve the stylesheet indicators, and the
 * one that asks for the client hints they read.
 *
 * ```ts
 * // next.config.ts
 * import { withFairGardenIndicators } from '@fairgarden/indicators/withFairGardenIndicators'
 * import { indicators } from './lib/indicators.ts'
 *
 * export default withFairGardenIndicators(nextConfig, indicators)
 * ```
 *
 * The app's own rewrites run first, so a path they produce is localized
 * like any other; its redirects also come first. Nothing else in the config
 * is touched, and nothing is put in `env`, so the result merges into a
 * monolith like any app's config.
 *
 * An entry point of its own because it reads the file system, which the
 * package's main entry — imported by client modules too — must not.
 */
export const withFairGardenIndicators = <C extends IndicatorsConfig>(
  nextConfig: NextConfig = {},
  indicators: Indicators<C>,
  options: PluginOptions = {}
): NextConfig => {
  const root = options.root ?? callerDirectory() ?? process.cwd()
  const detected: RewriteOptions =
    options.detectExclusions === false
      ? {}
      : detectExclusions(root, indicators.config.segments.length > 0)
  const hardFlags = normalizeHardFlags(options.hardFlags, indicators.config)
  const hard = hardFlagRewrites(indicators.config, hardFlags, detected)
  if (options.detectExclusions !== false) reportMissingStylesheets(root, indicators.config)
  const clientHints = options.clientHints ?? true

  return {
    ...nextConfig,
    headers: async () =>
      [
        // Ahead of the app's own, so a `Link` or `Accept-CH` it sets on a
        // page wins.
        ...(options.preloadStylesheets === false
          ? []
          : stylesheetPreloadHeaders(indicators.config, detected)),
        ...(clientHints === false
          ? []
          : clientHintHeaders(indicators.config, hardFlags, {
              ...detected,
              critical: clientHints === 'critical',
            })),
        ...((await call(nextConfig.headers)) ?? []),
        ...stylesheetHeaders(indicators.config),
      ] as Headers,
    rewrites: async () => {
      const own = toPhases(await call(nextConfig.rewrites))
      return {
        ...own,
        beforeFiles: [
          ...own.beforeFiles,
          ...indicatorsRewrites(indicators.config, detected),
          ...hard.beforeFiles,
        ],
        fallback: [...own.fallback, ...hard.fallback],
      }
    },
    redirects: async () => [
      ...((await call(nextConfig.redirects)) ?? []),
      ...indicatorsRedirects(indicators.config, detected),
    ] as Redirects,
  }
}
