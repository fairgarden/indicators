import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'
import { normalizeHardFlags, type HardFlags, type IndicatorsConfig } from './config.ts'
import type { Indicators } from './indicators.ts'
import {
  hardFlagRewrites,
  indicatorsRedirects,
  indicatorsRewrites,
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
}

type Phases = { beforeFiles: Rewrite[]; afterFiles: Rewrite[]; fallback: Rewrite[] }
type Rewrites = Awaited<ReturnType<NonNullable<NextConfig['rewrites']>>>
type Redirects = Awaited<ReturnType<NonNullable<NextConfig['redirects']>>>

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
 * Paths a look at the app says must never be localized.
 *
 * Everything in `public/` is served at its own name. So is every route at the
 * top of `app/` that is not a dynamic segment: an `api/` directory, a health
 * check, a metadata file. A route group or a parallel slot could hold
 * anything, so those are left to the config's `exclude`.
 */
export const detectExclusions = (root: string): Required<RewriteOptions> => {
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
      exclude.push(entry.name)
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
 * into the path.
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
    options.detectExclusions === false ? {} : detectExclusions(root)
  const hard = hardFlagRewrites(
    indicators.config,
    normalizeHardFlags(options.hardFlags, indicators.config)
  )

  return {
    ...nextConfig,
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
