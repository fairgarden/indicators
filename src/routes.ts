import { escapeRegExp, type NormalizedConfig, type NormalizedIndicator } from './config.ts'
import { EMPTY_SEGMENT, PAIR_SEPARATOR, VALUE_SEPARATOR } from './segments.ts'

/**
 * The rewrites that turn a public URL, plus the request's cookies and
 * headers, into the path Next actually renders:
 *
 *     /login  +  cookie theme=dark  +  x-vercel-ip-timezone: America/New_York
 *     -> /en/theme~dark/tz~EST/login
 *
 * They go in `beforeFiles`, which is the one phase where Next keeps applying
 * rewrites after one matches — each one sees the path the previous ones
 * produced. That is what lets this be a chain of small steps rather than one
 * rewrite per combination:
 *
 *  1. a path without a locale gets the default one
 *  2. empty preference and flag segments are inserted after the locale
 *  3. each value of each preference, when its cookie or header matches,
 *     appends `.key~value` to the preferences segment; then flags likewise
 *  4. a segment still starting with the empty marker has it stripped
 *
 * Keys are visited in sorted order and each value's rewrite refuses to fire
 * when its key is already in the segment, so the result is always the
 * canonical form `segments.ts` describes. The number of rewrites grows with
 * the number of values, not with the number of combinations.
 */

/** The shape Next accepts for `has` and `missing`. */
export type Has =
  | { type: 'cookie' | 'header' | 'query'; key: string; value?: string }
  | { type: 'host'; key?: undefined; value: string }

export interface Rewrite {
  source: string
  destination: string
  has?: Has[]
  missing?: Has[]
}

export interface Redirect {
  source: string
  destination: string
  permanent: boolean
}

export interface RewriteOptions {
  /**
   * Further top-level paths to leave alone, found by looking at the app: the
   * files in `public/`, the routes that sit outside the locale tree.
   */
  exclude?: readonly string[]
  /**
   * Top-level names to leave alone whatever their extension, for metadata
   * routes such as `sitemap` that Next serves as `sitemap.xml` from
   * `sitemap.ts`.
   */
  excludeStems?: readonly string[]
}

const alternation = (values: readonly string[]): string => values.map(escapeRegExp).join('|')

/** `:locale(en|fr)` — a segment that is one of the locales. */
const localeParam = (config: NormalizedConfig): string =>
  `:locale(${alternation(config.locales)})`

/**
 * A negative lookahead for everything a path may start with and still not be
 * localized. Each entry has to be a whole segment: `en` must not exclude
 * `/entries`.
 */
const excluded = (config: NormalizedConfig, options: RewriteOptions): string => {
  const names = [...new Set([...config.locales, ...config.exclude, ...(options.exclude ?? [])])]
  const stems = [...new Set(options.excludeStems ?? [])]
  return [
    ...names.map((name) => `${escapeRegExp(name)}(?:/|$)`),
    ...stems.map((stem) => `${escapeRegExp(stem)}(?:\\.[^/]*)?(?:/|$)`),
  ].join('|')
}

/** Steps 1 and 2: a locale for every path, then the two empty segments. */
export const localeRewrites = (config: NormalizedConfig, options: RewriteOptions = {}): Rewrite[] => [
  { source: '/', destination: `/${config.defaultLocale}` },
  {
    source: `/:path((?!${excluded(config, options)}).+)`,
    destination: `/${config.defaultLocale}/:path`,
  },
  {
    source: `/${localeParam(config)}/:path*`,
    destination: `/:locale/${EMPTY_SEGMENT}/${EMPTY_SEGMENT}/:path*`,
  },
]

/**
 * Step 3 for one kind of indicator, then step 4.
 *
 * The guard on the segment, `(?!(?:[^/]*\.)?key~)`, is what makes a key's
 * rewrites exclusive: once one value has matched, the rest see the key in
 * the segment and stand down. It looks only within the segment, so a `.`
 * further along the path cannot confuse it.
 */
export const indicatorRewrites = (
  config: NormalizedConfig,
  kind: 'prefs' | 'flags'
): Rewrite[] => {
  const indicators: NormalizedIndicator[] = config[kind]
  const locale = localeParam(config)
  const rewrites: Rewrite[] = []

  for (const indicator of indicators) {
    const guard = `(?!(?:[^/]*${escapeRegExp(PAIR_SEPARATOR)})?${escapeRegExp(indicator.key)}${escapeRegExp(VALUE_SEPARATOR)})`
    const segment = `:${kind}(${guard}[^/]+)`
    const source =
      kind === 'prefs'
        ? `/${locale}/${segment}/:flags/:path*`
        : `/${locale}/:prefs/${segment}/:path*`

    for (const value of indicator.values) {
      const pair = `${indicator.key}${VALUE_SEPARATOR}${value.name}`
      const destination =
        kind === 'prefs'
          ? `/:locale/:prefs${PAIR_SEPARATOR}${pair}/:flags/:path*`
          : `/:locale/:prefs/:flags${PAIR_SEPARATOR}${pair}/:path*`

      rewrites.push({
        source,
        has: [{ type: indicator.source.type, key: indicator.source.key, value: value.pattern }],
        destination,
      })
    }
  }

  // Nothing to strip when nothing could have been appended. The separator is
  // escaped: a bare `.` before a param is a prefix to path-to-regexp, which
  // then keeps dots out of the param, and a segment with two pairs has one.
  if (indicators.length > 0) {
    const marker = `${EMPTY_SEGMENT}${escapeRegExp(PAIR_SEPARATOR)}`
    rewrites.push(
      kind === 'prefs'
        ? {
            source: `/${locale}/${marker}:prefs/:flags/:path*`,
            destination: '/:locale/:prefs/:flags/:path*',
          }
        : {
            source: `/${locale}/:prefs/${marker}:flags/:path*`,
            destination: '/:locale/:prefs/:flags/:path*',
          }
    )
  }

  return rewrites
}

/** The whole chain, in the order it has to run. */
export const indicatorsRewrites = (
  config: NormalizedConfig,
  options: RewriteOptions = {}
): Rewrite[] => [
  ...localeRewrites(config, options),
  ...indicatorRewrites(config, 'prefs'),
  ...indicatorRewrites(config, 'flags'),
]

/**
 * Canonical URLs for the default locale.
 *
 * With `as-needed`, `/en/login` is the same page as `/login`, so it redirects
 * there for good. With `always`, an unprefixed path redirects to the default
 * locale — temporarily, since which locale it lands on is a matter of
 * detection, which is the site root's job and not something to cache. The
 * root itself is left to the proxy either way; without one, the rewrites
 * serve the default locale there.
 */
export const indicatorsRedirects = (
  config: NormalizedConfig,
  options: RewriteOptions = {}
): Redirect[] => {
  const { defaultLocale } = config

  if (config.localePrefix === 'always') {
    return [
      {
        source: `/:path((?!${excluded(config, options)}).+)`,
        destination: `/${defaultLocale}/:path`,
        permanent: false,
      },
    ]
  }

  return [
    { source: `/${defaultLocale}`, destination: '/', permanent: true },
    { source: `/${defaultLocale}/:path*`, destination: '/:path*', permanent: true },
  ]
}
