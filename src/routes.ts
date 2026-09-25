import {
  DEFAULT_STYLESHEET,
  escapeRegExp,
  stylesheetFile,
  type NormalizedConfig,
  type NormalizedHardFlag,
  type NormalizedIndicator,
  type NormalizedStylesheet,
  type NormalizedValue,
  type Segment,
} from './config.ts'
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
 *  2. an empty segment is inserted after the locale for each of the
 *     preferences and flags segments the tree has
 *  3. each value of each preference, when its cookie or header matches,
 *     appends `.key~value` to the preferences segment; then flags likewise
 *  4. a segment still starting with the empty marker has it stripped
 *
 * Keys are visited in sorted order and each value's rewrite refuses to fire
 * when its key is already in the segment, so the result is always the
 * canonical form `segments.ts` describes. The number of rewrites grows with
 * the number of values, not with the number of combinations.
 *
 * An indicator expressed through a stylesheet takes no part in this: its
 * rewrites map the stylesheet's URL to a file, and come first.
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

export interface Header {
  source: string
  headers: Array<{ key: string; value: string }>
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

/**
 * A value's pattern as a `has` value. Next anchors it as `^…$`, which binds
 * only the outer alternatives of `AT|BE|DE`, so `DEU` would match; the
 * group makes it the whole value, as the config promises.
 */
const whole = (value: NormalizedValue): string => `(?:${value.pattern})`

/** `:locale(en|fr)` — a segment that is one of the locales. */
const localeParam = (config: NormalizedConfig): string =>
  `:locale(${alternation(config.locales)})`

const hasSegment = (config: NormalizedConfig, segment: Segment): boolean =>
  config.segments.includes(segment)

/** The first segment of a public path: what the locale rewrite keys on. */
const firstSegment = (pathname: string): string => pathname.split('/')[1] ?? ''

/**
 * The path up to and including the last indicator segment, as a source and
 * as a destination, with a segment's param given a custom pattern:
 * `/:locale(en|fr)/:prefs(...)/:flags`. The base every later step hangs
 * its `/:path*` off.
 *
 * With locales, `:locale(en|fr)` anchors every source: a path Next serves
 * itself, or a file in `public/`, does not start with one. Without, the
 * first segment's param carries the same lookahead the locale step uses,
 * so `/_next/static/x.js` is never mistaken for two indicator segments.
 */
const segmentPath = (
  config: NormalizedConfig,
  options: RewriteOptions,
  patterns: Partial<Record<'prefs' | 'flags', string>> = {},
  /** Off for a source that something else anchors, such as the marker a cleanup looks for. */
  anchored = true
): { source: string; destination: string } => {
  let source = ''
  let destination = ''
  let first = true
  for (const segment of config.segments) {
    if (segment === 'locale') {
      source += `/${localeParam(config)}`
      destination += '/:locale'
    } else {
      const anchor = first && anchored ? `(?!${excluded(config, options)})` : ''
      const pattern = patterns[segment]
      const custom = pattern ? pattern.slice(1, -1) : ''
      source += anchor || custom ? `/:${segment}(${anchor}${custom || '[^/]+'})` : `/:${segment}`
      destination += `/:${segment}`
    }
    first = false
  }
  return { source, destination }
}

/**
 * A negative lookahead for everything a path may start with and still not be
 * localized. Each entry has to be a whole segment: `en` must not exclude
 * `/entries`.
 */
const excluded = (
  config: NormalizedConfig,
  options: RewriteOptions,
  /**
   * On to ask what is a page instead, which leaves out what only the
   * rewrites have to: a path starting with a locale is a page, and so is
   * `/theme` beside `/theme.css`, whose files have an extension.
   */
  pages = false
): string => {
  // A stylesheet and the files it is rewritten to: the directory when it is
  // in one, otherwise its name whatever the extension, since `/theme.css`
  // is served beside `/theme.dark.css`.
  const sheets = pages ? [] : config.stylesheets
  const inDirectory = sheets.filter((sheet) => sheet.href.indexOf('/', 1) !== -1)
  const atRoot = sheets.filter((sheet) => sheet.href.indexOf('/', 1) === -1)

  const names = [
    ...new Set([
      ...(pages ? [] : config.locales),
      ...config.exclude,
      ...(options.exclude ?? []),
      ...inDirectory.map((sheet) => firstSegment(sheet.href)),
    ]),
  ].filter((name) => name !== '')
  const stems = [
    ...new Set([...(options.excludeStems ?? []), ...atRoot.map((sheet) => sheet.base.slice(1))]),
  ]
  return [
    ...names.map((name) => `${escapeRegExp(name)}(?:/|$)`),
    ...stems.map((stem) => `${escapeRegExp(stem)}(?:\\.[^/]*)?(?:/|$)`),
  ].join('|')
}

/**
 * Steps 1 and 2: a locale for every path, then the empty segments. Without
 * locales, the empty segments go in front of every path the locale step
 * would have localized, and the root gets them alone.
 */
export const localeRewrites = (config: NormalizedConfig, options: RewriteOptions = {}): Rewrite[] => {
  const empty = `/${EMPTY_SEGMENT}`.repeat(
    config.segments.filter((segment) => segment !== 'locale').length
  )

  // The path step first: the root's result would match it otherwise, and
  // the empty segments would be inserted twice. (With a locale, a localized
  // root cannot match the path step, so the order there is free.)
  if (!hasSegment(config, 'locale')) {
    if (empty === '') return []
    return [
      { source: `/:path((?!${excluded(config, options)}).+)`, destination: `${empty}/:path` },
      { source: '/', destination: empty },
    ]
  }

  const rewrites: Rewrite[] = [
    { source: '/', destination: `/${config.defaultLocale}` },
    {
      source: `/:path((?!${excluded(config, options)}).+)`,
      destination: `/${config.defaultLocale}/:path`,
    },
  ]

  if (empty !== '') {
    rewrites.push({
      source: `/${localeParam(config)}/:path*`,
      destination: `/:locale${empty}/:path*`,
    })
  }

  return rewrites
}

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
  kind: 'prefs' | 'flags',
  options: RewriteOptions = {}
): Rewrite[] => {
  const indicators: NormalizedIndicator[] = config[kind]
  if (indicators.length === 0 || !hasSegment(config, kind)) return []

  const rewrites: Rewrite[] = []

  for (const indicator of indicators) {
    const guard = `(?!(?:[^/]*${escapeRegExp(PAIR_SEPARATOR)})?${escapeRegExp(indicator.key)}${escapeRegExp(VALUE_SEPARATOR)})`
    const base = segmentPath(config, options, { [kind]: `(${guard}[^/]+)` })

    for (const value of indicator.values) {
      const pair = `${indicator.key}${VALUE_SEPARATOR}${value.name}`
      rewrites.push({
        source: `${base.source}/:path*`,
        has: [{ type: indicator.source.type, key: indicator.source.key, value: whole(value) }],
        destination: `${base.destination.replace(
          `:${kind}`,
          `:${kind}${PAIR_SEPARATOR}${pair}`
        )}/:path*`,
      })
    }
  }

  // Strip the marker the values were appended to. The separator is escaped:
  // a bare `.` before a param is a prefix to path-to-regexp, which then
  // keeps dots out of the param, and a segment with two pairs has one.
  // The marker anchors this one on its own, so the segments go unpatterned.
  const marker = `${EMPTY_SEGMENT}${escapeRegExp(PAIR_SEPARATOR)}`
  const cleanup = segmentPath(config, options, {}, false)
  rewrites.push({
    source: `${cleanup.source.replace(`:${kind}`, `${marker}:${kind}`)}/:path*`,
    destination: `${cleanup.destination}/:path*`,
  })

  return rewrites
}

/**
 * An indicator expressed through a stylesheet: its URL is rewritten to the
 * file for the first value whose cookie or header matches, or to the
 * default. Nothing runs for it — the files are static, and the `headers`
 * entry below is what keeps the browser asking.
 */
export const stylesheetRewrites = (config: NormalizedConfig): Rewrite[] =>
  config.stylesheets.flatMap((sheet: NormalizedStylesheet): Rewrite[] => [
    ...sheet.values.map(
      (value): Rewrite => ({
        source: sheet.href,
        has: [{ type: sheet.source.type, key: sheet.source.key, value: whole(value) }],
        destination: stylesheetFile(sheet, value.name),
      })
    ),
    // Reached only when no value matched: a match rewrote the path away.
    { source: sheet.href, destination: stylesheetFile(sheet, DEFAULT_STYLESHEET) },
  ])

/**
 * The response depends on a cookie or header, so no cache in front may keep
 * it, and the browser has to ask again on every page — which is a 304 while
 * nothing changed, and a new file when the value did. A stale copy is only
 * the wrong theme, so it may stand in when the server cannot answer.
 */
export const stylesheetHeaders = (config: NormalizedConfig): Header[] =>
  config.stylesheets.map((sheet) => ({
    source: sheet.href,
    headers: [
      { key: 'Cache-Control', value: 'private, no-cache, stale-if-error=86400' },
    ],
  }))

/**
 * A `headers` source matching every page: any path that does not start with
 * what the locale rewrite leaves alone for a route's sake — `_next`, `api`,
 * `.well-known`, `exclude`, what the plugin found in the app — and whose
 * last segment has no extension. A path starting with a locale is one, and
 * so is the root; the extension is what rules out a stylesheet's files.
 */
const pageSource = (config: NormalizedConfig, options: RewriteOptions): string =>
  `/:path((?!${excluded(config, options, true)})(?:[^/]*/)*[^/.]*)`

/**
 * Headers a browser sends only once a page has asked for them with
 * `Accept-CH`: every `Sec-CH-` header, and the older hints without the
 * prefix. The three a browser sends unasked (`Sec-CH-UA`, `-Mobile`,
 * `-Platform`) may be asked for all the same.
 */
const CLIENT_HINT = /^(?:sec-ch-.+|device-memory|dpr|viewport-width|width|rtt|downlink|ect)$/

/** The client hints a browser sends before any page has asked for them. */
const UNASKED_HINTS = new Set(['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'])

/**
 * A `Link` header on every page naming its stylesheets. The request is a
 * 304 on nearly every page, and the page cannot render before it, so
 * starting it early is most of its cost. On its own the header gains
 * little, since Next sends the `<head>` with the headers and the browser
 * finds the `<link>` in it straight away; it pays off when a CDN turns it
 * into 103 Early Hints, sent before the page is ready.
 */
export const stylesheetPreloadHeaders = (
  config: NormalizedConfig,
  options: RewriteOptions = {}
): Header[] => {
  // A stylesheet only some pages link would be preloaded, unused, on the
  // rest; and one `Link` per set of pages would not survive two sets
  // matching the same path, since Next keeps the last value. One that reads
  // a hint the browser sends only when asked is left out too: on a first
  // visit the 103 arrives before the `Accept-CH` that asks, so the preload
  // would fetch the default, and the page's link would use it.
  const preloaded = config.stylesheets.filter(
    ({ global, source }) =>
      global &&
      !(source.type === 'header' && CLIENT_HINT.test(source.key) && !UNASKED_HINTS.has(source.key))
  )
  if (preloaded.length === 0) return []
  const value = preloaded
    .map((sheet) => `<${sheet.href}>; rel=preload; as=style`)
    .join(', ')
  return [{ source: pageSource(config, options), headers: [{ key: 'Link', value }] }]
}

export interface ClientHintOptions extends RewriteOptions {
  /**
   * Also name, in `Critical-CH`, the hints the path depends on, so a
   * browser that did not send one retries the request with it.
   */
  critical?: boolean
}

/**
 * `Accept-CH` on every page, naming each client hint an indicator or a hard
 * flag reads, so the browser sends it from then on.
 *
 * The request for the first page a visitor opens cannot carry a hint the
 * browser has not been asked for yet; every request that page makes does,
 * and so does every request after. A stylesheet is one of the first, so it
 * gets the hint from the first page. A segment of the path needs it on the
 * page's own request, which is what `Critical-CH` is for: the browser
 * retries that request with the hint, at the cost of a round trip, once.
 * Only the hints the path reads go in it; a stylesheet has no need.
 */
export const clientHintHeaders = (
  config: NormalizedConfig,
  hardFlags: NormalizedHardFlag[] = [],
  options: ClientHintOptions = {}
): Header[] => {
  const hints = (sources: Array<{ source: { type: string; key: string } }>): string[] => [
    ...new Set(
      sources
        .filter(({ source }) => source.type === 'header' && CLIENT_HINT.test(source.key))
        .map(({ source }) => source.key)
    ),
  ]
  const inPath = hints([...config.prefs, ...config.flags, ...hardFlags])
  const all = hints([...config.prefs, ...config.flags, ...hardFlags, ...config.stylesheets])
  if (all.length === 0) return []

  const critical = options.critical ? inPath : []
  return [
    {
      source: pageSource(config, options),
      headers: [
        { key: 'Accept-CH', value: all.sort().join(', ') },
        ...(critical.length > 0 ? [{ key: 'Critical-CH', value: critical.sort().join(', ') }] : []),
      ],
    },
  ]
}

/** The whole chain, in the order it has to run. */
export const indicatorsRewrites = (
  config: NormalizedConfig,
  options: RewriteOptions = {}
): Rewrite[] => [
  ...stylesheetRewrites(config),
  ...localeRewrites(config, options),
  ...indicatorRewrites(config, 'prefs', options),
  ...indicatorRewrites(config, 'flags', options),
]

export interface HardFlagRewrites {
  /** After the chain: quarantine, then one injection per flag. */
  beforeFiles: Rewrite[]
  /** One strip per flag, for a path that has no version under it. */
  fallback: Rewrite[]
}

/**
 * The rewrites for hard flags — see `HardFlagDefinition`.
 *
 * Three parts, and the first is the one that matters for safety. The chain
 * puts the empty segments straight after the locale, so whatever a public
 * path starts with lands exactly where a hard segment goes: a request for
 * `/beta/login` would otherwise become `/en/-/-/beta/login` and be served
 * the beta page with no cookie at all. So a path whose first segment names
 * a hard flag is quarantined first, by pushing an empty segment in front of
 * it, where it matches nothing. Only then does each flag whose cookie or
 * header matches inject its segment, straight after the last indicator
 * segment; visiting the flags in reverse order leaves the segments sorted.
 *
 * The strips go in `fallback`, which Next applies only once no route
 * matched, checking again after each: a beta user asking for a page with no
 * beta version gets the ordinary one. Not `afterFiles`, which runs before
 * dynamic routes are matched and would strip the segment from everything.
 * Flags are stripped last first, so with several hard flags a page that
 * exists only under a later one is not found for a user who also has an
 * earlier one.
 *
 * A strip has to allow for the earlier segments being there or not. In a
 * source that is `:h0(beta)?`; in a destination it is `:h0*`, because Next
 * reads a destination as a URL before compiling it and a `?` there starts
 * the query string.
 */
export const hardFlagRewrites = (
  config: NormalizedConfig,
  hardFlags: NormalizedHardFlag[],
  options: RewriteOptions = {}
): HardFlagRewrites => {
  if (hardFlags.length === 0) return { beforeFiles: [], fallback: [] }

  // A name that is also a path left alone — a file in `public/`, an
  // excluded route — could not be quarantined without breaking that path.
  const reserved = new Set([...config.exclude, ...(options.exclude ?? [])])
  for (const flag of hardFlags) {
    if (reserved.has(flag.key)) {
      throw new Error(
        `hardFlags key ${JSON.stringify(flag.key)} is also a path that is never rewritten ` +
          '(excluded, or in public/); a hard flag needs a name of its own.'
      )
    }
  }

  const base = segmentPath(config, options)
  const has = (flag: NormalizedHardFlag): Has[] => [
    { type: flag.source.type, key: flag.source.key, value: `(?:${flag.patterns.join('|')})` },
  ]
  const optional = (before: NormalizedHardFlag[]) => ({
    source: before.map((earlier, at) => `/:h${at}(${escapeRegExp(earlier.key)})?`).join(''),
    destination: before.map((_, at) => `/:h${at}*`).join(''),
  })

  const quarantine: Rewrite = {
    source: `${base.source}/:hard(${alternation(hardFlags.map((flag) => flag.key))})/:path*`,
    destination: `${base.destination}/${EMPTY_SEGMENT}/:hard/:path*`,
  }

  // With no segment at all, a hard segment goes at the front of every path
  // the locale step would have localized, and of the root, and comes off
  // the same way. `/:path*` alone would take `/_next` too, and `/:path*` as
  // a whole destination compiles to nothing for the root. The root comes
  // second, since its result would match the path step.
  if (base.source === '') {
    const guarded = `/:path((?!${excluded(config, options)}).+)`
    const inject = [...hardFlags].reverse().flatMap((flag): Rewrite[] => [
      { source: guarded, has: has(flag), destination: `/${flag.key}/:path` },
      { source: '/', has: has(flag), destination: `/${flag.key}` },
    ])
    const fallback = hardFlags
      .flatMap((flag, index): Rewrite[] => {
        const before = optional(hardFlags.slice(0, index))
        const kept = before.destination === '' ? '/' : before.destination
        return [
          { source: `${before.source}/${flag.key}`, destination: kept },
          { source: `${before.source}/${flag.key}/:path+`, destination: `${before.destination}/:path+` },
        ]
      })
      .reverse()
    return { beforeFiles: [quarantine, ...inject], fallback }
  }

  const inject = [...hardFlags].reverse().map(
    (flag): Rewrite => ({
      source: `${base.source}/:path*`,
      has: has(flag),
      destination: `${base.destination}/${flag.key}/:path*`,
    })
  )

  const fallback = hardFlags
    .map((flag, index): Rewrite => {
      const before = optional(hardFlags.slice(0, index))
      return {
        source: `${base.source}${before.source}/${flag.key}/:path*`,
        destination: `${base.destination}${before.destination}/:path*`,
      }
    })
    .reverse()

  return { beforeFiles: [quarantine, ...inject], fallback }
}

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
  if (defaultLocale === undefined) return []

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
